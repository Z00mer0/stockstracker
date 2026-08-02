import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiLoadWatchlist, loadWatchlistLocal } from '../services/watchlistService';
import { isAuthed } from '../utils/auth.js';
import { NOTIFY_THRESHOLD, getPriceChangeBucket, todayKey } from '../utils/notificationText.js';
import { lsSet } from '../utils/safeStorage.js';

const POLL_MS = 5 * 60 * 1000;
const SEEN_KEY = 'myfund_notif_seen';
const MUTED_KEY = 'myfund_notif_muted';

function lsRead(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function readSet(key) {
  try { return new Set(JSON.parse(lsRead(key)) || []); } catch { return new Set(); }
}

function writeSet(key, set) {
  lsSet(key, JSON.stringify([...set]));
}

// Kiedy dane powiadomienie zobaczylismy pierwszy raz: { dedupeKey: ms }.
// Wczesniej to byla zwykla lista kluczy, ktora nikt nigdy nie czytal — sam
// zapis, bez czytelnika. Teraz z niej leci wiek karty, wiec „1 minutę temu"
// przestaje byc napisem na sztywno. Stary format (tablica) po prostu
// odrzucamy — jednorazowo, w granicach jednego dnia.
function readStamps(key) {
  try {
    const parsed = JSON.parse(lsRead(key));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return {};
    return parsed;
  } catch { return {}; }
}

function writeStamps(key, stamps) {
  lsSet(key, JSON.stringify(stamps));
}

// Prune keys whose date prefix isn't today — one line per read keeps LS small.
function pruneStale(set, today) {
  const kept = new Set();
  for (const k of set) if (k.startsWith(`${today}:`)) kept.add(k);
  return kept;
}

function pruneStaleStamps(stamps, today) {
  const kept = {};
  for (const [k, v] of Object.entries(stamps)) if (k.startsWith(`${today}:`)) kept[k] = v;
  return kept;
}

async function fetchQuote(sym) {
  try {
    const r = await fetch(`/api/finnhub/v1/quote?symbol=${encodeURIComponent(sym)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const q = await r.json();
    if (q?.c > 0 && q?.dp != null) {
      const dp = Number(q.dp);
      const priceNow = Number(q.c);
      const prev = priceNow / (1 + dp / 100);
      const abs = priceNow - prev;
      return { symbol: sym, price: priceNow, changePct: dp, changeAbs: abs };
    }
  } catch {}
  return null;
}

export function useMarketNotifications() {
  const { portfolio } = useApp();
  const [watchSymbols, setWatchSymbols] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const seenRef = useRef(readStamps(SEEN_KEY));
  const mutedRef = useRef(readSet(MUTED_KEY));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list = [];
      if (isAuthed()) {
        try {
          const data = await apiLoadWatchlist();
          if (Array.isArray(data)) list = data;
        } catch {}
      }
      if (!list.length) list = loadWatchlistLocal() || [];
      if (cancelled) return;
      setWatchSymbols([...new Set(list.map(w => w?.symbol).filter(Boolean))]);
    })();
    return () => { cancelled = true; };
  }, []);

  const targets = useMemo(() => {
    const pfSyms = (portfolio || []).map(h => h?.symbol).filter(Boolean);
    return [...new Set([...pfSyms, ...watchSymbols])];
  }, [portfolio, watchSymbols]);

  const scan = useCallback(async () => {
    if (!targets.length) { setNotifications([]); return; }
    const today = todayKey();
    seenRef.current = pruneStaleStamps(seenRef.current, today);
    mutedRef.current = pruneStale(mutedRef.current, today);

    const results = await Promise.allSettled(targets.map(fetchQuote));
    const fresh = [];
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      const q = r.value;
      if (Math.abs(q.changePct) < NOTIFY_THRESHOLD) continue;
      const bucket = getPriceChangeBucket(q.changePct);
      const dedupeKey = `${today}:${q.symbol}:${bucket}`;
      if (mutedRef.current.has(dedupeKey)) continue;
      // Pierwsze wykrycie ustala wiek karty i przezywa przeladowanie strony;
      // kolejne skany tego samego ruchu go nie odswiezaja.
      if (!seenRef.current[dedupeKey]) seenRef.current[dedupeKey] = Date.now();
      fresh.push({ ...q, bucket, dedupeKey, detectedAt: seenRef.current[dedupeKey] });
    }
    writeStamps(SEEN_KEY, seenRef.current);
    setNotifications(fresh);
  }, [targets]);

  useEffect(() => {
    scan();
    const id = setInterval(scan, POLL_MS);
    return () => clearInterval(id);
  }, [scan]);

  const dismiss = useCallback((dedupeKey, { mute = false } = {}) => {
    if (mute) {
      mutedRef.current.add(dedupeKey);
      writeSet(MUTED_KEY, mutedRef.current);
    }
    setNotifications(list => list.filter(n => n.dedupeKey !== dedupeKey));
  }, []);

  return { notifications, dismiss };
}
