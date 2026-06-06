import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import { usePrivacy } from '../context/PrivacyContext';
import Sparkline from '../components/shared/Sparkline';
import Spinner from '../components/shared/Spinner';
import Card from '../components/shared/Card';
import TickerLogo from '../components/shared/TickerLogo';
import Chip from '../components/shared/Chip';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import useDividendEvents from '../hooks/useDividendEvents';
import { COLUMN_DEFS, loadColumnConfig } from '../utils/portfolioColumns';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import KpiPro from '../components/shared/KpiPro';
import InsightStrip from '../components/shared/InsightStrip';
import StackedAllocation from '../components/shared/StackedAllocation';
import WinnersLosers from '../components/shared/WinnersLosers';
import SegmentedControl from '../components/shared/SegmentedControl';
import HistoryChart from '../components/HistoryChart';
ChartJS.register(ArcElement, Tooltip, Legend);

function xirr(cashflows) {
  if (cashflows.length < 2) return null;
  const t0 = new Date(cashflows[0].date).getTime();
  const days = cashflows.map(cf => (new Date(cf.date).getTime() - t0) / 86400000);
  let rate = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    let f = 0, df = 0;
    for (let i = 0; i < cashflows.length; i++) {
      const t = days[i] / 365;
      const denom = Math.pow(1 + rate, t);
      f  += cashflows[i].amount / denom;
      df -= t * cashflows[i].amount / (denom * (1 + rate));
    }
    if (Math.abs(f) < 1e-7) return rate;
    const next = rate - f / df;
    if (!isFinite(next)) return null;
    rate = next;
  }
  return Math.abs(rate) < 50 ? rate : null;
}

function toPlnRate(currency, fx) {
  return fx[currency] ?? 1;
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CUR_FLAG_DASH = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };
const COL_LABEL_DASH = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.label]));

function renderCellDash(key, pos, isPrivate) {
  const flag = CUR_FLAG_DASH[pos.currency] ?? pos.currency;
  switch (key) {
    case 'qty':
      return <span style={{ color: 'var(--text)' }}>{fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}</span>;
    case 'avgPrice':
      return <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.avgPrice)} <span className="text-xs">{flag}</span></span>;
    case 'price':
      return pos.price != null
        ? <span style={{ color: 'var(--text)' }}>{fmt(pos.price)} <span className="text-xs">{flag}</span></span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'dailyChg': {
      if (pos.dailyChg == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.dailyChg >= 0;
      return <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>{up ? '+' : ''}{fmt(pos.dailyChg, 2)}%</span>;
    }
    case 'costPLN':
      return <span style={{ color: 'var(--text)', fontWeight: 600 }} className={isPrivate ? 'privacy-blur' : ''}>{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span style={{ color: 'var(--text)', fontWeight: 600 }} className={isPrivate ? 'privacy-blur' : ''}>{fmt(pos.valuePLN)} zł</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.plPLN >= 0;
      return <span style={{ color: up ? 'var(--up)' : 'var(--down)', fontWeight: 600 }} className={isPrivate ? 'privacy-blur' : ''}>{up ? '+' : ''}{fmt(pos.plPLN)} zł</span>;
    }
    case 'period':
      return <span style={{ color: 'var(--text-dim)' }}>{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null ? <span style={{ color: 'var(--text)' }}>{fmt(pos.moic, 2)}x</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'irr': {
      if (pos.irr == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.irr >= 0;
      return <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>{up ? '+' : ''}{fmt(pos.irr, 1)}%</span>;
    }
    case 'pe':
      return pos.pe != null ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pe, 1)}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'peFwd':
      return pos.peFwd != null ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.peFwd, 1)}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'pb':
      return pos.pb != null ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pb, 2)}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    default:
      return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  }
}


