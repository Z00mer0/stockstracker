import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import HistoryChart from '../components/HistoryChart';
import ReturnRateChart from '../components/ReturnRateChart';
import RollingReturnsChart from '../components/RollingReturnsChart';
import Spinner from '../components/shared/Spinner';
import SegmentedControl from '../components/shared/SegmentedControl';
import Card from '../components/shared/Card';

function fmt(n, decimals = 0, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(v, locale = 'pl-PL') {
  if (v == null) return '—';
  return Number(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function calcMDD(snapshots) {
  if (snapshots.length < 2) return null;
  let peak = -Infinity, peakDate = null;
  let maxDD = 0, ddStart = null, ddEnd = null;
  for (const s of snapshots) {
    if ((s.total ?? 0) > peak) {
      peak = s.total;
      peakDate = s.date;
    }
    if (peak > 0) {
      const dd = (peak - (s.total ?? 0)) / peak * 100;
      if (dd > maxDD) {
        maxDD = dd;
        ddStart = peakDate;
        ddEnd = s.date;
      }
    }
  }
  return maxDD > 0 ? { pct: maxDD, from: ddStart, to: ddEnd } : null;
}

const PERIODS_BASE = [
  { key: '1M',  pl: '1M',  en: '1M',  days: 30  },
  { key: '3M',  pl: '3M',  en: '3M',  days: 90  },
  { key: '6M',  pl: '6M',  en: '6M',  days: 180 },
  { key: '1Y',  pl: '1R',  en: '1Y',  days: 365 },
  { key: 'MAX', pl: 'MAX', en: 'MAX', days: null },
];


// Polish annual CPI from GUS (average YoY %)
const PL_CPI_ANNUAL = {
  2018: 1.6, 2019: 2.3, 2020: 3.4, 2021: 5.1,
  2022: 14.4, 2023: 11.4, 2024: 3.6, 2025: 5.2,
};

function generateSynthBench(key, startDate, endDate) {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const pts   = [];
  let price   = 1000;
  const d     = new Date(start);
  while (d <= end) {
    pts.push({ date: d.toISOString().slice(0, 10), price });
    const year  = d.getFullYear();
    let annRate;
    if (key === 'SYNTH:CPI_PL') {
      annRate = (PL_CPI_ANNUAL[year] ?? PL_CPI_ANNUAL[2025]) / 100;
    } else {
      // SYNTH:LOK5 — fixed 5% per year
      annRate = 0.05;
    }
    price *= Math.pow(1 + annRate, 1 / 365);
    d.setDate(d.getDate() + 1);
  }
  return pts;
}

export default function History() {
  const { snapshots, loading, invested } = useApp();
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();
  const PERIODS = PERIODS_BASE.map(p => ({ ...p, label: locale === 'pl-PL' ? p.pl : p.en }));

  const BENCHMARKS = [
    { key: null,            label: t('no_benchmark') },
    { key: '^GSPC',         label: 'S&P 500' },
    { key: '^IXIC',         label: 'NASDAQ' },
    { key: 'URTH',          label: 'MSCI World' },
    { key: 'PL:WIG',        label: 'WIG' },
    { key: 'PL:WIG20',      label: 'WIG20' },
    { key: 'SYNTH:CPI_PL',  label: 'Inflacja PL' },
    { key: 'SYNTH:LOK5',    label: 'Lokata 5%' },
  ];

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

  const mdd = useMemo(() => calcMDD(filtered), [filtered]);

  useEffect(() => {
    if (!benchmark) { setBenchData([]); return; }
    setBenchLoading(true);
    const authHeader = { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' };

    if (benchmark.startsWith('SYNTH:')) {
      // Synthetic benchmarks — generated locally, no fetch needed
      const startDate = sorted.length ? sorted[0].date : new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10);
      const endDate   = new Date().toISOString().slice(0, 10);
      setBenchData(generateSynthBench(benchmark, startDate, endDate));
      setBenchLoading(false);
    } else if (benchmark.startsWith('PL:')) {
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
  }, [benchmark, sorted]);

  function handleExportHistory() {
    const headers = [t('col_date'), t('value_pln_header'), t('invested_pln_header')];
    const rows = sorted.map(s => [s.date, s.total ?? '', s.invested ?? '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `historia_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !snapshots.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!snapshots.length) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
        <div className="text-5xl mb-3">📈</div>
        <p style={{ color: 'var(--text-dim)' }} className="font-semibold">{t('no_history')}</p>
        <p className="text-sm mt-1">{t('history_first_refresh')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: t('value_filter'), value: <span className={isPrivate ? 'privacy-blur' : ''}>{fmtMoney(filteredLast?.total, locale)}</span>, sub: null },
          { label: t('gain_loss_short'), value: <span className={isPrivate ? 'privacy-blur' : ''} style={{ color: gainPLN >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtMoney(gainPLN, locale)}</span>, sub: gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : null },
          { label: 'CAGR', value: cagr != null ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%` : '—', sub: cagr == null ? `${t('cagr_min_days')} (${days} ${t('days_of_history')})` : null },
          { label: 'ATH', value: <span className={isPrivate ? 'privacy-blur' : ''}>{fmtMoney(ath?.total, locale)}</span>, sub: ath?.date ? fmtDate(ath.date) : null },
          {
            label: 'Max Drawdown',
            value: mdd
              ? <span style={{ color: mdd.pct > 25 ? 'var(--down)' : mdd.pct > 10 ? 'var(--warn)' : 'var(--up)' }}>-{mdd.pct.toFixed(1)}%</span>
              : <span style={{ color: 'var(--text-faint)' }}>—</span>,
            sub: mdd ? `${fmtDate(mdd.from)} → ${fmtDate(mdd.to)}` : t('no_data_short'),
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>{value}</div>
            {sub && <div className="kpi-sub">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Wykres kapitału */}
      <Card title={t('portfolio_value_tf')}>
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
      <Card title={t('return_rate')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('benchmark_label')}:</span>
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

      {/* Rolling Returns */}
      <Card title={t('rolling_returns')}>
        <RollingReturnsChart data={sorted} />
      </Card>

      {/* Tabela */}
      <Card title={period === 'MAX' ? t('all_snapshots') : `${t('snapshots_last')} ${PERIODS.find(p => p.key === period)?.label}`}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={handleExportHistory} className="btn" style={{ fontSize: 11 }}>{t('export_csv')}</button>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 8, alignSelf: 'center' }}>{filtered.length} {t('entries')}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('col_date')}</th>
                <th className="right">{t('col_value')}</th>
                <th className="right">{t('invested_label')}</th>
                <th className="right">P&L</th>
                <th className="right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = [...filtered].reverse();
                return rows.map((s, i) => {
                  const pl      = s.invested != null ? (s.total ?? 0) - s.invested : null;
                  const pct     = s.invested > 0 && pl != null ? (pl / s.invested) * 100 : null;
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
                      }}>{fmt(s.total, 0, locale)} zł</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--text-dim)' }}>{fmt(s.invested, 0, locale)} zł</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: pl == null ? 'var(--text-faint)' : pl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>
                        {pl == null ? '—' : <>{pl >= 0 ? '+' : ''}{fmt(pl, 0, locale)} zł<span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>({pct >= 0 ? '+' : ''}{fmt(pct, 1, locale)}%)</span></>}
                      </td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 12, color: delta == null ? 'var(--text-faint)' : deltaUp ? 'var(--up)' : 'var(--down)' }}>
                        {delta == null ? '—' : `${deltaUp ? '+' : ''}${fmt(delta, 0, locale)} zł`}
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
