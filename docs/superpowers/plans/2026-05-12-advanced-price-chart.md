# Advanced Price Chart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać interaktywny modal z wykresem świecowym + wskaźnikami technicznymi, otwierany z Portfolio, Watchlist i Dashboard.

**Architecture:** Custom SVG candlestick chart z viewport-based zoom/pan (viewStart/viewEnd indeksy). Dane historyczne z Yahoo Finance przez istniejący `/api/proxy`. Modal zarządzany przez `ChartContext` — każda strona woła `openChart(symbol)`.

**Tech Stack:** React 18, Tailwind CSS, custom SVG (bez bibliotek wykresów), Axios via `/api/proxy`, localStorage cache 5 min.

---

## File Map

| Plik | Akcja | Odpowiedzialność |
|------|-------|-----------------|
| `src/hooks/useTechnicalIndicators.js` | Utwórz | Czyste funkcje MA/EMA/RSI/MACD/BB + hook |
| `src/hooks/usePriceHistory.js` | Utwórz | Fetch Yahoo Finance via proxy + cache |
| `src/components/CandlestickChart.jsx` | Utwórz | SVG rendering: świece, overlaye, osie, tooltip, zoom/pan |
| `src/components/IndicatorPanel.jsx` | Utwórz | Toggle przyciski wskaźników |
| `src/components/AdvancedPriceChart.jsx` | Utwórz | Modal: period selector, assembles chart |
| `src/context/ChartContext.jsx` | Utwórz | openChart(symbol) provider + renderuje modal |
| `src/App.jsx` | Modyfikuj | Owrap `<ChartProvider>` |
| `src/pages/Dashboard.jsx` | Modyfikuj | Klik na symbol → openChart |
| `src/pages/Portfolio.jsx` | Modyfikuj | Klik na symbol → openChart |
| `src/pages/Watchlist.jsx` | Modyfikuj | Klik na symbol → openChart |

---

## Task 1: useTechnicalIndicators.js

**Files:**
- Create: `src/hooks/useTechnicalIndicators.js`

- [ ] **Krok 1: Utwórz plik z czystymi funkcjami obliczeniowymi**

```js
// src/hooks/useTechnicalIndicators.js
import { useMemo } from 'react';

function calcMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const result = new Array(values.length).fill(null);
  let ema = null;
  let seedCount = 0;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || isNaN(v)) continue;
    if (ema == null) {
      seedCount++;
      seedSum += v;
      if (seedCount === period) {
        ema = seedSum / period;
        result[i] = ema;
      }
    } else {
      ema = v * k + ema * (1 - k);
      result[i] = ema;
    }
  }
  return result;
}

function calcRSI(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  }
  return result;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null
  );
  const signalLine = calcEMA(macdLine, 9);
  const histogram = closes.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

function calcBollingerBands(closes, period = 20, mult = 2) {
  const middle = calcMA(closes, period);
  return closes.map((_, i) => {
    if (middle[i] == null) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd };
  });
}

export function useTechnicalIndicators(candles) {
  return useMemo(() => {
    if (!candles.length) return { ma20: [], ma50: [], ema: [], rsi: [], macd: null, bb: [] };
    const closes = candles.map(c => c.close);
    return {
      ma20: calcMA(closes, 20),
      ma50: calcMA(closes, 50),
      ema:  calcEMA(closes, 21),
      rsi:  calcRSI(closes, 14),
      macd: calcMACD(closes),
      bb:   calcBollingerBands(closes),
    };
  }, [candles]);
}
```

- [ ] **Krok 2: Zweryfikuj w konsoli (opcjonalne ręczne sprawdzenie)**

Otwórz DevTools Console i sprawdź manualnie:
```js
// Skopiuj funkcje calcMA, calcRSI i przetestuj:
const closes = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109,
                110, 112, 111, 113, 115, 114, 116, 118, 117, 119, 120];
// calcMA(closes, 20) powinno zwrócić null x19, potem ~109 na idx 19
// calcRSI(closes, 14) powinno zwrócić null x14, potem ~100 (same trend up)
```

