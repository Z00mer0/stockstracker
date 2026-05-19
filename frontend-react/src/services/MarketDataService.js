// frontend-react/src/services/MarketDataService.js

export const MD_API_KEY_LS = 'marketdata_api_key';
const CACHE_PREFIX = 'marketdata_chain_';
const CACHE_TTL    = 10 * 60 * 1000;

export function getMdApiKey() {
  return localStorage.getItem(MD_API_KEY_LS) || '';
}

export function setMdApiKey(key) {
  localStorage.setItem(MD_API_KEY_LS, key.trim());
}

export function getChainFromCache(ticker) {
  try {
    const cacheKey = CACHE_PREFIX + ticker.toUpperCase().trim();
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  } catch {}
  return null;
}

export async function fetchOptionChain(ticker) {
  const token = getMdApiKey();
  if (!token) throw new Error('Brak klucza API. Ustaw go w Ustawienia → Klucze API.');

  const sym = ticker.toUpperCase().trim();
  const cacheKey = CACHE_PREFIX + sym;

  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached?.ts && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  } catch { /* invalid cache — will re-fetch */ }

  // dte=1-365 filters out expired contracts (avoids "These option contracts have expired" error)
  const url = `https://api.marketdata.app/v1/options/chain/${encodeURIComponent(sym)}/?dte=1-365&token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

  const json = await res.json().catch(() => { throw new Error(`HTTP ${res.status}`); });
  if (!res.ok || json.s === 'error') {
    localStorage.removeItem(cacheKey); // clear stale cache on error
    throw new Error(json.errmsg || `HTTP ${res.status}`);
  }

  if (!json.optionSymbol?.length) {
    throw new Error(`Brak kontraktów dla ${sym}`);
  }

  const n = (json.optionSymbol || []).length;
  const contracts = Array.from({ length: n }, (_, i) => ({
    optionSymbol: json.optionSymbol[i],
    expiry:       json.expirationDate?.[i] ?? '',
    strike:       json.strike?.[i]         ?? 0,
    side:         json.side?.[i]           ?? 'call',
    bid:          json.bid?.[i]            ?? null,
    ask:          json.ask?.[i]            ?? null,
    mid:          json.mid?.[i]            ?? null,
    iv:           json.iv?.[i]             ?? null,
    delta:        json.delta?.[i]          ?? null,
    theta:        json.theta?.[i]          ?? null,
    dte:          json.dte?.[i]            ?? null,
  }));

  const expirations = [...new Set(contracts.map(c => c.expiry))].sort();
  const data = { expirations, contracts };

  localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  return data;
}

export async function getOptionQuote(optionSymbol) {
  const token = getMdApiKey();
  if (!token) throw new Error('Brak klucza API.');

  const url = `https://api.marketdata.app/v1/options/quotes/${encodeURIComponent(optionSymbol)}/?token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = await res.json().catch(() => { throw new Error(`HTTP ${res.status}`); });
  if (!res.ok || json.s === 'error') throw new Error(json.errmsg || `HTTP ${res.status}`);

  return {
    bid:   json.bid?.[0]   ?? null,
    ask:   json.ask?.[0]   ?? null,
    mid:   json.mid?.[0]   ?? null,
    iv:    json.iv?.[0]    ?? null,
    delta: json.delta?.[0] ?? null,
    theta: json.theta?.[0] ?? null,
  };
}
