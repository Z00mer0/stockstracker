// Replay transakcji do daty snapshotu → zwraca invested per waluta w tej dacie
// (sum(qty * avgPrice) per currency, po weighted-average z BUY-ów i redukcji z SELL-i).
// Nie używa fx, nie przelicza — dopiero caller mnoży przez fx dla waluty wyświetlania.
// Zaleta: dla USD-only portfela wyświetlanego w USD, invested nie "oddycha" z NBP.
import { weightedAvg } from './weightedAvg.js';

// Zwraca { CCY: sumOfQtyTimesAvgPrice } po zastosowaniu transakcji <= date.
// Kolejność w obrębie dnia: BUY przed SELL (żeby same-day sprzedaż miała pokrycie).
export function investedByCurrencyAt(transactions, date) {
  const relevant = (transactions || [])
    // fromClosedPosition BUY-e są fabrykowane pod SELL z importu — nie ruszają holdings.
    .filter(tx => (tx.type === 'BUY' || tx.type === 'SELL') && tx.qty > 0
              && (tx.date || '') <= date && !tx.fromClosedPosition)
    .sort((a, b) => {
      const d = (a.date || '').localeCompare(b.date || '');
      if (d !== 0) return d;
      return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
    });

  // Per symbol → { qty, avg, currency }. Same-symbol w różnych walutach: bierzemy
  // walutę pierwszego BUY-a jako kanon (i tak w portfelu jeden symbol = jedna waluta).
  // fromSnapshot BUY: replace stanu (snapshot importu brokera = autorytatywna baseline
  // z ich avgPrice), zgodnie z AppContext:504-509. Kolejne "zwykłe" BUY po snapshotcie
  // dokładają się weighted-avg do tej baseline.
  const holdings = new Map();
  for (const tx of relevant) {
    const cur = tx.currency || 'PLN';
    const h = holdings.get(tx.symbol) || { qty: 0, avg: 0, currency: cur };
    if (tx.type === 'BUY') {
      if (tx.fromSnapshot) {
        h.qty = tx.qty;
        h.avg = tx.price;
        h.currency = cur;
      } else {
        h.avg = weightedAvg(h.qty, h.avg, tx.qty, tx.price);
        h.qty = h.qty + tx.qty;
        h.currency = h.currency || cur;
      }
    } else {
      h.qty = Math.max(0, h.qty - tx.qty);
      if (h.qty === 0) h.avg = 0;
    }
    holdings.set(tx.symbol, h);
  }

  const byCur = {};
  for (const h of holdings.values()) {
    if (h.qty <= 0 || h.avg <= 0) continue;
    byCur[h.currency] = (byCur[h.currency] || 0) + h.qty * h.avg;
  }
  return byCur;
}

// Wygodny wrapper: invested w walucie wyświetlania (używa fx z parametru — może być
// z snapshotu (frozen) albo bieżących fxRates). Dla portfela w tej samej walucie co
// displayCurrency (i tylko tej), fx = 1 i wynik jest dokładnie constant.
export function investedInDisplayAt(transactions, date, displayCurrency, fxRatesForDate) {
  const byCur = investedByCurrencyAt(transactions, date);
  let sumPLN = 0;
  for (const [ccy, amount] of Object.entries(byCur)) {
    sumPLN += amount * (fxRatesForDate?.[ccy] ?? 1);
  }
  const dispFx = fxRatesForDate?.[displayCurrency] ?? 1;
  return sumPLN / dispFx;
}
