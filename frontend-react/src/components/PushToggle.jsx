// src/components/PushToggle.jsx
import { useEffect, useState } from 'react';
import { useT } from '../context/LanguageContext';

function authHeader() { return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' }; }

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
}

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export default function PushToggle() {
  const t = useT();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  if (isIOS && !isStandalone) {
    return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>💡 {t('push_ios_hint')}</span>;
  }
  if (!supported) return null;

  async function enable() {
    setBusy(true); setMsg('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setMsg(t('push_denied')); return; }
      const vres = await fetch('/api/push/vapid-key', { headers: authHeader() });
      if (!vres.ok) throw new Error(`HTTP ${vres.status}`);
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
      if (!sres.ok) throw new Error(`HTTP ${sres.status}`);
      setSubscribed(true);
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const r = await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/push/test', { method: 'POST', headers: authHeader() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const { sent } = await r.json();
      setMsg(t('push_test_sent').replace('{n}', sent));
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally { setBusy(false); }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {msg && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{msg}</span>}
      {subscribed && (
        <button className="btn" onClick={sendTest} disabled={busy} style={{ fontSize: 11 }}>{t('push_test')}</button>
      )}
      <button className={`btn ${subscribed ? '' : 'btn-primary'}`} onClick={subscribed ? disable : enable}
        disabled={busy} style={{ fontSize: 11 }}>
        🔔 {subscribed ? t('push_disable') : t('push_enable')}
      </button>
    </span>
  );
}
