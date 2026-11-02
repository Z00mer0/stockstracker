// Kolejne źródła logo; gdy obrazek się nie wczyta, próbujemy następnego,
// a na końcu zostają inicjały. Domena (z mapy albo ze strony spółki w Yahoo)
// daje favicon, a logo po samym tickerze pokrywa spółki, dla których Yahoo
// nie zwrócił strony (np. ALAB, GRAB).
export function logoSources(symbol, domain) {
  const out = [];
  if (domain) out.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
  const ticker = symbol.replace(/\.US$/i, '').toUpperCase();
  if (/^[A-Z0-9.-]{1,15}$/.test(ticker) && !ticker.includes('-')) {
    out.push(`https://financialmodelingprep.com/image-stock/${ticker}.png`);
  }
  return out;
}
