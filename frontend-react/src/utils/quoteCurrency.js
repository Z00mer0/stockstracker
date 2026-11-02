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
