import React, { useRef, useState, useEffect } from 'react';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';

const M = { top: 10, right: 75, bottom: 28, left: 10 };
const H = 220;

// Returns the benchmark price at or before a given date (binary-search style scan)
function priceAtDate(benchData, date) {
  let last = null;
  for (const pt of benchData) {
    if (pt.date <= date) last = pt.price;
    else break;
  }
  return last;
}

export default function HistoryChart({ data, benchData = [], benchLabel = '', displayCurrency = 'PLN', fxRate = 1 }) {
  const { locale } = useLanguage();
  const t = useT();
  const { isPrivate } = usePrivacy();
  const blurCls = isPrivate ? 'privacy-blur' : undefined;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;

  // Per-punkt fx: snapshoty z zapisanym .fx (od PR #15) używają swojego
  // wtedy-aktualnego kursu — historyczna wartość zamrożona. Fallback do
  // `fxRate` prop dla starych wpisów bez fx w bazie. Bez tego Y-oś i
  // tooltipy chart oddychają z dzisiejszym NBP mimo tego samego portfela.
  const rateFor = (d) => {
    const dayFx = d?.fx?.[displayCurrency];
    return (dayFx && dayFx > 0) ? dayFx : (fxRate || 1);
  };

  function fmtXDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }

  function fmtVal(n) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const [svgWidth, setSvgWidth] = useState(800);
  const [tooltip, setTooltip]   = useState(null);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setSvgWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  if (!data || data.length < 2) return null;

  const chartW = svgWidth - M.right - M.left;
  const totalH = H + M.top + M.bottom;

  // Przekonwertowane od razu na displayCurrency przez per-pkt fx —
  // Y-oś i scale operują na spójnych jednostkach niezależnie od dnia.
  const totals    = data.map(d => (d.total    ?? 0) / rateFor(d));
  const investeds = data.map(d => (d.invested ?? 0) / rateFor(d));
  const hasInvested = data.some(d => d.invested != null && d.invested > 0);

  // Normalize benchmark to portfolio's first value so both lines share the same scale
  const benchNormalized = (() => {
    if (!benchData.length || !data.length) return [];
    const firstBenchPrice = priceAtDate(benchData, data[0].date);
    const firstPortfolio  = totals[0];
    if (!firstBenchPrice || !firstPortfolio) return [];
    return data.map(s => {
      const price = priceAtDate(benchData, s.date);
      return price != null ? (price / firstBenchPrice) * firstPortfolio : null;
    });
  })();
  const hasBenchNorm = benchNormalized.length > 0 && benchNormalized.some(v => v != null);

  // Scale based on totals + benchmark; never let stale/zero invested values distort the Y-axis
  const scaleVals = [
    ...totals,
    ...(hasBenchNorm ? benchNormalized.filter(v => v != null) : []),
  ];
  const minTotal = Math.min(...totals);
  // Include invested in scale only if it's in a reasonable range (≥ 30% of min total)
  const saneinvesteds = investeds.filter(v => v > 0 && v >= minTotal * 0.3);
  if (saneinvesteds.length) scaleVals.push(...saneinvesteds);

  const minVal = Math.min(...scaleVals) * 0.992;
  const maxVal = Math.max(...scaleVals) * 1.008;
  const range  = maxVal - minVal || 1;

  const xScale = (i) => M.left + (i / (data.length - 1)) * chartW;
  const yScale = (v) => M.top + H - ((v - minVal) / range) * H;

  const buildPath = (values) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

  const totalPath = buildPath(totals);
  const baseY = (M.top + H).toFixed(1);
  const areaPath = `${totalPath} L${xScale(data.length - 1).toFixed(1)},${baseY} L${M.left.toFixed(1)},${baseY} Z`;

  const benchPath = hasBenchNorm ? (() => {
    const parts = [];
    let movePending = true;
    for (let i = 0; i < benchNormalized.length; i++) {
      if (benchNormalized[i] == null) { movePending = true; continue; }
      parts.push(`${movePending ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(benchNormalized[i]).toFixed(1)}`);
      movePending = false;
    }
    return parts.join(' ');
  })() : null;

  const isUp      = totals[totals.length - 1] >= totals[0];
  const lineColor = isUp ? '#10b981' : '#f43f5e';

  // Y-axis ticks
  const tickCount = 5;
  const tickStep  = (maxVal - minVal) / (tickCount - 1);
  const yTicks    = Array.from({ length: tickCount }, (_, i) => minVal + i * tickStep);

  // X-axis labels (at most 7)
  const labelStep  = Math.max(1, Math.floor(data.length / 7));
  const dateLabels = data
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1);

  const handleMouseMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left - M.left;
    const idx  = Math.max(0, Math.min(data.length - 1, Math.round((mx / chartW) * (data.length - 1))));
    const d    = data[idx];
    const r    = rateFor(d);
    const dispTotal    = d.total    != null ? d.total    / r : null;
    const dispInvested = d.invested != null ? d.invested / r : null;
    const pl = dispTotal != null && dispInvested != null ? dispTotal - dispInvested : null;
    setTooltip({
      x:          xScale(idx),
      screenX:    e.clientX - rect.left,
      y:          e.clientY - rect.top,
      date:       d.date,
      total:      dispTotal,       // już w displayCurrency
      invested:   dispInvested,    // już w displayCurrency
      pl,                          // już w displayCurrency
      // benchNormalized[idx] jest w tych samych jednostkach co totals[idx]
      // (bo skalujemy do totals[0]), a totals[i] też już podzielone przez rateFor
      benchValue: hasBenchNorm ? benchNormalized[idx] : null,
      idx,
    });
  };

  return (
    <div ref={containerRef} className="w-full relative select-none cursor-crosshair">
      <svg
        ref={svgRef}
        width={svgWidth}
        height={totalH}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="hc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={i}>
              <line x1={M.left} x2={svgWidth - M.right} y1={y} y2={y}
                stroke="#334155" strokeDasharray="3,3" strokeWidth={0.5} />
              <text x={svgWidth - M.right + 4} y={y + 4} fill="#64748b" fontSize={10} textAnchor="start" className={blurCls}>
                {fmtVal(v)} {currLabel}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#hc-area)" />

        {/* Benchmark line (normalized to portfolio start value) */}
        {hasBenchNorm && benchPath && (
          <path d={benchPath} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.8} />
        )}

        {/* Invested line (dashed, slate) — skip zero/outlier segments */}
        {hasInvested && saneinvesteds.length > 0 && (() => {
          const parts = [];
          let pen = true;
          for (let i = 0; i < investeds.length; i++) {
            const v = investeds[i];
            if (!v || v < minTotal * 0.3) { pen = true; continue; }
            parts.push(`${pen ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`);
            pen = false;
          }
          const d = parts.join(' ');
          return d ? <path d={d} fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="5,3" /> : null;
        })()}

        {/* Portfolio value line */}
        <path d={totalPath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />

        {/* Hover: vertical line + dot */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} x2={tooltip.x}
              y1={M.top} y2={M.top + H}
              stroke="#64748b" strokeWidth={1} strokeDasharray="2,2"
            />
            <circle cx={tooltip.x} cy={yScale(tooltip.total ?? 0)} r={4}
              fill={lineColor} stroke="#1e293b" strokeWidth={2} />
          </>
        )}

        {/* X-axis baseline */}
        <line x1={M.left} x2={svgWidth - M.right} y1={M.top + H} y2={M.top + H}
          stroke="#334155" strokeWidth={0.5} />

        {/* X-axis date labels */}
        {dateLabels.map(({ i, date }) => (
          <text key={i} x={xScale(i)} y={M.top + H + 17} fill="#64748b" fontSize={9} textAnchor="middle">
            {fmtXDate(date)}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-xs pointer-events-none shadow-xl"
          style={{
            left: tooltip.screenX > svgWidth / 2 ? tooltip.screenX - 185 : tooltip.screenX + 14,
            top:  Math.max(4, tooltip.y - 72),
          }}
        >
          <p className="font-semibold text-slate-300 mb-1.5">{tooltip.date}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
            <span>Wartość</span>
            <span className={`text-slate-100 text-right font-semibold${isPrivate ? ' privacy-blur' : ''}`}>{fmtVal(tooltip.total)} {currLabel}</span>
            {hasInvested && tooltip.invested != null && (
              <>
                <span>Zainwest.</span>
                <span className={`text-slate-400 text-right${isPrivate ? ' privacy-blur' : ''}`}>{fmtVal(tooltip.invested)} {currLabel}</span>
                <span>P&L</span>
                <span className={`text-right font-semibold ${tooltip.pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}${isPrivate ? ' privacy-blur' : ''}`}>
                  {tooltip.pl >= 0 ? '+' : ''}{fmtVal(tooltip.pl)} {currLabel}
                </span>
              </>
            )}
            {hasBenchNorm && tooltip.benchValue != null && (
              <>
                <span>{benchLabel || 'Benchmark'}</span>
                <span className={`text-blue-400 text-right${isPrivate ? ' privacy-blur' : ''}`}>{fmtVal(tooltip.benchValue)} {currLabel}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="hc-legend">
        <div className="hc-legend-item">
          <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" /></svg>
          <span>{t('legend_portfolio_value')}</span>
        </div>
        {hasInvested && (
          <div className="hc-legend-item">
            <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="#94a3b8" strokeWidth="1.8" strokeDasharray="5,3" strokeLinecap="round" /></svg>
            <span>{t('legend_invested')}</span>
          </div>
        )}
        {hasBenchNorm && benchLabel && (
          <div className="hc-legend-item">
            <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="#60a5fa" strokeWidth="1.8" strokeDasharray="4,2" strokeLinecap="round" /></svg>
            <span>{benchLabel} <span style={{ color: 'var(--text-faint)' }}>{t('legend_benchmark')}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
