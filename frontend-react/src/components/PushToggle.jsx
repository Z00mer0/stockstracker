// src/components/PushToggle.jsx
import { useEffect, useState } from 'react';
import { useT } from '../context/LanguageContext';
import { authHeader } from '../utils/auth.js';
import { pushSupported, getPushSubscription, subscribePush } from '../utils/pushSubscription.js';

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export default function PushToggle() {
  const t = useT();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getPushSubscription().then(sub => setSubscribed(!!sub));
  }, []);

  if (isIOS && !isStandalone) {
    return <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>💡 {t('push_ios_hint')}</span>;
  }
  if (!pushSupported) return null;

  async function enable() {
    setBusy(true); setMsg('');
    try {
      const r = await subscribePush();
      if (!r.ok) {
        setMsg(r.reason === 'denied' ? t('push_denied') : r.reason);
      } else {
        setSubscribed(true);
      }
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg('');
    try {
      const sub = await getPushSubscription();
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
