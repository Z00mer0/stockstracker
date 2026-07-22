// Weighted average of two lots. Zwraca 0 przy sumie qty <= 0 (guard przed NaN).
export function weightedAvg(qty1, price1, qty2, price2) {
  const total = qty1 + qty2;
  if (total <= 0) return 0;
  return (qty1 * price1 + qty2 * price2) / total;
}
