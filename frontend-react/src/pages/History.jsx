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
import { investedInDisplayAt } from '../utils/investedAtDate.js';

function fmt(n, decimals = 0, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtMoney(v, currLabel = 'zł', locale = 'pl-PL') {
  if (v == null) return '—';
  return Number(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currLabel;
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
  { key: 'YTD', pl: 'YTD', en: 'YTD', days: null, ytd: true },
  { key: '1Y',  pl: '1R',  en: '1Y',  days: 365 },
  { key: 'MAX', pl: 'MAX', en: 'MAX', days: null },
];


// Monthly YoY CPI from GUS (Polish Central Statistical Office).
// Using YoY rate as instantaneous annualised rate per month — much more accurate
// than annual averages, correctly captures the 2022-2023 spike and 2024 decline.
// Months from 2025-09 onwards are estimates based on NBP projections and trend.
const PL_CPI_YOY = {
  '2019-01': 0.8, '2019-02': 0.9, '2019-03': 1.7, '2019-04': 2.2,
  '2019-05': 2.4, '2019-06': 2.6, '2019-07': 2.9, '2019-08': 2.9,
  '2019-09': 2.6, '2019-10': 2.5, '2019-11': 2.6, '2019-12': 3.4,
  '2020-01': 4.3, '2020-02': 4.7, '2020-03': 4.6, '2020-04': 3.4,
  '2020-05': 2.9, '2020-06': 3.3, '2020-07': 3.0, '2020-08': 2.9,
  '2020-09': 3.2, '2020-10': 3.8, '2020-11': 3.0, '2020-12': 2.4,
  '2021-01': 2.7, '2021-02': 2.4, '2021-03': 3.2, '2021-04': 4.3,
  '2021-05': 4.8, '2021-06': 4.4, '2021-07': 5.0, '2021-08': 5.4,
  '2021-09': 5.9, '2021-10': 6.8, '2021-11': 7.8, '2021-12': 8.6,
  '2022-01': 9.2, '2022-02': 8.5, '2022-03': 11.0, '2022-04': 12.4,
  '2022-05': 13.9, '2022-06': 15.5, '2022-07': 15.6, '2022-08': 16.1,
  '2022-09': 17.2, '2022-10': 17.9, '2022-11': 17.5, '2022-12': 16.6,
  '2023-01': 18.4, '2023-02': 18.4, '2023-03': 16.1, '2023-04': 14.7,
  '2023-05': 13.0, '2023-06': 11.5, '2023-07': 10.8, '2023-08': 10.1,
  '2023-09':  8.2, '2023-10':  6.5, '2023-11':  6.6, '2023-12':  6.2,
  '2024-01':  3.9, '2024-02':  2.8, '2024-03':  2.0, '2024-04':  2.4,
  '2024-05':  2.5, '2024-06':  2.6, '2024-07':  4.2, '2024-08':  4.3,
  '2024-09':  4.9, '2024-10':  5.0, '2024-11':  4.7, '2024-12':  4.7,
  '2025-01':  5.3, '2025-02':  5.3, '2025-03':  4.9, '2025-04':  4.3,
  '2025-05':  4.2, '2025-06':  4.1, '2025-07':  4.0, '2025-08':  4.1,
  '2025-09':  3.9, '2025-10':  3.8, '2025-11':  3.7, '2025-12':  3.8,
  '2026-01':  4.9, '2026-02':  4.6, '2026-03':  4.2, '2026-04':  3.9,
  '2026-05':  3.7, '2026-06':  3.5,
};

function getPlCpiRate(dateStr) {
  const key = dateStr.slice(0, 7); // 'YYYY-MM'
  if (PL_CPI_YOY[key] != null) return PL_CPI_YOY[key] / 100;
  const keys = Object.keys(PL_CPI_YOY).sort();
  return PL_CPI_YOY[key > keys[keys.length - 1] ? keys[keys.length - 1] : keys[0]] / 100;
}

function generateSynthBench(key, startDate, endDate) {
  const start = new Date(startDate);
  const end   = new Date(endDate);
  const pts   = [];
  let price   = 1000;
  const d     = new Date(start);
  while (d <= end) {
    const dateStr = d.toISOString().slice(0, 10);
    pts.push({ date: dateStr, price });
    const annRate = key === 'SYNTH:CPI_PL' ? getPlCpiRate(dateStr) : 0.05;
    price *= Math.pow(1 + annRate, 1 / 365);
    d.setDate(d.getDate() + 1);
  }
  return pts;
}

export default function History() {
  const { snapshots, loading, invested, displayCurrency, fxRates, transactions } = useApp();
  // Per-date fx: dla snapshotu z zapisanym fx używamy jego wtedy-aktualnego
  // kursu (wartość historyczna zamrożona). Fallback do dzisiejszego kursu
  // dla starych wpisów bez fx — inaczej wartości "oddychają" z kursem NBP.
  const displayFxFor = (snap) => {
    const dayFx = snap?.fx?.[displayCurrency];
    return (dayFx && dayFx > 0) ? dayFx : (fxRates[displayCurrency] ?? 1);
  };
  const toDispAt = (v, snap) => v == null ? null : v / displayFxFor(snap);
  // Invested per snapshot z replay transakcji — dla portfela jednowalutowego w tej samej
  // walucie co display, wynik jest constant (bez fx). Dla multi-currency używa frozen fx
  // ze snapshotu (fallback: dzisiejsze fx dla starych snapshotów bez fx_json).
  const investedAt = (snap) => {
    const fxForDate = snap?.fx || fxRates;
    return investedInDisplayAt(transactions, snap.date, displayCurrency, fxForDate);
  };
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();
  const histFx = fxRates[displayCurrency] ?? 1;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const toDisp = v => v == null ? null : v / histFx;
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
    if (p?.ytd) {
      const jan1 = `${new Date().getFullYear()}-01-01`;
      return sorted.filter(s => s.date >= jan1);
    }
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
  const cagrUnlockStr = cagr == null && sorted.length > 0 ? (() => {
    const unlock = new Date(sorted[0].date);
    unlock.setDate(unlock.getDate() + 90);
    return unlock.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  })() : null;

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

    if (benchmark === 'SYNTH:CPI_PL') {
      // Fetch live HICP index from Eurostat (auto-updated monthly), fall back to hardcoded
      const startDate = sorted.length ? sorted[0].date : new Date(Date.now() - 5 * 365 * 86400000).toISOString().slice(0, 10);
      const endDate   = new Date().toISOString().slice(0, 10);
      fetch('/api/cpi-pl', { signal: AbortSignal.timeout(12000), headers: authHeader })
        .then(r => r.json())
        .then(json => { if (Array.isArray(json) && json.length) setBenchData(json); else setBenchData(generateSynthBench('SYNTH:CPI_PL', startDate, endDate)); })
        .catch(() => setBenchData(generateSynthBench('SYNTH:CPI_PL', startDate, endDate)))
        .finally(() => setBenchLoading(false));
    } else if (benchmark.startsWith('SYNTH:')) {
      // SYNTH:LOK5 and other synthetic benchmarks — generated locally
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
          { label: t('value_filter'), value: <span className={isPrivate ? 'privacy-blur' : ''}>{fmtMoney(toDispAt(filteredLast?.total, filteredLast), currLabel, locale)}</span>, sub: null },
          { label: t('gain_loss_short'), value: <span className={isPrivate ? 'privacy-blur' : ''} style={{ color: gainPLN >= 0 ? 'var(--up)' : 'var(--down)' }}>{fmtMoney(toDispAt(gainPLN, filteredLast), currLabel, locale)}</span>, sub: gainPct != null ? `${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(2)}%` : null },
          { label: 'CAGR', value: cagr != null ? `${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}%` : '—', sub: cagr == null ? <>{t('cagr_min_days')} ({days} {t('days_of_history')}){cagrUnlockStr && <><br /><span style={{ color: '#888' }}>dostępne ~{cagrUnlockStr}</span></>}</> : null },
          { label: 'ATH', value: <span className={isPrivate ? 'privacy-blur' : ''}>{fmtMoney(toDispAt(ath?.total, ath), currLabel, locale)}</span>, sub: ath?.date ? fmtDate(ath.date) : null },
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <SegmentedControl
            options={PERIODS.map(p => ({ value: p.key, label: p.label }))}
            value={period}
            onChange={setPeriod}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{t('benchmark_label')}:</span>
            <SegmentedControl
              options={BENCHMARKS.map(b => ({ value: b.key ?? 'none', label: b.label + (benchLoading && benchmark === b.key ? ' …' : '') }))}
              value={benchmark ?? 'none'}
              onChange={v => setBenchmark(v === 'none' ? null : v)}
            />
          </div>
        </div>
        <HistoryChart
          data={filteredWithInvested}
          benchData={benchData}
          benchLabel={BENCHMARKS.find(b => b.key === benchmark)?.label}
          displayCurrency={displayCurrency}
          fxRate={fxRates[displayCurrency] ?? 1}
        />
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
                  // Invested z replay transakcji (nie z zapisanego PLN → nie "oddycha" z fx).
                  const invDisp = investedAt(s);
                  const totDisp = toDispAt(s.total, s);
                  const pl      = totDisp != null && invDisp != null ? totDisp - invDisp : null;
                  const pct     = invDisp > 0 && pl != null ? (pl / invDisp) * 100 : null;
                  const prev    = rows[i + 1];
                  const prevTot = prev != null ? toDispAt(prev.total, prev) : null;
                  const delta   = prevTot != null && totDisp != null ? totDisp - prevTot : null;
                  const deltaUp = delta != null && delta >= 0;
                  const valueUp = prevTot != null && totDisp != null ? totDisp >= prevTot : null;
                  return (
                    <tr key={s.date + i}>
                      <td style={{ color: 'var(--text-dim)' }}>{fmtDate(s.date)}</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{
                        color: valueUp === true ? 'var(--up)' : valueUp === false ? 'var(--down)' : 'var(--text)',
                        fontWeight: 600,
                      }}>{fmt(totDisp, 0, locale)} {currLabel}</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--text-dim)' }}>{fmt(invDisp, 0, locale)} {currLabel}</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: pl == null ? 'var(--text-faint)' : pl >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 500 }}>
                        {pl == null ? '—' : <>{pl >= 0 ? '+' : ''}{fmt(pl, 0, locale)} {currLabel}<span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>({pct >= 0 ? '+' : ''}{fmt(pct, 1, locale)}%)</span></>}
                      </td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 12, color: delta == null ? 'var(--text-faint)' : deltaUp ? 'var(--up)' : 'var(--down)' }}>
                        {delta == null ? '—' : `${deltaUp ? '+' : ''}${fmt(delta, 0, locale)} ${currLabel}`}
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
