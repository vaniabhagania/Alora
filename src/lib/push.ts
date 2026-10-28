import { supabase } from '@/lib/supabase';

/** Public VAPID key (safe in the bundle). The private half lives only in Supabase secrets. */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim();

export type PushSupport = 'unsupported' | 'not-configured' | 'denied' | 'ready';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  if (Notification.permission === 'denied') return 'denied';
  return 'ready';
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  return existing ?? navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}

/** Is this browser currently subscribed AND is that subscription saved for this account? */
export async function isPushOn(): Promise<boolean> {
  if (pushSupport() === 'unsupported') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle();
    return !!data;
  } catch { return false; }
}

export type EnablePushResult = { ok: true } | { ok: false; message: string };

export async function enablePush(): Promise<EnablePushResult> {
  const support = pushSupport();
  if (support === 'unsupported') return { ok: false, message: "This browser can't receive push notifications. On iPhone, add Alora to your Home Screen first." };
  if (support === 'not-configured') return { ok: false, message: "Push isn't set up for this Alora yet (the VAPID key is missing)." };
  if (support === 'denied') return { ok: false, message: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, message: 'Permission was not granted, so no reminders will be sent to this device.' };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'You need to be signed in.' };
  let sub: PushSubscription;
  try {
    const reg = await registration();
    await navigator.serviceWorker.ready;
    sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource });
  } catch (e) {
    return { ok: false, message: `Couldn't subscribe this device: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) { await sub.unsubscribe().catch(() => {}); return { ok: false, message: 'The browser returned an incomplete subscription.' }; }
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) { await sub.unsubscribe().catch(() => {}); return { ok: false, message: "Couldn't save this device. Check your connection and try again." }; }
  return { ok: true };
}

export async function disablePush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    if (error) return false;
    await sub.unsubscribe();
    return true;
  } catch { return false; }
}
