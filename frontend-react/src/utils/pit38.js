// PIT-38: dochód ze sprzedaży papierów wartościowych.
//
// Zasady (ustawa o PIT):
// - przychód i koszt w walucie przeliczamy średnim kursem NBP z ostatniego
//   dnia roboczego PRZED dniem transakcji (art. 11a) — osobno dla sprzedaży
//   i dla każdego zakupu;
// - koszt sprzedanych akcji wg FIFO — najpierw najstarsze zakupy (art. 24
//   ust. 10), osobno dla każdego rachunku (tu: portfela);
// - podstawa i podatek zaokrąglone do pełnych złotych (Ordynacja, art. 63).
// Konta IKE/IKZE nie wchodzą do PIT-38.
//
// Prowizje (tx.fee) są kosztem: prowizja zakupu proporcjonalnie do
// sprzedanych z partii akcji, prowizja sprzedaży — po kursie dnia sprzedaży.
// Czego tu nie ma: strat z lat poprzednich i dywidend zagranicznych — mówi
// o tym opis na karcie.
// Data podatkowa: domyślnie dzień rozliczenia (przychód powstaje z chwilą
// rozliczenia transakcji) — T+2 dni robocze, w USA T+1 od 28.05.2024,
// kryptowaluty tego samego dnia. Święta giełdowe nie są liczone (tylko
// weekendy); kurs NBP serwer i tak bierze z ostatniej tabeli przed tą datą.
// Do wyboru też data zawarcia (tak transakcje zapisuje aplikacja).
import { normalizeType, txFee } from './transactions.js';
import { splitAdjusted } from './splits.js';

export const PIT_RATE = 0.19;

export function dayBefore(iso) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const inScope = (t, excluded) => !excluded.has(t._portfolioId ?? '');

const isCrypto = sym => /-(USD|USDT|USDC|EUR|PLN)$/i.test(sym ?? '');
const isUs = t => (t.currency || 'PLN') === 'USD' && !String(t.symbol ?? '').includes('.');

function addBusinessDays(iso, n) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) n--;
  }
  return d.toISOString().slice(0, 10);
}

// Dzień rozliczenia transakcji z dnia zawarcia.
export function settlementDate(t) {
  const date = t.date.slice(0, 10);
  if (isCrypto(t.symbol)) return date;
  return addBusinessDays(date, isUs(t) && date >= '2024-05-28' ? 1 : 2);
}

// basis: 'settlement' (domyślnie) albo 'trade'.
export const taxDate = (t, basis = 'settlement') => (basis === 'trade' ? t.date.slice(0, 10) : settlementDate(t));

// Daty kursów do pobrania: { USD: Set('2025-03-06', …) } — dzień przed każdą
// transakcją kupna/sprzedaży w walucie. Serwer (/api/fx-rate) cofa się sam
// przez weekend i święta do ostatniego dnia z tabelą NBP.
export function pit38RateDates(transactions = [], excluded = new Set(), basis = 'settlement') {
  const out = {};
  for (const t of transactions) {
    const type = normalizeType(t.type);
    if ((type !== 'BUY' && type !== 'SELL') || !t.date || !inScope(t, excluded)) continue;
    const ccy = t.currency || 'PLN';
    if (ccy === 'PLN') continue;
    (out[ccy] ??= new Set()).add(dayBefore(taxDate(t, basis)));
  }
  return out;
}

