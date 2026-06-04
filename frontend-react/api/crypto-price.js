const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', MATIC: 'matic-network',
  DOT: 'polkadot', SHIB: 'shiba-inu', AVAX: 'avalanche-2', LINK: 'chainlink',
  UNI: 'uniswap', LTC: 'litecoin', BCH: 'bitcoin-cash', ATOM: 'cosmos',
  XLM: 'stellar', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum',
  OP: 'optimism', INJ: 'injective-protocol', SUI: 'sui', TRX: 'tron',
  TON: 'the-open-network', PEPE: 'pepe', WIF: 'dogwifcoin',
};

export default async function handler(req, res) {
  const rawSyms = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  const symToId = Object.fromEntries(rawSyms.filter(s => COINGECKO_IDS[s]).map(s => [s, COINGECKO_IDS[s]]));

  if (!Object.keys(symToId).length) { res.status(200).json({}); return; }

  const ids = Object.values(symToId).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd,pln,eur&include_24hr_change=true`;

  try {
    const upstream = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) { res.status(502).json({ error: 'coingecko error' }); return; }
    const cgData = await upstream.json();
    const idToSym = Object.fromEntries(Object.entries(symToId).map(([s, id]) => [id, s]));
    const result = {};
    for (const [cgId, vals] of Object.entries(cgData)) {
      const sym = idToSym[cgId];
      if (sym) result[sym] = { usd: vals.usd, pln: vals.pln, eur: vals.eur, change24h: vals.usd_24h_change };
    }
    res.setHeader('Cache-Control', 's-maxage=300');
    res.status(200).json(result);
  } catch (e) {
    res.status(502).json({ error: 'upstream request failed' });
  }
}
