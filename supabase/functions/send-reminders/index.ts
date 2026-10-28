// Alora — daily reminder digest (web push + email).
//
// Meant to be called once a morning by a schedule (see README → "Reminders"), never by the browser:
// it uses the service role to look across users, so it refuses anything without the shared secret.
// Each student gets at most ONE digest per day per channel (notification_log makes re-runs harmless),
// only if they have open work due today/overdue, and only on channels they turned on.
//
// Secrets (supabase secrets set …):
//   CRON_SECRET            shared secret the schedule sends as the x-cron-secret header
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   (mailto:you@example.com) — for web push
//   RESEND_API_KEY, REMINDER_FROM_EMAIL                  — for email (e.g. "Alora <hello@yourdomain>")
//   APP_URL                the deployed app, used for the link in emails and push clicks
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { buildDigest, digestEmailHtml, localDate, type DigestTask } from '../_shared/digest.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || !timingSafeEqual(req.headers.get('x-cron-secret') ?? '', secret)) return json({ error: 'forbidden' }, 403);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const now = new Date();
  const today = localDate(now);
  const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

  const vapidPub = Deno.env.get('VAPID_PUBLIC_KEY'), vapidPriv = Deno.env.get('VAPID_PRIVATE_KEY');
  const pushReady = !!(vapidPub && vapidPriv);
  if (pushReady) webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', vapidPub!, vapidPriv!);
  const resendKey = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('REMINDER_FROM_EMAIL');
  const emailReady = !!(resendKey && from);

  const summary = { users: 0, pushSent: 0, emailSent: 0, skippedNothingDue: 0, failures: [] as string[] };

  // Everyone who hasn't switched notifications off. (settings row missing = defaults = on, push needs a subscription anyway.)
  const { data: off } = await admin.from('settings').select('user_id').eq('notifications_enabled', false);
  const optedOut = new Set((off ?? []).map((r: { user_id: string }) => r.user_id));

  const { data: openTasks, error: taskErr } = await admin.from('tasks')
    .select('id, user_id, title, deadline, priority, status').neq('status', 'done').not('deadline', 'is', null)
    .lte('deadline', new Date(now.getTime() + 36 * 3600 * 1000).toISOString()).limit(5000);
  if (taskErr) return json({ error: taskErr.message }, 500);

  const byUser = new Map<string, DigestTask[]>();
  for (const t of (openTasks ?? []) as (DigestTask & { user_id: string })[]) {
    if (optedOut.has(t.user_id)) continue;
    (byUser.get(t.user_id) ?? byUser.set(t.user_id, []).get(t.user_id)!).push(t);
  }

  for (const [userId, tasks] of byUser) {
    summary.users++;
    const { data: profile } = await admin.from('alora_profiles').select('display_name').eq('user_id', userId).maybeSingle();
    const digest = buildDigest(tasks, now, (profile as { display_name?: string } | null)?.display_name);
    if (!digest) { summary.skippedNothingDue++; continue; }

    // Claim first, send second: if two runs overlap, the unique key lets exactly one through.
    const claim = async (channel: string) => {
      const { error } = await admin.from('notification_log').insert({ user_id: userId, kind: 'daily_digest', ref_key: today, channel });
      return !error;
    };
    const release = (channel: string) => admin.from('notification_log').delete().match({ user_id: userId, kind: 'daily_digest', ref_key: today, channel });

    // ---- push
    if (pushReady) {
      const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
      if (subs?.length && await claim('push')) {
        let delivered = 0;
        for (const s of subs as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: digest.title, body: digest.body, url: `${appUrl}/#/tasks` }), { TTL: 6 * 3600 });
            delivered++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id); // browser unsubscribed
            else summary.failures.push(`push ${userId.slice(0, 8)}: ${code ?? (e as Error).message}`);
          }
        }
        if (delivered) summary.pushSent++; else await release('push');
      }
    }

    // ---- email
    if (emailReady) {
      const { data: s } = await admin.from('settings').select('email_reminders_enabled').eq('user_id', userId).maybeSingle();
      if ((s as { email_reminders_enabled?: boolean } | null)?.email_reminders_enabled && await claim('email')) {
        const { data: u } = await admin.auth.admin.getUserById(userId);
        const to = u?.user?.email;
        let ok = false;
        if (to) {
          const r = await fetch('https://api.resend.com/emails', {
            method: 'POST', headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from, to, subject: digest.title, html: digestEmailHtml(digest, appUrl), text: `${digest.title}\n\n${digest.body}\n\n${appUrl}/#/tasks` }),
          });
          ok = r.ok;
          if (!ok) summary.failures.push(`email ${userId.slice(0, 8)}: ${r.status}`);
        }
        if (ok) summary.emailSent++; else await release('email'); // a failed send can be retried by the next run
      }
    }
  }
  return json({ ok: true, ...summary, pushConfigured: pushReady, emailConfigured: emailReady });
});
