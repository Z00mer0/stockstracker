import React, { useState, useEffect, useRef, useMemo } from 'react';
import FinancialsTab from './FinancialsTab';
import KeyStatsTab from './KeyStatsTab';
import SummaryTab from './SummaryTab';

const PERIODS = [
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '6M', days: 180 },
  { key: '1R', days: 365 },
];
const CM = { top: 8, right: 8, bottom: 22, left: 56 };
const CHART_H = 150;

function MiniChart({ data, period }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(440);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const p = PERIODS.find(x => x.key === period);
    if (!p) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return data.filter(d => d.date >= cutStr);
  }, [data, period]);

  if (filtered.length < 2) return <div ref={containerRef} style={{ height: CHART_H + CM.top + CM.bottom }} />;

  const chartW = width - CM.left - CM.right;
  const totalH = CHART_H + CM.top + CM.bottom;
  const prices = filtered.map(d => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const pad = range * 0.1;
  const yMin = minP - pad;
  const yMax = maxP + pad;
  const rawStep = (yMax - yMin) / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceStep * magnitude;
  const niceMin = Math.floor(yMin / step) * step;
  const yTicks = Array.from({ length: 10 }, (_, i) => niceMin + i * step)
    .filter(v => v >= yMin && v <= yMax);
  const yDecimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;

  const xScale = i => CM.left + (i / (filtered.length - 1)) * chartW;
  const yScale = v => CM.top + CHART_H - ((v - minP + pad) / (range + pad * 2)) * CHART_H;

  const linePath = filtered.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(d.price).toFixed(1)}`
  ).join(' ');
  const areaPath = `${linePath} L${xScale(filtered.length - 1).toFixed(1)},${(CM.top + CHART_H).toFixed(1)} L${CM.left.toFixed(1)},${(CM.top + CHART_H).toFixed(1)} Z`;

  const isUp = filtered[filtered.length - 1].price >= filtered[0].price;
  const lineColor = isUp ? '#10b981' : '#f43f5e';

  const labelStep = Math.max(1, Math.floor(filtered.length / 5));
  const MIN_LABEL_GAP = 36;
  const dateLabels = filtered
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % labelStep === 0 || i === filtered.length - 1)
    .filter((dl, li, arr) => {
      if (li === arr.length - 1) return true;
      return xScale(arr[li + 1].i) - xScale(dl.i) >= MIN_LABEL_GAP;
    });

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
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
                {v.toLocaleString('pl-PL', { minimumFractionDigits: yDecimals, maximumFractionDigits: yDecimals })}
              </text>
            </g>
          );
        })}
        <path d={areaPath} fill="url(#sdm-area)" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        {filtered.length > 1 && (() => {
          const lx = xScale(filtered.length - 1);
          const ly = yScale(filtered[filtered.length - 1].price);
          return <circle cx={lx} cy={ly} r={3} fill={lineColor} />;
        })()}
        {dateLabels.map(({ i, date }, li) => {
          const anchor = li === 0 ? 'start' : li === dateLabels.length - 1 ? 'end' : 'middle';
          return (
            <text key={i} x={xScale(i)} y={totalH - 4} fill="#64748b" fontSize={9} textAnchor={anchor}>
              {date.slice(5).replace('-', '/')}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function StockDetailModal({ item, existingPortfolio, onSave, onClose }) {
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('3M');
  const [currency] = useState(item.currency || (item.symbol?.endsWith('.WA') ? 'PLN' : 'USD'));
  const [activeTab, setActiveTab] = useState('wykres');
  const [financialsMounted, setFinancialsMounted] = useState(false);
  const [wskaznikMounted, setWskaznikMounted] = useState(false);
  const [summaryMounted, setSummaryMounted] = useState(false);

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
        const closes = result.indicators?.quote?.[0]?.close ?? [];
        const pts = timestamps
          .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i] }))
          .filter(p => p.price != null);
        setChartData(pts);
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [item.symbol]);

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
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 12, width: '100%', maxWidth: 480,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Stock header */}
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 8, background: 'var(--panel-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
            }}>{item.symbol?.slice(0, 2)}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{item.symbol}</div>
              {item.name && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{item.name}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {currentPrice != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {currentPrice.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </div>
                {dayChangePct != null && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: dayChangePct >= 0 ? 'var(--up)' : 'var(--down)', marginTop: 2 }}>
                    {dayChangePct >= 0 ? '▲' : '▼'} {Math.abs(dayChangePct).toFixed(2)}%
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}
            >✕</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, margin: '12px 20px 0', borderBottom: '1px solid var(--border)' }}>
          {[['wykres', 'Wykres'], ['wskazniki', 'Wskaźniki'], ['finanse', 'Finanse'], ['ai', 'AI']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => switchTab(k)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === k ? '2px solid var(--accent)' : '2px solid transparent',
                padding: '8px 14px',
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
        <div style={{ padding: '8px 20px 0' }}>
          {chartLoading ? (
            <div style={{ height: CHART_H + CM.top + CM.bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wykresu…</span>
            </div>
          ) : chartData.length >= 2 ? (
            <>
              <MiniChart data={chartData} period={chartPeriod} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
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
                  >{p.key}</button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Brak danych wykresu</span>
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
            <FinancialsTab symbol={item.symbol} livePrice={currentPrice} />
          </div>
        )}

        {/* AI tab — lazy mount */}
        {summaryMounted && (
          <div style={{ display: activeTab === 'ai' ? 'block' : 'none' }}>
            <SummaryTab symbol={item.symbol} livePrice={currentPrice} />
          </div>
        )}
      </div>
    </div>
  );
}
