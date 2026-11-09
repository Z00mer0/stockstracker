// Porównanie kursu z Yahoo z drugim źródłem (stooq, GPW). Rozjazd ponad
// próg z tej samej sesji to sygnał, że któreś źródło podaje zły kurs —
// wtedy wycena portfela nie zgadzałaby się z biurem.
export const PRICE_CHECK_PCT = 1;

const warsawDate = ts => new Date(ts * 1000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' });

// price: kurs z Yahoo; marketTime: czas notowania Yahoo (s); check: { source, price, date, time }
// → { source, price, date, time, diffPct, mismatch } | null
export function comparePrice(price, marketTime, check) {
  if (!(price > 0) || !(check?.price > 0)) return null;
  const diffPct = (check.price / price - 1) * 100;
  // Kurs z innego dnia (np. stooq jeszcze z wczoraj) — nie ma czego porównywać.
  const sameSession = marketTime ? warsawDate(marketTime) === check.date : false;
  return { ...check, diffPct, mismatch: sameSession && Math.abs(diffPct) > PRICE_CHECK_PCT };
}
