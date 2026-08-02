import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { apiLoadWatchlist, loadWatchlistLocal } from '../services/watchlistService';
import { isAuthed } from '../utils/auth.js';
import { shouldNotify, getPriceChangeBucket, todayKey } from '../utils/notificationText.js';
import { lsSet } from '../utils/safeStorage.js';

const POLL_MS = 5 * 60 * 1000;
const SEEN_KEY = 'myfund_notif_seen';
const MUTED_KEY = 'myfund_notif_muted';
const SCAN_KEY = 'myfund_notif_scan';

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

// Notowania paczkami, nie po jednym symbolu.
//
// Wczesniej bylo jedno zadanie na symbol do /api/finnhub/v1/quote — przy
// portfelu i watchliscie na kilkadziesiat pozycji to kilkadziesiat zadan co
// piec minut z kazdej otwartej karty. Ten sam blad naprawiono juz kiedys po
// stronie serwera (patrz test_quotes_batch.py). /api/quotes?format=map bierze
// do 60 symboli naraz i odpytuje je rownolegle.
const QUOTES_CHUNK = 60;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// Wpis z ?format=map -> ksztalt, ktorego uzywa reszta hooka. Sciezka stooq
// oddaje sama cene bez zmiany dziennej — bez niej nie da sie ocenic progu,
// wiec taki symbol pomijamy (serwer robi to samo).
export function quoteFromEntry(symbol, entry) {
  if (!entry || entry.notFound) return null;
  const q = entry.quote || {};
  const price = Number(q.regularMarketPrice);
  const changePct = q.regularMarketChangePercent;
  if (!(price > 0) || changePct == null) return null;
  const dp = Number(changePct);
  const prev = price / (1 + dp / 100);
  return { symbol, price, changePct: dp, changeAbs: price - prev };
}

export async function fetchQuotes(symbols) {
  const out = [];
  for (const part of chunk(symbols, QUOTES_CHUNK)) {
    try {
      const url = `/api/quotes?format=map&symbols=${encodeURIComponent(part.join(','))}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) continue;
      const { quotes } = await r.json();
      for (const sym of part) {
        const q = quoteFromEntry(sym, quotes?.[sym]);
        if (q) out.push(q);
      }
    } catch {}
  }
  return out;
}

// Wynik skanu wspoldzielony miedzy zakladkami.
//
// Paczkowanie zbilo jedno zadanie na symbol do dwoch na skan, ale kazda
// otwarta zakladka nadal odpytywala osobno — trzy zakladki to trzy razy
// tyle. Skan trafia wiec do localStorage ze znacznikiem czasu i podpisem
// listy symboli; zakladka, ktora zastanie swiezy wynik, nie rusza sieci.
// Efekt: ruch nie zalezy od liczby otwartych kart.
//
// Podpis jest potrzebny, bo dwie zakladki moga patrzec na rozne portfele —
// wynik dla innego zestawu symboli nie moze sie przekleic.
export function scanSignature(symbols) {
  return [...symbols].sort().join(',');
}

export function readScanCache(sig, maxAgeMs, now = Date.now()) {
  try {
    const parsed = JSON.parse(lsRead(SCAN_KEY));
    if (!parsed || !Array.isArray(parsed.quotes)) return null;
    if (!Number.isFinite(parsed.ts)) return null;
    if (parsed.sig !== sig) return null;
    // Zegar potrafi sie cofnac (synchronizacja, strefa) — wpis z przyszlosci
    // traktujemy jak nieswiezy, zeby nie zamrozic skanu na dlugo.
    if (parsed.ts > now) return null;
    if (now - parsed.ts > maxAgeMs) return null;
    return parsed.quotes;
  } catch { return null; }
}

export function writeScanCache(sig, quotes, now = Date.now()) {
  lsSet(SCAN_KEY, JSON.stringify({ ts: now, sig, quotes }));
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

    // Swiezy wynik z innej zakladki oszczedza cale zapytanie.
    const sig = scanSignature(targets);
    let quotes = readScanCache(sig, POLL_MS);
    if (!quotes) {
      quotes = await fetchQuotes(targets);
      writeScanCache(sig, quotes);
    }
    const fresh = [];
    for (const q of quotes) {
      if (!shouldNotify(q.changePct)) continue;
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

  // Karta w tle nie ma komu pokazac dzwonka, a odpytywanie leci z kazdej
  // otwartej zakladki — wiec w tle nie skanujemy, a po powrocie doganiamy.
  useEffect(() => {
    let id;
    function start() {
      scan();
      id = setInterval(scan, POLL_MS);
    }
    function stop() { clearInterval(id); id = undefined; }
    function onVisibility() {
      if (document.hidden) stop();
      else if (!id) start();
    }
    // Skan w innej zakladce = gotowy wynik tutaj; scan() trafi w swiezy
    // cache i przeliczy karty bez ruszania sieci.
    function onStorage(e) { if (e.key === SCAN_KEY) scan(); }
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
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
