import { useRegisterSW } from 'virtual:pwa-register/react';
import { useT } from '../context/LanguageContext';

/**
 * Toast shown when a new app version is waiting (PWA service worker).
 * Without it users keep running the previous build until they happen
 * to reload the tab.
 */
export default function UpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Long-lived tabs: look for a new version once an hour.
      if (registration) {
        setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 16px', borderRadius: 12,
      background: 'var(--panel)', border: '1px solid var(--border-strong)',
      boxShadow: '0 12px 40px rgba(0,0,0,.5)', maxWidth: 'calc(100vw - 32px)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{t('pwa_update_available')}</span>
      <button onClick={() => updateServiceWorker(true)} className="btn btn-primary" style={{ fontSize: 12 }}>
        {t('pwa_reload')}
      </button>
      <button onClick={() => setNeedRefresh(false)} className="btn" style={{ fontSize: 12 }}>
        {t('pwa_later')}
      </button>
    </div>
  );
}
