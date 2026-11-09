// „Skąd wynik": łączny wynik portfela rozłożony na spółki i sektory.
// Wynik spółki = zysk papierowy otwartej pozycji + zrealizowany ze sprzedaży
// + dywidendy (netto). Spółki już sprzedane też się liczą — ich wynik nie
// znika z portfela tylko dlatego, że pozycji już nie ma. Kwoty w PLN.
import { computeRealizedTrades } from './realizedPL.js';
import { normalizeType, divNet, txAmount, txFee } from './transactions.js';
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

// Ten sam łączny wynik rozłożony na źródła: zmiana cen (po kursie waluty
// z dnia zakupu), kursy walut, dywidendy brutto, podatek u źródła i prowizje.
// Prowizje siedzą w koszcie (średnia z prowizją) i w wyniku sprzedaży —
// tu są wyjęte osobno, więc zmiana cen jest „przed prowizjami”.
// Suma pięciu części = total z attribution().
export function sourceBreakdown(positions = [], transactions = [], fxRates = {}, hist = null) {
  let tradeTotal = 0, fx = 0, fees = 0, dividends = 0, tax = 0;
  for (const p of positions) {
    if (p.plPLN == null) continue;
    tradeTotal += p.plPLN;
    // Waluta: dzisiejsza wartość po dzisiejszym kursie minus ta sama wartość
    // po kursie z dni zakupu (z kosztu pozycji).
    const costNative = (p.qty ?? 0) * (p.avgPrice ?? 0);
    if (p.price != null && costNative > 0 && p.costPLN != null && p.valuePLN != null) {
      fx += p.valuePLN - p.qty * p.price * (p.costPLN / costNative);
    }
  }
  for (const tr of computeRealizedTrades(transactions, fxRates, hist)) {
    tradeTotal += tr.plPLN;
    const costNative = tr.costBasis * tr.qty;
    // Wynik w walucie po kursie zakupu; reszta to waluta.
    if (costNative > 0 && tr.costPLN > 0) fx += tr.plPLN - tr.plNative * (tr.costPLN / costNative);
  }
  for (const tx of transactions) {
    const type = normalizeType(tx.type);
    const r = fxRates[tx.currency] ?? 1;
    if (type === 'BUY' || type === 'SELL') fees += txFee(tx) * r;
    else if (type === 'DIV' && tx.symbol) {
      dividends += txAmount({ ...tx, qty: tx.qty || 1, price: tx.price || 0 }) * r;
      tax += (Number(tx.tax) || 0) * r;
    }
  }
  const price = tradeTotal - fx + fees;
  const parts = [
    { key: 'price', total: price },
    { key: 'fx', total: fx },
    { key: 'dividends', total: dividends },
    { key: 'tax', total: -tax },
    { key: 'fees', total: -fees },
  ];
  return { parts, total: parts.reduce((s, x) => s + x.total, 0) };
}
