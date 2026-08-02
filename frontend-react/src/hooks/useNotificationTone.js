import { useCallback, useEffect, useState } from 'react';
import { lsSet } from '../utils/safeStorage.js';
import { api } from './useApi.js';
import { isAuthed } from '../utils/auth.js';
import { useLanguage } from '../context/LanguageContext';

export const TONE_KEY = 'myfund_notification_tone';
export const HOUR_KEY = 'myfund_notification_hour';
const VALID_TONE = new Set(['professional', 'funny']);
const DEFAULT_HOUR = 16;

function lsRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readTone() {
  const raw = lsRead(TONE_KEY);
  return VALID_TONE.has(raw) ? raw : 'professional';
}

function readHour() {
  const raw = parseInt(lsRead(HOUR_KEY) ?? '', 10);
  return Number.isFinite(raw) && raw >= 0 && raw <= 23 ? raw : DEFAULT_HOUR;
}

// Byl tu jeszcze zapis kopii ustawien pod myfund_portfolio_prefs_<id>,
// opisany jako „swiadomosc miedzy kartami". Nic go nigdy nie czytalo —
// sam zapis do localStorage przy kazdej zmianie tonu i godziny. Zrodlem
// prawdy jest serwer (/api/notification-tone), a localStorage trzyma tylko
// ostatnia znana wartosc na czas offline'u.
function postPrefs(patch) {
  if (!isAuthed()) return;
  api.post('/api/notification-tone', patch).catch(() => {});
}

export function useNotificationTone() {
  const [tone, setToneState] = useState(readTone);
  const { language } = useLanguage();

  // Pull server truth on mount if authed.
  useEffect(() => {
    if (!isAuthed()) return;
    let cancelled = false;
    api.get('/api/notification-tone')
      .then(res => {
        if (cancelled) return;
        const t = res?.data?.tone;
        const h = res?.data?.hour;
        if (VALID_TONE.has(t) && t !== readTone()) {
          lsSet(TONE_KEY, t);
          setToneState(t);
        }
        if (Number.isFinite(h) && h >= 0 && h <= 23) {
          lsSet(HOUR_KEY, String(h));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Whenever the app language changes, push it to the server so OS-level
  // pushes speak the same language as the UI.
  useEffect(() => {
    if (!isAuthed()) return;
    postPrefs({ language });
  }, [language]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === TONE_KEY) setToneState(readTone());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTone = useCallback((next) => {
    const value = VALID_TONE.has(next) ? next : 'professional';
    lsSet(TONE_KEY, value);
    setToneState(value);
    postPrefs({ tone: value });
  }, []);

  return [tone, setTone];
}

export function useNotificationHour() {
  const [hour, setHourState] = useState(readHour);

  useEffect(() => {
    function onStorage(e) {
      if (e.key === HOUR_KEY) setHourState(readHour());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setHour = useCallback((next) => {
    const n = parseInt(next, 10);
    const value = Number.isFinite(n) && n >= 0 && n <= 23 ? n : DEFAULT_HOUR;
    lsSet(HOUR_KEY, String(value));
    setHourState(value);
    postPrefs({ hour: value });
  }, []);

  return [hour, setHour];
}
