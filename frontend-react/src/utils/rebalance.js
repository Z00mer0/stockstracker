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

// „Gdzie wpłacić kolejne X zł": tylko zakupy (bez sprzedaży, więc bez podatku),
// jak najbliżej docelowych udziałów po wpłacie. Luki liczone od nowej wartości
// portfela; gdy wpłata ich nie pokrywa — dzielona proporcjonalnie do luk,
// nadwyżka ponad luki — według udziałów docelowych. Potem całe akcje (w dół)
// i dokupowanie po jednej akcji tam, gdzie po zakupie brakuje najwięcej,
// dopóki starcza reszty.
//   zwraca { orders: [{ symbol, amtPLN, shares, pricePLN, cost, afterPct }], leftover }
export function allocateNewMoney(positions, targets, total, amount) {
  const keys = Object.keys(targets).filter(k => targets[k] > 0);
  const targetSum = Object.values(targets).reduce((s, v) => s + (v || 0), 0);
  if (!keys.length || Math.abs(targetSum - 100) >= 1 || !(amount > 0)) return { orders: [], leftover: amount > 0 ? amount : 0 };
  const newTotal = (total > 0 ? total : 0) + amount;
  const items = positions
    .filter(p => targets[p.symbol] > 0 && p.qty > 0 && p.valuePLN > 0)
    .map(p => ({ symbol: p.symbol, value: p.valuePLN, pricePLN: p.valuePLN / p.qty, w: targets[p.symbol] / 100 }));
  const gaps = items.map(i => Math.max(0, i.w * newTotal - i.value));
  const G = gaps.reduce((s, g) => s + g, 0);
  const wSum = items.reduce((s, i) => s + i.w, 0) || 1;
  const ideal = items.map((i, k) => (G >= amount ? amount * gaps[k] / G : gaps[k] + (amount - G) * i.w / wSum));

  const shares = items.map((i, k) => Math.floor(ideal[k] / i.pricePLN + 1e-9));
  let leftover = amount - items.reduce((s, i, k) => s + shares[k] * i.pricePLN, 0);
  for (;;) {
    let best = -1, bestGap = 0;
    items.forEach((i, k) => {
      if (i.pricePLN > leftover + 1e-9) return;
      const gap = i.w * newTotal - (i.value + shares[k] * i.pricePLN);
      if (gap > bestGap) { best = k; bestGap = gap; }
    });
    if (best < 0) break;
    shares[best] += 1;
    leftover -= items[best].pricePLN;
  }
  const orders = items.map((i, k) => ({
    symbol: i.symbol,
    amtPLN: ideal[k],
    shares: shares[k],
    pricePLN: i.pricePLN,
    cost: shares[k] * i.pricePLN,
    afterPct: ((i.value + shares[k] * i.pricePLN) / newTotal) * 100,
  })).filter(o => o.shares > 0).sort((a, b) => b.cost - a.cost);
  return { orders, leftover: Math.max(0, leftover) };
}
