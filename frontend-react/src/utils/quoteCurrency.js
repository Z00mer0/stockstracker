// Waluta notowania z Yahoo. Londyn notuje akcje w pensach (GBp / GBX) —
// cena w funtach to 1/100. Bez tego BP.L po 450 pensów liczył się jak 450 £.
export function fromQuote(price, currency) {
  if (price == null) return { price: null, currency: currency ?? null };
  if (currency === 'GBp' || currency === 'GBX') return { price: price / 100, currency: 'GBP' };
  return { price, currency: currency ?? null };
}

// Waluta notowania inna niż waluta pozycji (np. ETF z Londynu notowany w USD,
// a zapisany jako GBP) — wtedy wycena i wynik są w złej walucie.
export function currencyMismatch(quoteCurrency, positionCurrency) {
  if (!quoteCurrency || !positionCurrency) return null;
  return quoteCurrency !== positionCurrency ? quoteCurrency : null;
}

// Waluta notowania z Yahoo dla symboli spoza USA i GPW. Biuro (XTB .UK)
// nie mówi, w czym notowany jest instrument — ETF-y z Londynu, np. CSPX.L,
// są w USD, a sufiks podpowiadał GBP. Zwraca { symbol: waluta }; przy błędzie
// sieci pusty obiekt — import idzie wtedy z walutą z sufiksu.
export async function fetchQuoteCurrencies(symbols) {
  const list = [...new Set(symbols)].filter(s => /\.[A-Z]+$/i.test(s) && !/\.WA$/i.test(s));
  const out = {};
  for (let i = 0; i < list.length; i += 60) {
    const chunk = list.slice(i, i + 60);
    try {
      const res = await fetch(`/api/quotes?format=map&symbols=${chunk.map(encodeURIComponent).join(',')}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const { quotes } = await res.json();
      for (const sym of chunk) {
        const ccy = fromQuote(1, quotes?.[sym]?.quote?.currency).currency;
        if (ccy) out[sym] = ccy;
      }
    } catch { /* bez waluty z notowania — zostaje ta z sufiksu */ }
  }
  return out;
}

// Kupna/sprzedaże (albo pozycje z importu) w walucie notowania. Dywidendy
// i gotówka zostają w walucie rachunku.
export function withQuoteCurrency(items, currencies) {
  return items.map(it => {
    const ccy = currencies[it.symbol];
    if (!ccy || ccy === it.currency) return it;
    if (it.type != null && !['BUY', 'SELL'].includes(String(it.type).toUpperCase())) return it;
    return { ...it, currency: ccy };
  });
}
