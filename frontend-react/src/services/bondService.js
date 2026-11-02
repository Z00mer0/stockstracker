// Wycena detalicznych obligacji skarbowych: EDO (10-letnie, kapitalizacja roczna)
// i COI (4-letnie, odsetki wypłacane po każdym roku). Nominał: 100 zł / obligacja.
// Od 2. okresu odsetkowego oprocentowanie = inflacja r/r (GUS) + marża emisji;
// wskaźnikiem jest inflacja ogłaszana w miesiącu poprzedzającym początek okresu,
// czyli dotycząca miesiąca o dwa wcześniejszego. Wycena ma charakter szacunkowy.

export const BOND_NOMINAL = 100;
export const BOND_TYPES = {
  EDO: { years: 10, capitalizes: true },
  COI: { years: 4,  capitalizes: false },
};

// Podatek od odsetek (art. 30a ustawy o PIT); na IKE/IKZE nie ma go.
export const BOND_TAX = 0.19;

// Opłata za przedterminowy wykup (zł/szt.) zależy od emisji: od września 2024
// EDO 3 zł (wcześniej 2 zł), COI 2 zł (wcześniej 0,70 zł). Domyślna wg daty
// zakupu — przy obligacji można wpisać stawkę z listu emisyjnego.
const FEE_CHANGE = '2024-09-01';
const EARLY_FEES = { EDO: [2.00, 3.00], COI: [0.70, 2.00] };

export function defaultEarlyFee(type, purchaseDate) {
  const [before, after] = EARLY_FEES[type] ?? EARLY_FEES.EDO;
  return String(purchaseDate ?? '') >= FEE_CHANGE ? after : before;
}

let _cpiPromise = null;

/** Monthly CPI index level series: [{date:'YYYY-MM-01', price}] → Map('YYYY-MM' → level) */
export function fetchCpiSeries() {
  if (!_cpiPromise) {
    const base = import.meta.env.VITE_API_URL ?? '';
    _cpiPromise = fetch(`${base}/api/cpi-pl`, { signal: AbortSignal.timeout(12000) })
      .then(r => (r.ok ? r.json() : []))
      .then(rows => {
        const map = new Map();
        (Array.isArray(rows) ? rows : []).forEach(r => map.set(String(r.date).slice(0, 7), r.price));
        return map;
      })
      .catch(() => new Map());
  }
  return _cpiPromise;
}

/** Year-over-year inflation for a reference month 'YYYY-MM' (fraction, e.g. 0.043). Null if unknown. */
export function yoyInflation(cpiMap, ym) {
  const [y, m] = ym.split('-').map(Number);
  const prev = `${String(y - 1).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
  const a = cpiMap.get(ym);
  const b = cpiMap.get(prev);
  if (a == null || b == null || !b) return null;
  return a / b - 1;
}

// Inflacja r/r z najnowszego miesiąca w serii — zastępstwo, gdy miesiąca
// odniesienia jeszcze nie opublikowano.
function latestInflation(cpiMap) {
  const months = [...cpiMap.keys()].sort().reverse();
  for (const ym of months) {
    const v = yoyInflation(cpiMap, ym);
    if (v != null) return v;
  }
  return null;
}

function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

function refMonthFor(periodStart) {
  // Miesiąc odniesienia inflacji: dwa miesiące przed początkiem okresu.
  const d = new Date(periodStart);
  d.setMonth(d.getMonth() - 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Values a single bond entry.
 * bond: { type:'EDO'|'COI', name, purchaseDate:'YYYY-MM-DD', count, firstYearRate(%), margin(%),
 *         earlyFee? (zł/szt., domyślnie wg daty), taxFree? (IKE/IKZE) }
 * Returns { valuePerBond, totalValue, totalNominal, currentRate, periodIndex,
 *           paidInterestTotal (COI, brutto), redeemTodayTotal (po opłacie i podatku),
 *           feeTotal, taxTotal, estimated (brak inflacji z miesiąca odniesienia),
 *           matured, maturityDate }
 */
export function valueBond(bond, cpiMap, today = new Date()) {
  const spec = BOND_TYPES[bond.type] ?? BOND_TYPES.EDO;
  const count = Number(bond.count) || 0;
  const buy = new Date(bond.purchaseDate);
  const maturity = addYears(buy, spec.years);
  const clampedToday = today > maturity ? maturity : today;

  let capital = BOND_NOMINAL;      // EDO: rośnie po każdym roku; COI: stały nominał
  let paidPerBond = 0;             // COI: odsetki już wypłacone (brutto)
  let currentRate = (Number(bond.firstYearRate) || 0) / 100;
  let periodIndex = 0;
  let accruedPerBond = 0;
  let estimated = false;

  for (let k = 0; k < spec.years; k++) {
    const start = addYears(buy, k);
    const end = addYears(buy, k + 1);
    if (clampedToday <= start) break;

    let rate;
    if (k === 0) {
      rate = (Number(bond.firstYearRate) || 0) / 100;
    } else {
      let infl = yoyInflation(cpiMap, refMonthFor(start));
      if (infl == null) { infl = latestInflation(cpiMap) ?? 0; estimated = true; }
      rate = (Number(bond.margin) || 0) / 100 + Math.max(infl, 0);
    }

    if (clampedToday >= end) {
      // pełny, zakończony okres
      if (spec.capitalizes) capital *= 1 + rate;
      else paidPerBond += BOND_NOMINAL * rate;
    } else {
      // okres bieżący — odsetki narosłe proporcjonalnie do dni
      const frac = (clampedToday - start) / (end - start);
      accruedPerBond = capital * rate * frac;
      currentRate = rate;
      periodIndex = k;
      break;
    }
    currentRate = rate;
    periodIndex = k;
  }

  const valuePerBond = capital + accruedPerBond;
  const interestPerBond = valuePerBond - BOND_NOMINAL;   // jeszcze niewypłacone odsetki
  const matured = today >= maturity;
  const feeRate = bond.earlyFee != null && bond.earlyFee !== '' ? Number(bond.earlyFee) : defaultEarlyFee(bond.type, bond.purchaseDate);
  // EDO: opłata nigdy nie przekracza narosłych odsetek. COI: ten limit działa
  // tylko w 1. okresie odsetkowym, później opłata jest pobierana w całości.
  const capped = spec.capitalizes || periodIndex === 0;
  const fee = matured ? 0 : capped ? Math.min(feeRate, Math.max(interestPerBond, 0)) : feeRate;
  const tax = bond.taxFree ? 0 : BOND_TAX * Math.max(interestPerBond - fee, 0);

  return {
    valuePerBond,
    totalValue: valuePerBond * count,
    totalNominal: BOND_NOMINAL * count,
    currentRate,
    periodIndex,
    paidInterestTotal: paidPerBond * count,
    redeemTodayTotal: (valuePerBond - fee - tax) * count,
    feeTotal: fee * count,
    taxTotal: tax * count,
    estimated,
    matured,
    maturityDate: maturity.toISOString().slice(0, 10),
  };
}
