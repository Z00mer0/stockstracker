// Wspólne drobiazgi dla list transakcji.

// Typ transakcji w jednej postaci. Część danych (import brokera) ma
// „DIVIDEND" zamiast „DIV" albo małe litery — filtr „Dywidendy" i suma
// dywidend z 30 dni ich nie widziały, choć Portfel liczył je poprawnie.
export function normalizeType(type) {
  const up = String(type ?? '').toUpperCase();
  return up === 'DIVIDEND' ? 'DIV' : up;
}

// Kwota transakcji w jej własnej walucie (CASH nie ma ilości).
export const txAmount = tx => (tx.qty ?? 1) * (tx.price ?? 0);

// Prowizja kupna/sprzedaży (tx.fee) — łącznie, w walucie transakcji.
export const txFee = tx => Number(tx.fee) || 0;

// Koszt jednej akcji z zakupu razem z prowizją — z tego liczy się średnia
// cena pozycji, a więc i wynik sprzedaży.
export const buyUnitCost = tx => (tx.price ?? 0) + (tx.qty > 0 ? txFee(tx) / tx.qty : 0);

// Podatek pobrany od dywidendy (tx.tax) — łącznie, w walucie dywidendy.
export const divNet = tx => txAmount(tx) - (Number(tx.tax) || 0);

// Sumy kupna / sprzedaży / dywidend / gotówki z ostatnich 30 dni w walucie
// wyświetlania. Wcześniej kwoty w różnych walutach były dodawane wprost
// i podpisane walutą wyświetlania — zakup za 1110 $ liczył się jako 1110 zł.
export function last30Totals(transactions, fxRates, displayCurrency, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const toDisp = fxRates[displayCurrency] ?? 1;
  const totals = { BUY: 0, SELL: 0, DIV: 0, CASH: 0 };
  for (const tx of transactions) {
    if (!(new Date(tx.date) >= cutoff)) continue;
    const type = normalizeType(tx.type);
    if (!(type in totals)) continue;
    totals[type] += txAmount(tx) * (fxRates[tx.currency] ?? 1) / toDisp;
  }
  return { buy: totals.BUY, sell: totals.SELL, div: totals.DIV, cash: totals.CASH };
}
