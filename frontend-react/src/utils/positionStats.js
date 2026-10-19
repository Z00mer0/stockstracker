// Historia jednej pozycji do okna spółki: transakcje na wykres, od kiedy
// trzymana i ile wypłaciła dywidend.
import { normalizeType, divNet } from './transactions.js';
import { splitAdjusted } from './splits.js';
import { baseSymbol } from './ledger.js';

// trades — kupna i sprzedaże w jednostkach po splitach (tak jak wykres Yahoo),
// rosnąco po dacie. since — data pierwszego zakupu po ostatnim dniu, w którym
// pozycja była zamknięta (inaczej „trzymasz od" liczyłoby się od dawno
// sprzedanej pierwszej partii). dividendsPLN — netto, po bieżących kursach.
export function positionStats(transactions = [], symbol, fxRates = {}) {
  const key = baseSymbol(symbol);
  const mine = transactions.filter(tx => tx.symbol && baseSymbol(tx.symbol) === key);
  const trades = splitAdjusted(mine)
    .filter(tx => ['BUY', 'SELL'].includes(normalizeType(tx.type)) && tx.qty > 0 && tx.date)
    .map(tx => ({ date: tx.date, type: normalizeType(tx.type), qty: tx.qty, price: tx.price }))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'BUY' ? -1 : 1));

  let qty = 0;
  let since = null;
  for (const t of trades) {
    if (t.type === 'BUY') {
      if (qty <= 1e-9) since = t.date;
      qty += t.qty;
    } else {
      qty = Math.max(0, qty - t.qty);
    }
  }

  const dividendsPLN = mine
    .filter(tx => normalizeType(tx.type) === 'DIV')
    .reduce((s, tx) => s + divNet({ ...tx, qty: tx.qty || 1 }) * (fxRates[tx.currency] ?? 1), 0);

  return { trades, since, dividendsPLN };
}
