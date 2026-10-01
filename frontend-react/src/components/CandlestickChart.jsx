// src/components/CandlestickChart.jsx
import { useRef, useState, useEffect } from 'react';
import { useT } from '../context/LanguageContext';
import { INDICATOR_COLORS as C } from './IndicatorPanel.jsx';

const M = { top: 12, right: 62, bottom: 25, left: 8 };
const MAIN_H = 280;
const SUB_H  = 75;
const GAP    = 8;

function buildPath(visible, getVal, xScale, yScale) {
  let d = '';
  let pen = false;
  visible.forEach((_, i) => {
    const v = getVal(i);
    if (v == null || isNaN(v)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)} `;
    pen = true;
  });
  return d;
}

function YAxis({ min, max, height, top, chartRight, count = 5 }) {
  if (max === min) return null;
  const step = (max - min) / (count - 1);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const v = min + i * step;
        const y = top + height - ((v - min) / (max - min)) * height;
        return (
          <g key={i}>
            <line x1={M.left} x2={chartRight} y1={y} y2={y}
              style={{ stroke: 'var(--border)' }} strokeDasharray="3,3" strokeWidth={0.5} />
            <text x={chartRight + 4} y={y + 4} style={{ fill: 'var(--text-faint)' }} fontSize={10} textAnchor="start">
              {v >= 1000 ? v.toFixed(0) : v.toFixed(2)}
            </text>
          </g>
        );
      })}
    </>
  );
}

export default function CandlestickChart({ candles, start = 0, indicators, technicalData, onCandleClick }) {
  const t = useT();
  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const dragRef      = useRef(null);
  const [svgWidth, setSvgWidth] = useState(700);
  const [view, setView]         = useState({ start: 0, end: 0 });
  const [tooltip, setTooltip]   = useState(null);

  // Responsive width
  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setSvgWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Na start widać wybrany okres (świece wcześniej to rozbieg wskaźników —
  // można do nich przewinąć, przeciągając w lewo). Min. 10 świec.
  useEffect(() => {
    if (!candles.length) return;
    const from = Math.max(0, Math.min(start, candles.length - 10));
    setView({ start: from, end: candles.length });
  }, [candles, start]);

  // Wheel zoom (passive:false required to preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      setView(prev => {
        const range  = prev.end - prev.start;
        const center = Math.round((prev.start + prev.end) / 2);
        const delta  = e.deltaY > 0 ? 1 : -1;
        const step   = Math.max(1, Math.floor(range * 0.1));
        const newRange = Math.max(10, Math.min(candles.length, range + delta * step));
        const half     = Math.floor(newRange / 2);
        const newStart = Math.max(0, Math.min(candles.length - newRange, center - half));
        return { start: newStart, end: newStart + newRange };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [candles.length]);

  const { showRSI, showMACD, showMA20, showMA50, showEMA, showBB } = indicators;

  const chartW  = svgWidth - M.right - M.left;
  const rsiTop  = M.top + MAIN_H + GAP;
  const macdTop = rsiTop + (showRSI ? SUB_H + GAP : 0);
  const xAxisY  = macdTop + (showMACD ? SUB_H + GAP : 0);
  const totalH  = xAxisY + M.bottom;

  const visible = candles.slice(view.start, view.end);
  if (!visible.length) return <div ref={containerRef} className="w-full" style={{ height: MAIN_H + M.top + M.bottom }} />;
  const count   = visible.length || 1;
  const cw      = Math.max(2, Math.floor(chartW / count) - 1);
  const xScale  = (i) => M.left + i * (cw + 1) + cw / 2;

  // Price Y range (include BB upper/lower if enabled)
  const priceVals = visible.flatMap(c => [c.high ?? c.close, c.low ?? c.close]);
  if (showBB && technicalData.bb) {
    for (let i = view.start; i < view.end; i++) {
      const bb = technicalData.bb[i];
      if (bb?.upper) priceVals.push(bb.upper, bb.lower);
    }
  }
  const priceMin = Math.min(...priceVals) * 0.999;
  const priceMax = Math.max(...priceVals) * 1.001;
  const yScale   = (v) => M.top + MAIN_H - ((v - priceMin) / (priceMax - priceMin || 1)) * MAIN_H;

  // RSI Y scale: 0-100
  const rsiScale = (v) => rsiTop + SUB_H - (v / 100) * SUB_H;

  // MACD Y scale (symmetric around 0)
  const macdVals = visible.flatMap((_, i) => {
    const gi = view.start + i;
    return [technicalData.macd?.macd?.[gi], technicalData.macd?.signal?.[gi]].filter(v => v != null);
  });
  const macdAbsMax = macdVals.length ? Math.max(Math.abs(Math.min(...macdVals)), Math.abs(Math.max(...macdVals))) * 1.2 || 1 : 1;
  const macdScale  = (v) => macdTop + SUB_H / 2 - (v / macdAbsMax) * (SUB_H / 2);

  // Pan handlers
  const handleMouseDown = (e) => {
    dragRef.current = { x: e.clientX, start: view.start, end: view.end };
  };

  const handleMouseMove = (e) => {
    if (dragRef.current) {
      const dx    = e.clientX - dragRef.current.x;
      const range = dragRef.current.end - dragRef.current.start;
      const shift = Math.round(-dx / ((chartW / range) || 1));
      const newStart = Math.max(0, Math.min(candles.length - range, dragRef.current.start + shift));
      setView({ start: newStart, end: newStart + range });
      setTooltip(null);
    } else {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const mx   = e.clientX - rect.left - M.left;
      const idx  = Math.floor(mx / (cw + 1));
      if (idx >= 0 && idx < visible.length) {
        const gi = view.start + idx;
        setTooltip({
          x:      e.clientX - rect.left,
          y:      e.clientY - rect.top,
          candle: visible[idx],
          rsi:    technicalData.rsi?.[gi],
          macd:   technicalData.macd?.macd?.[gi],
        });
      } else {
        setTooltip(null);
      }
    }
  };

  const endDrag = () => { dragRef.current = null; };

  // X-axis labels (at most 7) — show time for intraday candles
  const isIntraday = visible.length > 0 && visible[0].time != null;
  const labelStep  = Math.max(1, Math.floor(visible.length / 7));
  const dateLabels = visible
    .map((c, i) => ({ i, label: isIntraday ? c.time : c.date.slice(5) }))
    .filter((_, i) => i % labelStep === 0);

  const chartRight = svgWidth - M.right;

  return (
    <div ref={containerRef} className="w-full relative select-none cursor-crosshair">
      <svg
        ref={svgRef}
        width={svgWidth}
        height={totalH}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={() => { endDrag(); setTooltip(null); }}
        onClick={(e) => {
          if (!svgRef.current) return;
          const rect = svgRef.current.getBoundingClientRect();
          const idx  = Math.floor((e.clientX - rect.left - M.left) / (cw + 1));
          if (idx >= 0 && idx < visible.length) onCandleClick?.(visible[idx]);
        }}
      >
        {/* Main chart Y-axis grid */}
        <YAxis min={priceMin} max={priceMax} height={MAIN_H} top={M.top} chartRight={chartRight} />

        {/* Bollinger Bands */}
        {showBB && technicalData.bb && (() => {
          const pts = visible.map((_, i) => {
            const bb = technicalData.bb[view.start + i];
            return bb?.upper != null ? { x: xScale(i), up: yScale(bb.upper), lo: yScale(bb.lower) } : null;
          }).filter(Boolean);
          if (pts.length < 2) return null;
          const upPath = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.up}`).join(' ');
          const loLine = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.lo}`).join(' ');
          // Dolna krawędź wypełnienia musi ciągnąć ten sam kontur (same L) —
          // wcześniej zaczynała od M, więc pas rozpadał się na dwa trójkąty.
          const loPath = [...pts].reverse().map(p => `L${p.x},${p.lo}`).join(' ');
          return (
            <g>
              <path d={`${upPath} ${loPath} Z`} fill={C.bb} fillOpacity={0.07} />
              <path d={upPath} fill="none" stroke={C.bb} strokeWidth={1} strokeOpacity={0.5} />
              <path d={loLine} fill="none" stroke={C.bb} strokeWidth={1} strokeOpacity={0.5} />
            </g>
          );
        })()}

        {/* MA20 — yellow */}
        {showMA20 && technicalData.ma20 && (
          <path d={buildPath(visible, i => technicalData.ma20[view.start + i], xScale, yScale)}
            fill="none" stroke={C.ma20} strokeWidth={1.5} />
        )}
        {/* MA50 — orange */}
        {showMA50 && technicalData.ma50 && (
          <path d={buildPath(visible, i => technicalData.ma50[view.start + i], xScale, yScale)}
            fill="none" stroke={C.ma50} strokeWidth={1.5} />
        )}
        {/* EMA21 — blue */}
        {showEMA && technicalData.ema && (
          <path d={buildPath(visible, i => technicalData.ema[view.start + i], xScale, yScale)}
            fill="none" stroke={C.ema} strokeWidth={1.5} />
        )}

        {/* Candlesticks */}
        {visible.map((c, i) => {
          const isUp    = c.close >= c.open;
          const color   = isUp ? 'var(--up)' : 'var(--down)';
          const bodyTop = yScale(Math.max(c.open, c.close));
          const bodyBot = yScale(Math.min(c.open, c.close));
          const bodyH   = Math.max(1, bodyBot - bodyTop);
          const cx      = xScale(i);
          return (
            <g key={c.timestamp ?? i}>
              <line x1={cx} y1={yScale(c.high ?? c.close)} x2={cx} y2={yScale(c.low ?? c.close)}
                style={{ stroke: color }} strokeWidth={1} />
              <rect x={cx - cw / 2} y={bodyTop} width={cw} height={bodyH}
                style={{ fill: color, stroke: color }} strokeWidth={0.5} fillOpacity={isUp ? 0.85 : 1} />
            </g>
          );
        })}

        {/* X-axis separator + date labels */}
        <line x1={M.left} x2={chartRight} y1={M.top + MAIN_H} y2={M.top + MAIN_H}
          style={{ stroke: 'var(--border)' }} strokeWidth={0.5} />
        {/* Daty pod ostatnim panelem (wcześniej rysowane na dole panelu MACD). */}
        {dateLabels.map(({ i, label }, li) => (
          <text key={i} x={xScale(i)} y={totalH - 8} style={{ fill: 'var(--text-faint)' }} fontSize={9} textAnchor={li === 0 ? 'start' : 'middle'}>
            {label}
          </text>
        ))}

        {/* RSI Panel */}
        {showRSI && technicalData.rsi && (
          <g>
            <rect x={M.left} y={rsiTop} width={chartW} height={SUB_H} style={{ fill: 'var(--panel-2)' }} />
            <text x={M.left + 4} y={rsiTop + 12} style={{ fill: 'var(--text-dim)' }} fontSize={10} fontWeight="600">RSI (14)</text>
            {[70, 50, 30].map(lvl => (
              <g key={lvl}>
                <line x1={M.left} x2={chartRight} y1={rsiScale(lvl)} y2={rsiScale(lvl)}
                  style={{ stroke: 'var(--border)' }} strokeDasharray={lvl === 50 ? '1,4' : '3,3'} strokeWidth={0.5} />
                <text x={chartRight + 4} y={rsiScale(lvl) + 4} style={{ fill: 'var(--text-faint)' }} fontSize={9}>{lvl}</text>
              </g>
            ))}
            <path d={buildPath(visible, i => technicalData.rsi[view.start + i], xScale, rsiScale)}
              fill="none" stroke={C.rsi} strokeWidth={1.5} />
          </g>
        )}

        {/* MACD Panel */}
        {showMACD && technicalData.macd && (
          <g>
            <rect x={M.left} y={macdTop} width={chartW} height={SUB_H} style={{ fill: 'var(--panel-2)' }} />
            <text x={M.left + 4} y={macdTop + 12} style={{ fill: 'var(--text-dim)' }} fontSize={10} fontWeight="600">MACD (12,26,9)</text>
            <line x1={M.left} x2={chartRight} y1={macdScale(0)} y2={macdScale(0)}
              style={{ stroke: 'var(--border)' }} strokeWidth={0.5} />
            {visible.map((_, i) => {
              const v = technicalData.macd.histogram?.[view.start + i];
              if (v == null) return null;
              const y0 = macdScale(0);
              const y1 = macdScale(v);
              return (
                <rect key={i} x={xScale(i) - cw / 2} y={Math.min(y0, y1)}
                  width={cw} height={Math.abs(y0 - y1) || 1}
                  style={{ fill: v >= 0 ? 'var(--up)' : 'var(--down)' }} fillOpacity={0.7} />
              );
            })}
            <path d={buildPath(visible, i => technicalData.macd.macd?.[view.start + i], xScale, macdScale)}
              fill="none" stroke={C.macd} strokeWidth={1.5} />
            <path d={buildPath(visible, i => technicalData.macd.signal?.[view.start + i], xScale, macdScale)}
              fill="none" stroke={C.signal} strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* Hover tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-card-sm border border-line bg-panel p-2.5 text-[12px] shadow-pop"
          style={{
            left: tooltip.x > svgWidth / 2 ? tooltip.x - 170 : tooltip.x + 12,
            top:  Math.max(4, tooltip.y - 90),
          }}
        >
          <p className="mb-1.5 font-semibold text-fg">
            {tooltip.candle.date}{tooltip.candle.time ? ` ${tooltip.candle.time}` : ''}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums text-dim">
            <span>{t('ac_open')}</span>
            <span className="text-right text-fg">{tooltip.candle.open?.toFixed(2)}</span>
            <span>{t('ac_close')}</span>
            <span className={`text-right font-semibold ${tooltip.candle.close >= tooltip.candle.open ? 'text-up' : 'text-down'}`}>
              {tooltip.candle.close?.toFixed(2)}
            </span>
            <span>{t('ac_high')}</span>
            <span className="text-right text-fg">{(tooltip.candle.high ?? tooltip.candle.close)?.toFixed(2)}</span>
            <span>{t('ac_low')}</span>
            <span className="text-right text-fg">{(tooltip.candle.low ?? tooltip.candle.close)?.toFixed(2)}</span>
            {tooltip.rsi != null && (
              <><span>RSI</span><span className="text-right" style={{ color: C.rsi }}>{tooltip.rsi.toFixed(1)}</span></>
            )}
            {tooltip.macd != null && (
              <><span>MACD</span><span className="text-right" style={{ color: C.macd }}>{tooltip.macd.toFixed(4)}</span></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
