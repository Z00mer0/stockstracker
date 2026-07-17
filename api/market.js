// Vercel serverless — fetches market indices + FX rates in one request
// Cached 5 min on CDN edge; avoids 5 separate client-side calls

const SYMBOLS = [
  { key: 'WIG20',   sym: 'WIG20.WA' }, // cash — no WIG20 futures on Yahoo
  { key: 'S&P500',  sym: 'ES=F'     }, // E-mini S&P 500 futures
  { key: 'NASDAQ',  sym: 'NQ=F'     }, // E-mini Nasdaq-100 futures
  { key: 'DAX',     sym: '^GDAXI'   }, // cash — FDAX=F not available on Yahoo
  { key: 'USD/PLN', sym: 'USDPLN=X' },
  { key: 'EUR/PLN', sym: 'EURPLN=X' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchOne(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
  const data = await r.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('no price');
  const price = meta.regularMarketPrice;
  const prev  = meta.chartPreviousClose;
  const delta = prev > 0 ? ((price - prev) / prev) * 100 : 0;
  return { price, delta };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Cache 5 min on Vercel CDN; client gets fresh data without hammering Yahoo
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  const results = await Promise.allSettled(SYMBOLS.map(({ sym }) => fetchOne(sym)));

  const tickers = SYMBOLS.map(({ key }, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') return { key, price: r.value.price, delta: r.value.delta };
    return { key, price: null, delta: null };
  });

  return res.status(200).json({ tickers, ts: Date.now() });
}
