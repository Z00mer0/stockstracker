import React, { useState, useEffect, useRef, useMemo } from 'react';
import FinancialsTab from './FinancialsTab';
import KeyStatsTab from './KeyStatsTab';
import SummaryTab from './SummaryTab';
import TickerLogo from './shared/TickerLogo';
import { useLanguage, useT } from '../context/LanguageContext';

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
const CHART_H = 200;

function MiniChart({ data, period, benchData = [], benchLabel = '', currency = '', isIntraday = false }) {
  const { locale } = useLanguage();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(440);
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const filtered = useMemo(() => {
    if (isIntraday) return data;
    const p = PERIODS_BASE.find(x => x.key === period);
    if (!p) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return data.filter(d => d.date >= cutStr);
  }, [data, period, isIntraday]);

  const filteredBench = useMemo(() => {
    if (!benchData.length) return [];
    const p = PERIODS_BASE.find(x => x.key === period);
    if (!p) return benchData;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return benchData.filter(d => d.date >= cutStr);
  }, [benchData, period]);

  if (filtered.length < 2) return <div ref={containerRef} style={{ height: CHART_H + CM.top + CM.bottom }} />;

  const showBench = filteredBench.length >= 2;
  const chartW = width - CM.left - CM.right;
  const VOL_H = 22;
  const volData = filtered.map(d => d.volume ?? 0);
  const hasVol = !showBench && volData.some(v => v > 0);
  const totalH = CHART_H + CM.top + (hasVol ? VOL_H + 4 : 0) + CM.bottom;

  // In benchmark mode, work with % returns normalized to start=0
  const stockBase = filtered[0].price;
  const benchBase = showBench ? filteredBench[0].price : 1;
  const stockValues = showBench
    ? filtered.map(d => ((d.price - stockBase) / stockBase) * 100)
    : filtered.map(d => d.price);
  const benchValues = showBench ? filteredBench.map(d => ((d.price - benchBase) / benchBase) * 100) : [];

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

  const linePath = filtered.map((_, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(stockValues[i]).toFixed(1)}`
  ).join(' ');
  const areaPath = showBench ? null : `${linePath} L${xScale(filtered.length - 1).toFixed(1)},${(CM.top + CHART_H).toFixed(1)} L${CM.left.toFixed(1)},${(CM.top + CHART_H).toFixed(1)} Z`;

  const isUp = stockValues[stockValues.length - 1] >= stockValues[0];
  const lineColor = isUp ? '#10b981' : '#f43f5e';

  const benchXScale = showBench ? (i => CM.left + (i / (filteredBench.length - 1)) * chartW) : null;
  const benchPath = showBench ? filteredBench.map((_, i) =>
    `${i === 0 ? 'M' : 'L'}${benchXScale(i).toFixed(1)},${yScale(benchValues[i]).toFixed(1)}`
  ).join(' ') : null;

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

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>
      {showBench && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 4, paddingLeft: CM.left, fontSize: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={16} height={2}><line x1={0} y1={1} x2={16} y2={1} stroke={lineColor} strokeWidth={2} /></svg>
            <span style={{ color: 'var(--text-dim)' }}>{data[0]?.symbol ?? 'Spółka'}</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={16} height={2}><line x1={0} y1={1} x2={16} y2={1} stroke="#64748b" strokeWidth={1.5} strokeDasharray="3,2" /></svg>
            <span style={{ color: 'var(--text-faint)' }}>{benchLabel}</span>
          </span>
        </div>
      )}
      <svg width={width} height={totalH}>
        <defs>
          <linearGradient id="sdm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={i}>
              <line x1={CM.left} y1={y} x2={CM.left + chartW} y2={y}
                    stroke="#1f2937" strokeOpacity={0.5} strokeWidth={1} />
              <text x={CM.left - 6} y={y + 3} fill="#64748b" fontSize={9}
                    textAnchor="end" fontFamily="JetBrains Mono, monospace">
                {showBench
                  ? `${v >= 0 ? '+' : ''}${v.toFixed(yDecimals)}%`
                  : v.toLocaleString(locale, { minimumFractionDigits: yDecimals, maximumFractionDigits: yDecimals })}
              </text>
            </g>
          );
        })}
        {areaPath && <path d={areaPath} fill="url(#sdm-area)" />}
        {benchPath && <path d={benchPath} fill="none" stroke="#64748b" strokeWidth={1.5} strokeDasharray="4,3" strokeLinejoin="round" />}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        {(() => {
          const lx = xScale(filtered.length - 1);
          const ly = yScale(stockValues[stockValues.length - 1]);
          return <circle cx={lx} cy={ly} r={3} fill={lineColor} />;
        })()}
        {hasVol && (() => {
          const maxVol = Math.max(...volData, 1);
          const barW = Math.max(1, chartW / filtered.length * 0.7);
          const volY0 = CM.top + CHART_H + 4;
          return volData.map((v, i) => {
            const bh = Math.max(1, (v / maxVol) * (VOL_H - 2));
            return (
              <rect key={i}
                x={xScale(i) - barW / 2}
                y={volY0 + (VOL_H - 2) - bh}
                width={barW}
                height={bh}
                fill={lineColor}
                fillOpacity={0.25}
              />
            );
          });
        })()}
        {dateLabels.map(({ i, date }, li) => {
          const anchor = li === 0 ? 'start' : li === dateLabels.length - 1 ? 'end' : 'middle';
          return (
            <text key={i} x={xScale(i)} y={totalH - 4} fill="#64748b" fontSize={9} textAnchor={anchor}>
              {date.slice(5).split('-').reverse().join('.')}
            </text>
          );
        })}
        {hoverIdx !== null && (
          <line
            x1={xScale(hoverIdx)} y1={CM.top}
            x2={xScale(hoverIdx)} y2={CM.top + CHART_H}
            stroke="var(--border)" strokeWidth={1} strokeDasharray="3,2"
          />
        )}
        {hoverIdx !== null && (
          <circle cx={xScale(hoverIdx)} cy={yScale(stockValues[hoverIdx])} r={4} fill={lineColor} stroke="var(--bg-2)" strokeWidth={2} />
        )}
      </svg>
      {hoverIdx !== null && (() => {
        const d = filtered[hoverIdx];
        const x = xScale(hoverIdx);
        const tooltipLeft = x + 10 + 110 < width ? x + 10 : x - 120;
        return (
          <div style={{
            position: 'absolute', top: CM.top + 4, left: tooltipLeft,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '6px 10px', fontSize: 11,
            pointerEvents: 'none', zIndex: 10, minWidth: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            <div style={{ color: 'var(--text-faint)', marginBottom: 3 }}>
              {d.date.slice(5).split('-').reverse().join('.')}{d.time ? ` ${d.time}` : ''}
            </div>
            <div style={{ color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
              {showBench
                ? (stockValues[hoverIdx] >= 0 ? '+' : '') + stockValues[hoverIdx].toFixed(2) + '%'
                : d.price.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ` ${currency}` : '')}
            </div>
            {hasVol && d.volume > 0 && (
              <div style={{ color: 'var(--text-faint)', marginTop: 2 }}>
                {d.volume >= 1_000_000
                  ? (d.volume / 1_000_000).toFixed(1) + 'M'
                  : d.volume >= 1000
                  ? Math.round(d.volume / 1000) + 'K'
                  : String(d.volume)}
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
  const [note, setNote] = useState(() => localStorage.getItem(`myfund_note_${item.symbol}`) || '');
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    setNote(localStorage.getItem(`myfund_note_${item.symbol}`) || '');
  }, [item.symbol]);

  useEffect(() => {
    setChartLoading(true);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1d&range=1y`;
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
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
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
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
          const time = dt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: tz });
          return { date, time, price: closes[i], volume: volumes[i] ?? null };
        }).filter(p => p.price != null);
        setIntradayData(pts);
      })
      .catch(() => setIntradayData([]))
      .finally(() => setIntradayLoading(false));
  }, [prePost, chartPeriod, item.symbol]);

  useEffect(() => {
    if (!benchSymbol) { setBenchData([]); return; }
    setBenchLoading(true);
    const authHeader = { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' };
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

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isFullscreen ? 0 : 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: isFullscreen ? 0 : 14, width: '100%',
          maxWidth: isFullscreen ? '100%' : 620,
          boxShadow: isFullscreen ? 'none' : '0 24px 64px rgba(0,0,0,0.5)',
          maxHeight: isFullscreen ? '100vh' : '92vh',
          height: isFullscreen ? '100vh' : undefined,
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Stock header */}
        <div style={{ padding: '20px 22px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <TickerLogo symbol={item.symbol} size={44} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{item.symbol}</div>
              {item.name && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            {currentPrice != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.01em' }}>
                  {currentPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </div>
                {dayChangePct != null && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: dayChangePct >= 0 ? 'var(--up)' : 'var(--down)', marginTop: 2, textAlign: 'right' }}>
                    {dayChangePct >= 0 ? '▲' : '▼'} {Math.abs(dayChangePct).toFixed(2)}%
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'Zmniejsz' : 'Pełny ekran'}
              style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-dim)', padding: '6px 8px', lineHeight: 1, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center' }}
            >
              {isFullscreen
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
              }
            </button>
            <button
              onClick={onClose}
              style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 14, padding: '6px 8px', lineHeight: 1, flexShrink: 0, borderRadius: 8 }}
            >✕</button>
          </div>
        </div>

        {/* Position context strip — only for portfolio positions */}
        {item.qty != null && (
          <div style={{ margin: '12px 22px 0', padding: '10px 14px', background: 'var(--panel)', borderRadius: 10, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {item.qty.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 4 })} {t('shares')}
              {item.avgPrice != null && (
                <> · {t('avg_abbr')} {item.avgPrice.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</>
              )}
              {item.valuePLN != null && totalPortfolioValue > 0 && (
                <> · {((item.valuePLN / totalPortfolioValue) * 100).toFixed(1)}% {t('of_portfolio')}</>
              )}
            </span>
            {item.plPLN != null && (
              <span style={{ fontSize: 11, fontWeight: 600, color: item.plPLN >= 0 ? 'var(--up)' : 'var(--down)', marginLeft: 'auto' }}>
                {item.plPLN >= 0 ? '+' : ''}{item.plPLN.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                {item.costPLN > 0 && (
                  <span style={{ fontWeight: 400, opacity: 0.8 }}>
                    {' '}({((item.plPLN / item.costPLN) * 100) >= 0 ? '+' : ''}{((item.plPLN / item.costPLN) * 100).toFixed(1)}%)
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, margin: '14px 22px 0', borderBottom: '1px solid var(--border)' }}>
          {[['wykres', t('tab_chart')], ['wskazniki', t('tab_indicators')], ['finanse', t('tab_financials')], ['ai', 'AI'], ['notatki', note ? `📝 ${t('tab_notes')}` : t('tab_notes')]].map(([k, l]) => (
            <button
              key={k}
              onClick={() => switchTab(k)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === k ? '2px solid var(--accent)' : '2px solid transparent',
                padding: '9px 16px',
                fontSize: 12,
                fontWeight: activeTab === k ? 600 : 400,
                color: activeTab === k ? 'var(--text)' : 'var(--text-dim)',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >{l}</button>
          ))}
        </div>

        {/* Wykres tab */}
        {activeTab === 'wykres' && (
        <div style={{ padding: '10px 22px 22px' }}>
          {chartLoading ? (
            <div style={{ height: CHART_H + CM.top + CM.bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('loading')}</span>
            </div>
          ) : chartData.length >= 2 ? (
            <>
              {(() => {
                const shortPeriod = chartPeriod === '1W' || chartPeriod === '1M';
                const isIntraday  = prePost && shortPeriod;
                const activeData  = isIntraday ? intradayData : chartData;
                const loading     = isIntraday ? intradayLoading : false;
                return (
                  <>
                    {loading
                      ? <div style={{ height: CHART_H + CM.top + CM.bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('loading')}</span>
                        </div>
                      : <MiniChart
                          data={activeData}
                          period={chartPeriod}
                          benchData={benchData}
                          benchLabel={benchSymbol === null ? '' : (BENCH_OPTS.find(b => b.key === benchSymbol)?.label ?? '')}
                          currency={currency}
                          isIntraday={isIntraday}
                        />
                    }
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {PERIODS.map(p => (
                          <button
                            key={p.key}
                            onClick={() => setChartPeriod(p.key)}
                            style={{
                              fontSize: 11, padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              background: chartPeriod === p.key ? 'var(--accent)' : 'var(--panel-2)',
                              color: chartPeriod === p.key ? '#fff' : 'var(--text-dim)',
                              fontWeight: chartPeriod === p.key ? 600 : 400,
                              transition: 'background 0.15s',
                            }}
                          >{p.label}</button>
                        ))}
                        {shortPeriod && (
                          <button
                            onClick={() => setPrePost(v => !v)}
                            title="Dane po godzinach i przed otwarciem (pre/post market)"
                            style={{
                              fontSize: 10, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                              background: prePost ? 'rgba(99,102,241,0.15)' : 'transparent',
                              color: prePost ? 'var(--accent)' : 'var(--text-faint)',
                              fontWeight: prePost ? 600 : 400,
                              transition: 'all 0.15s',
                              marginLeft: 4,
                            }}
                          >po godz.</button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                        {BENCH_OPTS.map(b => (
                          <button
                            key={b.key ?? 'none'}
                            onClick={() => setBenchSymbol(b.key)}
                            style={{
                              fontSize: 10, padding: '2px 7px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              background: benchSymbol === b.key ? 'var(--panel-2)' : 'transparent',
                              color: benchSymbol === b.key ? 'var(--text)' : 'var(--text-faint)',
                              fontWeight: benchSymbol === b.key ? 600 : 400,
                              transition: 'background 0.15s, color 0.15s',
                              outline: benchSymbol === b.key ? '1px solid var(--border)' : 'none',
                            }}
                          >{b.key === null ? t('none_label') : b.label}{benchLoading && benchSymbol === b.key ? ' …' : ''}</button>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
          ) : (
            <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t('no_chart_data')}</span>
            </div>
          )}
        </div>
        )}

        {/* Wskaźniki tab — lazy mount */}
        {wskaznikMounted && (
          <div style={{ display: activeTab === 'wskazniki' ? 'block' : 'none' }}>
            <KeyStatsTab symbol={item.symbol} livePrice={currentPrice} currency={currency} yearChangePct={yearChangePct} />
          </div>
        )}

        {/* Finanse tab — lazy mount */}
        {financialsMounted && (
          <div style={{ display: activeTab === 'finanse' ? 'block' : 'none' }}>
            <FinancialsTab symbol={item.symbol} livePrice={currentPrice} companyName={item.name} />
          </div>
        )}

        {/* AI tab — lazy mount */}
        {summaryMounted && (
          <div style={{ display: activeTab === 'ai' ? 'block' : 'none' }}>
            <SummaryTab symbol={item.symbol} livePrice={currentPrice} />
          </div>
        )}

        {activeTab === 'notatki' && (
          <div style={{ padding: '16px 20px 20px' }}>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 8 }}>
              Teza inwestycyjna, cel cenowy, powód zakupu — zapisywane lokalnie na tym urządzeniu.
            </p>
            <textarea
              value={note}
              onChange={e => { setNote(e.target.value); localStorage.setItem(`myfund_note_${item.symbol}`, e.target.value); }}
              placeholder={`Notatki do ${item.symbol}…`}
              style={{
                width: '100%', minHeight: 160, padding: '10px 12px',
                background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text)', fontSize: 13, lineHeight: 1.6, resize: 'vertical',
                fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', outline: 'none',
              }}
              autoFocus
            />
            {note && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  onClick={() => { setNote(''); localStorage.removeItem(`myfund_note_${item.symbol}`); }}
                  style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Wyczyść notatkę
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
