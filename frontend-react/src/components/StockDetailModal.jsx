import { useState, useEffect, useRef, useMemo } from 'react';
import { ChartCandlestick, Maximize2, Minimize2, StickyNote, X } from 'lucide-react';
import FinancialsTab from './FinancialsTab';
import KeyStatsTab from './KeyStatsTab';
import SummaryTab from './SummaryTab';
import TickerLogo from './shared/TickerLogo';
import { useLanguage, useT } from '../context/LanguageContext';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import { getThesis, setThesis } from '../services/journalService';
import { alignBenchmark } from '../utils/benchmark.js';
import { Button, IconButton, Modal, SegmentedControl, Spinner, Tabs, TabPanel } from './ui';
import { cx } from './ui/cx.js';

const PERIODS_BASE = [
  { key: '1W', pl: '1T', en: '1W', days: 7 },
  { key: '1M', pl: '1M', en: '1M', days: 30 },
  { key: '3M', pl: '3M', en: '3M', days: 90 },
  { key: '6M', pl: '6M', en: '6M', days: 180 },
  { key: '1Y', pl: '1R', en: '1Y', days: 365 },
];

const BENCH_OPTS = [
  { key: null,       label: 'none' },
  { key: '^GSPC',    label: 'S&P 500' },
  { key: '^IXIC',    label: 'NASDAQ' },
  { key: '^WIG20',   label: 'WIG20' },
];
const CM = { top: 8, right: 8, bottom: 22, left: 56 };
const DEFAULT_CHART_H = 200;

