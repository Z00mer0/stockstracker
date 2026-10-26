// „Skąd wynik": łączny wynik portfela rozłożony na spółki i sektory.
// Wynik spółki = zysk papierowy otwartej pozycji + zrealizowany ze sprzedaży
// + dywidendy (netto). Spółki już sprzedane też się liczą — ich wynik nie
// znika z portfela tylko dlatego, że pozycji już nie ma. Kwoty w PLN.
import { computeRealizedTrades } from './realizedPL.js';
import { normalizeType, divNet } from './transactions.js';
import { baseSymbol } from './ledger.js';

// hist: kursy z dni transakcji (useHistoricalFx) — zrealizowany wynik z walutą.
export function attribution(positions = [], transactions = [], fxRates = {}, hist = null) {
  const rows = new Map();
  const row = (sym, sector) => {
    const k = baseSymbol(sym);
    if (!rows.has(k)) rows.set(k, { symbol: sym, sector: sector ?? null, unrealized: 0, realized: 0, dividends: 0 });
    const r = rows.get(k);
    if (sector && !r.sector) r.sector = sector;
    return r;
  };
  // Każda pozycja zapisuje sektor, także bez ceny (bez zysku papierowego) —
  // inaczej jej dywidendy trafiałyby do grupy „bez sektora”.
  for (const p of positions) row(p.symbol, p.sector).unrealized += p.plPLN ?? 0;
  for (const tr of computeRealizedTrades(transactions, fxRates, hist)) row(tr.symbol).realized += tr.plPLN;
  for (const tx of transactions) {
    if (normalizeType(tx.type) !== 'DIV' || !tx.symbol) continue;
    row(tx.symbol).dividends += divNet({ ...tx, qty: tx.qty || 1, price: tx.price || 0 }) * (fxRates[tx.currency] ?? 1);
  }

  const list = [...rows.values()].map(r => ({ ...r, total: r.unrealized + r.realized + r.dividends }));
  const sectors = new Map();
  for (const r of list) {
    const k = r.sector ?? '';
    sectors.set(k, (sectors.get(k) ?? 0) + r.total);
  }
  const byTotal = (a, b) => b.total - a.total;
  return {
    positions: list.sort(byTotal),
    sectors: [...sectors].map(([sector, total]) => ({ sector, total })).sort(byTotal),
    total: list.reduce((s, r) => s + r.total, 0),
  };
}
