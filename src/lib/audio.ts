import { supabase } from '@/lib/supabase';
import type { Attachment } from '@/lib/attachments';

/** Gemini takes ~20 MB inline; the transcribe-audio function enforces the same cap. */
export const MAX_TRANSCRIBE_BYTES = 14 * 1024 * 1024;
export const TARGET_RATE = 16000;
/** 16 kHz mono 16-bit WAV is 32 000 bytes/s, so 7 minutes stays under the cap. */
export const MAX_RECORD_SECONDS = 7 * 60;

export function isAudioType(fileType: string): boolean {
  return fileType.startsWith('audio/');
}

/** Encodes mono float samples (-1..1) as a 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

/** Whatever the browser recorded (webm/mp4) → 16 kHz mono WAV, a format Gemini documents support for. */
export async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
    const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return new Blob([encodeWav(rendered.getChannelData(0), TARGET_RATE)], { type: 'audio/wav' });
  } finally {
    void ctx.close();
  }
}

export function canRecord(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && typeof AudioContext !== 'undefined';
}

export type TranscribeResult = { ok: true; transcript: string } | { ok: false; message: string };

export async function transcribeAttachment(a: Pick<Attachment, 'id'>): Promise<TranscribeResult> {
  const { data, error } = await supabase.functions.invoke('transcribe-audio', { body: { attachmentId: a.id } });
  if (error) {
    // supabase-js hides the function's JSON body inside error.context — surface the function's own sentence when there is one.
    let message = "Couldn't reach the transcription service. Your recording is saved; try again in a moment.";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') { const body = await ctx.json(); if (body?.error) message = String(body.error); }
      else if ((error as { name?: string }).name === 'FunctionsFetchError') message = "Couldn't reach the transcription service. Check your connection.";
    } catch { /* keep the default */ }
    return { ok: false, message };
  }
  const transcript = typeof data?.transcript === 'string' ? data.transcript.trim() : '';
  return transcript ? { ok: true, transcript } : { ok: false, message: 'No transcript came back.' };
}
