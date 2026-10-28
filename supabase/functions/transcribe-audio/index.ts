// Alora — post-class audio → transcript.
//
// The browser uploads the recording to the private `attachments` bucket as usual, then calls this
// function with the attachment id. It runs AS THE STUDENT (their JWT), so row-level security
// guarantees they can only transcribe their own files, downloads the audio, asks Gemini for a
// plain transcript, and stores it on the attachment row. Nothing is invented: if Gemini fails,
// the transcript stays empty and the error is returned.
//
// Secret: GEMINI_API_KEY (already used by alora-chat).  Deploy: supabase functions deploy transcribe-audio

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Gemini accepts ~20 MB of inline data per request; stay clear of the limit once base64 inflates it.
const MAX_BYTES = 14 * 1024 * 1024;
const MODEL = 'gemini-3.6-flash'; // same model alora-chat uses

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Not signed in.' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.healthCheck) return json({ ok: true, geminiKeyConfigured: !!Deno.env.get('GEMINI_API_KEY') });
    const attachmentId = typeof body?.attachmentId === 'string' ? body.attachmentId : '';
    if (!attachmentId) return json({ error: 'attachmentId is required.' }, 400);

    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'Transcription is not set up yet (GEMINI_API_KEY missing).' }, 503);

    const { data: att } = await supabase.from('attachments').select('id, file_type, file_size, storage_path, file_name').eq('id', attachmentId).maybeSingle();
    if (!att) return json({ error: 'Recording not found.' }, 404); // also what a stranger's id looks like: RLS hides it
    if (!String(att.file_type).startsWith('audio/')) return json({ error: 'That file is not audio.' }, 415);
    if ((att.file_size ?? 0) > MAX_BYTES) return json({ error: 'That recording is too large to transcribe (limit about 14 MB). Try a shorter clip.' }, 413);

    const { data: blob, error: dlErr } = await supabase.storage.from('attachments').download(att.storage_path);
    if (dlErr || !blob) return json({ error: 'Could not read the recording.' }, 502);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > MAX_BYTES) return json({ error: 'That recording is too large to transcribe (limit about 14 MB). Try a shorter clip.' }, 413);

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { text: 'Transcribe this recording of a class or lecture exactly as spoken. Output only the transcript text, no commentary, no headings. If nothing intelligible is spoken, output exactly: [no speech detected]' },
          { inline_data: { mime_type: att.file_type, data: toBase64(bytes) } },
        ] }],
        generationConfig: { temperature: 0 },
      }),
    });
    if (!res.ok) { console.error('Gemini transcription failed', res.status, (await res.text()).slice(0, 300)); return json({ error: 'The transcription service could not process that recording.' }, 502); }
    const out = await res.json();
    const transcript = String(out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '').trim();
    if (!transcript) return json({ error: 'No transcript came back.' }, 502);

    const { error: saveErr } = await supabase.from('attachments').update({ transcript, transcribed_at: new Date().toISOString() }).eq('id', att.id);
    if (saveErr) return json({ error: 'Transcribed, but could not save the transcript.' }, 500);
    return json({ transcript });
  } catch (e) {
    console.error('transcribe-audio error', e);
    return json({ error: 'Something went wrong transcribing that recording.' }, 500);
  }
});