function MiniChart({ data, symbol, period, benchData = [], benchLabel = '', currency = '', isIntraday = false, height: CHART_H = DEFAULT_CHART_H }) {
  const { locale } = useLanguage();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(440);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const periodData = useMemo(() => {
    if (isIntraday) return data;
    const p = PERIODS_BASE.find(x => x.key === period);
    if (!p) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return data.filter(d => d.date >= cutStr);
  }, [data, period, isIntraday]);

  // Indeks dopasowany po dacie (utils/benchmark.js); wykres zaczyna się od
  // pierwszego dnia, dla którego są oba notowania.
  const aligned = useMemo(
    () => (benchData.length ? alignBenchmark(periodData, benchData) : null),
    [periodData, benchData],
  );
  const start = aligned ? Math.max(0, aligned.stockPct.findIndex(v => v != null)) : 0;
  const showBench = !!aligned && aligned.stockPct.length - start >= 2;
  const filtered = showBench ? periodData.slice(start) : periodData;

  if (filtered.length < 2) return <div ref={containerRef} style={{ height: CHART_H + CM.top + CM.bottom }} />;

  const chartW = width - CM.left - CM.right;
  const VOL_H = 22;
  const volData = filtered.map(d => d.volume ?? 0);
  const hasVol = !showBench && volData.some(v => v > 0);
  const totalH = CHART_H + CM.top + (hasVol ? VOL_H + 4 : 0) + CM.bottom;

  const stockValues = showBench ? aligned.stockPct.slice(start) : filtered.map(d => d.price);
  const benchValues = showBench ? aligned.benchPct.slice(start) : [];

  const allValues = showBench ? [...stockValues, ...benchValues] : stockValues;
  const minP = Math.min(...allValues);
  const maxP = Math.max(...allValues);
  const range = maxP - minP || 1;
  const pad = range * 0.1;
  const yMin = minP - pad;
  const yMax = maxP + pad;
  const rawStep = (yMax - yMin) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceNorm = rawStep / magnitude;
  const niceStep = niceNorm <= 1 ? 1 : niceNorm <= 2 ? 2 : niceNorm <= 5 ? 5 : 10;
  const step = niceStep * magnitude;
  const niceMin = Math.floor(yMin / step) * step;
  const yTicks = Array.from({ length: 10 }, (_, i) => niceMin + i * step)
    .filter(v => v >= yMin && v <= yMax);
  const yDecimals = showBench ? 1 : (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

  const xScale = i => CM.left + (i / (filtered.length - 1)) * chartW;
  const yScale = v => CM.top + CHART_H - ((v - yMin) / (yMax - yMin)) * CHART_H;

  const pathOf = values => values.map((v, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`
  ).join(' ');
  const linePath = pathOf(stockValues);
  const areaPath = showBench ? null : `${linePath} L${xScale(filtered.length - 1).toFixed(1)},${(CM.top + CHART_H).toFixed(1)} L${CM.left.toFixed(1)},${(CM.top + CHART_H).toFixed(1)} Z`;
  const benchPath = showBench ? pathOf(benchValues) : null;

  // Kolory z tokenów motywu (wcześniej na sztywno — siatka ginęła w jasnym).
  const isUp = stockValues[stockValues.length - 1] >= stockValues[0];
  const lineColor = isUp ? 'var(--up)' : 'var(--down)';
  const muted = 'var(--text-faint)';

  const labelStep = Math.max(1, Math.floor(filtered.length / 5));
  const MIN_LABEL_GAP = 36;
  const dateLabels = filtered
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % labelStep === 0 || i === filtered.length - 1)
    .filter((dl, li, arr) => {
      if (li === arr.length - 1) return true;
      return xScale(arr[li + 1].i) - xScale(dl.i) >= MIN_LABEL_GAP;
    });

  const handleMouseMove = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = (e.clientX - rect.left) * (width / rect.width);
    const relX = mx - CM.left;
    if (relX < 0 || relX > chartW) { setHoverIdx(null); return; }
    setHoverIdx(Math.max(0, Math.min(filtered.length - 1, Math.round((relX / chartW) * (filtered.length - 1)))));
  };
  const fmtDay = d => d.slice(5).split('-').reverse().join('.');
  const signedPct = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

  return (
    <div ref={containerRef} className="relative w-full min-w-0 overflow-hidden" onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
      {showBench && (
        <div className="mb-1 flex gap-3 text-[10px]" style={{ paddingLeft: CM.left }}>
          <span className="flex items-center gap-1">
            <svg width={16} height={2} aria-hidden><line x1={0} y1={1} x2={16} y2={1} style={{ stroke: lineColor }} strokeWidth={2} /></svg>
            <span className="text-dim">{symbol}</span>
          </span>
          <span className="flex items-center gap-1">
            <svg width={16} height={2} aria-hidden><line x1={0} y1={1} x2={16} y2={1} style={{ stroke: muted }} strokeWidth={1.5} strokeDasharray="3,2" /></svg>
            <span className="text-faint">{benchLabel}</span>
          </span>
        </div>
      )}
      <svg width={width} height={totalH} role="img" aria-label={`${symbol} ${showBench ? `vs ${benchLabel}` : ''}`}>
        <defs>
          <linearGradient id="sdm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: lineColor, stopOpacity: 0.2 }} />
            <stop offset="100%" style={{ stopColor: lineColor, stopOpacity: 0.02 }} />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={i}>
              <line x1={CM.left} y1={y} x2={CM.left + chartW} y2={y} style={{ stroke: 'var(--border)' }} strokeWidth={1} />
              <text x={CM.left - 6} y={y + 3} style={{ fill: muted, fontFamily: 'var(--font-mono)' }} fontSize={9} textAnchor="end">
                {showBench
                  ? `${v >= 0 ? '+' : ''}${v.toFixed(yDecimals)}%`
                  : v.toLocaleString(locale, { minimumFractionDigits: yDecimals, maximumFractionDigits: yDecimals })}
              </text>
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill="url(#sdm-area)" />}
        {benchPath && <path d={benchPath} fill="none" style={{ stroke: muted }} strokeWidth={1.5} strokeDasharray="4,3" strokeLinejoin="round" />}
        <path d={linePath} fill="none" style={{ stroke: lineColor }} strokeWidth={1.5} strokeLinejoin="round" />
        <circle cx={xScale(filtered.length - 1)} cy={yScale(stockValues[stockValues.length - 1])} r={3} style={{ fill: lineColor }} />
        {hasVol && (() => {
          const maxVol = Math.max(...volData, 1);
          const barW = Math.max(1, chartW / filtered.length * 0.7);
          const volY0 = CM.top + CHART_H + 4;
          return volData.map((v, i) => {
            const bh = Math.max(1, (v / maxVol) * (VOL_H - 2));
            return <rect key={i} x={xScale(i) - barW / 2} y={volY0 + (VOL_H - 2) - bh} width={barW} height={bh} style={{ fill: lineColor }} fillOpacity={0.25} />;
          });
        })()}
        {dateLabels.map(({ i, date }, li) => {
          const anchor = li === 0 ? 'start' : li === dateLabels.length - 1 ? 'end' : 'middle';
          return <text key={i} x={xScale(i)} y={totalH - 4} style={{ fill: muted }} fontSize={9} textAnchor={anchor}>{fmtDay(date)}</text>;
        })}
        {hoverIdx !== null && (
          <>
            <line x1={xScale(hoverIdx)} y1={CM.top} x2={xScale(hoverIdx)} y2={CM.top + CHART_H} style={{ stroke: 'var(--border-strong, var(--border))' }} strokeWidth={1} strokeDasharray="3,2" />
            <circle cx={xScale(hoverIdx)} cy={yScale(stockValues[hoverIdx])} r={4} style={{ fill: lineColor, stroke: 'var(--panel)' }} strokeWidth={2} />
          </>
        )}
      </svg>
      {hoverIdx !== null && (() => {
        const d = filtered[hoverIdx];
        const x = xScale(hoverIdx);
        const tooltipLeft = x + 10 + 120 < width ? x + 10 : x - 130;
        return (
          <div className="pointer-events-none absolute z-10 min-w-[100px] rounded-card-sm border border-line bg-panel px-2.5 py-1.5 text-[11px] shadow-pop" style={{ top: CM.top + 4, left: tooltipLeft }}>
            <div className="mb-0.5 text-faint">{fmtDay(d.date)}{d.time ? ` ${d.time}` : ''}</div>
            <div className="font-mono font-semibold text-fg">
              {showBench
                ? signedPct(stockValues[hoverIdx])
                : d.price.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ` ${currency}` : '')}
            </div>
            {showBench && <div className="font-mono text-faint">{benchLabel} {signedPct(benchValues[hoverIdx])}</div>}
            {hasVol && d.volume > 0 && (
              <div className="mt-0.5 text-faint">
                {d.volume >= 1_000_000 ? (d.volume / 1_000_000).toFixed(1) + 'M' : d.volume >= 1000 ? Math.round(d.volume / 1000) + 'K' : String(d.volume)}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default function StockDetailModal({ item, existingPortfolio, totalPortfolioValue = 0, onSave, onClose }) {
  const { locale } = useLanguage();
  const t = useT();
  const { displayCurrency, fxRates } = useApp();
  const { openChart } = useChart();
  const dispFx = fxRates?.[displayCurrency] ?? 1;
  const dispCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const PERIODS = PERIODS_BASE.map(p => ({ ...p, label: locale === 'pl-PL' ? p.pl : p.en }));
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('3M');
  const [benchSymbol, setBenchSymbol] = useState(null);
  const [benchData, setBenchData] = useState([]);
  const [benchLoading, setBenchLoading] = useState(false);
  const [currency] = useState(item.currency || (item.symbol?.endsWith('.WA') ? 'PLN' : 'USD'));
  const [prePost, setPrePost] = useState(false);
  const [intradayData, setIntradayData] = useState([]);
  const [intradayLoading, setIntradayLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('wykres');
  const [financialsMounted, setFinancialsMounted] = useState(false);
  const [wskaznikMounted, setWskaznikMounted] = useState(false);
  const [summaryMounted, setSummaryMounted] = useState(false);
  const [note, setNote] = useState('');
  const noteTimer = useRef(null);
  const pendingNote = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Zapis tezy na serwer z opóźnieniem, żeby nie POST-ować przy każdej literze
  function updateNote(text) {
    setNote(text);
    clearTimeout(noteTimer.current);
    pendingNote.current = { symbol: item.symbol, text };
    noteTimer.current = setTimeout(() => {
      pendingNote.current = null;
      setThesis(item.symbol, text).catch(() => {});
    }, 800);
  }
  // Zamknięcie okna w trakcie odliczania zapisuje od razu — wcześniej timer
  // był tylko kasowany i ostatnie słowa notatki przepadały.
  useEffect(() => () => {
    clearTimeout(noteTimer.current);
    const p = pendingNote.current;
    if (p) setThesis(p.symbol, p.text).catch(() => {});
  }, []);

  function switchTab(tab) {
    setActiveTab(tab);
    if (tab === 'finanse') setFinancialsMounted(true);
    if (tab === 'wskazniki') setWskaznikMounted(true);
    if (tab === 'ai') setSummaryMounted(true);
  }

  useEffect(() => {
    setActiveTab('wykres');
    setFinancialsMounted(false);
    setWskaznikMounted(false);
    setSummaryMounted(false);
    setBenchSymbol(null);
    setBenchData([]);
    let cancelled = false;
    getThesis(item.symbol).then(text => { if (!cancelled) setNote(text); }).catch(() => {});
    return () => { cancelled = true; };
  }, [item.symbol]);

  useEffect(() => {
    setChartLoading(true);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1d&range=1y`;
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
      })
      .then(r => r.json())
      .then(json => {
        const result = json?.chart?.result?.[0];
        if (!result) return;
        const timestamps = result.timestamp ?? [];
        const closes  = result.indicators?.quote?.[0]?.close  ?? [];
        const volumes = result.indicators?.quote?.[0]?.volume ?? [];
        const pts = timestamps
          .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i], volume: volumes[i] ?? null }))
          .filter(p => p.price != null);
        setChartData(pts);
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [item.symbol]);

  // Intraday fetch for pre/post market (1W = 30m intervals, 1M = 1h intervals)
  useEffect(() => {
    const shortPeriod = chartPeriod === '1W' || chartPeriod === '1M';
    if (!prePost || !shortPeriod) { setIntradayData([]); return; }
    setIntradayLoading(true);
    const range    = chartPeriod === '1W' ? '5d' : '1mo';
    const interval = chartPeriod === '1W' ? '30m' : '1h';
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=${interval}&range=${range}&includePrePost=true`;
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(12000),
      })
      .then(r => r.json())
      .then(json => {
        const result = json?.chart?.result?.[0];
        if (!result) return;
        const timestamps = result.timestamp ?? [];
        const closes  = result.indicators?.quote?.[0]?.close  ?? [];
        const volumes = result.indicators?.quote?.[0]?.volume ?? [];
        const tz = result.meta?.exchangeTimezoneName || 'Europe/Warsaw';
        const pts = timestamps.map((ts, i) => {
          const dt = new Date(ts * 1000);
          const date = dt.toISOString().slice(0, 10);
          const time = dt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: tz });
          return { date, time, price: closes[i], volume: volumes[i] ?? null };
        }).filter(p => p.price != null);
        setIntradayData(pts);
      })
      .catch(() => setIntradayData([]))
      .finally(() => setIntradayLoading(false));
  }, [prePost, chartPeriod, item.symbol, locale]);

  useEffect(() => {
    if (!benchSymbol) { setBenchData([]); return; }
    setBenchLoading(true);
    const authHeader = { };
    if (benchSymbol.startsWith('PL:')) {
      const sym = benchSymbol.slice(3);
      fetch(`/api/bench-pl?s=${sym}`, { signal: AbortSignal.timeout(15000), headers: authHeader })
        .then(r => r.json())
        .then(json => { if (Array.isArray(json)) setBenchData(json); else setBenchData([]); })
        .catch(() => setBenchData([]))
        .finally(() => setBenchLoading(false));
    } else {
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(benchSymbol)}?interval=1d&range=1y`;
      fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000), headers: authHeader })
        .then(r => r.json())
        .then(json => {
          const result = json?.chart?.result?.[0];
          if (!result) return;
          const timestamps = result.timestamp ?? [];
          const closes = result.indicators?.quote?.[0]?.close ?? [];
          const pts = timestamps
            .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i] }))
            .filter(p => p.price != null);
          setBenchData(pts);
        })
        .catch(() => setBenchData([]))
        .finally(() => setBenchLoading(false));
    }
  }, [benchSymbol]);

  const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : null;
  const prevClose = chartData.length > 1 ? chartData[chartData.length - 2].price : null;
  const dayChangePct = currentPrice != null && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : null;
  const firstPrice = chartData.length > 0 ? chartData[0].price : null;
  const yearChangePct = currentPrice != null && firstPrice != null && firstPrice > 0
    ? ((currentPrice - firstPrice) / firstPrice) * 100 : null;

  const shortPeriod = chartPeriod === '1W' || chartPeriod === '1M';
  const isIntraday = prePost && shortPeriod;
  const activeData = isIntraday ? intradayData : chartData;
  const fmt2 = n => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const plPct = item.costPLN > 0 && item.plPLN != null ? (item.plPLN / item.costPLN) * 100 : null;

  const header = (
    <span className="flex items-center gap-3">
      <TickerLogo symbol={item.symbol} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-bold text-fg">{item.symbol}</span>
        {item.name && <span className="block truncate text-[12px] font-normal text-faint">{item.name}</span>}
      </span>
      {currentPrice != null && (
        <span className="shrink-0 text-right">
          <span className="block font-mono text-[18px] font-bold tracking-tight text-fg">{fmt2(currentPrice)} {currency}</span>
          {dayChangePct != null && (
            <span className={cx('block text-[13px] font-semibold', dayChangePct >= 0 ? 'text-up' : 'text-down')}>
              {dayChangePct >= 0 ? '▲' : '▼'} {Math.abs(dayChangePct).toFixed(2)}%
            </span>
          )}
        </span>
      )}
      <IconButton
        icon={isFullscreen ? Minimize2 : Maximize2}
        label={isFullscreen ? t('sd_exit_fullscreen') : t('sd_fullscreen')}
        size="sm"
        className="max-md:hidden"
        onClick={() => setIsFullscreen(f => !f)}
      />
    </span>
  );

  const chartLoadingBox = (
    <div className="grid place-items-center" style={{ height: DEFAULT_CHART_H + CM.top + CM.bottom }}>
      <Spinner size="sm" label={t('loading')} />
    </div>
  );

  return (
    <Modal size={isFullscreen ? 'full' : 'lg'} title={header} onClose={onClose}>
      {/* minmax(0,1fr): bez tego szeroki wykres (svg) i paski wyboru
          rozpychały kolumnę poza arkusz na telefonie. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {item.qty != null && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card-sm bg-panel-2 px-3 py-2 text-[12px] text-dim">
            <span>
              {item.qty.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {t('shares')}
              {item.avgPrice != null && <> · {t('avg_abbr')} {fmt2(item.avgPrice)} {currency}</>}
              {item.valuePLN != null && totalPortfolioValue > 0 && (
                <> · {((item.valuePLN / totalPortfolioValue) * 100).toFixed(1)}% {t('of_portfolio')}</>
              )}
            </span>
            {item.plPLN != null && (
              <span className={cx('ml-auto font-semibold tabular-nums', item.plPLN >= 0 ? 'text-up' : 'text-down')}>
                {item.plPLN >= 0 ? '+' : ''}{fmt2(item.plPLN / dispFx)} {dispCurrLabel}
                {plPct != null && <span className="font-normal opacity-80"> ({plPct >= 0 ? '+' : ''}{plPct.toFixed(1)}%)</span>}
              </span>
            )}
          </div>
        )}

        <Tabs
          id="sd"
          value={activeTab}
          onChange={switchTab}
          tabs={[
            { value: 'wykres', label: t('tab_chart') },
            { value: 'wskazniki', label: t('tab_indicators') },
            { value: 'finanse', label: t('tab_financials') },
            { value: 'ai', label: 'AI' },
            { value: 'notatki', label: t('tab_notes'), icon: note ? StickyNote : undefined },
          ]}
        />

        <TabPanel tabsId="sd" value={activeTab}>
          {activeTab === 'wykres' && (
            chartLoading ? chartLoadingBox : chartData.length >= 2 ? (
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                {isIntraday && intradayLoading
                  ? chartLoadingBox
                  : (
                    <MiniChart
                      data={activeData}
                      symbol={item.symbol}
                      period={chartPeriod}
                      benchData={benchData}
                      benchLabel={BENCH_OPTS.find(b => b.key === benchSymbol)?.label ?? ''}
                      currency={currency}
                      isIntraday={isIntraday}
                      height={isFullscreen ? 440 : DEFAULT_CHART_H}
                    />
                  )}
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    aria-label={t('sd_period')}
                    options={PERIODS.map(p => ({ value: p.key, label: p.label }))}
                    value={chartPeriod}
                    onChange={setChartPeriod}
                  />
                  {shortPeriod && (
                    <Button size="sm" variant={prePost ? 'primary' : 'ghost'} aria-pressed={prePost} title={t('sd_prepost_hint')} onClick={() => setPrePost(v => !v)}>
                      {t('sd_prepost')}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon={ChartCandlestick} onClick={() => openChart(item.symbol)}>{t('ac_open_btn')}</Button>
                  <span className="ml-auto flex items-center gap-2">
                    {benchLoading && <Spinner size="sm" />}
                    <SegmentedControl
                      aria-label={t('sd_benchmark')}
                      options={BENCH_OPTS.map(b => ({ value: b.key ?? 'none', label: b.key === null ? t('none_label') : b.label }))}
                      value={benchSymbol ?? 'none'}
                      onChange={v => setBenchSymbol(v === 'none' ? null : v)}
                    />
                  </span>
                </div>
              </div>
            ) : <p className="py-3 text-small text-faint">{t('no_chart_data')}</p>
          )}

          {/* Zakładki z danymi montowane przy pierwszym otwarciu i trzymane */}
          {wskaznikMounted && (
            <div hidden={activeTab !== 'wskazniki'}>
              <KeyStatsTab symbol={item.symbol} livePrice={currentPrice} currency={currency} yearChangePct={yearChangePct} />
            </div>
          )}
          {financialsMounted && (
            <div hidden={activeTab !== 'finanse'}>
              <FinancialsTab symbol={item.symbol} livePrice={currentPrice} companyName={item.name} />
            </div>
          )}
          {summaryMounted && (
            <div hidden={activeTab !== 'ai'}>
              <SummaryTab symbol={item.symbol} livePrice={currentPrice} />
            </div>
          )}

          {activeTab === 'notatki' && (
            <div className="grid gap-2">
              <p className="text-[11px] leading-relaxed text-faint">{t('sd_notes_hint')}</p>
              <textarea
                value={note}
                onChange={e => updateNote(e.target.value)}
                aria-label={t('tab_notes')}
                placeholder={t('sd_notes_ph').replace('{symbol}', item.symbol)}
                className="min-h-[160px] w-full resize-y rounded-card-sm border border-line bg-panel-2 px-3 py-2.5 text-small leading-relaxed text-fg placeholder:text-faint hover:border-line-strong focus:border-accent focus:outline-none"
              />
              {note && (
                <Button size="sm" variant="ghost" icon={X} className="justify-self-end" onClick={() => updateNote('')}>{t('sd_notes_clear')}</Button>
              )}
            </div>
          )}
        </TabPanel>
      </div>
    </Modal>
  );
}
