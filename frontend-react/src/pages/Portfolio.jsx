// frontend-react/src/pages/Portfolio.jsx
import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import GridLayout, { noCompactor } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { useApp } from '../context/AppContext';
import CsvImportModal from '../components/CsvImportModal';
import AddStockModal from '../components/AddStockModal';
import SellStockModal from '../components/SellStockModal';
import EditPositionModal from '../components/EditPositionModal';
import AddDividendModal from '../components/AddDividendModal';
import { useChart } from '../context/ChartContext';
import StockDetailModal from '../components/StockDetailModal';
import Spinner from '../components/shared/Spinner';
import ColumnPicker from '../components/shared/ColumnPicker';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import { fetchCpiSeries, valueBond, BOND_TYPES } from '../services/bondService';
import useDividendEvents from '../hooks/useDividendEvents';
import { useSplitDetector } from '../hooks/useSplitDetector';
import {
  COLUMN_DEFS, getColLabel, loadColumnConfig, saveColumnConfig, SORT_GETTERS,
} from '../utils/portfolioColumns';
import { loadPositionNotes, savePositionNotes, migrateLegacyNotes } from '../utils/positionNotes';
import TickerLogo from '../components/shared/TickerLogo';
import Chip from '../components/shared/Chip';
import PortfolioPieChart from '../components/PortfolioPieChart';
import Card from '../components/shared/Card';
import * as XLSX from 'xlsx';
import HistoryChart from '../components/HistoryChart';
import StackedAllocation from '../components/shared/StackedAllocation';
import SegmentedControl from '../components/shared/SegmentedControl';
import { useLanguage, useT } from '../context/LanguageContext';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
const DASH_LAYOUT_KEY = 'portfolio_dash_layout_v5';
const DASH_ROW_H = 30;
const DASH_MARGIN = [12, 12];
const DASH_DEFAULT_LAYOUT = [
  { i: 'chart',   x: 0, y: 0,  w: 8,  h: 9, minW: 4, minH: 5, maxH: 15 },
  { i: 'stats',   x: 8, y: 0,  w: 4,  h: 9, minW: 2, minH: 4, maxH: 15 },
  { i: 'pie',     x: 0, y: 9,  w: 6,  h: 8, minW: 3, minH: 4, maxH: 15 },
  { i: 'alloc',   x: 6, y: 9,  w: 6,  h: 8, minW: 3, minH: 4, maxH: 15 },
  { i: 'realytd', x: 0, y: 17, w: 12, h: 8, minW: 4, minH: 5, maxH: 15 },
];

const CRYPTO_OPTIONS = [
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','MATIC','DOT','AVAX',
  'LINK','UNI','LTC','BCH','ATOM','NEAR','TON','PEPE','SUI','ARB',
];

function AddCryptoModal({ onSave, onClose }) {
  const t = useT();
  const [symbol, setSymbol] = useState('BTC');
  const [customSym, setCustomSym] = useState('');
  const [qty, setQty]   = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const finalSym = symbol === '__custom' ? customSym.trim().toUpperCase() : symbol;

  async function handleSave() {
    if (!finalSym) { setError(t('err_enter_symbol')); return; }
    const q = parseFloat(qty), p = parseFloat(price);
    if (isNaN(q) || q <= 0) { setError(t('err_enter_qty_short')); return; }
    if (isNaN(p) || p <= 0) { setError(t('err_enter_price_short')); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: finalSym, qty: q, price: p, currency, date, note: 'Crypto', assetType: 'crypto' });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>₿ Dodaj kryptowalutę</h2>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">Symbol</label>
          <select className="field-input" value={symbol} onChange={e => setSymbol(e.target.value)}>
            {CRYPTO_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            <option value="__custom">Inny (wpisz ręcznie)</option>
          </select>
          {symbol === '__custom' && (
            <input className="field-input" style={{ marginTop: 8 }} placeholder="np. PEPE" value={customSym} onChange={e => setCustomSym(e.target.value.toUpperCase())} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{t('qty_short')}</label>
            <input type="number" min="0" step="any" className="field-input" value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="field-label">{t('buy_price_label')}</label>
            <input type="number" min="0" step="any" className="field-input" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label className="field-label">{t('currency_label')}</label>
            <select className="field-input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {['USD','EUR','PLN'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">{t('buy_date_label')}</label>
            <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('add_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}

const WATCH_KEY = 'myfund_watchlist';
function toggleWatchlist(symbol) {
  const list = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
  const idx = list.indexOf(symbol);
  if (idx === -1) list.push(symbol); else list.splice(idx, 1);
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  return idx === -1;
}
function isWatched(symbol) {
  return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]').includes(symbol);
}

const ALERTS_KEY = 'myfund_price_alerts';
function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); }
  catch { return []; }
}
function saveAlerts(list) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(list));
}

function NoteEditor({ symbol, initial, onSave, onCancel }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  return (
    <div style={{ padding: '8px 16px 12px', background: 'var(--panel-2)' }}>
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        placeholder={`Notatka do ${symbol}…`}
        style={{
          width: '100%', minHeight: 80, resize: 'vertical',
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--text)', fontSize: 12, padding: '6px 10px',
          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        <button
          onClick={() => { setDraft(initial); onCancel(); }}
          style={{ fontSize: 11, padding: '3px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer' }}
        >{t('cancel')}</button>
        <button
          onClick={() => onSave(draft)}
          style={{ fontSize: 11, padding: '3px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer', fontWeight: 600 }}
        >{t('save_btn')}</button>
      </div>
    </div>
  );
}

function SetAlertModal({ symbol, currentPrice, onSave, onClose }) {
  const t = useT();
  const [target, setTarget] = useState(currentPrice != null ? String(Number(currentPrice).toFixed(2)) : '');
  const [dir, setDir] = useState(currentPrice != null ? 'above' : 'above');

  function handleSave() {
    const tgt = parseFloat(target);
    if (isNaN(tgt) || tgt <= 0) return;
    onSave({ symbol, target: tgt, direction: dir });
    onClose();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
         onClick={onClose}>
      <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}
           onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Alert cenowy — {symbol}</h2>
        {currentPrice != null && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Cena teraz: {Number(currentPrice).toFixed(2)}</p>
        )}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Cena docelowa</label>
          <input type="number" min="0" step="any" autoFocus
            value={target} onChange={e => setTarget(e.target.value)}
            style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>Kierunek</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['above', '▲ Powyżej'], ['below', '▼ Poniżej']].map(([val, label]) => (
              <button key={val} onClick={() => setDir(val)}
                style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                  background: dir === val ? 'var(--accent)' : 'var(--border)', color: dir === val ? '#fff' : 'var(--text-dim)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'var(--border)', color: 'var(--text-dim)', fontSize: 13, border: 'none', cursor: 'pointer' }}>{t('cancel')}</button>
          <button onClick={handleSave} style={{ flex: 1, padding: '8px 0', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, border: 'none', cursor: 'pointer', fontWeight: 600 }}>{t('save_alert')}</button>
        </div>
      </div>
    </div>
  );
}

function fmt(n, decimals = 2, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CUR_FLAG = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };

