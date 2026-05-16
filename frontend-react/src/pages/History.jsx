import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import HistoryChart from '../components/HistoryChart';
import Spinner from '../components/shared/Spinner';

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

const PERIODS = [
  { key: '1M',  label: '1M',  days: 30  },
  { key: '3M',  label: '3M',  days: 90  },
  { key: '6M',  label: '6M',  days: 180 },
  { key: '1Y',  label: '1R',  days: 365 },
  { key: 'MAX', label: 'MAX', days: null },
];

const BENCHMARKS = [
  { key: null,       label: 'Brak' },
  { key: '^GSPC',    label: 'S&P 500' },
  { key: 'WIG20.WA', label: 'WIG20' },
  { key: 'URTH',     label: 'MSCI World' },
];

export default function History() {
  const { snapshots, loading } = useApp();
  const [period, setPeriod] = useState('MAX');
  const [benchmark, setBenchmark] = useState(null);
  const [benchData, setBenchData] = useState([]);
  const [benchLoading, setBenchLoading] = useState(false);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots]
  );

  const filtered = useMemo(() => {
    const p = PERIODS.find(p => p.key === period);
    if (!p?.days) return sorted;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return sorted.filter(s => s.date >= cutStr);
  }, [sorted, period]);

  const latest       = sorted[sorted.length - 1];
  const filteredFirst = filtered[0];
  const filteredLast  = filtered[filtered.length - 1];

  // KPI scoped to selected period
  const gainPLN = filteredLast && filteredFirst
    ? (filteredLast.total ?? 0) - (filteredFirst.total ?? 0) : 0;
  const gainPct = filteredFirst?.total > 0 ? (gainPLN / filteredFirst.total) * 100 : null;

  const days = filteredFirst && filteredLast
    ? Math.round((new Date(filteredLast.date) - new Date(filteredFirst.date)) / 86400000)
    : 0;
  // CAGR: annualized return on invested capital (total / invested ratio), min 90d
  const cagr = days >= 90 && latest?.invested > 0 && latest?.total > 0
    ? (Math.pow(latest.total / latest.invested, 365 / days) - 1) * 100
    : null;

  const ath = useMemo(
    () => sorted.reduce((best, s) => (s.total ?? 0) > (best?.total ?? 0) ? s : best, null),
    [sorted]
  );

  useEffect(() => {
    if (!benchmark) { setBenchData([]); return; }
    setBenchLoading(true);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(benchmark)}?interval=1d&range=5y`;
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) })
      .then(r => r.json())
      .then(json => {
        const result = json?.chart?.result?.[0];
        if (!result) return;
        const timestamps = result.timestamp ?? [];
        const closes = result.indicators?.quote?.[0]?.close ?? [];
        const pts = timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString().slice(0, 10),
            price: closes[i],
          }))
          .filter(p => p.price != null);
        setBenchData(pts);
      })
      .catch(() => setBenchData([]))
      .finally(() => setBenchLoading(false));
  }, [benchmark]);

  const benchNormalized = useMemo(() => {
    if (!benchData.length || !filtered.length) return [];
    const priceAtDate = (date) => {
      let last = null;
      for (const pt of benchData) {
        if (pt.date <= date) last = pt.price;
        else break;
      }
      return last;
    };
    const firstBenchPrice = priceAtDate(filtered[0].date);
    if (!firstBenchPrice) return [];
    const firstPortValue = filtered[0].total ?? 0;
    return filtered.map(s => ({
      date: s.date,
      value: ((priceAtDate(s.date) ?? firstBenchPrice) / firstBenchPrice) * firstPortValue,
    }));
  }, [benchData, filtered]);

  if (loading && !snapshots.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!snapshots.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">📈</div>
        <p className="text-slate-400 font-semibold">Brak historii</p>
        <p className="text-sm mt-1">Historia pojawi się po pierwszym odświeżeniu portfela</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Aktualna wartość</p>
          <p className="text-xl font-bold text-slate-100">{fmt(latest?.total)} zł</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Zainwestowano</p>
          <p className="text-xl font-bold text-slate-100">{fmt(latest?.invested)} zł</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${gainPLN >= 0 ? 'border-emerald-800/60 bg-emerald-950/30' : 'border-rose-800/60 bg-rose-950/30'}`}>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Zmiana od początku</p>
          <p className={`text-xl font-bold ${gainPLN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {gainPLN >= 0 ? '+' : ''}{fmt(gainPLN)} zł
          </p>
          {gainPct != null && (
            <p className={`text-xs mt-0.5 ${gainPLN >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {gainPct >= 0 ? '+' : ''}{fmt(gainPct, 1)}%
            </p>
          )}
        </div>
        {cagr != null && (
          <div className="rounded-xl border border-indigo-800/60 bg-indigo-950/30 px-5 py-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">CAGR (annualizowany)</p>
            <p className={`text-xl font-bold ${cagr >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
              {cagr >= 0 ? '+' : ''}{fmt(cagr, 1)}%
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{days}d historii</p>
          </div>
        )}
        {ath && (
          <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">ATH (szczyt)</p>
            <p className="text-xl font-bold text-amber-400">{fmt(ath.total)} zł</p>
            <p className="text-xs text-slate-500 mt-0.5">{fmtDate(ath.date)}</p>
          </div>
        )}
      </div>

      {/* Wykres historii portfela */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-300">Historia wartości portfela</p>
          <div className="flex gap-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  period === p.key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* Benchmark */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-500">Benchmark:</span>
          <div className="flex gap-1">
            {BENCHMARKS.map(b => (
              <button
                key={String(b.key)}
                onClick={() => setBenchmark(b.key)}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  benchmark === b.key
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {b.label}
                {benchLoading && benchmark === b.key && ' …'}
              </button>
            ))}
          </div>
        </div>
        <HistoryChart data={filtered} benchData={benchNormalized} benchLabel={BENCHMARKS.find(b => b.key === benchmark)?.label} />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">
            {period === 'MAX' ? 'Wszystkie snapshots' : `Snapshots — ostatnie ${PERIODS.find(p => p.key === period)?.label}`}
          </h2>
          <span className="text-xs text-slate-500">{filtered.length} wpisów</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Data</th>
                <th className="text-right px-5 py-2.5">Wartość</th>
                <th className="text-right px-5 py-2.5">Zainwestowano</th>
                <th className="text-right px-5 py-2.5">P&L</th>
                <th className="text-right px-5 py-2.5">Δ dnia</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = [...filtered].reverse();
                return rows.map((s, i) => {
                  const pl      = (s.total ?? 0) - (s.invested ?? 0);
                  const pct     = s.invested > 0 ? (pl / s.invested) * 100 : 0;
                  const prev    = rows[i + 1];
                  const delta   = prev != null ? (s.total ?? 0) - (prev.total ?? 0) : null;
                  const deltaUp = delta != null && delta >= 0;
                  const valueUp = prev != null ? (s.total ?? 0) >= (prev.total ?? 0) : null;
                  return (
                    <tr key={s.date + i} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-2.5 text-slate-400">{fmtDate(s.date)}</td>
                      <td className={`px-5 py-2.5 text-right font-semibold ${
                        valueUp === true ? 'text-emerald-300' : valueUp === false ? 'text-rose-300' : 'text-slate-100'
                      }`}>{fmt(s.total)} zł</td>
                      <td className="px-5 py-2.5 text-right text-slate-400">{fmt(s.invested)} zł</td>
                      <td className={`px-5 py-2.5 text-right font-medium ${pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pl >= 0 ? '+' : ''}{fmt(pl)} zł
                        <span className="text-xs ml-1 opacity-70">({pct >= 0 ? '+' : ''}{fmt(pct, 1)}%)</span>
                      </td>
                      <td className={`px-5 py-2.5 text-right text-xs ${delta == null ? 'text-slate-600' : deltaUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {delta == null ? '—' : `${deltaUp ? '+' : ''}${fmt(delta)} zł`}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
