// Dywidendy wypłacone przez spółkę (historia Yahoo: dzień odcięcia + kwota na
// akcję), których nie ma w transakcjach, choć w dniu odcięcia akcje były
// w portfelu. Zapomniana dywidenda zaniża dochód i stopę zwrotu bez żadnego
// ostrzeżenia.
import { normalizeType } from './transactions.js';
import { splitAdjusted } from './splits.js';

// Zapis dywidendy liczy się do odcięcia, jeśli ma datę od tygodnia przed nim
// do 90 dni po nim: ręczne wpisy mają datę odcięcia, import brokera — wypłaty.
const MATCH_BEFORE = 7;
const MATCH_AFTER = 90;

const shift = (iso, days) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Akcje kupione przed dniem odcięcia i niesprzedane do niego — tylko one
// dają prawo do dywidendy. Na transakcjach po splitAdjusted (jak kwoty Yahoo).
export function sharesHeldBefore(transactions, symbol, date) {
  let qty = 0;
  const list = transactions
    .filter(t => t.symbol === symbol && t.date && t.date.slice(0, 10) < date)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const t of list) {
    const type = normalizeType(t.type);
    if (!(t.qty > 0)) continue;
    if (type === 'BUY') qty = t.fromSnapshot ? t.qty : qty + t.qty;
    else if (type === 'SELL') qty = Math.max(0, qty - t.qty);
  }
  return qty;
}

// history: { symbol: [{ date: ex-date, amount: na akcję }] }
// dismissed: Set kluczy `${symbol}|${exDate}`, które użytkownik odrzucił.
// Zwraca [{ symbol, exDate, perShare, qty, gross }] od najnowszych.
export function findMissingDividends(transactions = [], history = {}, { dismissed = new Set(), today = new Date().toISOString().slice(0, 10) } = {}) {
  // W widoku „Wszystkie" każdy portfel osobno — każdy ma własny zapis dywidendy.
  const byPortfolio = new Map();
  for (const t of transactions) {
    if (!byPortfolio.has(t._portfolioId)) byPortfolio.set(t._portfolioId, []);
    byPortfolio.get(t._portfolioId).push(t);
  }
  const out = [];
  for (const [portfolioId, txs] of byPortfolio) {
    const adjusted = splitAdjusted(txs);
    const recorded = txs.filter(t => normalizeType(t.type) === 'DIV' && t.date);
    const used = new Set();
    for (const [symbol, events] of Object.entries(history)) {
      const divs = recorded.filter(t => t.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date));
      for (const ev of [...(events ?? [])].sort((a, b) => a.date.localeCompare(b.date))) {
        if (!(ev.amount > 0) || ev.date > today) continue;
        const from = shift(ev.date, -MATCH_BEFORE), to = shift(ev.date, MATCH_AFTER);
        const match = divs.find(d => !used.has(d) && d.date.slice(0, 10) >= from && d.date.slice(0, 10) <= to);
        if (match) { used.add(match); continue; }
        if (dismissed.has(`${symbol}|${ev.date}`)) continue;
        const qty = sharesHeldBefore(adjusted, symbol, ev.date);
        if (qty > 0) out.push({ symbol, exDate: ev.date, perShare: ev.amount, qty, gross: qty * ev.amount, ...(portfolioId != null ? { portfolioId } : {}) });
      }
    }
  }
  return out.sort((a, b) => b.exDate.localeCompare(a.exDate));
}
