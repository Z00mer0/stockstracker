import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import HistoryChart from '../components/HistoryChart';
import ReturnRateChart from '../components/ReturnRateChart';
import Spinner from '../components/shared/Spinner';
import SegmentedControl from '../components/shared/SegmentedControl';
import Card from '../components/shared/Card';

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
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
  { key: null,        label: 'Brak' },
  { key: '^GSPC',     label: 'S&P 500' },
  { key: '^IXIC',     label: 'NASDAQ' },
  { key: 'URTH',      label: 'MSCI World' },
  { key: 'PL:WIG20',  label: 'WIG20' },
  { key: 'PL:MWIG40', label: 'mWIG40' },
  { key: 'PL:SWIG80', label: 'sWIG80' },
];

export default function History() {
  const { snapshots, loading, invested } = useApp();
  const { isPrivate } = usePrivacy();
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
  const cagr = days >= 90 && invested > 0 && filteredLast?.total > 0
    ? (Math.pow(filteredLast.total / invested, 365 / days) - 1) * 100
    : null;

  const filteredWithInvested = useMemo(
    () => filtered.map(s => ({ ...s, invested: s.invested ?? (invested > 0 ? invested : null) })),
    [filtered, invested]
  );

  const ath = useMemo(
    () => sorted.reduce((best, s) => (s.total ?? 0) > (best?.total ?? 0) ? s : best, null),
    [sorted]
  );

  useEffect(() => {
    if (!benchmark) { setBenchData([]); return; }
    setBenchLoading(true);
    const authHeader = { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' };

    if (benchmark.startsWith('PL:')) {
      const sym = benchmark.slice(3);
      fetch(`/api/bench-pl?s=${sym}`, { signal: AbortSignal.timeout(15000), headers: authHeader })
        .then(r => r.json())
        .then(json => { if (Array.isArray(json)) setBenchData(json); else setBenchData([]); })
        .catch(() => setBenchData([]))
        .finally(() => setBenchLoading(false));
    } else {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(benchmark)}?interval=1d&range=5y`;
      fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000), headers: authHeader })
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
    }
  }, [benchmark]);

  if (loading && !snapshots.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!snapshots.length) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
        <div className="text-5xl mb-3">📈</div>
        <p style={{ color: 'var(--text-dim)' }} className="font-semibold">Brak historii</p>
        <p className="text-sm mt-1">Historia pojawi się po pierwszym odświeżeniu portfela</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Wartość (filtr)', value: <span className={isPrivate ? 'privacy-blur' : ''}>{fmtMoney(filteredLast?.total)}</span>, sub: null },
          { label: 'Zysk/strata', value: <span className={isPrivate ? 'privacy-blur' : ''} style={{ color: gainPLN >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtMoney(gainPLN)}</span>, sub: gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : null },
          { label: 'CAGR', value: cagr != null ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%` : '—', sub: null },
          { label: 'ATH', value: <span className={isPrivate ? 'privacy-blur' : ''}>{fmtMoney(ath?.total)}</span>, sub: ath?.date ? fmtDate(ath.date) : null },
        ].map(({ label, value, sub }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{value}</div>
            {sub && <div className="kpi-sub">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Wykres kapitału */}
      <Card title="Wartość portfela">
        <div style={{ marginBottom: 16 }}>
          <SegmentedControl
            options={PERIODS.map(p => ({ value: p.key, label: p.label }))}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <HistoryChart data={filteredWithInvested} />
      </Card>

      {/* Wykres stopy zwrotu z benchmarkiem */}
      <Card title="Stopa zwrotu">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Benchmark:</span>
          <SegmentedControl
            options={BENCHMARKS.map(b => ({ value: b.key ?? 'none', label: b.label + (benchLoading && benchmark === b.key ? ' …' : '') }))}
            value={benchmark ?? 'none'}
            onChange={v => setBenchmark(v === 'none' ? null : v)}
          />
        </div>
        <ReturnRateChart
          data={filteredWithInvested}
          benchData={benchData}
          benchLabel={BENCHMARKS.find(b => b.key === benchmark)?.label}
        />
      </Card>

      {/* Tabela */}
      <Card title={period === 'MAX' ? 'Wszystkie snapshots' : `Snapshots — ostatnie ${PERIODS.find(p => p.key === period)?.label}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{filtered.length} wpisów</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th className="right">Wartość</th>
                <th className="right">Zainwestowano</th>
                <th className="right">P&L</th>
                <th className="right">Δ dnia</th>
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
                    <tr key={s.date + i}>
                      <td style={{ color: 'var(--text-dim)' }}>{fmtDate(s.date)}</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{
                        color: valueUp === true ? 'var(--up)' : valueUp === false ? 'var(--down)' : 'var(--text)',
                        fontWeight: 600,
                      }}>{fmt(s.total)} zł</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--text-dim)' }}>{fmt(s.invested)} zł</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: pl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>
                        {pl >= 0 ? '+' : ''}{fmt(pl)} zł
                        <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>({pct >= 0 ? '+' : ''}{fmt(pct, 1)}%)</span>
                      </td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 12, color: delta == null ? 'var(--text-faint)' : deltaUp ? 'var(--up)' : 'var(--down)' }}>
                        {delta == null ? '—' : `${deltaUp ? '+' : ''}${fmt(delta)} zł`}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
