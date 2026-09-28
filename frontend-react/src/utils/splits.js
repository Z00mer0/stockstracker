// Podziały akcji (splity). Zapisujemy je jako transakcję
//   { type: 'SPLIT', symbol, date, ratio }
// gdzie ratio = liczba nowych akcji za jedną starą (10 dla 10:1, 0.1 dla
// scalenia 1:10). Data to dzień, od którego kurs jest już po podziale —
// transakcje z tego dnia są w nowych jednostkach.
//
// Pozycję w portfelu przelicza się raz, przy zastosowaniu splitu. Historia
// transakcji zostaje taka, jak była (tak wygląda w wyciągu z biura), a obliczenia,
// które odtwarzają ilości z historii, biorą ją przez splitAdjusted().

export const isSplit = tx => String(tx?.type ?? '').toUpperCase() === 'SPLIT';

// Transakcje kupna/sprzedaży przeliczone na jednostki po wszystkich późniejszych
// splitach tej samej spółki w tym samym portfelu (_portfolioId w widoku „Wszystkie").
// Wartości (ilość × cena) się nie zmieniają. Wpisy SPLIT są pomijane.
export function splitAdjusted(transactions = []) {
  const splits = transactions.filter(t => isSplit(t) && t.ratio > 0 && t.symbol && t.date);
  if (!splits.length) return transactions;
  return transactions.filter(t => !isSplit(t)).map(t => {
    const type = String(t.type ?? '').toUpperCase();
    if (type !== 'BUY' && type !== 'SELL') return t;
    const f = splits
      .filter(s => s.symbol === t.symbol && s._portfolioId === t._portfolioId && (t.date || '') < s.date)
      .reduce((acc, s) => acc * s.ratio, 1);
    if (f === 1) return t;
    return {
      ...t,
      qty: t.qty != null ? t.qty * f : t.qty,
      price: t.price != null ? t.price / f : t.price,
      ...(t.costBasis != null ? { costBasis: t.costBasis / f } : {}),
    };
  });
}

// „10:1" → 10, „1:10" → 0.1 (Yahoo podaje numerator/denominator).
export const splitRatio = (numerator, denominator) =>
  numerator > 0 && denominator > 0 ? numerator / denominator : null;
