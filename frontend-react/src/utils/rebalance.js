// Zlecenia rebalansujące: przy docelowych udziałach sumujących się do 100%
// każda pozycja odbiegająca o ≥ 2 pkt proc. dostaje zlecenie kupna/sprzedaży.
//
// Cena i liczba akcji w PLN: wcześniej kwotę w złotych dzielono przez cenę
// w walucie notowania — dla spółki z USA wychodziło ~4× za dużo akcji,
// a cenę w dolarach pokazywano jako złote.
//   positions: [{ symbol, qty, valuePLN }] (tylko wycenione, wartość > 0)
//   targets:   { SYMBOL: procent }
//   total:     wartość bazowa w PLN
export function rebalanceOrders(positions, targets, total) {
  const keys = Object.keys(targets);
  const targetSum = keys.reduce((s, k) => s + (targets[k] || 0), 0);
  if (!keys.length || Math.abs(targetSum - 100) >= 1 || !(total > 0)) return [];
  return positions
    .map(p => {
      const dev = (p.valuePLN / total) * 100 - (targets[p.symbol] ?? 0);
      if (Math.abs(dev) < 2) return null;
      const amtPLN = Math.abs(dev) / 100 * total;
      const pricePLN = p.qty > 0 ? p.valuePLN / p.qty : null;
      return {
        symbol: p.symbol,
        dev,
        side: dev > 0 ? 'sell' : 'buy',
        amtPLN,
        pricePLN,
        shares: pricePLN ? Math.round(amtPLN / pricePLN) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
}
