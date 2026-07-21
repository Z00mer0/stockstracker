// Współdzielone helpery Web Push — używane przez PushToggle i Settings.
import { authHeader } from './auth.js';

export const pushSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}

// Zwraca aktualną subskrypcję lub null. Bez błędu gdy brak SW.
export async function getPushSubscription() {
  if (!pushSupported) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch { return null; }
}

// Włącza push: uprawnienia + subscribe + POST /api/push/subscribe.
// Zwraca { ok: true } lub { ok: false, reason: string }.
export async function subscribePush() {
  if (!pushSupported) return { ok: false, reason: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  const vres = await fetch('/api/push/vapid-key', { headers: authHeader() });
  if (!vres.ok) return { ok: false, reason: `vapid-key ${vres.status}` };
  const { key } = await vres.json();
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  const sres = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!sres.ok) return { ok: false, reason: `subscribe ${sres.status}` };
  return { ok: true };
}
