import { useMemo, useState, useEffect } from 'react';
import { Wallet, TrendingUp, TrendingDown, Gauge, Trophy, Download, ChartLine, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import HistoryChart from '../components/HistoryChart';
import ReturnRateChart from '../components/ReturnRateChart';
import RollingReturnsChart from '../components/RollingReturnsChart';
import BenchmarkCompareCard from '../components/BenchmarkCompareCard.jsx';
import { benchInPLN, compareWithBenchmark } from '../utils/benchmarkCompare.js';
import { PageSkeleton } from '../components/RouteFallback';
import { Button, Callout, Card, EmptyState, SegmentedControl, Select, Spinner, Stat, Table } from '../components/ui';
import { cx } from '../components/ui/cx.js';
import { fxForSnapshot } from '../utils/investedAtDate.js';
import { snapshotRows } from '../utils/capital.js';
import { historyStats } from '../utils/historyStats.js';
import { formatPercent } from '../utils/format.js';

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

const USD_BENCHMARKS = new Set(['^GSPC', '^IXIC', 'URTH']);

export default function History() {
  const { snapshots, loading, displayCurrency, fxRates, transactions, cash } = useApp();
  // Snapshoty rosnąco — potrzebne, żeby dla wpisu bez zapisanych kursów sięgnąć
  // po kursy najbliższego wcześniejszego snapshotu zamiast po dzisiejsze.
  const snapshotsAsc = useMemo(
    () => [...snapshots].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [snapshots]
  );
  // Per-date fx: własne kursy snapshotu, inaczej kursy z jego epoki. Dzisiejsze
  // dopiero gdy w bazie nie ma ani jednego snapshotu z kursami — wtedy i tak
  // nie ma z czego wybierać.
  const fxFor = (snap) => fxForSnapshot(snap, snapshotsAsc) || fxRates;
  const displayFxFor = (snap) => {
    const dayFx = fxFor(snap)?.[displayCurrency];
    return (dayFx && dayFx > 0) ? dayFx : (fxRates[displayCurrency] ?? 1);
  };
  const toDispAt = (v, snap) => v == null ? null : v / displayFxFor(snap);
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
    { key: 'SYNTH:CPI_PL',  label: t('bench_cpi_pl') },
    { key: 'SYNTH:LOK5',    label: t('bench_deposit5') },
  ];

  const [period, setPeriod] = useState('MAX');
  const [benchmark, setBenchmark] = useState(null);
  const [benchData, setBenchData] = useState([]);
  const [benchLoading, setBenchLoading] = useState(false);
  const [benchInPln, setBenchInPln] = useState(true);

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots]
  );

  const cashPLN = Object.entries(cash ?? {}).reduce((sum, [c, a]) => sum + (a || 0) * (fxRates[c] ?? 1), 0);

  // Snapshoty z kursem dnia, kosztem pozycji i kapitałem własnym (wpłaty −
  // wypłaty). Kapitał liczymy na całej historii, zanim wytniemy okres —
  // szacunek dla starszych dni opiera się na pierwszym dniu ze znanym
  // kapitałem, który może leżeć poza okresem.
  const allRows = useMemo(
    () => snapshotRows(snapshots, { transactions, fxRates, cashPLN }),
    [snapshots, transactions, fxRates, cashPLN]
  );

  const filtered = useMemo(() => {
    const p = PERIODS.find(p => p.key === period);
    if (p?.ytd) {
      const jan1 = `${new Date().getFullYear()}-01-01`;
      return allRows.filter(s => s.date >= jan1);
    }
    if (!p?.days) return allRows;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return allRows.filter(s => s.date >= cutStr);
  }, [allRows, period]);

  const latest       = sorted[sorted.length - 1];
  const filteredLast  = filtered[filtered.length - 1];

  // Zysk, stopa zwrotu (ważona czasem), CAGR i obsunięcie bez wpłat i wypłat —
  // patrz utils/historyStats.js. W walucie wyświetlania, po kursie z dnia.
  const inDisplay = rows => rows.map(r => ({ date: r.date, total: toDispAt(r.total, r), capital: toDispAt(r.capital, r) }));
  const stats = useMemo(
    () => historyStats(inDisplay(filtered)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, displayCurrency, fxRates]
  );
  const allSeries = useMemo(
    () => historyStats(inDisplay(allRows)).series.map(p => ({ date: p.date, total: p.index })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, displayCurrency, fxRates]
  );
  const { profit: gainDisp, twrPct, cagr, days, mdd } = stats;

  // Indeksy notowane w dolarach domyślnie w złotych — kurs USD z dnia
  // snapshotu (a przed pierwszym — najstarszy znany). Portfel liczony jest
  // w złotych, więc porównanie z indeksem w dolarach pomijało ruch kursu.
  const usdIndex = USD_BENCHMARKS.has(benchmark);
  const benchView = useMemo(() => {
    if (!usdIndex || !benchInPln || !benchData.length) return benchData;
    const fxSeries = sorted.filter(s => s.fx?.USD > 0).map(s => ({ date: s.date, rate: s.fx.USD }));
    return benchInPLN(benchData, fxSeries.length ? fxSeries : [{ date: '1970-01-01', rate: fxRates.USD ?? 1 }]);
  }, [benchData, usdIndex, benchInPln, sorted, fxRates]);
  const benchCmp = useMemo(
    () => (benchmark && benchView.length ? compareWithBenchmark(stats.series, benchView) : null),
    [benchmark, benchView, stats.series]
  );
  // Ostatni dzień okresu z kapitałem szacowanym (sprzed jego zapisywania).
  const estimatedUntil = [...filtered].reverse().find(r => r.capitalEstimated)?.date ?? null;

  const cagrUnlockStr = cagr == null && sorted.length > 0 ? (() => {
    const unlock = new Date(sorted[0].date);
    unlock.setDate(unlock.getDate() + 90);
    return unlock.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  })() : null;

  // Wykres wartości: linia przerywana to kapitał własny, nie koszt pozycji —
  // wartość obejmuje gotówkę, więc przy koszcie różnica między liniami była
  // „zyskiem + gotówką".
  const chartRows = useMemo(() => filtered.map(r => ({ ...r, invested: r.capital })), [filtered]);

  const ath = useMemo(
    () => sorted.reduce((best, s) => (s.total ?? 0) > (best?.total ?? 0) ? s : best, null),
    [sorted]
  );

  useEffect(() => {
    if (!benchmark) { setBenchData([]); return; }
    setBenchLoading(true);
    const authHeader = { };

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
    const headers = [t('col_date'), t('value_pln_header'), t('invested_pln_header'), t('capital_pln_header'), t('capital_estimated_header')];
    const rows = allRows.map(s => [
      s.date, s.total ?? '', s.invested ?? '',
      s.capital != null ? Math.round(s.capital * 100) / 100 : '',
      s.capitalEstimated ? t('capital_estimated_yes') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `historia_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !snapshots.length) return <PageSkeleton />;

  if (!snapshots.length) {
    return <EmptyState icon={ChartLine} title={t('no_history')} description={t('history_first_refresh')} className="py-16" />;
  }

  // Wiersze tabeli: najnowsze na górze, Δ względem poprzedniego snapshotu.
  // Zysk = wartość − kapitał własny (wcześniej wartość − koszt pozycji, czyli
  // z gotówką liczoną jak zysk, a zakup akcji z gotówki jak strata).
  const rowsDesc = [...filtered].reverse();
  const tableRows = rowsDesc.map((s, i) => {
    const capDisp = toDispAt(s.capital, s);
    const totDisp = toDispAt(s.total, s);
    const pl      = totDisp != null && capDisp != null ? totDisp - capDisp : null;
    const pct     = capDisp > 0 && pl != null ? (pl / capDisp) * 100 : null;
    const prev    = rowsDesc[i + 1];
    const prevTot = prev != null ? toDispAt(prev.total, prev) : null;
    const delta   = prevTot != null && totDisp != null ? totDisp - prevTot : null;
    return { key: s.date + i, date: s.date, totDisp, capDisp, estimated: s.capitalEstimated, pl, pct, delta };
  });

  const blur = isPrivate ? 'privacy-blur' : undefined;
  const upDown = v => (v == null ? 'text-faint' : v >= 0 ? 'text-up' : 'text-down');
  const signed = v => `${v >= 0 ? '+' : ''}${fmt(v, 0, locale)} ${currLabel}`;
  const columns = [
    { key: 'date', header: t('col_date'), sortable: true, firstDir: 'desc', mobile: 'title', render: r => <span className="text-dim">{fmtDate(r.date)}</span> },
    {
      key: 'totDisp', header: t('col_value'), align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside',
      render: r => <span className={cx('font-semibold', r.delta == null ? 'text-fg' : upDown(r.delta), blur)}>{fmt(r.totDisp, 0, locale)} {currLabel}</span>,
    },
    {
      key: 'capDisp', header: t('history_capital'), align: 'right', sortable: true, firstDir: 'desc',
      render: r => (
        <span className={cx('text-dim', blur)} title={r.estimated ? t('capital_estimated_title') : undefined}>
          {r.estimated && r.capDisp != null && '≈ '}{fmt(r.capDisp, 0, locale)} {currLabel}
        </span>
      ),
    },
    {
      key: 'pl', header: 'P&L', align: 'right', sortable: true, firstDir: 'desc',
      render: r => (r.pl == null ? <span className="text-faint">—</span> : (
        <span className={cx('font-medium', upDown(r.pl), blur)}>
          {signed(r.pl)}
          <span className="ml-1 text-[11px] opacity-70">({r.pct >= 0 ? '+' : ''}{fmt(r.pct, 1, locale)}%)</span>
        </span>
      )),
    },
    {
      key: 'delta', header: 'Δ', align: 'right', sortable: true, firstDir: 'desc',
      render: r => (r.delta == null ? <span className="text-faint">—</span> : <span className={cx('text-xs', upDown(r.delta), blur)}>{signed(r.delta)}</span>),
    },
  ];

  const benchOptions = BENCHMARKS.map(b => ({ value: b.key ?? 'none', label: b.label }));

  return (
    <div className="space-y-4">
      {/* Okres i benchmark dotyczą całej strony (kafelki, oba wykresy, tabela) —
          wcześniej siedziały w karcie pierwszego wykresu, a benchmark był
          powtórzony w drugiej karcie. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          options={PERIODS.map(p => ({ value: p.key, label: p.label }))}
          value={period}
          onChange={setPeriod}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="history-bench" className="text-small text-dim">{t('benchmark_label')}</label>
          <Select
            id="history-bench"
            className="w-40"
            value={benchmark ?? 'none'}
            onChange={e => setBenchmark(e.target.value === 'none' ? null : e.target.value)}
          >
            {benchOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          {benchLoading && <Spinner size="sm" label={t('loading')} />}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat
          blur={isPrivate}
          icon={Wallet}
          label={t('value_filter')}
          value={fmtMoney(toDispAt(filteredLast?.total, filteredLast), currLabel, locale)}
        />
        <Stat
          blur={isPrivate}
          icon={gainDisp >= 0 ? TrendingUp : TrendingDown}
          label={t('gain_loss_short')}
          tone={gainDisp == null ? undefined : gainDisp >= 0 ? 'up' : 'down'}
          value={fmtMoney(gainDisp, currLabel, locale)}
          delta={twrPct != null ? formatPercent(twrPct, { locale, decimals: 2 }) : null}
          deltaTone={twrPct >= 0 ? 'up' : 'down'}
          hint={t('history_net_of_deposits')}
        />
        <Stat
          icon={Gauge}
          label="CAGR"
          value={cagr != null ? formatPercent(cagr, { locale, decimals: 1 }) : '—'}
          hint={cagr == null ? (
            <>
              {t('cagr_min_days')} ({days} {t('days_of_history')})
              {cagrUnlockStr && <span className="block text-faint">{t('history_cagr_from').replace('{date}', cagrUnlockStr)}</span>}
            </>
          ) : null}
        />
        <Stat
          blur={isPrivate}
          icon={Trophy}
          label="ATH"
          value={fmtMoney(toDispAt(ath?.total, ath), currLabel, locale)}
          hint={ath?.date ? fmtDate(ath.date) : null}
        />
        <Stat
          className="col-span-2 sm:col-span-1"
          icon={TrendingDown}
          label={t('max_drawdown_label')}
          tone={mdd ? (mdd.pct > 25 ? 'down' : mdd.pct > 10 ? 'warn' : 'up') : undefined}
          value={mdd ? formatPercent(-mdd.pct, { locale, decimals: 1, showSign: false }) : '—'}
          hint={mdd ? `${fmtDate(mdd.from)} → ${fmtDate(mdd.to)}` : t('no_data_short')}
        />
      </div>

      {estimatedUntil && (
        <Callout tone="info" icon={Info}>
          {t('history_capital_estimated').replace('{date}', fmtDate(estimatedUntil))}
        </Callout>
      )}

      <Card title={t('portfolio_value_tf')}>
        <div className="px-4 pb-4 pt-2">
          <HistoryChart
            data={chartRows}
            displayCurrency={displayCurrency}
            fxRate={fxRates[displayCurrency] ?? 1}
          />
        </div>
      </Card>

      <Card title={t('return_rate')}>
        <div className="px-4 pb-4 pt-2">
          {/* Indeks TWR zamiast wartość / pierwsza wartość — wpłaty nie są zwrotem. */}
          <ReturnRateChart
            data={stats.series.map(p => ({ date: p.date, total: p.index }))}
            benchData={benchView}
            benchLabel={BENCHMARKS.find(b => b.key === benchmark)?.label}
          />
          <p className="mt-2 text-small text-faint">{t('history_twr_note')}</p>
        </div>
      </Card>

      {benchCmp && (
        <BenchmarkCompareCard
          cmp={benchCmp}
          label={BENCHMARKS.find(b => b.key === benchmark)?.label}
          usdIndex={usdIndex}
          inPLN={benchInPln}
          onInPLN={setBenchInPln}
        />
      )}

      <Card title={t('rolling_returns')} collapsible collapseKey="history_rolling">
        <div className="px-4 pb-4 pt-2">
          <RollingReturnsChart data={allSeries} />
        </div>
      </Card>

      <Card
        title={`${period === 'MAX' ? t('all_snapshots') : `${t('snapshots_last')} ${PERIODS.find(p => p.key === period)?.label}`} · ${filtered.length}`}
        actions={<Button size="sm" icon={Download} onClick={handleExportHistory}>{t('tx_export_csv')}</Button>}
      >
        <Table
          columns={columns}
          rows={tableRows}
          rowKey={r => r.key}
          defaultSort={{ key: 'date', dir: 'desc' }}
          pageSize={50}
        />
      </Card>
    </div>
  );
}