function renderCell(key, pos, fxRates, divBySymbol, locale, displayCurrency = 'PLN') {
  const flag = CUR_FLAG[pos.currency] ?? pos.currency;
  const isPLN = displayCurrency === 'PLN';
  const currLabel = isPLN ? 'zł' : displayCurrency;
  // Convert PLN-based metric to display currency
  const toDisp = (plnVal) => plnVal == null ? null : plnVal / (fxRates[displayCurrency] ?? 1);

  switch (key) {
    case 'qty':
      return (
        <span style={{ color: 'var(--text)' }}>
          {fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4, locale)}
        </span>
      );
    case 'avgPrice':
      return (
        <span style={{ color: 'var(--text-dim)' }}>
          {fmt(pos.avgPrice, 2, locale)} <span className="text-xs">{flag}</span>
        </span>
      );
    case 'price':
      return pos.price != null ? (
        <span style={{ color: 'var(--text)' }}>
          {fmt(pos.price, 2, locale)} <span className="text-xs">{flag}</span>
        </span>
      ) : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'dailyChg':
      if (pos.dailyChg == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      return <Chip value={pos.dailyChg} />;
    case 'costPLN': {
      const v = toDisp(pos.costPLN);
      return <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(v, 2, locale)} {currLabel}</span>;
    }
    case 'valuePLN': {
      const v = toDisp(pos.valuePLN);
      return v != null
        ? <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(v, 2, locale)} {currLabel}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    }
    case 'plPLN': {
      const v = toDisp(pos.plPLN);
      if (v == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = v >= 0;
      return (
        <span style={{ color: up ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
          {up ? '+' : ''}{fmt(v, 2, locale)} {currLabel}
        </span>
      );
    }
    case 'period':
      return <span style={{ color: 'var(--text-dim)' }}>{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null
        ? <span style={{ color: 'var(--text)' }}>{fmt(pos.moic, 2, locale)}x</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'irr': {
      if (pos.irr == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.irr >= 0;
      return (
        <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
          {up ? '+' : ''}{fmt(pos.irr, 1, locale)}%
        </span>
      );
    }
    case 'pe':
      return pos.pe != null
        ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pe, 1, locale)}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'peFwd':
      return pos.peFwd != null
        ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.peFwd, 1, locale)}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'pb':
      return pos.pb != null
        ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pb, 2, locale)}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'divYoc': {
      const totalDiv = divBySymbol[pos.symbol] ?? 0;
      if (!totalDiv) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const dispCost = toDisp(pos.costPLN);
      const yoc = dispCost > 0 ? (toDisp(totalDiv) / dispCost) * 100 : null;
      return (
        <span style={{ color: 'var(--warn)', fontWeight: 600 }}>
          {fmt(toDisp(totalDiv), 2, locale)} {currLabel}{yoc != null ? <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.75 }}>({fmt(yoc, 1, locale)}%)</span> : null}
        </span>
      );
    }
    default:
      return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  }
}