function AllocationChart({ positions }) {
  const [tab, setTab] = useState('stocks');

  const grouped = (() => {
    if (tab === 'stocks') {
      return positions.reduce((acc, p) => {
        acc[p.symbol] = (acc[p.symbol] ?? 0) + (p.valuePLN ?? 0);
        return acc;
      }, {});
    }
    if (tab === 'currencies') {
      return positions.reduce((acc, p) => {
        acc[p.currency] = (acc[p.currency] ?? 0) + (p.valuePLN ?? 0);
        return acc;
      }, {});
    }
    // sectors — use sector from enrichPosition (covers US via Yahoo + .WA via WA_SECTOR_MAP)
    return positions.reduce((acc, p) => {
      const sector = p.sector || 'Inne';
      acc[sector] = (acc[sector] ?? 0) + (p.valuePLN ?? 0);
      return acc;
    }, {});
  })();

  const allLabels = Object.keys(grouped);
  const totalVal = allLabels.reduce((s, k) => s + grouped[k], 0);
  const labels = allLabels.filter(k => totalVal > 0 && (grouped[k] / totalVal * 100) >= 0.05);
  const data = {
    labels,
    datasets: [{
      data: labels.map(k => grouped[k]),
      backgroundColor: ['#00d97e', '#7c9eff', '#ffb020', '#ff4d6d', '#a78bfa', '#34d399', '#60a5fa', '#f59e0b'].slice(0, labels.length),
      borderColor: 'transparent',
      borderWidth: 0,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: tab === 'stocks'
        ? { display: false }
        : { position: 'right', labels: { color: '#8a929d', font: { size: 11 }, boxWidth: 12, padding: 10 } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : '0';
            return ` ${ctx.label}: ${ctx.parsed.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł (${pct}%)`;
          },
        },
      },
    },
  };

  if (!positions.length) return null;

  return (
    <Card title="Alokacja portfela" actions={
      <div className="flex gap-1">
        {[['stocks', 'Spółki'], ['currencies', 'Waluty'], ['sectors', 'Sektory']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={tab === key ? 'btn btn-primary' : 'btn btn-ghost'}
            style={{ fontSize: 12, padding: '2px 10px' }}
          >
            {label}
          </button>
        ))}
      </div>
    }>
      <div style={{ padding: '16px 20px 16px', maxWidth: 360, margin: '0 auto' }}>
        <Doughnut data={data} options={options} />
      </div>
      {tab === 'stocks' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8, justifyContent: 'center', paddingBottom: 16, padding: '0 8px 16px' }}>
          {labels.map((sym, i) => {
            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((grouped[sym] / total) * 100).toFixed(1) : '0';
            return (
              <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                <TickerLogo symbol={sym} size={18} />
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>{sym.replace('.WA', '')}</span>
                <span style={{ color: 'var(--text-faint)' }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function KpiCard({ label, value, sub, trend, isPrivate }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value${isPrivate ? ' privacy-blur' : ''}`}>{value}</div>
      {sub != null && (
        <div style={{
          fontSize: 12,
          marginTop: 4,
          fontWeight: 500,
          color: trend > 0 ? 'var(--up)' : trend < 0 ? 'var(--down)' : 'var(--text-dim)',
        }} className={isPrivate ? 'privacy-blur' : ''}>{sub}</div>
      )}
    </div>
  );
}

const CUR_FLAGS = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };
const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

function CashSection({ cash, fxRates, saveCash }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  function openModal() {
    setForm({ PLN: cash.PLN ?? 0, USD: cash.USD ?? 0, EUR: cash.EUR ?? 0, GBP: cash.GBP ?? 0 });
    setIsOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCash(Object.fromEntries(CURRENCIES.map(c => [c, parseFloat(form[c]) || 0])));
      setIsOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const hasCash = CURRENCIES.some(c => (cash[c] ?? 0) > 0);

  return (
    <>
      <Card title="Gotówka" actions={
        <button onClick={openModal} className="btn btn-ghost" style={{ fontSize: 12 }}>
          ✎ Zarządzaj
        </button>
      }>
        <div style={{ padding: '0 20px 16px' }}>
          {!hasCash ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', paddingTop: 8, paddingBottom: 8 }}>
              Brak gotówki — kliknij „Zarządzaj" aby dodać.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {CURRENCIES.filter(c => (cash[c] ?? 0) > 0).map(cur => {
                const amt = cash[cur] ?? 0;
                const pln = amt * (fxRates[cur] ?? 1);
                return (
                  <div key={cur} style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 16px', minWidth: 110 }}>
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                      {CUR_FLAGS[cur]} {cur}
                    </p>
                    <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
                      {amt.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {cur !== 'PLN' && (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
                        ≈ {Math.round(pln).toLocaleString('pl-PL')} zł
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
             onClick={() => setIsOpen(false)}>
          <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 384 }}
               onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>Zarządzaj gotówką</h2>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Wprowadź aktualne salda. Wartości zostaną przeliczone na PLN po bieżącym kursie.</p>
            <div className="space-y-3">
              {CURRENCIES.map(cur => (
                <div key={cur} className="flex items-center gap-3">
                  <label style={{ fontSize: 14, color: 'var(--text)', width: 64 }}>{CUR_FLAGS[cur]} {cur}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form[cur] ?? 0}
                    onChange={e => setForm(prev => ({ ...prev, [cur]: e.target.value }))}
                    style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setIsOpen(false)} className="btn btn-ghost" style={{ flex: 1 }}>
                Anuluj
              </button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ flex: 1 }}>
                {saving ? 'Zapisywanie…' : 'Zapisz'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function Dashboard() {
  const { portfolio, transactions, snapshots, loading, fxRates, cash, otherAssets, saveCash, invested, saveSnapshot, displayName, displayCurrency } = useApp();
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const { openChart } = useChart();
  const { isPrivate } = usePrivacy();
  const [cols] = useState(loadColumnConfig);
  const [tf, setTf] = useState('MAX');
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { allCalendarEvents } = useDividendEvents(symbols);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nextDividend = allCalendarEvents.find(e => e.date >= todayStr);

  // ── Live positions (market prices + enrichment) ──────────────────────────
  const allPositions = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const topPositions = useMemo(
    () => [...portfolio]
      .sort((a, b) => (b.qty * b.avgPrice * toPlnRate(b.currency, fxRates)) - (a.qty * a.avgPrice * toPlnRate(a.currency, fxRates)))
      .slice(0, 7)
      .map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const topMovers = useMemo(() => {
    const withChg = allPositions.filter(p => p.dailyChg != null);
    const sorted = [...withChg].sort((a, b) => b.dailyChg - a.dailyChg);
    return { gainers: sorted.slice(0, 3), losers: sorted.slice(-3).reverse() };
  }, [allPositions]);

  // ── KPI — real-time values from live positions, not stale snapshots ────────
  const kpi = useMemo(() => {
    // Transaction-derived (no live price needed)
    const realizedPLN = transactions
      .filter(t => t.type === 'SELL')
      .reduce((sum, tx) => {
        const rate = toPlnRate(tx.currency, fxRates);
        const pl   = tx.overridePL != null
          ? tx.overridePL
          : (tx.price - (tx.costBasis ?? tx.avgPrice ?? tx.price)) * tx.qty;
        return sum + pl * rate;
      }, 0);

    const dividendsPLN = transactions
      .filter(t => t.type === 'DIV')
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const yearCutStr = yearAgo.toISOString().slice(0, 10);
    const annualDivPLN = transactions
      .filter(t => t.type === 'DIV' && t.date >= yearCutStr)
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const sorted      = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const sparkValues = sorted.slice(-60).map(s => s.total ?? 0);

    // Live values — use real-time position prices, fall back to cost for unpriced positions
    const positionsValue   = allPositions.reduce((s, p) => s + (p.valuePLN ?? p.costPLN ?? 0), 0);
    const cashValue        = Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const otherAssetsValue = otherAssets.reduce((s, a) => s + (a.value || 0) * (fxRates[a.currency] ?? 1), 0);
    const totalValue       = positionsValue + cashValue + otherAssetsValue;

    // Unrealized P&L: sum of per-position P&L (null if price unknown → 0)
    const costBasis  = invested ?? 0; // = sum(qty * avgPrice * fx) for current holdings
    const unrealPLN  = allPositions.reduce((s, p) => s + (p.plPLN ?? 0), 0);
    const unrealPct  = costBasis > 0 ? (unrealPLN / costBasis) * 100 : 0;

    // Total ROI: (positionsValue + realizedPLN + dividendsPLN - costBasis) / costBasis
    const totalROI = costBasis > 0
      ? ((positionsValue + realizedPLN + dividendsPLN - costBasis) / costBasis) * 100
      : null;

    const pricesLoaded = allPositions.some(p => p.valuePLN != null);

    console.log('[KPI] Total Invested vs Total Value', {
      costBasis:       costBasis.toFixed(2),
      positionsValue:  positionsValue.toFixed(2),
      cashValue:       cashValue.toFixed(2),
      totalValue:      totalValue.toFixed(2),
      unrealPLN:       unrealPLN.toFixed(2),
      unrealPct:       unrealPct.toFixed(2) + '%',
      totalROI:        totalROI != null ? totalROI.toFixed(2) + '%' : 'n/a',
      pricesLoaded,
    });

    return {
      totalValue, positionsValue, cashValue, costBasis,
      unrealPLN, unrealPct, totalROI,
      realizedPLN, dividendsPLN, annualDivPLN,
      sparkValues, pricesLoaded,
    };
  }, [allPositions, snapshots, transactions, fxRates, cash, invested]);

  // ── Portfolio IRR — requires ≥30 days of history ──────────────────────────
  const { portfolioIrr, irrMissingSymbols, irrDaySpan } = useMemo(() => {
    const symbolsWithBuy = new Set(
      transactions.filter(t => t.type === 'BUY').map(t => t.symbol)
    );
    const missingSymbols = allPositions
      .filter(p => !symbolsWithBuy.has(p.symbol))
      .map(p => p.symbol);

    const cashflows = transactions
      .filter(t => t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIV')
      .map(t => ({
        amount: t.type === 'BUY'
          ? -(t.qty * t.price * (fxRates[t.currency] ?? 1))
          :  +(t.qty * t.price * (fxRates[t.currency] ?? 1)),
        date: t.date,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!cashflows.length) return { portfolioIrr: null, irrMissingSymbols: missingSymbols, irrDaySpan: 0 };

    // Require at least 30 days of history — shorter periods give misleading annualized rates
    const daySpan = Math.round((Date.now() - new Date(cashflows[0].date).getTime()) / 86400000);
    if (daySpan < 30) return { portfolioIrr: null, irrMissingSymbols: missingSymbols, irrDaySpan: daySpan };

    // Only include positions with documented BUY transactions to avoid inflating IRR
    const terminalValue = allPositions
      .filter(p => symbolsWithBuy.has(p.symbol))
      .reduce((s, p) => s + (p.valuePLN ?? 0), 0);
    if (terminalValue <= 0) return { portfolioIrr: null, irrMissingSymbols: missingSymbols, irrDaySpan: daySpan }; // prices not loaded yet

    cashflows.push({ amount: terminalValue, date: new Date().toISOString().slice(0, 10) });
    return { portfolioIrr: xirr(cashflows), irrMissingSymbols: missingSymbols, irrDaySpan: daySpan };
  }, [transactions, fxRates, allPositions]);

  // ── Snapshot — only save when real prices are loaded ─────────────────────
  const positionsValueKey = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0).toFixed(0);
  useEffect(() => {
    if (loading) return;
    const pricesLoaded = allPositions.some(p => p.valuePLN != null);
    if (!pricesLoaded) return; // wait until market data arrives

    const totalValue    = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0)
      + Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const investedValue = allPositions.reduce((s, p) => s + (p.costPLN ?? 0), 0);
    if (totalValue > 0 && investedValue > 0) {
      saveSnapshot(totalValue, investedValue);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsValueKey, loading]);

  const dailyChange = useMemo(() => {
    const pln = allPositions.reduce((sum, pos) => {
      if (pos.valuePLN != null && pos.dailyChg != null) {
        return sum + pos.valuePLN * pos.dailyChg / 100;
      }
      return sum;
    }, 0);
    const pct = kpi.totalValue > 0 ? (pln / kpi.totalValue) * 100 : null;
    return { pln, pct };
  }, [allPositions, kpi.totalValue]);

  const snapshotsFiltered = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    if (tf === 'MAX') return sorted;
    const days = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 }[tf] || 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return sorted.filter(s => s.date >= cutoff);
  }, [snapshots, tf]);

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const fmtVal = (n, d = 0) => n == null || isNaN(n)
    ? '—'
    : n.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });

  const dayChipVal = dailyChange.pct != null
    ? (dailyChange.pct >= 0 ? '+' : '') + fmtVal(dailyChange.pct, 2) + '%'
    : null;
  const unrealChipVal = kpi.unrealPct != null
    ? (kpi.unrealPct >= 0 ? '+' : '') + fmtVal(kpi.unrealPct, 2) + '%'
    : null;
  const irrChipVal = portfolioIrr != null
    ? (portfolioIrr * 100).toFixed(1) + '%/r'
    : null;

  const TF_OPTIONS = ['1T', '1M', '3M', '6M', '1R', 'MAX'];

  return (
    <div>
      {/* page-head */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Witaj, {displayName ?? 'Inwestorze'}</h1>
          <p className="page-sub">
            {new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* InsightStrip */}
      {allPositions.length > 0 && (
        <InsightStrip positions={allPositions} dailyChangePLN={dailyChange.pln} />
      )}

      {/* KPI grid */}
      <div className="kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
        <KpiPro
          hero
          label="Wartość portfela"
          value={`${fmtVal(kpi.totalValue)} ${currLabel}`}
          chip={dayChipVal}
          chipUp={dailyChange.pln >= 0}
          sub="dziś"
          spark={kpi.sparkValues.slice(-24)}
          sparkUp={dailyChange.pln >= 0}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
        />
        <KpiPro
          label="Zysk / strata"
          tone={kpi.unrealPLN >= 0 ? 'up' : 'down'}
          value={`${kpi.unrealPLN >= 0 ? '+' : ''}${fmtVal(kpi.unrealPLN)} ${currLabel}`}
          chip={unrealChipVal}
          chipUp={kpi.unrealPLN >= 0}
          sub="niezrealizowany"
          spark={kpi.sparkValues.slice(-24)}
          sparkUp={kpi.unrealPLN >= 0}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
        />
        <KpiPro
          label="Dywidendy YTD"
          value={`${fmtVal(kpi.annualDivPLN)} ${currLabel}`}
          sub={nextDividend ? `następna: ${nextDividend.symbol}` : 'ostatnie 12 mies.'}
          spark={kpi.sparkValues.slice(-24)}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>}
        />
        <KpiPro
          label="Wolne środki"
          value={`${fmtVal(kpi.cashValue)} ${currLabel}`}
          chip={irrChipVal}
          chipUp={portfolioIrr != null && portfolioIrr >= 0}
          sub="konto · PLN"
          spark={kpi.sparkValues.slice(-24)}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>}
        />
      </div>

      {/* Chart + Top movers */}
      <div className="detail-grid" style={{ gridTemplateColumns: '1fr 380px', gap: 16, marginBottom: 18 }}>
        <div className="card chart-card">
          <div style={{ padding: '18px 20px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 4 }}>
                Wartość portfela · {tf}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {fmtVal(kpi.totalValue)} {currLabel}
              </div>
            </div>
            <SegmentedControl
              options={TF_OPTIONS}
              value={tf}
              onChange={setTf}
            />
          </div>
          <div style={{ padding: '4px 12px 18px' }}>
            {snapshotsFiltered.length >= 2
              ? <HistoryChart data={snapshotsFiltered} />
              : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>Za mało danych historycznych</div>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">Top ruchy dzisiaj</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="dot-status" />
              live
            </span>
          </div>
          <div>
            {[...topMovers.gainers, ...topMovers.losers].length === 0
              ? <p style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-faint)' }}>Brak danych</p>
              : [...topMovers.gainers, ...topMovers.losers].map(pos => (
                <div key={pos.symbol} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                  <TickerLogo symbol={pos.symbol} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{pos.symbol.replace('.WA', '')}</div>
                    {pos.name && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.name}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 58 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: pos.dailyChg >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {pos.dailyChg >= 0 ? '+' : ''}{pos.dailyChg?.toFixed(2)}%
                    </div>
                    {pos.price != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{fmt(pos.price)}</div>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Allocation + Winners/Losers */}
      {allPositions.length > 0 && (
        <div className="detail-grid" style={{ gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 18 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Alokacja sektorowa</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <StackedAllocation positions={allPositions} totalValue={kpi.positionsValue} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">Wygrani i przegrani</div>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>zwrot %</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <WinnersLosers positions={allPositions} />
            </div>
          </div>
        </div>
      )}

      {!portfolio.length && !loading && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-faint)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Brak danych portfela</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Dodaj pozycje w zakładce Portfel</p>
        </div>
      )}
    </div>
  );
}
