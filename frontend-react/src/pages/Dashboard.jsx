import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import { usePrivacy } from '../context/PrivacyContext';
import Sparkline from '../components/shared/Sparkline';
import Spinner from '../components/shared/Spinner';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
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
      return <span className="text-slate-300">{fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}</span>;
    case 'avgPrice':
      return <span className="text-slate-400">{fmt(pos.avgPrice)} <span className="text-xs">{flag}</span></span>;
    case 'price':
      return pos.price != null
        ? <span className="text-slate-300">{fmt(pos.price)} <span className="text-xs">{flag}</span></span>
        : <span className="text-slate-600">—</span>;
    case 'dailyChg': {
      if (pos.dailyChg == null) return <span className="text-slate-600">—</span>;
      const up = pos.dailyChg >= 0;
      return <span className={up ? 'text-emerald-400' : 'text-rose-400'}>{up ? '+' : ''}{fmt(pos.dailyChg, 2)}%</span>;
    }
    case 'costPLN':
      return <span className={`text-slate-200 font-semibold${isPrivate ? ' privacy-blur' : ''}`}>{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span className={`text-slate-200 font-semibold${isPrivate ? ' privacy-blur' : ''}`}>{fmt(pos.valuePLN)} zł</span>
        : <span className="text-slate-600">—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span className="text-slate-600">—</span>;
      const up = pos.plPLN >= 0;
      return <span className={`${up ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}${isPrivate ? ' privacy-blur' : ''}`}>{up ? '+' : ''}{fmt(pos.plPLN)} zł</span>;
    }
    case 'period':
      return <span className="text-slate-400">{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null ? <span className="text-slate-300">{fmt(pos.moic, 2)}x</span> : <span className="text-slate-600">—</span>;
    case 'irr': {
      if (pos.irr == null) return <span className="text-slate-600">—</span>;
      const up = pos.irr >= 0;
      return <span className={up ? 'text-emerald-400' : 'text-rose-400'}>{up ? '+' : ''}{fmt(pos.irr, 1)}%</span>;
    }
    case 'pe':
      return pos.pe != null ? <span className="text-slate-400">{fmt(pos.pe, 1)}</span> : <span className="text-slate-600">—</span>;
    case 'peFwd':
      return pos.peFwd != null ? <span className="text-slate-400">{fmt(pos.peFwd, 1)}</span> : <span className="text-slate-600">—</span>;
    case 'pb':
      return pos.pb != null ? <span className="text-slate-400">{fmt(pos.pb, 2)}</span> : <span className="text-slate-600">—</span>;
    default:
      return <span className="text-slate-600">—</span>;
  }
}

const SECTOR_CACHE_KEY = 'finnhub_sectors';
const SECTOR_TTL = 24 * 60 * 60 * 1000;
const FINNHUB_TOKEN = 'd7uhj69r01qnv95nm3e0d7uhj69r01qnv95nm3eg';

