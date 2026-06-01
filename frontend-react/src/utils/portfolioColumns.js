// frontend-react/src/utils/portfolioColumns.js

export const COLUMN_DEFS = [
  { key: 'qty',      label: 'Ilość',         fixed: true },
  { key: 'avgPrice', label: 'Śr. Zakup' },
  { key: 'price',    label: 'Cena Teraz' },
  { key: 'dailyChg', label: 'Zmiana Dz.' },
  { key: 'costPLN',  label: 'Wart. Zakupu' },
  { key: 'valuePLN', label: 'Wart. Teraz' },
  { key: 'plPLN',    label: 'Zysk/Strata' },
  { key: 'period',   label: 'Okres' },
  { key: 'moic',     label: 'MOIC' },
  { key: 'irr',      label: 'IRR r.' },
  { key: 'pe',       label: 'P/E' },
  { key: 'peFwd',    label: 'P/E FWD' },
  { key: 'pb',       label: 'P/B' },
];

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
