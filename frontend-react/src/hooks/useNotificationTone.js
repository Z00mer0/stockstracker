import { useCallback, useEffect, useState } from 'react';
import { lsSet } from '../utils/safeStorage.js';
import { api } from './useApi.js';
import { isAuthed } from '../utils/auth.js';

export const TONE_KEY = 'myfund_notification_tone';
const VALID = new Set(['professional', 'funny']);

function lsRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readTone() {
  const raw = lsRead(TONE_KEY);
  return VALID.has(raw) ? raw : 'professional';
}

// Client-side mirror onto a per-portfolio prefs blob. The backend portfolio
// schema doesn't carry a settings field yet, so we piggy-back on
// localStorage keyed by active portfolio id — enough for cross-tab
// awareness without a migration.
function mirrorToActivePortfolio(tone) {
  try {
    const activeId = lsRead('myfund_active_portfolio');
    if (!activeId) return;
    const shadowKey = `myfund_portfolio_prefs_${activeId}`;
    const raw = lsRead(shadowKey);
    const obj = raw ? JSON.parse(raw) : {};
    obj.notificationTone = tone;
    lsSet(shadowKey, JSON.stringify(obj));
  } catch {}
}

export function useNotificationTone() {
  const [tone, setToneState] = useState(readTone);

  // Pull server truth on mount if authed, so a device without local prefs
  // still respects the tone set on another device.
  useEffect(() => {
    if (!isAuthed()) return;
    let cancelled = false;
    api.get('/api/notification-tone')
      .then(res => {
        if (cancelled) return;
        const t = res?.data?.tone;
        if (VALID.has(t) && t !== readTone()) {
          lsSet(TONE_KEY, t);
          setToneState(t);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === TONE_KEY) setToneState(readTone());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTone = useCallback((next) => {
    const value = VALID.has(next) ? next : 'professional';
    lsSet(TONE_KEY, value);
    mirrorToActivePortfolio(value);
    setToneState(value);
    if (isAuthed()) {
      api.post('/api/notification-tone', { tone: value }).catch(() => {});
    }
  }, []);

  return [tone, setTone];
}