// rates: { USD: { '2025-03-06': 4.01, … } } — klucze to daty z pit38RateDates.
// excluded: Set(_portfolioId) kont, których nie liczymy (IKE/IKZE); w widoku
// jednego portfela transakcje nie mają _portfolioId, stąd klucz ''.
export function computePit38(transactions = [], { year, rates = {}, excluded = new Set(), basis = 'settlement' } = {}) {
  const rateAt = (ccy, date) => ((ccy || 'PLN') === 'PLN' ? 1 : rates[ccy]?.[dayBefore(date)] ?? null);

  const groups = new Map();
  for (const t of splitAdjusted(transactions)) {
    const type = normalizeType(t.type);
    if ((type !== 'BUY' && type !== 'SELL') || !(t.qty > 0) || !t.date || !inScope(t, excluded)) continue;
    const key = `${t._portfolioId ?? ''}|${t.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...t, type });
  }

  const rows = [];
  const years = new Set();
  for (const txs of groups.values()) {
    // Zakupy z tego samego dnia przed sprzedażą (jak w realizedPL.js).
    txs.sort((a, b) => a.date.localeCompare(b.date) || (a.type === 'BUY' ? 0 : 1) - (b.type === 'BUY' ? 0 : 1));
    const lots = [];
    for (const t of txs) {
      if (t.type === 'BUY') {
        lots.push({ date: t.date, taxDate: taxDate(t, basis), qty: t.qty, price: t.price ?? 0, feePerShare: txFee(t) / t.qty, currency: t.currency || 'PLN' });
        continue;
      }
      let left = t.qty;
      const used = [];
      while (left > 1e-9 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, left);
        used.push({ date: lot.date, qty: take, price: lot.price, fee: take * lot.feePerShare, currency: lot.currency, rate: rateAt(lot.currency, lot.taxDate) });
        lot.qty -= take;
        left -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
      // Rok podatkowy i kurs — wg daty podatkowej (rozliczenie zakupu z
      // 30.12 i sprzedaży z 30.12 przechodzi na styczeń).
      const sellTaxDate = taxDate(t, basis);
      const y = Number(sellTaxDate.slice(0, 4));
      years.add(y);
      if (y !== year) continue;
      const rate = rateAt(t.currency, sellTaxDate);
      const missingRate = rate == null || used.some(u => u.rate == null);
      const revenuePLN = rate == null ? null : t.qty * (t.price ?? 0) * rate;
      const sellFee = txFee(t);
      const feesPLN = used.some(u => u.rate == null) || (sellFee && rate == null)
        ? null
        : (sellFee ? sellFee * rate : 0) + used.reduce((s, u) => s + u.fee * u.rate, 0);
      const costPLN = feesPLN == null ? null : used.reduce((s, u) => s + u.qty * u.price * u.rate, 0) + feesPLN;
      rows.push({
        id: t.id,
        symbol: t.symbol,
        portfolio: t._portfolioName ?? '',
        date: t.date,
        taxDate: sellTaxDate,
        qty: t.qty,
        price: t.price ?? 0,
        currency: t.currency || 'PLN',
        rate,
        lots: used,
        uncoveredQty: left > 1e-9 ? left : 0,
        missingRate,
        revenuePLN,
        costPLN,
        feesPLN,
        gainPLN: revenuePLN != null && costPLN != null ? revenuePLN - costPLN : null,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));

  const ok = rows.filter(r => r.gainPLN != null);
  const revenue = ok.reduce((s, r) => s + r.revenuePLN, 0);
  const cost = ok.reduce((s, r) => s + r.costPLN, 0);
  const income = revenue - cost;
  const base = Math.round(Math.max(0, income));
  return {
    year,
    years: [...years].sort((a, b) => b - a),
    rows,
    totals: {
      revenue, cost, income, base,
      tax: Math.round(base * PIT_RATE),
      missingRates: rows.length - ok.length,
      uncovered: rows.filter(r => r.uncoveredQty > 0).length,
    },
  };
}

const num = v => (v == null ? '' : v.toFixed(2).replace('.', ','));
const rate4 = v => (v == null ? '' : v.toFixed(4).replace('.', ','));

export function pit38CSV({ year, rows, totals }) {
  const sep = ';';
  const lines = [[
    'Data sprzedaży', 'Data podatkowa', 'Spółka', 'Portfel', 'Ilość', 'Cena', 'Waluta', 'Kurs NBP (dzień przed)',
    'Przychód (PLN)', 'Koszt FIFO (PLN)', 'w tym prowizje (PLN)', 'Dochód/Strata (PLN)', 'Zakupy (data × ilość @ cena, kurs)',
  ].join(sep)];
  for (const r of rows) {
    lines.push([
      r.date, r.taxDate, r.symbol, r.portfolio, String(r.qty).replace('.', ','), num(r.price), r.currency, rate4(r.rate),
      num(r.revenuePLN), num(r.costPLN), num(r.feesPLN), num(r.gainPLN),
      r.lots.map(l => `${l.date} × ${String(+l.qty.toFixed(6)).replace('.', ',')} @ ${num(l.price)} ${l.currency}, ${rate4(l.rate)}`).join(' | ')
        + (r.uncoveredQty > 0 ? ` | BRAK ZAKUPU dla ${String(r.uncoveredQty).replace('.', ',')} szt.` : ''),
    ].join(sep));
  }
  lines.push('');
  lines.push([`PIT-38 ${year}`, '', '', '', '', '', '', '', num(totals.revenue), num(totals.cost), '', num(totals.income), ''].join(sep));
  lines.push(['Podstawa opodatkowania (zł)', '', '', '', '', '', '', '', '', '', '', String(totals.base), ''].join(sep));
  lines.push(['Podatek 19% (zł)', '', '', '', '', '', '', '', '', '', '', String(totals.tax), ''].join(sep));
  return '﻿' + lines.join('\r\n');
}

// Straty z lat poprzednich (art. 9 ust. 3 ustawy o PIT): stratę ze sprzedaży
// papierów odlicza się w ciągu 5 kolejnych lat, w jednym roku najwyżej 50%
// jej kwoty. Zakładamy, że w każdym roku z dochodem odliczono tyle, ile się
// dało, najpierw najstarsze straty. Jednorazowego odliczenia do 5 mln zł
// (inna metoda) nie liczymy. Tylko straty widoczne w aplikacji — z innych
// rachunków trzeba doliczyć samemu.
//   incomes: { rok: dochód (ujemny = strata) }, z computePit38
// Zwraca dla `year`: { deduction, base, tax, losses: [{ year, amount, remaining }] }
// — losses to straty, które w `year` jeszcze wolno odliczać (po odliczeniu w nim).
export function lossCarryForward(incomes, year) {
  const losses = [];
  let deduction = 0;
  for (const y of Object.keys(incomes).map(Number).filter(y => y <= year).sort((a, b) => a - b)) {
    const income = incomes[y] ?? 0;
    if (income < 0) {
      if (y < year) losses.push({ year: y, amount: -income, remaining: -income });
      continue;
    }
    let room = income;
    let ded = 0;
    for (const l of losses) {
      if (y - l.year > 5 || l.remaining <= 0 || room <= 0) continue;
      const take = Math.min(l.remaining, l.amount * 0.5, room);
      l.remaining -= take; room -= take; ded += take;
    }
    if (y === year) deduction = ded;
  }
  const income = incomes[year] ?? 0;
  const base = Math.round(Math.max(0, income - deduction));
  return {
    deduction,
    base,
    tax: Math.round(base * PIT_RATE),
    losses: losses.filter(l => year - l.year <= 5 && l.remaining > 0.005),
  };
}