- [ ] **Krok 3: Commit**

```bash
git add src/hooks/useTechnicalIndicators.js
git commit -m "feat: dodaj hook useTechnicalIndicators (MA/EMA/RSI/MACD/BB)"
```

---

## Task 2: usePriceHistory.js

**Files:**
- Create: `src/hooks/usePriceHistory.js`

- [ ] **Krok 1: Utwórz hook z fetch + cache**

```js
// src/hooks/usePriceHistory.js
import { useState, useEffect } from 'react';
import { api } from './useApi';

const CACHE_TTL = 5 * 60 * 1000;

const PERIOD_MAP = {
  '1D':  { range: '1d',  interval: '5m'  },
  '1W':  { range: '5d',  interval: '15m' },
  '1M':  { range: '1mo', interval: '1d'  },
  '3M':  { range: '3mo', interval: '1d'  },
  '6M':  { range: '6mo', interval: '1d'  },
  '1Y':  { range: '1y',  interval: '1d'  },
  'ALL': { range: 'max', interval: '1wk' },
};

function getCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

function parseYF(raw) {
  const result = raw?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  return timestamps.map((ts, i) => ({
    date:      new Date(ts * 1000).toISOString().slice(0, 10),
    timestamp: ts,
    open:   q.open?.[i]   ?? null,
    high:   q.high?.[i]   ?? null,
    low:    q.low?.[i]    ?? null,
    close:  q.close?.[i]  ?? null,
    volume: q.volume?.[i] ?? null,
  })).filter(c => c.open != null && c.close != null && !isNaN(c.close));
}

export function usePriceHistory(symbol, period) {
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!symbol || !period) return;
    const key = `chart_${symbol}_${period}`;
    const cached = getCached(key);
    if (cached) { setCandles(cached); return; }

    const { range, interval } = PERIOD_MAP[period];
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const proxyUrl = `/api/proxy?url=${encodeURIComponent(yfUrl)}`;

    setLoading(true);
    setError(null);
    setCandles([]);
    api.get(proxyUrl)
      .then(res => {
        const data = parseYF(res.data);
        setCache(key, data);
        setCandles(data);
      })
      .catch(err => setError(err.response?.data?.error ?? err.message))
      .finally(() => setLoading(false));
  }, [symbol, period]);

  return { candles, loading, error };
}
```

- [ ] **Krok 2: Sprawdź w przeglądarce (ręcznie)**

Z DevTools Network sprawdź że po otwarciu modal dla "AAPL" / "3M" pojawia się request do `/api/proxy?url=https%3A%2F%2Fquery1...` i zwraca JSON z polami `chart.result[0].timestamp` i `chart.result[0].indicators.quote`.

- [ ] **Krok 3: Commit**

```bash
git add src/hooks/usePriceHistory.js
git commit -m "feat: dodaj hook usePriceHistory (Yahoo Finance via proxy, cache 5min)"
```

---

## Task 3: CandlestickChart.jsx

**Files:**
- Create: `src/components/CandlestickChart.jsx`

- [ ] **Krok 1: Utwórz komponent**

