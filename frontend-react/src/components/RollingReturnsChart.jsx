import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';

const M = { top: 10, right: 56, bottom: 28, left: 10 };
const H = 190;

function calcRolling(snapshots, windowDays) {
  return snapshots.map((s, i) => {
    const target = new Date(s.date);
    target.setDate(target.getDate() - windowDays);
    const targetStr = target.toISOString().slice(0, 10);
    let past = null;
    for (let j = i - 1; j >= 0; j--) {
      if (snapshots[j].date <= targetStr) { past = snapshots[j]; break; }
    }
    if (!past || !(past.total > 0) || !(s.total > 0)) return null;
    const actualDays = (new Date(s.date) - new Date(past.date)) / 86400000;
    if (actualDays < windowDays * 0.5) return null;
    return (s.total / past.total - 1) * 100;
  });
}

const DISPLAY_PERIODS_KEYS = [
  { key: '1Y', pl: '1R',    en: '1Y',  days: 365  },
  { key: '2Y', pl: '2 lata', en: '2Y', days: 730 },
  { key: 'MAX', pl: 'MAX',  en: 'MAX', days: null },
];

export default function RollingReturnsChart({ data }) {
  const { locale } = useLanguage();
  const DISPLAY_PERIODS = DISPLAY_PERIODS_KEYS.map(p => ({ ...p, label: locale === 'pl-PL' ? p.pl : p.en }));

  function fmtXDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return new Date(+y, +m - 1, +d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: '2-digit' });
  }

  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const [svgWidth, setSvgWidth]       = useState(800);
  const [tooltip, setTooltip]         = useState(null);
  const [displayPeriod, setDisplayPeriod] = useState('MAX');

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setSvgWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Rolling computed on FULL data (lookback needs full history)
  const rolling3m = useMemo(() => calcRolling(data, 90),  [data]);
  const rolling6m = useMemo(() => calcRolling(data, 180), [data]);

  // Indices to display (subset of full array)
  const displayIndices = useMemo(() => {
    const p = DISPLAY_PERIODS.find(p => p.key === displayPeriod);
    if (!p?.days) return data.map((_, i) => i);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return data.map((_, i) => i).filter(i => data[i].date >= cutStr);
  }, [data, displayPeriod]);

  const dispData = displayIndices.map(i => data[i]);
  const disp3m   = displayIndices.map(i => rolling3m[i]);
  const disp6m   = displayIndices.map(i => rolling6m[i]);

  const has3m = disp3m.some(v => v != null);
  const has6m = disp6m.some(v => v != null);

  if (data.length < 10) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '32px 0' }}>
        Niewystarczająca historia — dodaj więcej snapshots (min. 10)
      </p>
    );
  }

  const chartW = svgWidth - M.right - M.left;
  const totalH = H + M.top + M.bottom;
  const n      = dispData.length;

  const allVals = [...disp3m, ...disp6m, 0].filter(v => v != null);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  const pad    = Math.max((rawMax - rawMin) * 0.1, 1);
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const range  = maxVal - minVal || 1;

  const xScale = (i) => M.left + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
  const yScale = (v) => M.top + H - ((v - minVal) / range) * H;
  const zeroY  = yScale(0);

  function buildPath(values) {
    const parts = [];
    let movePending = true;
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) { movePending = true; continue; }
      parts.push(`${movePending ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(values[i]).toFixed(1)}`);
      movePending = false;
    }
    return parts.join(' ');
  }

  const path3m = has3m ? buildPath(disp3m) : null;
  const path6m = has6m ? buildPath(disp6m) : null;

  const tickCount = 5;
  const tickStep  = (maxVal - minVal) / (tickCount - 1);
  const yTicks    = Array.from({ length: tickCount }, (_, i) => minVal + i * tickStep);

  const labelStep  = Math.max(1, Math.floor(n / 7));
  const dateLabels = dispData
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % labelStep === 0 || i === n - 1);

  function handleMouseMove(e) {
    if (!svgRef.current || n < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mx   = e.clientX - rect.left - M.left;
    const idx  = Math.max(0, Math.min(n - 1, Math.round((mx / chartW) * (n - 1))));
    setTooltip({
      x:       xScale(idx),
      screenX: e.clientX - rect.left,
      y:       e.clientY - rect.top,
      date:    dispData[idx].date,
      v3m:     disp3m[idx],
      v6m:     disp6m[idx],
    });
  }

  return (
    <div>
      {/* period selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {DISPLAY_PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setDisplayPeriod(p.key)}
            style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 6, cursor: 'pointer',
              border: '1px solid',
              borderColor: displayPeriod === p.key ? 'var(--accent)' : 'var(--border)',
              background: displayPeriod === p.key ? 'var(--accent)' : 'var(--panel-2)',
              color: displayPeriod === p.key ? '#fff' : 'var(--text-dim)',
              fontWeight: displayPeriod === p.key ? 600 : 400,
            }}
          >{p.label}</button>
        ))}
      </div>

      <div ref={containerRef} style={{ width: '100%', position: 'relative', userSelect: 'none', cursor: 'crosshair' }}>
        <svg ref={svgRef} width={svgWidth} height={totalH}
          onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip(null)}>

          <defs>
            <clipPath id="roll-clip">
              <rect x={M.left} y={M.top} width={chartW} height={H} />
            </clipPath>
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

          <line x1={M.left} x2={svgWidth - M.right} y1={zeroY} y2={zeroY}
            stroke="#475569" strokeWidth={1} />

          {has6m && path6m && (
            <path d={path6m} fill="none" stroke="#f59e0b"
              strokeWidth={1.5} strokeDasharray="5,3" opacity={0.85}
              clipPath="url(#roll-clip)" />
          )}

          {has3m && path3m && (
            <path d={path3m} fill="none" stroke="#38bdf8"
              strokeWidth={2} strokeLinejoin="round"
              clipPath="url(#roll-clip)" />
          )}

          {tooltip && (
            <>
              <line x1={tooltip.x} x2={tooltip.x} y1={M.top} y2={M.top + H}
                stroke="#64748b" strokeWidth={1} strokeDasharray="2,2" />
              {tooltip.v3m != null && (
                <circle cx={tooltip.x} cy={yScale(tooltip.v3m)} r={3.5}
                  fill="#38bdf8" stroke="#1e293b" strokeWidth={2} />
              )}
              {tooltip.v6m != null && (
                <circle cx={tooltip.x} cy={yScale(tooltip.v6m)} r={3.5}
                  fill="#f59e0b" stroke="#1e293b" strokeWidth={2} />
              )}
            </>
          )}

          <line x1={M.left} x2={svgWidth - M.right} y1={M.top + H} y2={M.top + H}
            stroke="#334155" strokeWidth={0.5} />

          {dateLabels.map(({ i, date }) => (
            <text key={i} x={xScale(i)} y={M.top + H + 17}
              fill="#64748b" fontSize={9} textAnchor="middle">
              {fmtXDate(date)}
            </text>
          ))}
        </svg>

        {tooltip && (
          <div style={{
            position: 'absolute', zIndex: 10,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12,
            pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            left: tooltip.screenX > svgWidth / 2 ? tooltip.screenX - 175 : tooltip.screenX + 14,
            top:  Math.max(4, tooltip.y - 52),
          }}>
            <p style={{ fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>{tooltip.date}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 16px', color: 'var(--text-faint)' }}>
              {tooltip.v3m != null && (
                <>
                  <span>Rolling 3M</span>
                  <span style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: tooltip.v3m >= 0 ? '#38bdf8' : 'var(--down)' }}>
                    {tooltip.v3m >= 0 ? '+' : ''}{tooltip.v3m.toFixed(2)}%
                  </span>
                </>
              )}
              {tooltip.v6m != null && (
                <>
                  <span>Rolling 6M</span>
                  <span style={{ textAlign: 'right', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', color: tooltip.v6m >= 0 ? '#f59e0b' : 'var(--down)' }}>
                    {tooltip.v6m >= 0 ? '+' : ''}{tooltip.v6m.toFixed(2)}%
                  </span>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 12, color: 'var(--text-faint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#38bdf8" strokeWidth="2" /></svg>
            Rolling 3M
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="4"><line x1="0" y1="2" x2="16" y2="2" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="5,3" /></svg>
            Rolling 6M
          </div>
        </div>
      </div>
    </div>
  );
}
