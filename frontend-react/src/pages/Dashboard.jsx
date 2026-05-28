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

  const labels = Object.keys(grouped);
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
      legend: {
        position: 'right',
        labels: { color: '#8a929d', font: { size: 11 }, boxWidth: 12, padding: 10 },
      },
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
      <div style={{ padding: '0 20px 16px', maxWidth: 360, margin: '0 auto' }}>
        <Doughnut data={data} options={options} />
      </div>
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
  const { portfolio, transactions, snapshots, loading, fxRates, cash, saveCash, invested, saveSnapshot, displayName, displayCurrency } = useApp();
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const { openChart } = useChart();
  const { isPrivate } = usePrivacy();
  const [cols] = useState(loadColumnConfig);
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

  // ── KPI — real-time values from live positions, not stale snapshots ────────
  const kpi = useMemo(() => {
    // Transaction-derived (no live price needed)
    const realizedPLN = transactions
      .filter(t => t.type === 'SELL')
      .reduce((sum, tx) => {
        const rate      = toPlnRate(tx.currency, fxRates);
        const costBasis = tx.costBasis ?? tx.avgPrice ?? tx.price;
        return sum + (tx.price - costBasis) * tx.qty * rate;
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
    const positionsValue = allPositions.reduce((s, p) => s + (p.valuePLN ?? p.costPLN ?? 0), 0);
    const cashValue      = Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const totalValue     = positionsValue + cashValue;

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
  const { portfolioIrr, irrMissingSymbols } = useMemo(() => {
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

    if (!cashflows.length) return { portfolioIrr: null, irrMissingSymbols: missingSymbols };

    // Require at least 30 days of history — shorter periods give misleading annualized rates
    const daySpan = Math.round((Date.now() - new Date(cashflows[0].date).getTime()) / 86400000);
    if (daySpan < 30) return { portfolioIrr: null, irrMissingSymbols: missingSymbols };

    // Only include positions with documented BUY transactions to avoid inflating IRR
    const terminalValue = allPositions
      .filter(p => symbolsWithBuy.has(p.symbol))
      .reduce((s, p) => s + (p.valuePLN ?? 0), 0);
    if (terminalValue <= 0) return { portfolioIrr: null, irrMissingSymbols: missingSymbols }; // prices not loaded yet

    cashflows.push({ amount: terminalValue, date: new Date().toISOString().slice(0, 10) });
    return { portfolioIrr: xirr(cashflows), irrMissingSymbols: missingSymbols };
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

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Witaj, {displayName ?? 'Inwestorze'}</h1>
          <p className="page-sub">{new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 16 }}>
        <KpiCard
          label="Wartość portfela"
          value={`${fmt(kpi.totalValue)} ${currLabel}`}
          isPrivate={isPrivate}
        />
        <KpiCard
          label="Unrealized P&L"
          value={`${kpi.unrealPLN >= 0 ? '+' : ''}${fmt(kpi.unrealPLN)} ${currLabel}`}
          sub={`${kpi.unrealPct >= 0 ? '+' : ''}${fmt(kpi.unrealPct)}%${!kpi.pricesLoaded ? ' (ceny ładuję…)' : ''}`}
          trend={kpi.unrealPLN}
          isPrivate={isPrivate}
        />
        <KpiCard
          label="Realized P&L"
          value={`${kpi.realizedPLN >= 0 ? '+' : ''}${fmt(kpi.realizedPLN)} ${currLabel}`}
          sub={kpi.totalROI != null ? `Total ROI: ${kpi.totalROI >= 0 ? '+' : ''}${fmt(kpi.totalROI, 1)}%` : undefined}
          trend={kpi.realizedPLN}
          isPrivate={isPrivate}
        />
        <KpiCard
          label="Roczna Dywidenda"
          value={`${fmt(kpi.annualDivPLN)} ${currLabel}`}
          sub="ostatnie 12 miesięcy"
          isPrivate={isPrivate}
        />
        <KpiCard
          label="Zmiana dzienna"
          value={`${dailyChange.pln >= 0 ? '+' : ''}${fmt(dailyChange.pln)} ${currLabel}`}
          sub={dailyChange.pct != null ? `${dailyChange.pct >= 0 ? '+' : ''}${fmt(dailyChange.pct, 2)}%` : undefined}
          trend={dailyChange.pln}
          isPrivate={isPrivate}
        />
        <KpiCard
          label="IRR portfela"
          value={portfolioIrr != null ? (portfolioIrr * 100).toFixed(1) + '%' : 'N/A'}
          sub={
            portfolioIrr != null
              ? irrMissingSymbols.length > 0
                ? `bez ${irrMissingSymbols.join(', ')} (brak BUY)`
                : 'ważona roczna stopa zwrotu'
              : '< 30 dni historii'
          }
          trend={portfolioIrr}
          isPrivate={false}
        />
      </div>

      {/* Gotówka */}
      <CashSection cash={cash} fxRates={fxRates} saveCash={saveCash} />

      {/* Alokacja */}
      {allPositions.length > 0 && (
        <AllocationChart positions={allPositions} />
      )}

      {/* Sparkline historii */}
      {kpi.sparkValues.length > 1 && (
        <Card title="Historia wartości portfela" actions={
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{kpi.sparkValues.length} punktów</span>
        }>
          <div style={{ padding: '0 20px 16px' }}>
            <Sparkline data={kpi.sparkValues} width={800} height={80} />
            {nextDividend && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--text-faint)' }}>Najbliższa dywidenda:</span>
                <span style={{ fontWeight: 700, color: 'var(--warn)' }}>{nextDividend.symbol}</span>
                <span style={{ color: 'var(--text-dim)' }}>{nextDividend.date}</span>
                {nextDividend.amount != null && (
                  <span style={{ color: 'var(--text-faint)' }}>
                    {nextDividend.amount.toFixed(4)} {nextDividend.currency ?? ''}
                  </span>
                )}
                <span style={{ color: 'var(--text-faint)', marginLeft: 'auto' }}>{nextDividend.isManual ? '✍️ ręczne' : '🤖 auto'}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Top pozycje */}
      {topPositions.length > 0 && (
        <Card title="Największe pozycje (wg kosztu)">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">Symbol</th>
                  {cols.map(key => (
                    <th key={key} className="text-right whitespace-nowrap">
                      {COL_LABEL_DASH[key] ?? key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topPositions.map((pos) => (
                  <tr key={pos.id ?? pos.symbol}>
                    <td
                      className="cursor-pointer"
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                    >
                      <TickerLogo symbol={pos.symbol} />
                      <span style={{ color: 'var(--info)', fontWeight: 700 }} className="hover:underline">
                        {pos.symbol}
                      </span>
                      {pos.name && pos.name !== pos.symbol && (
                        <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 400 }}>{pos.name}</span>
                      )}
                    </td>
                    {cols.map(key => (
                      <td key={key} className="text-right whitespace-nowrap">
                        {renderCellDash(key, pos, isPrivate)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!portfolio.length && !loading && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-faint)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Brak danych portfela</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>Dodaj pozycje w głównym portalu StocksTracker</p>
        </div>
      )}
    </div>
  );
}