export default function Portfolio() {
  const { portfolio, transactions, snapshots, rawData, loading, fxRates, saveHoldings, saveTransactions, renameSymbol, addPosition, editPosition, removePosition, sellPosition, refresh, displayCurrency, activePortfolioId } = useApp();
  const { locale } = useLanguage();
  const t = useT();
  const ASSET_CATEGORIES = getAssetCategories(t);

  const [showImport, setShowImport]   = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [showAddCrypto, setShowAddCrypto] = useState(false);
  const [addSymbol, setAddSymbol]     = useState('');
  const [sellTarget, setSellTarget]   = useState(null);
  const [divTarget, setDivTarget]     = useState(null);
  const [menuSym, setMenuSym]         = useState(null);
  const [menuPos, setMenuPos]         = useState({ x: 0, y: 0 });
  const [editTarget, setEditTarget]   = useState(null);
  const [confirmDel, setConfirmDel]   = useState(null);
  const [toast, setToast]             = useState('');
  const [editTicker, setEditTicker]   = useState(null); // { oldSymbol, value }
  const [selectedItem, setSelectedItem] = useState(null);
  const [notes, setNotes]             = useState(() => { migrateLegacyNotes(); return loadPositionNotes(); });
  const [noteEditing, setNoteEditing] = useState(null);
  const [alerts, setAlerts] = useState(loadAlerts);
  const [alertTarget, setAlertTarget] = useState(null); // { symbol, price }
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const filterMenuRef = useRef(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addMenuRef = useRef(null);

  // Dashboard grid layout
  const [dashLayout, setDashLayout] = useState(DASH_DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const gridRoRef = useRef(null);
  const saveLayoutTimer = useRef(null);

  const gridRef = useCallback(node => {
    if (gridRoRef.current) { gridRoRef.current.disconnect(); gridRoRef.current = null; }
    if (!node) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w > 0) setGridWidth(Math.floor(w));
    });
    ro.observe(node);
    gridRoRef.current = ro;
  }, []);

  useEffect(() => {
    if (!activePortfolioId) return;
    try {
      const saved = localStorage.getItem(`${DASH_LAYOUT_KEY}_${activePortfolioId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const valid = Array.isArray(parsed) && parsed.every(item => item.h <= 15 && item.w <= 12 && item.h >= 1);
        setDashLayout(valid ? parsed : DASH_DEFAULT_LAYOUT);
      } else {
        setDashLayout(DASH_DEFAULT_LAYOUT);
      }
    } catch {
      setDashLayout(DASH_DEFAULT_LAYOUT);
    }
  }, [activePortfolioId]);

  const saveLayoutToServer = useCallback((newLayout) => {
    if (!activePortfolioId) return;
    try {
      localStorage.setItem(`${DASH_LAYOUT_KEY}_${activePortfolioId}`, JSON.stringify(newLayout));
    } catch {}
  }, [activePortfolioId]);

  async function handleTickerRename(oldSymbol, newSymbol) {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || sym === oldSymbol) { setEditTicker(null); return; }
    await renameSymbol(oldSymbol, sym);
    setEditTicker(null);
    setToast(`${oldSymbol} → ${sym}`);
    refresh();
  }
  const menuRef = useRef(null);

  const { addDividend } = useDividendEvents(portfolio.map(p => p.symbol));
  const { alerts: splitAlerts, dismissAlert } = useSplitDetector(portfolio, transactions);

  useEffect(() => {
    if (!menuSym) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuSym(null);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuSym]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!showExportMenu) return;
    function handler(e) { if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) setShowExportMenu(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showExportMenu]);

  useEffect(() => {
    if (!showFilterMenu) return;
    function handler(e) { if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setShowFilterMenu(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilterMenu]);

  useEffect(() => {
    if (!showAddMenu) return;
    function handler(e) { if (addMenuRef.current && !addMenuRef.current.contains(e.target)) setShowAddMenu(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddMenu]);
  const { openChart } = useChart();
  const [sortCol, setSortCol] = useState('costPLN');
  const [sortDir, setSortDir] = useState('desc');
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [tfPortfolio, setTfPortfolio] = useState('MAX');
  const [filterChip, setFilterChip] = useState('all');
  const [filterGpw, setFilterGpw] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [cols, setCols] = useState(loadColumnConfig);

  const { enrichPosition, metricsLoading } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const divBySymbol = useMemo(() => {
    const map = {};
    for (const tx of transactions) {
      const type = tx.type?.toUpperCase();
      if (type !== 'DIV' && type !== 'DIVIDEND') continue;
      const sym = tx.symbol;
      if (!sym) continue;
      // amount = qty * price (if qty present), else just price, converted to PLN
      const amount = tx.qty != null && tx.qty > 0
        ? (tx.qty * (tx.price ?? 0))
        : (tx.price ?? 0);
      const amountPLN = amount * (fxRates[tx.currency] ?? 1);
      map[sym] = (map[sym] ?? 0) + amountPLN;
    }
    return map;
  }, [transactions, fxRates]);

  const ytdChartData = useMemo(() => {
    const jan1 = `${new Date().getFullYear()}-01-01`;
    const dispFx = fxRates[displayCurrency] ?? 1;
    const sells = transactions
      .filter(tx => tx.type === 'SELL' && tx.date >= jan1 && tx.costBasis != null)
      .sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    const points = [];
    for (const tx of sells) {
      const plNative = tx.overridePL != null
        ? tx.overridePL
        : (tx.price - tx.costBasis) * (tx.qty ?? 0);
      const plDisp = plNative * (fxRates[tx.currency] ?? 1) / dispFx;
      cum += plDisp;
      if (points.length && points[points.length - 1].date === tx.date) {
        points[points.length - 1].pl = cum;
      } else {
        points.push({ date: tx.date, pl: parseFloat(cum.toFixed(2)) });
      }
    }
    return points;
  }, [transactions, fxRates, displayCurrency]);

  function handleColChange(newCols) {
    setCols(newCols);
    saveColumnConfig(newCols);
  }

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  useEffect(() => {
    if (!alerts.length || !enriched.length) return;
    const triggered = [];
    const remaining = alerts.filter(a => {
      const pos = enriched.find(p => p.symbol === a.symbol);
      if (!pos?.price) return true;
      const hit = a.direction === 'above' ? pos.price >= a.target : pos.price <= a.target;
      if (hit) triggered.push({ ...a, price: pos.price });
      return !hit;
    });
    if (!triggered.length) return;
    saveAlerts(remaining);
    setAlerts(remaining);
    for (const a of triggered) {
      const msg = `${a.symbol} osiągnął ${a.price.toFixed(2)} (alert: ${a.direction === 'above' ? '≥' : '≤'} ${a.target})`;
      if (Notification.permission === 'granted') {
        new Notification('Alert cenowy', { body: msg, icon: '/favicon.ico' });
      } else {
        setToast(msg);
      }
    }
  }, [enriched, alerts]);

  const totalCostPLN = enriched.reduce((sum, p) => sum + (p.costPLN ?? 0), 0);
  const totalValuePLN = enriched.reduce((sum, p) => sum + (p.valuePLN ?? 0), 0);
  const portFx = fxRates[displayCurrency] ?? 1;
  const portCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const portToDisp = v => v / portFx;

  const dailyChangePLN = enriched.reduce((sum, pos) => {
    if (pos.valuePLN != null && pos.dailyChg != null) {
      return sum + pos.valuePLN * pos.dailyChg / 100;
    }
    return sum;
  }, 0);

  const snapshotsSorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const snapshotsForPortfolio = (() => {
    if (tfPortfolio === 'MAX') return snapshotsSorted;
    const days = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 }[tfPortfolio] || 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return snapshotsSorted.filter(s => s.date >= cutoff);
  })();

  function handleSort(key) {
    if (sortCol === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(key);
      setSortDir('desc');
    }
  }

  function handleColDrop(targetKey) {
    if (!dragCol || dragCol === targetKey) return;
    const from = cols.indexOf(dragCol);
    const to = cols.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    const next = [...cols];
    next.splice(from, 1);
    next.splice(to, 0, dragCol);
    handleColChange(next);
  }

  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      if (sortCol === 'symbol') {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === 'asc' ? cmp : -cmp;
      }
      const getter = SORT_GETTERS[sortCol];
      if (!getter) return 0;
      const va = getter(a);
      const vb = getter(b);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [enriched, sortCol, sortDir]);

  const filteredSorted = useMemo(() => {
    let base = sorted;
    if (filterChip === 'win')  base = base.filter(p => (p.plPLN ?? 0) >= 0);
    if (filterChip === 'lose') base = base.filter(p => (p.plPLN ?? 0) < 0);
    if (filterGpw)             base = base.filter(p => p.symbol?.endsWith('.WA'));
    return base;
  }, [sorted, filterChip, filterGpw]);

  const filteredCostPLN = filteredSorted.reduce((sum, p) => sum + (p.costPLN ?? 0), 0);

  const groupedPositions = useMemo(() => {
    if (!grouped) return null;
    const bySector = {};
    filteredSorted.forEach(p => {
      const sec = p.sector || 'Inne';
      (bySector[sec] = bySector[sec] || []).push(p);
    });
    return Object.entries(bySector).sort((a, b) =>
      b[1].reduce((s, p) => s + (p.valuePLN ?? 0), 0) - a[1].reduce((s, p) => s + (p.valuePLN ?? 0), 0)
    );
  }, [filteredSorted, grouped]);

  const SECTOR_COLORS_P = {
    Technology: '#7c9eff', Tech: '#7c9eff',
    Gaming: '#a78bfa', Energy: '#ffb020',
    'Consumer Cyclical': '#34d399', Retail: '#34d399',
    'Consumer Defensive': '#34d399',
    Auto: '#ff4d6d', Automotive: '#ff4d6d',
    Finance: '#22d3ee', Financials: '#22d3ee', 'Financial Services': '#22d3ee',
    Healthcare: '#f472b6', Health: '#f472b6',
    'Basic Materials': '#fb923c', Construction: '#fb923c',
    Food: '#facc15', 'Consumer Staples': '#facc15',
    Communication: '#60a5fa', 'Communication Services': '#60a5fa',
    Utilities: '#a3e635', 'Real Estate': '#f87171',
    Industrials: '#fbbf24', Inne: '#8a929d',
  };

  function renderPositionRow(pos) {
    const share = filteredCostPLN > 0 ? ((pos.costPLN ?? 0) / filteredCostPLN) * 100 : 0;
    const menuOpen = menuSym === pos.symbol;
    return (
      <React.Fragment key={pos.id ?? pos.symbol}>
      <tr>
        <td
          style={{ cursor: 'pointer', position: 'sticky', left: 0, zIndex: 1, background: 'var(--panel)' }}
          onClick={() => setSelectedItem(pos)}
          title={`Otwórz szczegóły ${pos.symbol}`}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <TickerLogo symbol={pos.symbol} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--info)' }}>{pos.symbol}</span>
                {notes[pos.symbol]?.text && (
                  <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>📝</span>
                )}
                {alerts.some(a => a.symbol === pos.symbol) && (
                  <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.6 }}>🔔</span>
                )}
                {pos.notFound && (
                  editTicker?.oldSymbol === pos.symbol ? (
                    <form
                      onSubmit={e => { e.preventDefault(); e.stopPropagation(); handleTickerRename(pos.symbol, editTicker.value); }}
                      onClick={e => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <input
                        autoFocus
                        value={editTicker.value}
                        onChange={e => setEditTicker(tk => ({ ...tk, value: e.target.value.toUpperCase() }))}
                        onKeyDown={e => e.key === 'Escape' && setEditTicker(null)}
                        style={{
                          width: 90, padding: '2px 6px', fontSize: 12,
                          background: 'var(--panel-2)', border: '1px solid var(--accent)',
                          borderRadius: 5, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace',
                          outline: 'none',
                        }}
                      />
                      <button type="submit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, padding: '0 2px' }}>✓</button>
                      <button type="button" onClick={() => setEditTicker(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, padding: '0 2px' }}>✕</button>
                    </form>
                  ) : (
                    <span
                      title={t('quote_not_found')}
                      onClick={e => { e.stopPropagation(); setEditTicker({ oldSymbol: pos.symbol, value: pos.symbol }); }}
                      style={{ fontSize: 12, color: 'var(--down)', cursor: 'pointer' }}
                    >⚠</span>
                  )
                )}
              </div>
              {pos.name && pos.name !== pos.symbol && (
                <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pos.name}</div>
              )}
            </div>
          </div>
        </td>
        {cols.map(key => (
          <td key={key} className="right mono">
            {renderCell(key, pos, fxRates, divBySymbol, locale, displayCurrency)}
          </td>
        ))}
        <td className="right mono">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <div style={{ width: 64, height: 6, background: 'var(--panel-2)', borderRadius: 9999, overflow: 'hidden' }}>
              <div
                style={{ height: '100%', background: 'var(--info)', borderRadius: 9999, width: `${Math.min(share, 100)}%` }}
              />
            </div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', width: 40, textAlign: 'right' }}>{fmt(share, 1, locale)}%</span>
          </div>
        </td>
        {/* ⋯ action menu */}
        <td style={{ padding: '12px' }} onClick={e => e.stopPropagation()}>
          <button
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuPos({ x: r.right, top: r.top, bottom: r.bottom }); setMenuSym(menuOpen ? null : pos.symbol); }}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, color: 'var(--text-faint)', background: 'transparent',
              border: 'none', cursor: 'pointer', fontSize: 16, transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--panel-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'transparent'; }}
          >
            ⋯
          </button>
        </td>
      </tr>
      {noteEditing === pos.symbol && (
        <tr key={`${pos.id ?? pos.symbol}-note`}>
          <td colSpan={cols.length + 3} style={{ padding: 0 }}>
            <NoteEditor
              symbol={pos.symbol}
              initial={notes[pos.symbol]?.text || ''}
              onSave={(text) => {
                const updated = text.trim()
                  ? { ...notes, [pos.symbol]: { text: text.trim(), updatedAt: new Date().toISOString() } }
                  : (() => { const n = { ...notes }; delete n[pos.symbol]; return n; })();
                setNotes(updated);
                savePositionNotes(updated);
                setNoteEditing(null);
              }}
              onCancel={() => setNoteEditing(null)}
            />
          </td>
        </tr>
      )}
      </React.Fragment>
    );
  }

  function handleExportCsv() {
    const headers = [t('col_symbol'), t('col_qty'), t('col_avg_price'), t('col_currency'), t('col_price'), t('col_cost_pln'), t('col_value_pln'), t('col_pl_pln'), t('col_pl_pct'), t('col_daily_chg')];
    const rows = sorted.map(p => [
      p.symbol,
      p.qty ?? '',
      p.avgPrice ?? '',
      p.currency ?? '',
      p.price ?? '',
      p.costPLN != null ? p.costPLN.toFixed(2) : '',
      p.valuePLN != null ? p.valuePLN.toFixed(2) : '',
      p.plPLN != null ? p.plPLN.toFixed(2) : '',
      p.costPLN > 0 && p.plPLN != null ? ((p.plPLN / p.costPLN) * 100).toFixed(2) : '',
      p.dailyChg != null ? p.dailyChg.toFixed(2) : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `portfel_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportTransactions() {
    const headers = [t('col_date'), t('col_type'), 'Symbol', t('col_qty'), t('col_price'), t('col_currency'), t('col_note')];
    const rows = transactions.map(tx => [
      tx.date ?? '',
      tx.type ?? '',
      tx.symbol ?? '',
      tx.qty != null ? tx.qty : '',
      tx.price != null ? tx.price : '',
      tx.currency ?? '',
      tx.note ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `transakcje_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportSnapshots() {
    const headers = [t('col_date'), t('value_pln_header'), t('invested_pln_header')];
    const rows = snapshots
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => [s.date, s.total ?? '', s.invested ?? '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `historia_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportXlsPositions() {
    const headers = [t('col_symbol'), t('col_qty'), t('col_avg_price'), t('col_currency'), t('col_price'), t('col_cost_pln'), t('col_value_pln'), t('col_pl_pln'), t('col_pl_pct'), t('col_daily_chg')];
    const rows = sorted.map(p => [
      p.symbol, p.qty ?? '', p.avgPrice ?? '', p.currency ?? '', p.price ?? '',
      p.costPLN != null ? parseFloat(p.costPLN.toFixed(2)) : '',
      p.valuePLN != null ? parseFloat(p.valuePLN.toFixed(2)) : '',
      p.plPLN != null ? parseFloat(p.plPLN.toFixed(2)) : '',
      p.costPLN > 0 && p.plPLN != null ? parseFloat(((p.plPLN / p.costPLN) * 100).toFixed(2)) : '',
      p.dailyChg != null ? parseFloat(p.dailyChg.toFixed(2)) : '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Portfel');
    XLSX.writeFile(wb, `portfel_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleExportXlsTransactions() {
    const headers = [t('col_date'), t('col_type'), 'Symbol', t('col_qty'), t('col_price'), t('col_currency'), t('col_note')];
    const rows = transactions.map(tx => [
      tx.date ?? '', tx.type ?? '', tx.symbol ?? '',
      tx.qty != null ? tx.qty : '',
      tx.price != null ? tx.price : '',
      tx.currency ?? '', tx.note ?? '',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Transakcje');
    XLSX.writeFile(wb, `transakcje_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleExportXlsSnapshots() {
    const headers = [t('col_date'), t('value_pln_header'), t('invested_pln_header')];
    const rows = snapshots
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => [s.date, s.total ?? '', s.invested ?? '']);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Historia');
    XLSX.writeFile(wb, `historia_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!portfolio.length) {
    return (
      <div className="space-y-4">
        <div className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
          <div className="text-5xl mb-3">💼</div>
          <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Brak pozycji w portfelu</p>
          <p className="text-sm mt-1 mb-5">{t('add_first_stock_hint')}</p>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary"
          >
            {t('add_stock_btn')}
          </button>
          {showAdd && (
            <AddStockModal
              existingPortfolio={portfolio}
              onSave={async (data) => { await addPosition(data); refresh(); }}
              onClose={() => setShowAdd(false)}
            />
          )}
        </div>
        <OtherAssetsSection />
        <BondsSection />
      </div>
    );
  }

  return (
    <div className="space-y-4" style={{ overflowX: 'hidden' }}>
      {/* Split alerts */}
      {splitAlerts.map(alert => (
        <div key={alert.key} style={{
          padding: '12px 16px',
          borderRadius: 10,
          background: 'rgba(234,179,8,0.08)',
          border: '1px solid rgba(234,179,8,0.35)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: 6 }}>{alert.symbol}</span>
            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {t('split_alert_msg').replace('{ratio}', alert.ratio).replace('{date}', alert.date).replace('{qty}', alert.qty)}
            </span>
          </div>
          <button
            onClick={() => dismissAlert(alert.key)}
            style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 6,
              background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)',
              color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {t('understood')}
          </button>
        </div>
      ))}

      {/* Dashboard grid — draggable/resizable cards */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {editMode && (
          <button
            onClick={() => { setDashLayout(DASH_DEFAULT_LAYOUT); saveLayoutToServer(DASH_DEFAULT_LAYOUT); }}
            style={{ fontSize: 11, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'var(--panel-2)', color: 'var(--text-dim)' }}
          >
            ↺ Resetuj
          </button>
        )}
        <button
          onClick={() => setEditMode(v => !v)}
          style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 7, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500,
            border: editMode ? 'none' : '1px solid var(--border)',
            background: editMode ? 'var(--accent)' : 'var(--panel-2)',
            color: editMode ? '#fff' : 'var(--text)',
            boxShadow: editMode ? '0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)' : 'none',
          }}
        >
          {editMode ? '✓ Gotowe' : '⊞ Edytuj układ'}
        </button>
      </div>
      <div ref={gridRef} className={editMode ? 'rgl-edit' : ''} style={{ marginBottom: 16, overflow: 'hidden' }}>
        {gridWidth > 0 && <GridLayout
          layout={dashLayout}
          width={gridWidth}
          gridConfig={{ cols: 12, rowHeight: DASH_ROW_H, margin: DASH_MARGIN, containerPadding: [0, 0] }}
          dragConfig={{ enabled: editMode, handle: '.card-head' }}
          resizeConfig={{ enabled: editMode, handles: ['se', 'sw', 'ne', 'nw'] }}
          compactor={noCompactor}
          onLayoutChange={newLayout => { if (editMode) { setDashLayout(newLayout); saveLayoutToServer(newLayout); } }}
        >
          <div key="chart">
            <div className="card" style={{ height: '100%', overflow: 'hidden' }}>
              <div className="card-head" style={{
                cursor: editMode ? 'grab' : undefined,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, padding: '14px 20px 4px',
                outline: editMode ? '2px solid transparent' : undefined,
              }}>
                <div>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 4 }}>
                    {t('portfolio_value_rail')}
                  </div>
                  <div className="pv-total" style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                    {fmt(portToDisp(totalValuePLN), 2, locale)} {portCurrLabel}
                  </div>
                  {dailyChangePLN !== 0 && (
                    <div className="pv-daily" style={{ fontSize: 12, marginTop: 4, color: dailyChangePLN >= 0 ? 'var(--up)' : 'var(--down)', fontFamily: 'var(--font-mono)' }}>
                      {dailyChangePLN >= 0 ? '+' : ''}{fmt(portToDisp(dailyChangePLN), 2, locale)} {portCurrLabel} {t('today')}
                    </div>
                  )}
                </div>
                <SegmentedControl
                  options={['1T', '1M', '3M', '6M', '1R', 'MAX']}
                  value={tfPortfolio}
                  onChange={setTfPortfolio}
                />
              </div>
              <div style={{ padding: '4px 12px 14px' }}>
                {snapshotsForPortfolio.length >= 2
                  ? <HistoryChart data={snapshotsForPortfolio} displayCurrency={displayCurrency} fxRate={fxRates[displayCurrency] ?? 1} />
                  : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>{t('not_enough_history')}</div>
                }
              </div>
            </div>
          </div>

          <div key="stats">
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="card-head" style={{ cursor: editMode ? 'grab' : undefined }}>
                <div className="card-title">{t('stats_section')}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 20px 16px' }}>
                <div className="rail-stats">
                  <div className="rail-stat">
                    <span className="rs-lbl">{t('stats_cost')}</span>
                    <span className="rs-val">{fmt(portToDisp(totalCostPLN), 2, locale)} {portCurrLabel}</span>
                  </div>
                  <div className="rail-stat">
                    <span className="rs-lbl">{t('stats_daily')}</span>
                    <span className="rs-val" style={{ color: dailyChangePLN >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {dailyChangePLN >= 0 ? '+' : ''}{fmt(portToDisp(dailyChangePLN), 2, locale)} {portCurrLabel}
                    </span>
                  </div>
                  <div className="rail-stat">
                    <span className="rs-lbl">{t('stats_beta')}</span>
                    <span className="rs-val" style={{ color: 'var(--text-faint)', fontSize: 11, fontWeight: 400 }}>
                      {snapshotsSorted.length}/60 sesji
                    </span>
                  </div>
                  <div className="rail-stat">
                    <span className="rs-lbl">{t('stats_positions')}</span>
                    <span className="rs-val">{portfolio.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div key="pie">
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="card-head" style={{ cursor: editMode ? 'grab' : undefined }}>
                <div className="card-title">Skład portfela</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '8px 20px 16px', overflow: 'hidden' }}>
                {enriched.length > 0
                  ? <PortfolioPieChart positions={enriched} totalValue={totalValuePLN} currency={displayCurrency} fxRate={portFx} />
                  : <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Brak danych</div>
                }
              </div>
            </div>
          </div>

          <div key="alloc">
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="card-head" style={{ cursor: editMode ? 'grab' : undefined }}>
                <div className="card-title">{t('alloc_section')}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 20px 16px', overflow: 'auto' }}>
                {enriched.length > 0
                  ? <StackedAllocation positions={enriched} totalValue={totalValuePLN} currency={displayCurrency} fxRate={portFx} />
                  : <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Brak danych</div>
                }
              </div>
            </div>
          </div>

          <div key="realytd">
            <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div className="card-head" style={{ cursor: editMode ? 'grab' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="card-title">Zysk zrealizowany YTD</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                    Skumulowany P&L ze sprzedaży w {new Date().getFullYear()} r.
                  </div>
                </div>
                {ytdChartData.length > 0 && (
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: ytdChartData[ytdChartData.length - 1].pl >= 0 ? 'var(--up)' : 'var(--down)', whiteSpace: 'nowrap' }}>
                    {ytdChartData[ytdChartData.length - 1].pl >= 0 ? '+' : ''}
                    {fmt(ytdChartData[ytdChartData.length - 1].pl, 2, locale)} {portCurrLabel}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, padding: '4px 8px 12px', minHeight: 0 }}>
                {ytdChartData.length >= 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ytdChartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <defs>
                        <linearGradient id="ytdGradUp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--up)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--up)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="ytdGradDown" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--down)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--down)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false}
                        tickFormatter={d => { if (!d) return ''; const [,m,day] = d.split('-'); return `${day}.${m}`; }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} width={60}
                        tickFormatter={v => `${v >= 0 ? '' : ''}${Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })}`} />
                      <Tooltip
                        contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: 'var(--text-dim)', marginBottom: 4 }}
                        formatter={(v) => [`${v >= 0 ? '+' : ''}${fmt(v, 2, locale)} ${portCurrLabel}`, 'P&L (kum.)']}
                        labelFormatter={d => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${day}.${m}.${y}`; }}
                      />
                      <Area
                        type="monotone" dataKey="pl" strokeWidth={2}
                        stroke={ytdChartData[ytdChartData.length - 1]?.pl >= 0 ? 'var(--up)' : 'var(--down)'}
                        fill={ytdChartData[ytdChartData.length - 1]?.pl >= 0 ? 'url(#ytdGradUp)' : 'url(#ytdGradDown)'}
                        dot={ytdChartData.length <= 20 ? { r: 3, fill: 'var(--up)', strokeWidth: 0 } : false}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                    Brak zamkniętych pozycji w {new Date().getFullYear()} r.
                  </div>
                )}
              </div>
            </div>
          </div>
        </GridLayout>}
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'visible' }}>
        {/* Toolbar */}
        <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', overflow: 'visible' }}>

          {/* ── Filtry ── */}
          {(() => {
            const activeCount = (filterChip !== 'all' ? 1 : 0) + (filterGpw ? 1 : 0) + (grouped ? 1 : 0);
            const DD_STYLE = { position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', minWidth: 200, padding: '6px 0' };
            const rowStyle = (active) => ({ width: '100%', textAlign: 'left', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 9, background: active ? 'var(--panel-2)' : 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13 });
            const hdr = { padding: '5px 14px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600 };
            const check = (on) => <span style={{ width: 14, textAlign: 'center', fontSize: 11, color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>{on ? '✓' : ''}</span>;
            return (
              <div style={{ position: 'relative', flexShrink: 0 }} ref={filterMenuRef}>
                <button className={'btn' + (activeCount > 0 ? ' btn-primary' : '')} onClick={() => setShowFilterMenu(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                  {t('filter')}
                  {activeCount > 0 && <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 8, fontSize: 10, fontWeight: 700, padding: '0 5px', lineHeight: '16px' }}>{activeCount}</span>}
                </button>
                {showFilterMenu && (
                  <div style={DD_STYLE}>
                    <div style={hdr}>{t('filter_pl_label')}</div>
                    {[['all',t('filter_all'),null],['win',t('filter_winners'),'var(--up)'],['lose',t('filter_losers'),'var(--down)']].map(([id,lbl,c]) => (
                      <button key={id} style={rowStyle(filterChip===id)} onClick={() => setFilterChip(id)}
                        onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background=filterChip===id?'var(--panel-2)':'transparent'}>
                        {check(filterChip===id)}{c&&<span style={{width:8,height:8,borderRadius:2,background:c,flexShrink:0}}/>}{lbl}
                      </button>
                    ))}
                    <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                    <div style={hdr}>{t('exchange')}</div>
                    <button style={rowStyle(filterGpw)} onClick={() => setFilterGpw(v=>!v)}
                      onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background=filterGpw?'var(--panel-2)':'transparent'}>
                      {check(filterGpw)}Tylko GPW
                    </button>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                    <div style={hdr}>Widok</div>
                    <button style={rowStyle(grouped)} onClick={() => setGrouped(v=>!v)}
                      onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background=grouped?'var(--panel-2)':'transparent'}>
                      {check(grouped)}{t('group_sectors')}
                    </button>
                    {activeCount > 0 && <>
                      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                      <button style={{ ...rowStyle(false), color: 'var(--text-faint)', fontSize: 12 }}
                        onClick={() => { setFilterChip('all'); setFilterGpw(false); setGrouped(false); setShowFilterMenu(false); }}
                        onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                        {check(false)}{t('clear_filters')}
                      </button>
                    </>}
                  </div>
                )}
              </div>
            );
          })()}


          <div style={{ flex: 1 }} />
          {metricsLoading && <Spinner size="sm" />}

          {/* ── Eksport / Import ── */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={exportMenuRef}>
            <button className="btn" onClick={() => setShowExportMenu(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {t('export')} / {t('import_btn')}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showExportMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', minWidth: 210, padding: '6px 0' }}>
                <div style={{ padding: '5px 14px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600 }}>{t('export')}</div>
                {[
                  { label: 'Pozycje (CSV)', fn: handleExportCsv },
                  { label: 'Pozycje (Excel)', fn: handleExportXlsPositions },
                  { label: 'Transakcje (CSV)', fn: handleExportTransactions },
                  { label: 'Transakcje (Excel)', fn: handleExportXlsTransactions },
                  { label: 'Historia (CSV)', fn: handleExportSnapshots },
                  { label: 'Historia (Excel)', fn: handleExportXlsSnapshots },
                ].map(({ label, fn }) => (
                  <button key={label} onClick={() => { fn(); setShowExportMenu(false); }}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13 }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  >{label}</button>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <div style={{ padding: '5px 14px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600 }}>Import</div>
                <button onClick={() => { setShowImport(true); setShowExportMenu(false); }}
                  style={{ width: '100%', textAlign: 'left', padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13 }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >Import CSV / Excel</button>
              </div>
            )}
          </div>

          {/* ── + Dodaj ── */}
          <div style={{ position: 'relative', flexShrink: 0 }} ref={addMenuRef}>
            <button className="btn btn-primary" onClick={() => setShowAddMenu(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              + {t('add')}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showAddMenu && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', minWidth: 180, padding: '6px 0' }}>
                {[
                  { icon: '📈', label: 'Akcje / ETF', action: () => { setShowAdd(true); setShowAddMenu(false); } },
                  { icon: '₿', label: 'Kryptowaluty', action: () => { setShowAddCrypto(true); setShowAddMenu(false); } },
                ].map(item => (
                  <button key={item.label} onClick={item.action}
                    style={{ width: '100%', textAlign: 'left', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 13 }}
                    onMouseEnter={e => e.currentTarget.style.background='var(--panel-2)'} onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  >
                    <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <ColumnPicker cols={cols} onChange={handleColChange} />
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th
                  style={{ textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, background: 'var(--panel)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => handleSort('symbol')}
                >
                  Symbol{sortCol === 'symbol' && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--accent)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                {cols.map(key => (
                  <th
                    key={key}
                    className="right"
                    draggable
                    style={{
                      cursor: dragCol ? 'grabbing' : 'pointer',
                      userSelect: 'none',
                      background: dragOverCol === key ? 'var(--panel-2)' : undefined,
                      opacity: dragCol === key ? 0.4 : 1,
                      outline: dragOverCol === key ? '1px solid var(--accent)' : undefined,
                      transition: 'background 0.1s, opacity 0.1s',
                      whiteSpace: 'nowrap',
                    }}
                    onClick={() => handleSort(key)}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragCol(key); }}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCol !== key) setDragOverCol(key); }}
                    onDrop={e => { e.preventDefault(); handleColDrop(key); setDragOverCol(null); }}
                    onDragEnd={() => { setDragCol(null); setDragOverCol(null); }}
                  >
                    {getColLabel(key, t)}
                    {sortCol === key && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--accent)' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
                <th className="right">{t('col_share_pct')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {grouped && groupedPositions
                ? groupedPositions.map(([sec, list]) => {
                    const sv = list.reduce((s, p) => s + (p.valuePLN ?? 0), 0);
                    const color = SECTOR_COLORS_P[sec] || '#8a929d';
                    return (
                      <React.Fragment key={sec}>
                        <tr className="sector-group">
                          <td colSpan={cols.length + 3}>
                            <div className="sg-inner">
                              <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />
                              {sec}
                              <span className="sg-count">· {list.length}</span>
                              <span className="sg-val">
                                {(sv / 1000).toFixed(1)}k · {totalValuePLN > 0 ? ((sv / totalValuePLN) * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                        {list.map(pos => renderPositionRow(pos))}
                      </React.Fragment>
                    );
                  })
                : filteredSorted.map(pos => renderPositionRow(pos))
              }
            </tbody>
            {filteredSorted.length > 0 && (() => {
              const tot = filteredSorted.reduce((a, p) => ({
                value: a.value + (p.valuePLN ?? 0),
                pl:    a.pl    + (p.plPLN ?? 0),
                cost:  a.cost  + (p.costPLN ?? 0),
              }), { value: 0, pl: 0, cost: 0 });
              const totRetPct = tot.cost > 0 ? (tot.pl / tot.cost) * 100 : null;
              return (
                <tfoot className="table-pro">
                  <tr>
                    <td className="lbl" style={{ position: 'sticky', left: 0, background: 'var(--panel-2)' }}>
                      {t('totals')} · {filteredSorted.length}
                    </td>
                    {cols.map(key => {
                      if (key === 'valuePLN') return <td key={key} className="right">{fmt(portToDisp(tot.value), 2, locale)} {portCurrLabel}</td>;
                      if (key === 'plPLN')    return <td key={key} className="right" style={{ color: tot.pl >= 0 ? 'var(--up)' : 'var(--down)' }}>{tot.pl >= 0 ? '+' : ''}{fmt(portToDisp(tot.pl), 2, locale)} {portCurrLabel}</td>;
                      if (key === 'costPLN')  return <td key={key} className="right">{fmt(portToDisp(tot.cost), 2, locale)} {portCurrLabel}</td>;
                      return <td key={key} />;
                    })}
                    <td className="right">{totRetPct != null ? ((totRetPct >= 0 ? '+' : '') + totRetPct.toFixed(1) + '%') : '—'}</td>
                    <td />
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
      {showImport && (
        <CsvImportModal
          existingHoldings={portfolio}
          onSave={async (holdings, rawRows) => {
            await saveHoldings(holdings);
            if (rawRows?.length) {
              const newTxs = rawRows.map(r => ({
                id: Math.random().toString(36).slice(2, 10),
                type: 'BUY',
                symbol: r.symbol,
                qty: r.qty,
                price: r.avgPrice,
                currency: r.currency,
                date: r.date,
                note: 'Import CSV',
              }));
              await saveTransactions(prev => [...prev, ...newTxs]);
            }
            refresh();
          }}
          onClose={() => setShowImport(false)}
        />
      )}
      {showAdd && (
        <AddStockModal
          existingPortfolio={portfolio}
          initialSymbol={addSymbol}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => { setShowAdd(false); setAddSymbol(''); }}
        />
      )}
      {showAddCrypto && (
        <AddCryptoModal
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setShowAddCrypto(false)}
        />
      )}
      {sellTarget && (
        <SellStockModal
          holding={sellTarget}
          onSave={async (data) => { await sellPosition(data); refresh(); }}
          onClose={() => setSellTarget(null)}
        />
      )}
      {editTarget && (
        <EditPositionModal
          holding={editTarget}
          onSave={async (data) => { await editPosition(data); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
        />
      )}
      {divTarget && (
        <AddDividendModal
          isOpen={!!divTarget}
          initialData={{ symbol: divTarget, exDate: '', payDate: '', amount: '' }}
          onSave={async (data) => {
            const heldQty = portfolio.find(p => p.symbol === divTarget)?.qty;
            const newTx = {
              id: Math.random().toString(36).slice(2, 10),
              type: 'DIV',
              symbol: data.symbol,
              date: data.exDate,
              price: data.amount,
              qty: heldQty != null && heldQty > 0 ? heldQty : 1,
              currency: data.currency,
              note: data.note || '',
            };
            await saveTransactions(prev => [...prev, newTx]);
            addDividend(data);
            setDivTarget(null);
            setToast(`Dywidenda ${divTarget} zapisana`);
          }}
          onClose={() => setDivTarget(null)}
        />
      )}
      {confirmDel && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setConfirmDel(null)}
        >
          <div
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>Usuń {confirmDel}?</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20 }}>{t('confirm_delete_pos')}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setConfirmDel(null)}
                className="btn"
                style={{ flex: 1, padding: '8px 0' }}
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => { const sym = confirmDel; setConfirmDel(null); removePosition(sym).then(() => refresh()); }}
                className="btn btn-danger"
                style={{ flex: 1, padding: '8px 0' }}
              >
                {t('delete_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedItem && (
        <StockDetailModal
          item={selectedItem}
          existingPortfolio={portfolio}
          totalPortfolioValue={totalValuePLN}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {menuSym && (() => {
        const MENU_H = 372;
        const fitsBelow = menuPos.bottom + MENU_H < window.innerHeight;
        const topVal = fitsBelow ? menuPos.bottom + 4 : menuPos.top - MENU_H - 4;
        return (
        <div
          ref={menuRef}
          style={{
            position: 'fixed', right: 'auto', left: menuPos.x - 176, top: topVal, zIndex: 200,
            background: 'var(--panel)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            width: 176, padding: '4px 0', fontSize: 14,
          }}
        >
          {(() => {
            const pos = sorted.find(p => p.symbol === menuSym);
            if (!pos) return null;
            return [
              { icon: '+', label: t('buy_more'), action: () => { setAddSymbol(pos.symbol); setShowAdd(true); setMenuSym(null); } },
              { icon: '↘', label: 'Sprzedaj', action: () => { setSellTarget(pos); setMenuSym(null); } },
              { icon: '✏', label: t('edit_position'), action: () => { setEditTarget(pos); setMenuSym(null); } },
              { icon: '💰', label: 'Dywidenda', action: () => { setDivTarget(pos.symbol); setMenuSym(null); } },
              { icon: '👁', label: isWatched(pos.symbol) ? t('unwatch') : t('watch'), action: () => { const added = toggleWatchlist(pos.symbol); setToast(added ? `${pos.symbol} ${t('added_watchlist')}` : `${pos.symbol} ${t('removed_watchlist')}`); setMenuSym(null); } },
              { icon: '📊', label: 'Fundamenty', action: () => { setSelectedItem(pos); setMenuSym(null); } },
              { icon: '🔔', label: 'Ustaw alert', action: () => { setAlertTarget({ symbol: pos.symbol, price: pos.price }); setMenuSym(null); } },
              null,
              { icon: '📝', label: 'Notatka', action: () => { setNoteEditing(noteEditing === pos.symbol ? null : pos.symbol); setMenuSym(null); } },
              { icon: '✕', label: t('delete_position'), action: () => { setConfirmDel(pos.symbol); setMenuSym(null); }, danger: true },
            ].map((item, i) =>
              item === null ? (
                <div key={i} style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
              ) : (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 16px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: item.danger ? 'var(--down)' : 'var(--text)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                </button>
              )
            );
          })()}
        </div>
        );
      })()}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel-2)', color: 'var(--text)', fontSize: 14,
          padding: '10px 20px', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 50, pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
      {alertTarget && (
        <SetAlertModal
          symbol={alertTarget.symbol}
          currentPrice={alertTarget.price}
          onSave={(alert) => {
            if (Notification.permission === 'default') {
              Notification.requestPermission();
            }
            const updated = [...alerts, { ...alert, id: Math.random().toString(36).slice(2, 10) }];
            setAlerts(updated);
            saveAlerts(updated);
            setToast(`Alert dla ${alert.symbol} ustawiony`);
          }}
          onClose={() => setAlertTarget(null)}
        />
      )}
      <OtherAssetsSection />
      <BondsSection />
    </div>
  );
}

function getAssetCategories(t) {
  return {
    real_estate: { label: t('asset_cat_real_estate'), icon: '🏠' },
    metals:      { label: t('asset_cat_metals'), icon: '🥇' },
    savings:     { label: t('asset_cat_savings'), icon: '🏦' },
    vehicle:     { label: t('asset_cat_vehicle'), icon: '🚗' },
    other:       { label: t('asset_cat_other'), icon: '📦' },
  };
}
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

function OtherAssetModal({ initial, onSave, onClose }) {
  const t = useT();
  const { locale } = useLanguage();
  const ASSET_CATEGORIES = getAssetCategories(t);
  const [name, setName]         = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'other');
  const [value, setValue]       = useState(initial?.value ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'PLN');
  const [note, setNote]         = useState(initial?.note ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    if (!name.trim()) { setError(t('enter_name')); return; }
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { setError(t('enter_value_err')); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), category, value: v, currency, note: note.trim() });
      onClose();
    } catch(e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {initial ? t('asset_edit_title') : t('asset_add_title')}
        </h2>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">{t('asset_name_label')}</label>
          <input className="field-input" placeholder="np. Mieszkanie Warszawa" value={name} onChange={e => setName(e.target.value)} autoFocus />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="field-label">{t('asset_category_label')}</label>
          <select className="field-input" value={category} onChange={e => setCategory(e.target.value)}>
            {Object.entries(ASSET_CATEGORIES).map(([k, { label, icon }]) => (
              <option key={k} value={k}>{icon} {label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{t('asset_value_label')}</label>
            <input type="number" min="0" step="any" className="field-input" value={value} onChange={e => setValue(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('currency_label')}</label>
            <select className="field-input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="field-label">{t('note_optional')}</label>
          <input className="field-input" value={note} onChange={e => setNote(e.target.value)} placeholder={t('asset_note_placeholder')} />
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function OtherAssetsSection() {
  const { otherAssets, addOtherAsset, editOtherAsset, deleteOtherAsset, fxRates, displayCurrency } = useApp();
  const oaFx = fxRates[displayCurrency] ?? 1;
  const oaCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const t = useT();
  const { locale } = useLanguage();
  const ASSET_CATEGORIES = getAssetCategories(t);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const totalPLN = otherAssets.reduce((s, a) => s + (a.value || 0) * (fxRates[a.currency] ?? 1), 0);

  function fmtLocal(n) {
    return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  if (!otherAssets.length && !showModal) {
    return (
      <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{t('other_assets')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('real_estate_hint')}</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ fontSize: 12 }}>+ {t('add')}</button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{t('other_assets')}</span>
          {totalPLN > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 10 }}>≈ {fmtLocal(totalPLN / oaFx)} {oaCurrLabel} {t('total_approx')}</span>
          )}
        </div>
        <button onClick={() => { setEditTarget(null); setShowModal(true); }} className="btn" style={{ fontSize: 12 }}>+ {t('add')}</button>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('col_name')}</th>
              <th>{t('col_category')}</th>
              <th className="right">{t('col_value')}</th>
              <th className="right">≈ {displayCurrency}</th>
              <th>{t('col_note')}</th>
              <th>{t('col_last_updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {otherAssets.map(a => {
              const cat = ASSET_CATEGORIES[a.category] ?? ASSET_CATEGORIES.other;
              const plnVal = (a.value || 0) * (fxRates[a.currency] ?? 1);
              return (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{cat.icon} {a.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{cat.label}</td>
                  <td className="right mono" style={{ color: 'var(--text)' }}>{fmtLocal(a.value)} {a.currency}</td>
                  <td className="right mono" style={{ color: 'var(--text-dim)' }}>{fmtLocal(plnVal / oaFx)} {oaCurrLabel}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{a.note || '—'}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{a.updatedAt || '—'}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => { setEditTarget(a); setShowModal(true); }}
                      style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}
                    >{t('edit')}</button>
                    <button
                      onClick={() => setConfirmDel(a)}
                      style={{ fontSize: 11, color: 'var(--down)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >{t('delete_btn')}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showModal && (
        <OtherAssetModal
          initial={editTarget}
          onSave={async (data) => {
            if (editTarget) await editOtherAsset(editTarget.id, data);
            else await addOtherAsset(data);
          }}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Usuń "{confirmDel.name}"?</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={() => setConfirmDel(null)} className="btn" style={{ flex: 1 }}>{t('cancel')}</button>
              <button onClick={() => { const a = confirmDel; setConfirmDel(null); deleteOtherAsset(a.id); }} className="btn btn-danger" style={{ flex: 1 }}>{t('delete_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BondsSection() {
  const { bonds, addBond, editBond, deleteBond, canWrite } = useApp();
  const t = useT();
  const { locale } = useLanguage();
  const [cpiMap, setCpiMap] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    if (bonds.length) fetchCpiSeries().then(setCpiMap);
  }, [bonds.length]);

  const valued = useMemo(
    () => bonds.map(b => ({ ...b, v: valueBond(b, cpiMap ?? new Map()) })),
    [bonds, cpiMap],
  );
  const totalValue = valued.reduce((s, b) => s + b.v.totalValue, 0);

  const fmt = n => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = r => (r * 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

  if (!bonds.length && !showModal) {
    return (
      <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{t('bonds_title')}</p>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>{t('bonds_hint')}</p>
        </div>
        {canWrite && <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ fontSize: 12 }}>+ {t('add')}</button>}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{t('bonds_title')}</span>
          {totalValue > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 10 }}>≈ {fmt(totalValue)} zł</span>
          )}
        </div>
        {canWrite && <button onClick={() => { setEditTarget(null); setShowModal(true); }} className="btn" style={{ fontSize: 12 }}>+ {t('add')}</button>}
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('bond_series')}</th>
              <th>{t('bond_type')}</th>
              <th>{t('bond_purchase_date')}</th>
              <th className="right">{t('bond_count')}</th>
              <th className="right">{t('col_nominal')}</th>
              <th className="right">{t('col_bond_rate')}</th>
              <th className="right">{t('col_bond_value')}</th>
              <th className="right">{t('col_bond_redeem')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {valued.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                  🏦 {b.name}
                  {b.v.matured && <span style={{ fontSize: 10, color: 'var(--warn)', marginLeft: 6 }}>{t('bond_matured')}</span>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.type} · {BOND_TYPES[b.type]?.years ?? '—'}L</td>
                <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{b.purchaseDate}</td>
                <td className="right mono">{b.count}</td>
                <td className="right mono" style={{ color: 'var(--text-dim)' }}>{fmt(b.v.totalNominal)} zł</td>
                <td className="right mono" style={{ color: 'var(--up)' }}>{fmtPct(b.v.currentRate)}</td>
                <td className="right mono" style={{ color: 'var(--text)' }}>{fmt(b.v.totalValue)} zł</td>
                <td className="right mono" style={{ color: 'var(--text-dim)' }}>{fmt(b.v.redeemTodayTotal)} zł</td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>
                  {canWrite && <>
                  <button
                    onClick={() => { setEditTarget(b); setShowModal(true); }}
                    style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8 }}
                  >{t('edit')}</button>
                  <button
                    onClick={() => setConfirmDel(b)}
                    style={{ fontSize: 11, color: 'var(--down)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >{t('delete_btn')}</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', padding: '10px 16px 14px' }}>{t('bonds_estimate_note')}</p>
      {showModal && (
        <BondModal
          initial={editTarget}
          onSave={async (data) => {
            if (editTarget) await editBond(editTarget.id, data);
            else await addBond(data);
          }}
          onClose={() => { setShowModal(false); setEditTarget(null); }}
        />
      )}
      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, maxWidth: 320, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>Usuń "{confirmDel.name}"?</p>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button onClick={() => setConfirmDel(null)} className="btn" style={{ flex: 1 }}>{t('cancel')}</button>
              <button onClick={() => { const b = confirmDel; setConfirmDel(null); deleteBond(b.id); }} className="btn btn-danger" style={{ flex: 1 }}>{t('delete_btn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BondModal({ initial, onSave, onClose }) {
  const t = useT();
  const [type, setType]     = useState(initial?.type ?? 'EDO');
  const [name, setName]     = useState(initial?.name ?? '');
  const [date, setDate]     = useState(initial?.purchaseDate ?? new Date().toISOString().slice(0, 10));
  const [count, setCount]   = useState(initial?.count ?? '');
  const [rate1, setRate1]   = useState(initial?.firstYearRate ?? '');
  const [margin, setMargin] = useState(initial?.margin ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    if (!name.trim()) { setError(t('enter_name')); return; }
    const c = parseInt(count, 10);
    if (!c || c < 1) { setError(t('bond_count_err')); return; }
    setSaving(true);
    try {
      await onSave({
        type, name: name.trim(), purchaseDate: date,
        count: c, firstYearRate: parseFloat(rate1) || 0, margin: parseFloat(margin) || 0,
      });
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {initial ? t('bond_edit_title') : t('bond_add_title')}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{t('bond_type')}</label>
            <select className="field-input" value={type} onChange={e => setType(e.target.value)}>
              <option value="EDO">EDO (10L)</option>
              <option value="COI">COI (4L)</option>
            </select>
          </div>
          <div>
            <label className="field-label">{t('bond_series')}</label>
            <input className="field-input" placeholder={t('bond_series_ph')} value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{t('bond_purchase_date')}</label>
            <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">{t('bond_count')}</label>
            <input type="number" min="1" step="1" className="field-input" value={count} onChange={e => setCount(e.target.value)} placeholder="np. 50" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
          <div>
            <label className="field-label">{t('bond_first_rate')}</label>
            <input type="number" min="0" step="0.01" className="field-input" value={rate1} onChange={e => setRate1(e.target.value)} placeholder="np. 6.55" />
          </div>
          <div>
            <label className="field-label">{t('bond_margin')}</label>
            <input type="number" min="0" step="0.01" className="field-input" value={margin} onChange={e => setMargin(e.target.value)} placeholder="np. 2.00" />
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>{t('bond_modal_hint')}</p>
        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
