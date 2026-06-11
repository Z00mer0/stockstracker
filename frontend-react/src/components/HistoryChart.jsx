import React, { useRef, useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const M = { top: 10, right: 75, bottom: 28, left: 10 };
const H = 220;

export default function HistoryChart({ data, benchData = [], benchLabel = '' }) {
  const { locale } = useLanguage();

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

  const totals    = data.map(d => d.total    ?? 0);
  const investeds = data.map(d => d.invested ?? 0);
  const hasInvested = data.some(d => d.invested != null && d.invested > 0);

  const benchValues = benchData.map(b => b.value);
  const allVals = hasInvested
    ? [...totals, ...investeds, ...benchValues]
    : [...totals, ...benchValues];
  const minVal  = Math.min(...allVals) * 0.995;
  const maxVal  = Math.max(...allVals) * 1.005;
  const range   = maxVal - minVal || 1;

  const xScale = (i) => M.left + (i / (data.length - 1)) * chartW;
  const yScale = (v) => M.top + H - ((v - minVal) / range) * H;

  const buildPath = (values) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

  const totalPath = buildPath(totals);
  const areaPath  = `${totalPath} L${xScale(data.length - 1).toFixed(1)},${(M.top + H).toFixed(1)} L${M.left.toFixed(1)},${(M.top + H).toFixed(1)} Z`;

  const hasBench = benchData.length === data.length;
  const benchPath = hasBench ? buildPath(benchData.map(b => b.value)) : null;

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
    const pl   = (d.total ?? 0) - (d.invested ?? 0);
    setTooltip({
      x:        xScale(idx),
      screenX:  e.clientX - rect.left,
      y:        e.clientY - rect.top,
      date:     d.date,
      total:    d.total,
      invested: d.invested,
      pl,
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
              <text x={svgWidth - M.right + 4} y={y + 4} fill="#64748b" fontSize={10} textAnchor="start">
                {fmtVal(v)} zł
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#hc-area)" />

        {/* Benchmark line */}
        {hasBench && benchPath && (
          <path d={benchPath} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,2" opacity={0.7} />
        )}

        {/* Invested line (dashed, slate) */}
        {hasInvested && (
          <path d={buildPath(investeds)} fill="none" stroke="#475569" strokeWidth={1.5} strokeDasharray="5,3" />
        )}

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
            <span className="text-slate-100 text-right font-semibold">{fmtVal(tooltip.total)} zł</span>
            {hasInvested && tooltip.invested != null && (
              <>
                <span>Zainwest.</span>
                <span className="text-slate-400 text-right">{fmtVal(tooltip.invested)} zł</span>
                <span>P&L</span>
                <span className={`text-right font-semibold ${tooltip.pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {tooltip.pl >= 0 ? '+' : ''}{fmtVal(tooltip.pl)} zł
                </span>
              </>
            )}
            {hasBench && benchData[tooltip.idx] != null && (
              <>
                <span>{benchLabel || 'Benchmark'}</span>
                <span className="text-amber-400 text-right">{fmtVal(benchData[tooltip.idx]?.value)} zł</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-5 mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke={lineColor} strokeWidth="2" /></svg>
          Wartość portfela
        </div>
        {hasInvested && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#475569" strokeWidth="1.5" strokeDasharray="5,3" /></svg>
            Zainwestowano
          </div>
        )}
        {hasBench && benchLabel && (
          <div className="flex items-center gap-1.5">
            <svg width="16" height="4">
              <line x1="0" y1="2" x2="16" y2="2" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,2" />
            </svg>
            {benchLabel} (znorm.)
          </div>
        )}
      </div>
    </div>
  );
}
