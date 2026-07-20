// Computes realized P&L from SELL transactions.
// Each SELL already carries costBasis (avg price at time of sale) stored by AppContext.
// SELL-e z importu brokera NIE mają zapisanego costBasis — dla nich koszt
// nabycia odtwarzamy z historii: replay zakupów per symbol (średnia ważona,
// ta sama metoda co avgPrice w portfelu). Sprzedaż bez żadnego wcześniejszego
// zakupu w historii nadal jest pomijana (nie znamy kosztu).

function backfillCostBasis(transactions) {
  const bySym = new Map();
  for (const tx of transactions) {
    if ((tx.type !== 'BUY' && tx.type !== 'SELL') || !tx.qty || tx.qty <= 0) continue;
    if (!bySym.has(tx.symbol)) bySym.set(tx.symbol, []);
    bySym.get(tx.symbol).push(tx);
  }
  const filled = new Map(); // tx (referencja) → odtworzony costBasis
  for (const txs of bySym.values()) {
    const sorted = [...txs].sort((a, b) => {
      const d = (a.date || '').localeCompare(b.date || '');
      if (d !== 0) return d;
      // Within a day, apply BUYs first so a same-day SELL has coverage.
      return (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1);
    });
    let qty = 0, avg = 0;
    for (const tx of sorted) {
      if (tx.type === 'BUY') {
        const newQty = qty + tx.qty;
        avg = newQty > 0 ? (qty * avg + tx.qty * tx.price) / newQty : 0;
        qty = newQty;
      } else {
        if (tx.costBasis == null && qty >= tx.qty) filled.set(tx, avg);
        qty = Math.max(0, qty - tx.qty);
        if (qty === 0) avg = 0;
      }
    }
  }
  return filled;
}

export function computeRealizedTrades(transactions = [], fxRates = {}) {
  const filled = backfillCostBasis(transactions);
  const sells = transactions.filter(tx => tx.type === 'SELL' && (tx.costBasis != null || filled.has(tx)));
  return sells.map(txRaw => {
    const tx = txRaw.costBasis != null ? txRaw : { ...txRaw, costBasis: filled.get(txRaw) };
    return mapTrade(tx, fxRates);
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function mapTrade(tx, fxRates) {
    const qty        = tx.qty   ?? 0;
    const sellPrice  = tx.price ?? 0;
    const costBasis  = tx.overridePL != null ? (sellPrice - tx.overridePL / qty) : (tx.costBasis ?? 0);
    const plNative   = (sellPrice - costBasis) * qty;          // in tx.currency
    const rate       = fxRates[tx.currency] ?? 1;
    const plPLN      = plNative * rate;
    const pct        = costBasis > 0 ? ((sellPrice - costBasis) / costBasis) * 100 : 0;
    return {
      id:        tx.id,
      symbol:    tx.symbol,
      date:      tx.date,
      qty,
      sellPrice,
      costBasis,
      currency:  tx.currency ?? 'PLN',
      plNative,
      plPLN,
      pct,
      note:      tx.note ?? '',
    };
}

export function groupBySymbol(trades) {
  const map = {};
  for (const t of trades) {
    if (!map[t.symbol]) {
      map[t.symbol] = { symbol: t.symbol, currency: t.currency, trades: [], plPLN: 0, plNative: 0, totalQty: 0 };
    }
    const g = map[t.symbol];
    g.trades.push(t);
    g.plPLN   += t.plPLN;
    g.plNative += t.plNative;
    g.totalQty += t.qty;
  }
  return Object.values(map).sort((a, b) => b.plPLN - a.plPLN);
}

// Generates PIT-38-compatible CSV (in PLN, current FX rates)
export function exportPIT38CSV(trades, fxRates = {}, locale = 'pl-PL') {
  const sep = ';';
  const rows = [
    ['Spółka', 'Data sprzedaży', 'Ilość', 'Cena sprzedaży', 'Koszt nabycia', 'Przychód (PLN)', 'Koszt (PLN)', 'Dochód/Strata (PLN)', 'Waluta', 'Kurs'].join(sep),
  ];
  for (const t of [...trades].sort((a, b) => a.date.localeCompare(b.date))) {
    const rate     = fxRates[t.currency] ?? 1;
    const income   = t.qty * t.sellPrice * rate;
    const cost     = t.qty * t.costBasis * rate;
    const gain     = income - cost;
    const fmt2 = v => v.toFixed(2).replace('.', ',');
    rows.push([
      t.symbol,
      t.date,
      String(t.qty).replace('.', ','),
      fmt2(t.sellPrice),
      fmt2(t.costBasis),
      fmt2(income),
      fmt2(cost),
      fmt2(gain),
      t.currency,
      fmt2(rate),
    ].join(sep));
  }
  // summary row
  const totalIncome = trades.reduce((s, t) => s + t.qty * t.sellPrice * (fxRates[t.currency] ?? 1), 0);
  const totalCost   = trades.reduce((s, t) => s + t.qty * t.costBasis * (fxRates[t.currency] ?? 1), 0);
  rows.push(['RAZEM', '', '', '', '', totalIncome.toFixed(2).replace('.', ','), totalCost.toFixed(2).replace('.', ','), (totalIncome - totalCost).toFixed(2).replace('.', ','), '', ''].join(sep));
  return '﻿' + rows.join('\r\n'); // BOM for Excel
}
