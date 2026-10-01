import { useRef, useState, useEffect } from 'react';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePrivacy } from '../context/PrivacyContext';

const M = { top: 10, right: 75, bottom: 28, left: 10 };
const H = 220;

// Wykres wartości portfela. Bez linii benchmarku: indeks skalowany do
// pierwszej wartości portfela porównywał go z wartością, w której siedzą
// późniejsze wpłaty — różnica między liniami nie była wynikiem inwestycji.
// Porównanie z indeksem jest na wykresie stopy zwrotu (TWR) i w karcie
// „Ty vs indeks" na stronie Historia.
export default function HistoryChart({ data, displayCurrency = 'PLN', fxRate = 1 }) {
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
    // useGrouping:'always' — pl-PL domyślnie grupuje dopiero od 10 000
    // ("5162" vs "10 907"), przez co Y-oś wyglądała niespójnie.
    return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' });
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

  // Scale based on totals; never let stale/zero invested values distort the Y-axis
  const scaleVals = [...totals];
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

  const isUp      = totals[totals.length - 1] >= totals[0];
  const lineColor = isUp ? 'var(--up)' : 'var(--down)';

  // Y-axis ticks
  const tickCount = 5;
  const tickStep  = (maxVal - minVal) / (tickCount - 1);
  const yTicks    = Array.from({ length: tickCount }, (_, i) => minVal + i * tickStep);

  // X-axis labels (at most 7)
  const labelStep  = Math.max(1, Math.floor(data.length / 7));
  const dateLabels = data
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i === data.length - 1
      // Ostatnia data jest zawsze; regularna etykieta tuż przed nią nachodziła
      // na nią tekstem („23 wrz" + „26 wrz" w jednym miejscu).
      || (i % labelStep === 0 && data.length - 1 - i >= labelStep / 2));

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
            <stop offset="0%"   style={{ stopColor: lineColor, stopOpacity: 0.18 }} />
            <stop offset="100%" style={{ stopColor: lineColor, stopOpacity: 0.02 }} />
          </linearGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {yTicks.map((v, i) => {
          const y = yScale(v);
          return (
            <g key={i}>
              <line x1={M.left} x2={svgWidth - M.right} y1={y} y2={y}
                stroke="var(--border)" strokeDasharray="3,3" strokeWidth={0.5} />
              <text x={svgWidth - M.right + 4} y={y + 4} fill="var(--text-faint)" fontSize={10} textAnchor="start" className={blurCls}>
                {fmtVal(v)} {currLabel}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#hc-area)" />

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
          return d ? <path d={d} fill="none" stroke="var(--border-strong)" strokeWidth={1.5} strokeDasharray="5,3" /> : null;
        })()}

        {/* Portfolio value line */}
        <path d={totalPath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />

        {/* Hover: vertical line + dot */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} x2={tooltip.x}
              y1={M.top} y2={M.top + H}
              stroke="var(--text-faint)" strokeWidth={1} strokeDasharray="2,2"
            />
            <circle cx={tooltip.x} cy={yScale(tooltip.total ?? 0)} r={4}
              fill={lineColor} stroke="var(--panel)" strokeWidth={2} />
          </>
        )}

        {/* X-axis baseline */}
        <line x1={M.left} x2={svgWidth - M.right} y1={M.top + H} y2={M.top + H}
          stroke="var(--border)" strokeWidth={0.5} />

        {/* X-axis date labels */}
        {dateLabels.map(({ i, date }) => (
          <text key={i} x={xScale(i)} y={M.top + H + 17} fill="var(--text-faint)" fontSize={9} textAnchor="middle">
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
            <svg width="18" height="4" aria-hidden="true"><line x1="0" y1="2" x2="18" y2="2" stroke="var(--text-dim)" strokeWidth="1.8" strokeDasharray="5,3" strokeLinecap="round" /></svg>
            <span>{t('legend_invested')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
