// Vercel serverless function — Polish index historical data via Bankier.pl public API.
// Uses api.bankier.pl which returns daily data from 1994 to today (no auth required).

const SYMBOLS = { WIG: 'WIG', WIG20: 'WIG20', WIG30: 'WIG30' };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const sym = (req.query.s || '').toUpperCase();
  if (!SYMBOLS[sym]) {
    return res.status(400).json({ error: `Unknown symbol: ${sym}. Allowed: ${Object.keys(SYMBOLS).join(', ')}` });
  }

  const url = `https://api.bankier.pl/quotes/public/gpw-indices-section-chart/?symbols=${sym}&metrics=true&intraday=false&max_period=true`;
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://www.bankier.pl/inwestowanie/profile/quote.html?symbol=${sym}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`Bankier HTTP ${r.status}`);

    const body = await r.json();
    const rawItems = body?.data ?? [];
    const item = rawItems.find(it => it.symbol === sym);
    const raw = item?.data ?? [];
    if (!raw.length) throw new Error(`No data returned for ${sym}`);

    const pts = raw
      .map(([ts, price]) => ({ date: new Date(ts).toISOString().slice(0, 10), price: parseFloat(price) }))
      .filter(p => p.price > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(pts);
  } catch (e) {
    console.error('bench-pl error:', e.message);
    return res.status(502).json({ error: e.message });
  }
}
