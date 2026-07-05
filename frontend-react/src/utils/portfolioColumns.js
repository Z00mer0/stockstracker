// frontend-react/src/utils/portfolioColumns.js

export const COLUMN_DEFS = [
  { key: 'qty',      tKey: 'col_qty_lbl',       fixed: true },
  { key: 'avgPrice', tKey: 'col_avg_price_lbl' },
  { key: 'price',    tKey: 'col_price_lbl' },
  { key: 'dailyChg', tKey: 'col_daily_chg_lbl' },
  { key: 'costPLN',  tKey: 'col_cost_pln_lbl' },
  { key: 'valuePLN', tKey: 'col_value_pln_lbl' },
  { key: 'plPLN',    tKey: 'col_pl_pln_lbl' },
  { key: 'period',   tKey: 'col_period_lbl' },
  { key: 'moic',     tKey: null, label: 'MOIC' },
  { key: 'irr',      tKey: null, label: 'IRR r.' },
  { key: 'pe',       tKey: null, label: 'P/E' },
  { key: 'peFwd',    tKey: null, label: 'P/E FWD' },
  { key: 'pb',       tKey: null, label: 'P/B' },
  { key: 'divYoc',   tKey: 'col_dividends_lbl' },
];

export function getColLabel(key, t) {
  const def = COLUMN_DEFS.find(c => c.key === key);
  if (!def) return key;
  return def.tKey ? t(def.tKey) : (def.label ?? key);
}

export const DEFAULT_COLS = [
  'qty', 'price', 'dailyChg', 'valuePLN', 'plPLN',
];

const LS_KEY = 'portfolio_col_config_v2';

export function loadColumnConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  return DEFAULT_COLS;
}

export function saveColumnConfig(cols) {
  localStorage.setItem(LS_KEY, JSON.stringify(cols));
}

// Maps column key → function extracting a numeric sort value from an enriched position
export const SORT_GETTERS = {
  qty:      p => p.qty ?? 0,
  avgPrice: p => p.avgPrice ?? 0,
  price:    p => p.price ?? 0,
  dailyChg: p => p.dailyChg ?? -Infinity,
  costPLN:  p => p.costPLN ?? 0,
  valuePLN: p => p.valuePLN ?? 0,
  plPLN:    p => p.plPLN ?? -Infinity,
  period:   p => p.periodDays ?? 0,
  moic:     p => p.moic ?? 0,
  irr:      p => p.irr ?? -Infinity,
  pe:       p => p.pe ?? Infinity,
  peFwd:    p => p.peFwd ?? Infinity,
  pb:       p => p.pb ?? Infinity,
  divYoc:   p => p.divYield ?? 0,
};
