import React, { useRef, useState, useEffect, useMemo } from 'react';

const M = { top: 10, right: 56, bottom: 28, left: 10 };
const H = 220;

const PL_MONTHS = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
function fmtXDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(d)} ${PL_MONTHS[parseInt(m) - 1]}`;
}

export default function ReturnRateChart({ data, benchData = [], benchLabel = '' }) {
  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const [svgWidth, setSvgWidth] = useState(800);
  const [tooltip, setTooltip]   = useState(null);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setSvgWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const baseline = data[0]?.total ?? 0;
  const portfolioPct = useMemo(
    () => data.map(d => baseline > 0 ? ((d.total ?? 0) / baseline - 1) * 100 : 0),
    [data, baseline]
  );

  const benchPct = useMemo(() => {
    if (!benchData.length || !data.length) return [];
    function priceAtDate(date) {
      let last = null;
      for (const pt of benchData) {
        if (pt.date <= date) last = pt.price;
        else break;
      }
      return last;
    }
    const firstBenchPrice = priceAtDate(data[0].date);
    if (!firstBenchPrice) return [];
    return data.map(s => {
      const price = priceAtDate(s.date);
      return price != null ? (price / firstBenchPrice - 1) * 100 : null;
    });
  }, [benchData, data]);

  if (!data || data.length < 2) return null;

  const chartW = svgWidth - M.right - M.left;
  const totalH = H + M.top + M.bottom;

  const hasBench = benchPct.length === data.length && benchPct.some(v => v != null);
  const allVals = [...portfolioPct, ...(hasBench ? benchPct.filter(v => v != null) : []), 0];
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad = Math.max((rawMax - rawMin) * 0.08, 0.5);
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const range  = maxVal - minVal || 1;

  const xScale = (i) => M.left + (i / (data.length - 1)) * chartW;
  const yScale = (v) => M.top + H - ((v - minVal) / range) * H;

  const buildPath = (values) => {
    const parts = [];
    let movePending = true;
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) { movePending = true; continue; }
      parts.push(`${movePending ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(values[i]).toFixed(1)}`);
      movePending = false;
    }
    return parts.join(' ');
  };

  const portfolioPath = buildPath(portfolioPct);
  const benchPath     = hasBench ? buildPath(benchPct) : null;
  const lastPct       = portfolioPct[portfolioPct.length - 1];
  const isUp          = lastPct >= 0;
  const lineColor     = isUp ? '#10b981' : '#f43f5e';
  const zeroY         = yScale(0);

  const areaPath = `${portfolioPath} L${xScale(data.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${M.left.toFixed(1)},${zeroY.toFixed(1)} Z`;

  const tickCount = 5;
  const tickStep  = (maxVal - minVal) / (tickCount - 1);
  const yTicks    = Array.from({ length: tickCount }, (_, i) => minVal + i * tickStep);

  const labelStep  = Math.max(1, Math.floor(data.length / 7));
  const dateLabels = data
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % labelStep === 0 || i === data.length - 1);

  function handleMouseMove(e) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx  = e.clientX - rect.left - M.left;
    const idx = Math.max(0, Math.min(data.length - 1, Math.round((mx / chartW) * (data.length - 1))));
    setTooltip({
      x:           xScale(idx),
      screenX:     e.clientX - rect.left,
      y:           e.clientY - rect.top,
      date:        data[idx].date,
      portfolioPct: portfolioPct[idx],
      benchPct:    hasBench ? benchPct[idx] : null,
      idx,
    });
  }

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
          <linearGradient id="rr-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={i}>
              <line x1={M.left} x2={svgWidth - M.right} y1={y} y2={y}
                stroke="#334155" strokeDasharray="3,3" strokeWidth={0.5} />
              <text x={svgWidth - M.right + 4} y={y + 4} fill="#64748b" fontSize={10} textAnchor="start">
                {v >= 0 ? '+' : ''}{v.toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* Zero baseline */}
        <line x1={M.left} x2={svgWidth - M.right} y1={zeroY} y2={zeroY}
          stroke="#475569" strokeWidth={1} />

        <path d={areaPath} fill="url(#rr-area)" />

        {hasBench && benchPath && (
          <path d={benchPath} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.8} />
        )}

        <path d={portfolioPath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />

        {tooltip && (
          <>
            <line x1={tooltip.x} x2={tooltip.x} y1={M.top} y2={M.top + H}
              stroke="#64748b" strokeWidth={1} strokeDasharray="2,2" />
            <circle cx={tooltip.x} cy={yScale(tooltip.portfolioPct ?? 0)} r={4}
              fill={lineColor} stroke="#1e293b" strokeWidth={2} />
          </>
        )}

        <line x1={M.left} x2={svgWidth - M.right} y1={M.top + H} y2={M.top + H}
          stroke="#334155" strokeWidth={0.5} />

        {dateLabels.map(({ i, date }) => (
          <text key={i} x={xScale(i)} y={M.top + H + 17} fill="#64748b" fontSize={9} textAnchor="middle">
            {fmtXDate(date)}
          </text>
        ))}
      </svg>

      {tooltip && (
        <div
          className="absolute z-10 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-xs pointer-events-none shadow-xl"
          style={{
            left: tooltip.screenX > svgWidth / 2 ? tooltip.screenX - 175 : tooltip.screenX + 14,
            top:  Math.max(4, tooltip.y - 52),
          }}
        >
          <p className="font-semibold text-slate-300 mb-1.5">{tooltip.date}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
            <span>Portfel</span>
            <span className={`text-right font-semibold ${(tooltip.portfolioPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {(tooltip.portfolioPct ?? 0) >= 0 ? '+' : ''}{(tooltip.portfolioPct ?? 0).toFixed(2)}%
            </span>
            {hasBench && tooltip.benchPct != null && (
              <>
                <span>{benchLabel || 'Benchmark'}</span>
                <span className={`text-right ${tooltip.benchPct >= 0 ? 'text-amber-400' : 'text-rose-300'}`}>
                  {tooltip.benchPct >= 0 ? '+' : ''}{tooltip.benchPct.toFixed(2)}%
                </span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-5 mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={lineColor} strokeWidth="2" /></svg>
          Portfel
        </div>
        {hasBench && benchLabel && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="4">
              <line x1="0" y1="2" x2="16" y2="2" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,2" />
            </svg>
            {benchLabel}
          </div>
        )}
      </div>
    </div>
  );
}