```jsx
// src/components/CandlestickChart.jsx
import React, { useRef, useState, useEffect, useCallback } from 'react';

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
              stroke="#334155" strokeDasharray="3,3" strokeWidth={0.5} />
            <text x={chartRight + 4} y={y + 4} fill="#64748b" fontSize={10} textAnchor="start">
              {v >= 1000 ? v.toFixed(0) : v.toFixed(2)}
            </text>
          </g>
        );
      })}
    </>
  );
}

export default function CandlestickChart({ candles, indicators, technicalData, onCandleClick }) {
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

  // Init view
  useEffect(() => {
    if (!candles.length) return;
    const count = Math.min(80, candles.length);
    setView({ start: candles.length - count, end: candles.length });
  }, [candles.length]);

  // Wheel zoom (passive:false)
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
  const count   = visible.length || 1;
  const cw      = Math.max(2, Math.floor(chartW / count) - 1);
  const xScale  = (i) => M.left + i * (cw + 1) + cw / 2;

  // Price Y range (include BB)
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

  // MACD Y scale
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

  // X-axis labels
  const labelStep = Math.max(1, Math.floor(visible.length / 7));
  const dateLabels = visible.map((c, i) => ({ i, date: c.date })).filter((_, i) => i % labelStep === 0);

  const chartRight = svgWidth - M.right;

  return (
    <div ref={containerRef} className="w-full relative select-none" style={{ cursor: dragRef.current ? 'grabbing' : 'crosshair' }}>
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
        {/* Main chart Y-axis */}
        <YAxis min={priceMin} max={priceMax} height={MAIN_H} top={M.top} chartRight={chartRight} />

        {/* Bollinger Bands */}
        {showBB && technicalData.bb && (() => {
          const pts = visible.map((_, i) => {
            const bb = technicalData.bb[view.start + i];
            return bb?.upper != null ? { x: xScale(i), up: yScale(bb.upper), lo: yScale(bb.lower) } : null;
          }).filter(Boolean);
          if (pts.length < 2) return null;
          const upPath = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.up}`).join(' ');
          const loPath = [...pts].reverse().map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.lo}`).join(' ');
          const loLine = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.lo}`).join(' ');
          return (
            <g>
              <path d={`${upPath} ${loPath} Z`} fill="#6366f1" fillOpacity={0.07} />
              <path d={upPath} fill="none" stroke="#6366f1" strokeWidth={1} strokeOpacity={0.4} />
              <path d={loLine} fill="none" stroke="#6366f1" strokeWidth={1} strokeOpacity={0.4} />
            </g>
          );
        })()}

        {/* MA20 */}
        {showMA20 && technicalData.ma20 && (
          <path d={buildPath(visible, i => technicalData.ma20[view.start + i], xScale, yScale)}
            fill="none" stroke="#eab308" strokeWidth={1.5} />
        )}
        {/* MA50 */}
        {showMA50 && technicalData.ma50 && (
          <path d={buildPath(visible, i => technicalData.ma50[view.start + i], xScale, yScale)}
            fill="none" stroke="#f97316" strokeWidth={1.5} />
        )}
        {/* EMA21 */}
        {showEMA && technicalData.ema && (
          <path d={buildPath(visible, i => technicalData.ema[view.start + i], xScale, yScale)}
            fill="none" stroke="#3b82f6" strokeWidth={1.5} />
        )}

        {/* Candlesticks */}
        {visible.map((c, i) => {
          const isUp    = c.close >= c.open;
          const color   = isUp ? '#10b981' : '#f43f5e';
          const bodyTop = yScale(Math.max(c.open, c.close));
          const bodyBot = yScale(Math.min(c.open, c.close));
          const bodyH   = Math.max(1, bodyBot - bodyTop);
          const cx      = xScale(i);
          return (
            <g key={c.timestamp ?? i}>
              <line x1={cx} y1={yScale(c.high ?? c.close)} x2={cx} y2={yScale(c.low ?? c.close)}
                stroke={color} strokeWidth={1} />
              <rect x={cx - cw / 2} y={bodyTop} width={cw} height={bodyH}
                fill={color} stroke={color} strokeWidth={0.5} fillOpacity={isUp ? 0.85 : 1} />
            </g>
          );
        })}

        {/* X-axis line + labels */}
        <line x1={M.left} x2={chartRight} y1={M.top + MAIN_H} y2={M.top + MAIN_H}
          stroke="#334155" strokeWidth={0.5} />
        {dateLabels.map(({ i, date }) => (
          <text key={i} x={xScale(i)} y={xAxisY - 8} fill="#64748b" fontSize={9} textAnchor="middle">
            {date.slice(5)}
          </text>
        ))}

        {/* RSI Panel */}
        {showRSI && technicalData.rsi && (
          <g>
            <rect x={M.left} y={rsiTop} width={chartW} height={SUB_H} fill="#0f172a" fillOpacity={0.3} />
            <text x={M.left + 4} y={rsiTop + 12} fill="#94a3b8" fontSize={10} fontWeight="600">RSI (14)</text>
            {[70, 50, 30].map(lvl => (
              <g key={lvl}>
                <line x1={M.left} x2={chartRight} y1={rsiScale(lvl)} y2={rsiScale(lvl)}
                  stroke="#334155" strokeDasharray={lvl === 50 ? '1,4' : '3,3'} strokeWidth={0.5} />
                <text x={chartRight + 4} y={rsiScale(lvl) + 4} fill="#64748b" fontSize={9}>{lvl}</text>
              </g>
            ))}
            <path d={buildPath(visible, i => technicalData.rsi[view.start + i], xScale, rsiScale)}
              fill="none" stroke="#a855f7" strokeWidth={1.5} />
          </g>
        )}

        {/* MACD Panel */}
        {showMACD && technicalData.macd && (
          <g>
            <rect x={M.left} y={macdTop} width={chartW} height={SUB_H} fill="#0f172a" fillOpacity={0.3} />
            <text x={M.left + 4} y={macdTop + 12} fill="#94a3b8" fontSize={10} fontWeight="600">MACD (12,26,9)</text>
            <line x1={M.left} x2={chartRight} y1={macdScale(0)} y2={macdScale(0)} stroke="#334155" strokeWidth={0.5} />
            {visible.map((_, i) => {
              const v = technicalData.macd.histogram?.[view.start + i];
              if (v == null) return null;
              const y0 = macdScale(0);
              const y1 = macdScale(v);
              return (
                <rect key={i} x={xScale(i) - cw / 2} y={Math.min(y0, y1)}
                  width={cw} height={Math.abs(y0 - y1) || 1}
                  fill={v >= 0 ? '#10b981' : '#f43f5e'} fillOpacity={0.7} />
              );
            })}
            <path d={buildPath(visible, i => technicalData.macd.macd?.[view.start + i], xScale, macdScale)}
              fill="none" stroke="#3b82f6" strokeWidth={1.5} />
            <path d={buildPath(visible, i => technicalData.macd.signal?.[view.start + i], xScale, macdScale)}
              fill="none" stroke="#f97316" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 bg-slate-900 border border-slate-600 rounded-lg p-2.5 text-xs pointer-events-none shadow-xl"
          style={{
            left: tooltip.x > svgWidth / 2 ? tooltip.x - 170 : tooltip.x + 12,
            top:  Math.max(4, tooltip.y - 90),
          }}
        >
          <p className="font-semibold text-slate-200 mb-1.5">{tooltip.candle.date}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400">
            <span>Otwarcie</span>
            <span className="text-slate-200 text-right">{tooltip.candle.open?.toFixed(2)}</span>
            <span>Zamknięcie</span>
            <span className={`text-right font-medium ${tooltip.candle.close >= tooltip.candle.open ? 'text-emerald-400' : 'text-rose-400'}`}>
              {tooltip.candle.close?.toFixed(2)}
            </span>
            <span>Max</span>
            <span className="text-slate-200 text-right">{(tooltip.candle.high ?? tooltip.candle.close)?.toFixed(2)}</span>
            <span>Min</span>
            <span className="text-slate-200 text-right">{(tooltip.candle.low ?? tooltip.candle.close)?.toFixed(2)}</span>
            {tooltip.rsi != null && (
              <><span>RSI</span><span className="text-purple-400 text-right">{tooltip.rsi.toFixed(1)}</span></>
            )}
            {tooltip.macd != null && (
              <><span>MACD</span><span className="text-blue-400 text-right">{tooltip.macd.toFixed(4)}</span></>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Krok 2: Commit**

```bash
git add src/components/CandlestickChart.jsx
git commit -m "feat: CandlestickChart — SVG świece, MA/EMA/BB/RSI/MACD, zoom/pan, tooltip"
```

---

## Task 4: IndicatorPanel.jsx

**Files:**
- Create: `src/components/IndicatorPanel.jsx`

- [ ] **Krok 1: Utwórz komponent**

```jsx
// src/components/IndicatorPanel.jsx
import React from 'react';

const ITEMS = [
  { key: 'showMA20', label: 'MA 20',     color: '#eab308' },
  { key: 'showMA50', label: 'MA 50',     color: '#f97316' },
  { key: 'showEMA',  label: 'EMA 21',    color: '#3b82f6' },
  { key: 'showBB',   label: 'Bollinger', color: '#6366f1' },
  { key: 'showRSI',  label: 'RSI',       color: '#a855f7' },
  { key: 'showMACD', label: 'MACD',      color: '#10b981' },
];

export default function IndicatorPanel({ indicators, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ITEMS.map(({ key, label, color }) => {
        const active = indicators[key];
        return (
          <button
            key={key}
            onClick={() => onChange(prev => ({ ...prev, [key]: !prev[key] }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              active
                ? 'border-transparent text-white'
                : 'border-slate-600 text-slate-400 bg-transparent hover:border-slate-500'
            }`}
            style={active ? { backgroundColor: color } : {}}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Krok 2: Commit**

```bash
git add src/components/IndicatorPanel.jsx
git commit -m "feat: IndicatorPanel — toggle przyciski wskaźników"
```

---

## Task 5: AdvancedPriceChart.jsx + ChartContext.jsx

**Files:**
- Create: `src/components/AdvancedPriceChart.jsx`
- Create: `src/context/ChartContext.jsx`

- [ ] **Krok 1: Utwórz AdvancedPriceChart.jsx**

```jsx
// src/components/AdvancedPriceChart.jsx
import React, { useState, useEffect } from 'react';
import CandlestickChart from './CandlestickChart';
import IndicatorPanel from './IndicatorPanel';
import { usePriceHistory } from '../hooks/usePriceHistory';
import { useTechnicalIndicators } from '../hooks/useTechnicalIndicators';

const PERIODS = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

const DEFAULT_IND = {
  showMA20: true,
  showMA50: false,
  showEMA:  false,
  showBB:   false,
  showRSI:  false,
  showMACD: false,
};

export default function AdvancedPriceChart({ symbol, onClose }) {
  const [period, setPeriod]         = useState('3M');
  const [indicators, setIndicators] = useState(DEFAULT_IND);
  const [selectedCandle, setSelectedCandle] = useState(null);

  const { candles, loading, error } = usePriceHistory(symbol, period);
  const technicalData               = useTechnicalIndicators(candles);

  // Zamknij na Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  function downloadCSV() {
    const header = 'Data,Otwarcie,Maksimum,Minimum,Zamknięcie,Wolumen';
    const rows   = candles.map(c => `${c.date},${c.open},${c.high},${c.low},${c.close},${c.volume}`);
    const blob   = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href = url; a.download = `${symbol}_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-5xl bg-slate-800 rounded-2xl border border-slate-700 flex flex-col max-h-[92vh] shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{symbol}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Wykres świecowy · scroll = zoom · przeciągnij = pan</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSV}
              disabled={!candles.length}
              className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 px-3 py-1.5 rounded-lg border border-slate-600 hover:border-slate-500 transition-colors"
            >
              Pobierz CSV
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-700 text-lg"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-slate-700 shrink-0">
          {PERIODS.map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setSelectedCandle(null); }}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                period === p
                  ? 'bg-indigo-500 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Indicator toggles */}
        <div className="px-5 py-3 border-b border-slate-700 shrink-0">
          <IndicatorPanel indicators={indicators} onChange={setIndicators} />
        </div>

        {/* Chart */}
        <div className="flex-1 overflow-auto px-3 py-3 min-h-0">
          {loading && (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          )}
          {error && (
            <div className="text-center py-16">
              <p className="text-rose-400 font-medium">Błąd ładowania danych</p>
              <p className="text-sm text-rose-300 mt-1">{error}</p>
            </div>
          )}
          {!loading && !error && candles.length > 0 && (
            <CandlestickChart
              candles={candles}
              indicators={indicators}
              technicalData={technicalData}
              onCandleClick={setSelectedCandle}
            />
          )}
          {!loading && !error && candles.length === 0 && (
            <div className="text-center py-16 text-slate-500">
              Brak danych historycznych dla <span className="font-semibold text-slate-400">{symbol}</span>
            </div>
          )}
        </div>

        {/* Selected candle details */}
        {selectedCandle && (
          <div className="px-5 py-3 border-t border-slate-700 bg-slate-900/60 shrink-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-400">Szczegóły dnia: {selectedCandle.date}</p>
              <button onClick={() => setSelectedCandle(null)} className="text-slate-500 hover:text-slate-300 text-sm">✕</button>
            </div>
            <div className="flex flex-wrap gap-6">
              {[
                ['Otwarcie', selectedCandle.open, ''],
                ['Max', selectedCandle.high ?? selectedCandle.close, ''],
                ['Min', selectedCandle.low ?? selectedCandle.close, ''],
                ['Zamknięcie', selectedCandle.close, selectedCandle.close >= selectedCandle.open ? 'text-emerald-400' : 'text-rose-400'],
              ].map(([lbl, val, cls]) => (
                <div key={lbl}>
                  <span className="text-xs text-slate-500">{lbl} </span>
                  <span className={`text-sm font-semibold ${cls || 'text-slate-200'}`}>{val?.toFixed(2)}</span>
                </div>
              ))}
              {selectedCandle.volume != null && (
                <div>
                  <span className="text-xs text-slate-500">Wolumen </span>
                  <span className="text-sm font-semibold text-slate-300">
                    {(selectedCandle.volume / 1_000_000).toFixed(2)}M
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Krok 2: Utwórz ChartContext.jsx**

```jsx
// src/context/ChartContext.jsx
import React, { createContext, useContext, useState } from 'react';
import AdvancedPriceChart from '../components/AdvancedPriceChart';

const ChartContext = createContext(null);

export function ChartProvider({ children }) {
  const [symbol, setSymbol] = useState(null);

  return (
    <ChartContext.Provider value={{ openChart: setSymbol }}>
      {children}
      {symbol && (
        <AdvancedPriceChart symbol={symbol} onClose={() => setSymbol(null)} />
      )}
    </ChartContext.Provider>
  );
}

export function useChart() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error('useChart musi być użyty wewnątrz ChartProvider');
  return ctx;
}
```

- [ ] **Krok 3: Commit**

```bash
git add src/components/AdvancedPriceChart.jsx src/context/ChartContext.jsx
git commit -m "feat: AdvancedPriceChart modal + ChartContext provider"
```

---

## Task 6: Wire up — App.jsx + strony

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/pages/Portfolio.jsx`
- Modify: `src/pages/Dashboard.jsx`
- Modify: `src/pages/Watchlist.jsx`

- [ ] **Krok 1: Dodaj ChartProvider do App.jsx**

W `src/App.jsx` dodaj import i owrap `<AppRoutes />`:

```jsx
// Dodaj import na górze:
import { ChartProvider } from './context/ChartContext';

// Zmień export default function App():
export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AppProvider>
        <ChartProvider>
          <AppRoutes />
        </ChartProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Krok 2: Dodaj trigger w Portfolio.jsx**

W `src/pages/Portfolio.jsx`:

```jsx
// Dodaj import:
import { useChart } from '../context/ChartContext';

// Wewnątrz komponentu Portfolio dodaj:
const { openChart } = useChart();

// Znajdź komórkę z symbolem spółki i zamień na klikalną:
// Przed (linia ~ok. 60-80, szukaj pierwszego <td> w tbody z symbolem):
<td className="px-5 py-3 font-bold text-slate-100">
  {p.symbol}
  ...
</td>

// Po:
<td
  className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
  onClick={() => openChart(p.symbol)}
  title={`Otwórz wykres ${p.symbol}`}
>
  {p.symbol}
  {p.name && p.name !== p.symbol && (
    <span className="ml-2 text-xs text-slate-500 font-normal">{p.name}</span>
  )}
</td>
```

- [ ] **Krok 3: Dodaj trigger w Dashboard.jsx**

W `src/pages/Dashboard.jsx`:

```jsx
// Dodaj import:
import { useChart } from '../context/ChartContext';

// Wewnątrz komponentu Dashboard dodaj:
const { openChart } = useChart();

// Znajdź komórkę symbolu w topPositions (linia ~141) i zamień:
// Przed:
<td className="px-5 py-3 font-bold text-slate-100">
  {pos.symbol}
  {pos.name && pos.name !== pos.symbol && (
    <span className="ml-2 text-xs text-slate-500 font-normal">{pos.name}</span>
  )}
</td>

// Po:
<td
  className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
  onClick={() => openChart(pos.symbol)}
  title={`Otwórz wykres ${pos.symbol}`}
>
  {pos.symbol}
  {pos.name && pos.name !== pos.symbol && (
    <span className="ml-2 text-xs text-slate-500 font-normal">{pos.name}</span>
  )}
</td>
```

- [ ] **Krok 4: Dodaj trigger w Watchlist.jsx**

W `src/pages/Watchlist.jsx`:

```jsx
// Dodaj import:
import { useChart } from '../context/ChartContext';

// Wewnątrz komponentu Watchlist dodaj:
const { openChart } = useChart();

// Znajdź komórkę symbolu w tabeli watchlist i zamień (szukaj <td> z item.symbol):
// Przed:
<td className="px-5 py-3 font-mono font-semibold text-slate-100">{item.symbol}</td>

// Po:
<td
  className="px-5 py-3 font-mono font-semibold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
  onClick={() => openChart(item.symbol)}
  title={`Otwórz wykres ${item.symbol}`}
>
  {item.symbol}
</td>
```

- [ ] **Krok 5: Uruchom dev server i przetestuj**

```bash
cd frontend-react && npm run start
```

Sprawdź:
1. Klik na symbol w Portfolio → otwiera modal
2. Klik na symbol w Dashboard → otwiera modal
3. Klik na symbol w Watchlist → otwiera modal
4. Period selector (1M, 3M, 1Y) przełącza dane
5. Toggle wskaźników (MA20, RSI, MACD)
6. Scroll wheel → zoom
7. Przeciągnij → pan
8. Hover → tooltip
9. Klik na świecę → szczegóły w stopce
10. Pobierz CSV → plik do pobrania
11. Escape lub klik tła → zamknięcie

- [ ] **Krok 6: Commit końcowy**

```bash
git add src/App.jsx src/pages/Portfolio.jsx src/pages/Dashboard.jsx src/pages/Watchlist.jsx
git commit -m "feat: wire up openChart() w Portfolio, Dashboard, Watchlist"
```

---

## Spec Coverage Check

| Wymaganie | Task |
|-----------|------|
| Świece zielone/czerwone + wick | Task 3 CandlestickChart |
| MA20 żółta, MA50 pomarańczowa, EMA niebieska | Task 3 |
| RSI panel pod chartem | Task 3 |
| MACD osobny panel z histogram | Task 3 |
| Bollinger Bands na main chart | Task 3 |
| Zoom scroll wheel | Task 3 handleWheel |
| Pan drag | Task 3 handleMouseMove |
| Hover tooltip | Task 3 tooltip state |
| Klik na świecę: szczegóły | Task 5 selectedCandle |
| Legend toggle | Task 4 IndicatorPanel |
| Period selector 1D–ALL | Task 5 PERIODS |
| Download data CSV | Task 5 downloadCSV |
| Fetch z /api/proxy → Yahoo Finance | Task 2 usePriceHistory |
| Cache localStorage 5 min | Task 2 getCached/setCache |
| Modal z Portfolio, Watchlist, Dashboard | Task 6 |
| Escape zamyka | Task 5 useEffect keydown |
| Dark mode | Tailwind slate kolory przez cały czas |
| Mobile responsive | max-w-5xl + overflow-auto |
