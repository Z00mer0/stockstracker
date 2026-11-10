// Kontrakty terminowe (GPW): w majątku liczy się depozyt zabezpieczający
// plus bieżący wynik = liczba kontraktów × mnożnik × (kurs − kurs otwarcia),
// dla pozycji krótkiej z odwrotnym znakiem. Kurs ze stooq (/api/quotes).

// Mnożniki GPW: indeksy WIG20 20 zł, mWIG40 40 zł; akcje zwykle 100 szt.;
// waluty 1000 jednostek. Dla innych serii użytkownik wpisuje sam.
export function defaultMultiplier(code) {
  const c = String(code ?? '').toUpperCase();
  if (c.startsWith('FW20')) return 20;
  if (c.startsWith('FW40')) return 40;
  if (/^F(USD|EUR|GBP|CHF)/.test(c)) return 1000;
  return 100;
}

/** Symbol do /api/quotes: seria prosto ze stooq. */
export const futureQuoteSymbol = code => `STOOQ:${String(code ?? '').trim().toUpperCase()}`;

/** @returns {{ value:number, pl:number|null }} — bez kursu sam depozyt. */
export function futureValue(margin, future, price) {
  const m = Number(margin) || 0;
  if (!(price > 0) || !future) return { value: m, pl: null };
  const dir = future.side === 'short' ? -1 : 1;
  const pl = Math.round(dir * (Number(future.contracts) || 0) * (Number(future.multiplier) || 0) * (price - (Number(future.entryPrice) || 0)) * 100) / 100;
  return { value: Math.round((m + pl) * 100) / 100, pl };
}

/** Pozycja „inne aktywa" z kontraktem: wartość z bieżącego kursu, `margin` = wpisany depozyt. */
export function withFutureValue(asset, quotes = {}) {
  if (!asset?.future) return asset;
  const price = quotes[futureQuoteSymbol(asset.future.code)] ?? null;
  const { value, pl } = futureValue(asset.value, asset.future, price);
  return { ...asset, margin: asset.value, value, pl, futurePrice: price };
}
