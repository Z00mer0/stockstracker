// Drugie źródło kursu dla spółek z GPW (stooq.com, CSV). Służy do kontroli
// kursu z Yahoo i jako zapas, gdy Yahoo nie odpowie.
//
// Pamięć 5 min w ciepłej instancji funkcji: każdy użytkownik odpytuje kursy
// co minutę, a stooq ma dzienny limit zapytań na adres.

const TTL_MS = 5 * 60 * 1000;
const cache = new Map();   // sym → { at, value }

// Fundusze inwestycyjne (TFI) mają na stooq numeryczny kod z sufiksem .N, np. 1048.N.
export const isFundSymbol = sym => /^\d+\.N$/i.test(String(sym ?? ''));

// „STOOQ:FW20Z2620" — instrument tylko ze stooq (np. kontrakty terminowe GPW).
export const isStooqDirect = sym => /^STOOQ:[A-Z0-9._-]{1,20}$/i.test(String(sym ?? ''));

export function stooqSymbol(sym) {
  if (isStooqDirect(sym)) return sym.slice(6).toLowerCase();
  if (isFundSymbol(sym)) return sym.toLowerCase();
  return /\.WA$/i.test(sym) ? sym.slice(0, -3).toLowerCase() : null;
}

// f=sd2t2c → Symbol,Date,Time,Close. Brak danych: „N/D”.
export function parseStooqCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const [, date, time, close] = lines[1].split(',');
  const price = parseFloat(close);
  if (!(price > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  return { source: 'stooq', price, date, time: /^\d{2}:\d{2}/.test(time || '') ? time.slice(0, 5) : null };
}

export async function fetchStooq(sym, { fetchImpl = fetch, now = Date.now(), headers = {} } = {}) {
  const s = stooqSymbol(sym);
  if (!s) return null;
  const hit = cache.get(s);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  let value = null;
  try {
    const r = await fetchImpl(`https://stooq.com/q/l/?s=${s}&f=sd2t2c&h&e=csv`, {
      headers: { 'Referer': 'https://stooq.com/', ...headers },
      signal: AbortSignal.timeout(6000),
    });
    if (r.ok) value = parseStooqCsv(await r.text());
  } catch { /* brak drugiego źródła — tylko bez kontroli */ }
  cache.set(s, { at: now, value });
  return value;
}

export function _clearStooqCache() { cache.clear(); }
