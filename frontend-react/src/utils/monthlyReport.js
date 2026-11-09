// Raport miesięczny portfela z zapisanych dziennych wartości (snapshotów)
// i transakcji. Wynik bez wpłat i wypłat: zmiana wartości minus zmiana
// kapitału własnego (snapshot.capital), procent metodą Dietza — tak samo
// jak podsumowanie tygodnia na serwerze.
import { computeRealizedTrades } from './realizedPL.js';
import { normalizeType, divNet, txFee } from './transactions.js';

export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}`, prevEnd: prev };
}

export function shiftMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// snapshots: [{ date, total, capital }] (PLN). → raport albo null bez danych.
export function monthlyReport({ snapshots = [], transactions = [], fxRates = {}, hist = null, month }) {
  const { start, end } = monthBounds(month);
  const asc = [...snapshots].filter(s => s.total > 0).sort((a, b) => a.date.localeCompare(b.date));
  const endSnap = [...asc].reverse().find(s => s.date <= end && s.date >= start);
  if (!endSnap) return null;
  // Start: ostatni dzień poprzedniego miesiąca; nowy portfel — pierwszy dzień w miesiącu.
  const before = [...asc].reverse().find(s => s.date < start);
  const startSnap = before ?? asc.find(s => s.date >= start);
  const partial = !before;
  const net = startSnap.capital != null && endSnap.capital != null;
  const flows = net ? endSnap.capital - startSnap.capital : 0;
  const result = endSnap.total - startSnap.total - flows;
  const base = startSnap.total + flows / 2;

  const inMonth = t => t.date && t.date.slice(0, 10) >= start && t.date.slice(0, 10) <= end;
  const rate = cur => fxRates[cur] ?? 1;
  let dividends = 0, fees = 0, buys = 0, sells = 0;
  for (const t of transactions.filter(inMonth)) {
    const type = normalizeType(t.type);
    if (type === 'DIV') dividends += divNet({ ...t, qty: t.qty || 1, price: t.price || 0 }) * rate(t.currency);
    if (type === 'BUY') { buys++; fees += txFee(t) * rate(t.currency); }
    if (type === 'SELL') { sells++; fees += txFee(t) * rate(t.currency); }
  }
  const realized = computeRealizedTrades(transactions, fxRates, hist)
    .filter(tr => tr.date >= start && tr.date <= end)
    .reduce((s, tr) => s + tr.plPLN, 0);

  return {
    month, startDate: startSnap.date, endDate: endSnap.date, partial,
    startValue: startSnap.total, endValue: endSnap.total,
    net, flows, result, pct: base > 0 ? (result / base) * 100 : null,
    dividends, fees, buys, sells, realized,
  };
}

export const changePct = (from, to) => (from > 0 && to > 0 ? (to / from - 1) * 100 : null);