function AllocationChart({ positions }) {
  const [tab, setTab] = useState('stocks');
  const [sectors, setSectors] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem(SECTOR_CACHE_KEY) || 'null');
      return c?.ts && Date.now() - c.ts < SECTOR_TTL ? c.data : {};
    } catch { return {}; }
  });

  useEffect(() => {
    const missing = positions.map(p => p.symbol).filter(sym => !(sym in sectors));
    if (!missing.length) return;
    let cancelled = false;
    Promise.allSettled(
      missing.map(sym =>
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${sym}&token=${FINNHUB_TOKEN}`)
          .then(r => r.json())
          .then(j => ({ sym, sector: j.finnhubIndustry || 'Inne' }))
          .catch(() => ({ sym, sector: 'Inne' }))
      )
    ).then(results => {
      if (cancelled) return;
      setSectors(prev => {
        const updated = { ...prev };
        results.forEach(r => { if (r.status === 'fulfilled') updated[r.value.sym] = r.value.sector; });
        localStorage.setItem(SECTOR_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: updated }));
        return updated;
      });
    });
    return () => { cancelled = true; };
  }, [positions]);

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
    // sectors
    return positions.reduce((acc, p) => {
      const sector = sectors[p.symbol] || 'Ładowanie…';
      acc[sector] = (acc[sector] ?? 0) + (p.valuePLN ?? 0);
      return acc;
    }, {});
  })();

  const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'];
  const labels = Object.keys(grouped);
  const data = {
    labels,
    datasets: [{
      data: labels.map(k => grouped[k]),
      backgroundColor: COLORS.slice(0, labels.length),
      borderColor: '#1e293b',
      borderWidth: 2,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'right',
        labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 10 },
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
    <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-300">Alokacja portfela</p>
        <div className="flex gap-1">
          {[['stocks', 'Spółki'], ['currencies', 'Waluty'], ['sectors', 'Sektory']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                tab === key ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-sm mx-auto">
        <Doughnut data={data} options={options} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, trend, color = 'slate' }) {
  const { isPrivate } = usePrivacy();
  const colors = {
    slate:   'border-slate-700 bg-slate-800',
    indigo:  'border-indigo-800/60 bg-indigo-950/40',
    green:   'border-emerald-800/60 bg-emerald-950/40',
    red:     'border-rose-800/60 bg-rose-950/40',
    yellow:  'border-yellow-800/60 bg-yellow-950/40',
  };
  const trendColor = trend > 0 ? 'text-emerald-400' : trend < 0 ? 'text-rose-400' : 'text-slate-400';

  return (
    <div className={`rounded-xl border px-5 py-4 ${colors[color]}`}>
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold text-slate-100${isPrivate ? ' privacy-blur' : ''}`}>{value}</p>
      {sub != null && (
        <p className={`text-sm mt-1 font-medium ${trendColor}${isPrivate ? ' privacy-blur' : ''}`}>{sub}</p>
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
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-300">Gotówka</p>
          <button
            onClick={openModal}
            className="text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 px-2.5 py-1 rounded-lg transition-colors"
          >
            ✎ Zarządzaj
          </button>
        </div>
        {!hasCash ? (
          <p className="text-xs text-slate-500 py-2">Brak gotówki — kliknij „Zarządzaj" aby dodać.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {CURRENCIES.filter(c => (cash[c] ?? 0) > 0).map(cur => {
              const amt = cash[cur] ?? 0;
              const pln = amt * (fxRates[cur] ?? 1);
              return (
                <div key={cur} className="bg-slate-900/50 rounded-lg px-4 py-2.5 min-w-[110px]">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{CUR_FLAGS[cur]} {cur}</p>
                  <p className="text-base font-bold text-slate-100">{amt.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  {cur !== 'PLN' && <p className="text-xs text-slate-500 mt-0.5">≈ {Math.round(pln).toLocaleString('pl-PL')} zł</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
             onClick={() => setIsOpen(false)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
               onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-slate-100 mb-4">Zarządzaj gotówką</h2>
            <p className="text-xs text-slate-500 mb-4">Wprowadź aktualne salda. Wartości zostaną przeliczone na PLN po bieżącym kursie.</p>
            <div className="space-y-3">
              {CURRENCIES.map(cur => (
                <div key={cur} className="flex items-center gap-3">
                  <label className="text-sm text-slate-300 w-16">{CUR_FLAGS[cur]} {cur}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form[cur] ?? 0}
                    onChange={e => setForm(prev => ({ ...prev, [cur]: e.target.value }))}
                    className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setIsOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
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
  const { portfolio, transactions, snapshots, loading, fxRates, cash, saveCash, invested } = useApp();
  const { openChart } = useChart();
  const { isPrivate } = usePrivacy();
  const [cols] = useState(loadColumnConfig);
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const kpi = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1];

    const totalValue    = latest?.total ?? 0;
    const totalInvested = invested ?? 0;
    const unrealPLN     = totalValue - totalInvested;
    const unrealPct     = totalInvested > 0 ? (unrealPLN / totalInvested) * 100 : 0;

    const realizedPLN = transactions
      .filter(t => t.type === 'SELL')
      .reduce((sum, tx) => {
        const rate     = toPlnRate(tx.currency, fxRates);
        const costBasis = tx.costBasis ?? tx.avgPrice ?? tx.price;
        return sum + (tx.price - costBasis) * tx.qty * rate;
      }, 0);

    const dividendsPLN = transactions
      .filter(t => t.type === 'DIV')
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const sparkValues = sorted.slice(-60).map(s => s.total ?? 0);

    return { totalValue, totalInvested, unrealPLN, unrealPct, realizedPLN, dividendsPLN, sparkValues };
  }, [snapshots, transactions, fxRates, invested]);

  const topPositions = useMemo(
    () => [...portfolio]
      .sort((a, b) => (b.qty * b.avgPrice * toPlnRate(b.currency, fxRates)) - (a.qty * a.avgPrice * toPlnRate(a.currency, fxRates)))
      .slice(0, 7)
      .map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const allPositions = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const portfolioIrr = useMemo(() => {
    const cashflows = transactions
      .filter(t => t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIV')
      .map(t => ({
        amount: t.type === 'BUY'
          ? -(t.qty * t.price * (fxRates[t.currency] ?? 1))
          : t.qty * t.price * (fxRates[t.currency] ?? 1),
        date: t.date,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const totalValue = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0);
    if (totalValue > 0) cashflows.push({ amount: totalValue, date: new Date().toISOString() });
    return xirr(cashflows);
  }, [transactions, fxRates, allPositions]);

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
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Wartość portfela"
          value={`${fmt(kpi.totalValue)} zł`}
          color="indigo"
        />
        <KpiCard
          label="Unrealized P&L"
          value={`${kpi.unrealPLN >= 0 ? '+' : ''}${fmt(kpi.unrealPLN)} zł`}
          sub={`${kpi.unrealPct >= 0 ? '+' : ''}${fmt(kpi.unrealPct)}%`}
          trend={kpi.unrealPLN}
          color={kpi.unrealPLN >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Realized P&L"
          value={`${kpi.realizedPLN >= 0 ? '+' : ''}${fmt(kpi.realizedPLN)} zł`}
          trend={kpi.realizedPLN}
          color={kpi.realizedPLN >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="Dywidendy"
          value={`${fmt(kpi.dividendsPLN)} zł`}
          color="yellow"
        />
        <KpiCard
          label="Zmiana dzienna"
          value={`${dailyChange.pln >= 0 ? '+' : ''}${fmt(dailyChange.pln)} zł`}
          sub={dailyChange.pct != null ? `${dailyChange.pct >= 0 ? '+' : ''}${fmt(dailyChange.pct, 2)}%` : undefined}
          trend={dailyChange.pln}
          color={dailyChange.pln >= 0 ? 'green' : 'red'}
        />
        <KpiCard
          label="IRR portfela"
          value={portfolioIrr != null ? (portfolioIrr * 100).toFixed(1) + '%' : '—'}
          sub="ważona roczna stopa zwrotu"
          color={portfolioIrr > 0 ? 'green' : portfolioIrr < 0 ? 'red' : 'slate'}
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
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-300">Historia wartości portfela</p>
            <span className="text-xs text-slate-500">{kpi.sparkValues.length} punktów</span>
          </div>
          <Sparkline data={kpi.sparkValues} width={800} height={80} />
        </div>
      )}

      {/* Top pozycje */}
      {topPositions.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Największe pozycje (wg kosztu)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Symbol</th>
                  {cols.map(key => (
                    <th key={key} className="text-right px-4 py-2.5 whitespace-nowrap">
                      {COL_LABEL_DASH[key] ?? key}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topPositions.map((pos) => (
                  <tr key={pos.id ?? pos.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                    <td
                      className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                    >
                      {pos.symbol}
                      {pos.name && pos.name !== pos.symbol && (
                        <span className="ml-2 text-xs text-slate-500 font-normal">{pos.name}</span>
                      )}
                    </td>
                    {cols.map(key => (
                      <td key={key} className="px-4 py-3 text-right whitespace-nowrap">
                        {renderCellDash(key, pos, isPrivate)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!portfolio.length && !loading && (
        <div className="text-center py-16 text-slate-500">
          <div className="text-5xl mb-3">📊</div>
          <p className="text-slate-400 font-semibold">Brak danych portfela</p>
          <p className="text-sm mt-1">Dodaj pozycje w głównym portalu StocksTracker</p>
        </div>
      )}
    </div>
  );
}
