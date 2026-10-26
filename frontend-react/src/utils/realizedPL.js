// Computes realized P&L from SELL transactions.
// Each SELL already carries costBasis (avg price at time of sale) stored by AppContext.
// SELL-e z importu brokera NIE mają zapisanego costBasis — dla nich koszt
// nabycia odtwarzamy z historii: replay zakupów per symbol (średnia ważona,
// ta sama metoda co avgPrice w portfelu). Sprzedaż bez żadnego wcześniejszego
// zakupu w historii nadal jest pomijana (nie znamy kosztu).
import { weightedAvg } from './weightedAvg.js';
import { splitAdjusted } from './splits.js';
import { buyUnitCost, txFee } from './transactions.js';
import { replayFx, rateOn } from './fxHistory.js';

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
        avg = weightedAvg(qty, avg, tx.qty, buyUnitCost(tx));
        qty = qty + tx.qty;
      } else {
        if (tx.costBasis == null && qty >= tx.qty) filled.set(tx, avg);
        qty = Math.max(0, qty - tx.qty);
        if (qty === 0) avg = 0;
      }
    }
  }
  return filled;
}

// hist (opcjonalnie, z useHistoricalFx): kursy z dni transakcji — wtedy
// wynik w PLN liczy przychód po kursie z dnia sprzedaży, a koszt po średnim
// kursie zakupu, więc zawiera zysk albo stratę na walucie. Bez kursów
// (jeszcze nie pobrane) — wszystko po dzisiejszym kursie, jak wcześniej.
export function computeRealizedTrades(rawTransactions = [], fxRates = {}, hist = null) {
  // Sprzedaż po splicie ma ilość w nowych jednostkach — zakupy sprzed niego też.
  const transactions = splitAdjusted(rawTransactions);
  const filled = backfillCostBasis(transactions);
  const costFx = hist ? replayFx(transactions, hist).atSell : null;
  const sells = transactions.filter(tx => tx.type === 'SELL' && (tx.costBasis != null || filled.has(tx)));
  return sells.map(txRaw => {
    const tx = txRaw.costBasis != null ? txRaw : { ...txRaw, costBasis: filled.get(txRaw) };
    const sellRate = hist ? rateOn(hist, tx.currency, tx.date) : null;
    const buyRate = costFx?.get(txRaw) ?? null;
    return mapTrade(tx, fxRates, sellRate != null && buyRate != null ? { sellRate, buyRate } : null);
  }).sort((a, b) => b.date.localeCompare(a.date));
}

function mapTrade(tx, fxRates, histRates) {
    const qty        = tx.qty   ?? 0;
    const sellPrice  = tx.price ?? 0;
    // Koszt zawiera prowizję zakupu (średnia z buyUnitCost), wynik — minus
    // prowizja sprzedaży. Wynik wpisany ręcznie (overridePL) jest ostateczny.
    const fee        = tx.overridePL != null ? 0 : txFee(tx);
    const costBasis  = tx.overridePL != null ? (sellPrice - tx.overridePL / qty) : (tx.costBasis ?? 0);
    const plNative   = (sellPrice - costBasis) * qty - fee;    // in tx.currency
    const rate       = fxRates[tx.currency] ?? 1;
    // Z kursami z dni transakcji: przychód po kursie sprzedaży, koszt po
    // kursie zakupu. Wynik wpisany ręcznie — po kursie z dnia sprzedaży.
    const plPLN      = !histRates ? plNative * rate
      : tx.overridePL != null ? plNative * histRates.sellRate
      : ((sellPrice * qty - fee) * histRates.sellRate) - costBasis * qty * histRates.buyRate;
    const costPLN    = costBasis * qty * (histRates ? histRates.buyRate : rate);
    const pct        = costPLN > 0 ? (plPLN / costPLN) * 100 : 0;
    return {
      id:        tx.id,
      symbol:    tx.symbol,
      date:      tx.date,
      qty,
      sellPrice,
      costBasis,
      fee,
      currency:  tx.currency ?? 'PLN',
      plNative,
      plPLN,
      costPLN,
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
  // Średnie ważone ilością, a % liczony od łącznego kosztu — wcześniej
  // Zamknięte pozycje brały zwykłą średnią z % transakcji, więc 10 akcji
  // na −50% i 1000 na +10% dawało −20% zamiast ok. +9%.
  return Object.values(map).map(g => {
    const cost = g.trades.reduce((s, t) => s + t.costBasis * t.qty, 0);
    const sell = g.trades.reduce((s, t) => s + t.sellPrice * t.qty, 0);
    // % od kosztu w PLN — ten sam wynik co kolumna zł (z walutą, gdy są kursy).
    const costPLN = g.trades.reduce((s, t) => s + t.costPLN, 0);
    return {
      ...g,
      avgCost: g.totalQty > 0 ? cost / g.totalQty : 0,
      avgSell: g.totalQty > 0 ? sell / g.totalQty : 0,
      pct: costPLN > 0 ? (g.plPLN / costPLN) * 100 : 0,
    };
  }).sort((a, b) => b.plPLN - a.plPLN);
}
