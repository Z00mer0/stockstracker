// Wspólna pamięć kursów dla /api/quotes: symbol pobrany z Yahoo/stooq
// obsługuje przez minutę każde kolejne żądanie, a równoczesne prośby o ten
// sam symbol czekają na jedno pobranie zamiast odpytywać źródło osobno.
//
// Zasięg: pamięć procesu. Na AWS (jeden stały proces) dzielą ją wszyscy
// użytkownicy i sprawdzanie powiadomień w server.py. Na Vercelu — żądania,
// które trafią do tej samej rozgrzanej instancji.
//
// Błąd przejściowy (null) nie jest zapamiętywany, żeby następne żądanie
// spróbowało od nowa.

const TTL_MS = 60 * 1000;
const MAX_KEYS = 2000;   // zapora przed puchnięciem pamięci

const cache = new Map();   // sym → { at, promise }

export function cachedQuote(sym, fetcher, now = Date.now()) {
  const hit = cache.get(sym);
  if (hit && now - hit.at < TTL_MS) return hit.promise;
  if (cache.size >= MAX_KEYS) cache.clear();
  const forget = () => { if (cache.get(sym)?.promise === promise) cache.delete(sym); };
  const promise = fetcher(sym).then(
    v => { if (v == null) forget(); return v; },
    e => { forget(); throw e; },
  );
  cache.set(sym, { at: now, promise });
  return promise;
}

export function _clearQuoteCache() { cache.clear(); }
