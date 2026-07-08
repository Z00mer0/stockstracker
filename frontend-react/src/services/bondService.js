// Wycena detalicznych obligacji skarbowych: EDO (10-letnie, kapitalizacja roczna)
// i COI (4-letnie, odsetki wypłacane po każdym roku). Nominał: 100 zł / obligacja.
// Od 2. okresu odsetkowego oprocentowanie = inflacja r/r (GUS) + marża emisji;
// wskaźnikiem jest inflacja ogłaszana w miesiącu poprzedzającym początek okresu,
// czyli dotycząca miesiąca o dwa wcześniejszego. Wycena ma charakter szacunkowy.

export const BOND_NOMINAL = 100;
export const BOND_TYPES = {
  EDO: { years: 10, capitalizes: true,  earlyFee: 3.00 },
  COI: { years: 4,  capitalizes: false, earlyFee: 0.70 },
};

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
 * bond: { type:'EDO'|'COI', name, purchaseDate:'YYYY-MM-DD', count, firstYearRate(%), margin(%) }
 * Returns { valuePerBond, totalValue, totalNominal, currentRate, periodIndex,
 *           paidInterestTotal (COI), redeemTodayTotal, matured, maturityDate }
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

  for (let k = 0; k < spec.years; k++) {
    const start = addYears(buy, k);
    const end = addYears(buy, k + 1);
    if (clampedToday <= start) break;

    let rate;
    if (k === 0) {
      rate = (Number(bond.firstYearRate) || 0) / 100;
    } else {
      const infl = yoyInflation(cpiMap, refMonthFor(start));
      rate = (Number(bond.margin) || 0) / 100 + Math.max(infl ?? 0, 0);
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
  const interestPerBond = valuePerBond - BOND_NOMINAL;
  const fee = Math.min(spec.earlyFee, Math.max(interestPerBond, 0));
  const matured = today >= maturity;

  return {
    valuePerBond,
    totalValue: valuePerBond * count,
    totalNominal: BOND_NOMINAL * count,
    currentRate,
    periodIndex,
    paidInterestTotal: paidPerBond * count,
    redeemTodayTotal: (matured ? valuePerBond : valuePerBond - fee) * count,
    matured,
    maturityDate: maturity.toISOString().slice(0, 10),
  };
}
