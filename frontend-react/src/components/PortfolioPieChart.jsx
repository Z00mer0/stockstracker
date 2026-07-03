import React, { useState } from 'react';

const COLORS = ['#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#64748b'];
const CX = 110, CY = 110, R = 90, INNER_R = 58;

function polarToXY(cx, cy, r, angleDeg) {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx, cy, r, innerR, startAngle, endAngle) {
  const s1 = polarToXY(cx, cy, r, startAngle);
  const e1 = polarToXY(cx, cy, r, endAngle);
  const s2 = polarToXY(cx, cy, innerR, endAngle);
  const e2 = polarToXY(cx, cy, innerR, startAngle);
  const large = (endAngle - startAngle) > 180 ? 1 : 0;
  return `M${s1.x},${s1.y} A${r},${r},0,${large},1,${e1.x},${e1.y} L${s2.x},${s2.y} A${innerR},${innerR},0,${large},0,${e2.x},${e2.y} Z`;
}

function fmtPLN(val) {
  if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + 'M';
  if (val >= 1_000) return (val / 1_000).toFixed(1) + 'k';
  return val.toFixed(0);
}

export default function PortfolioPieChart({ positions, totalValue, currency = 'PLN', fxRate = 1 }) {
  const [tooltip, setTooltip] = useState(null);

  const validPositions = (positions || []).filter(p => p.valuePLN > 0);
  validPositions.sort((a, b) => b.valuePLN - a.valuePLN);

  const top5 = validPositions.slice(0, 5);
  const rest = validPositions.slice(5);
  const restValue = rest.reduce((s, p) => s + p.valuePLN, 0);

  const slices = top5.map((p, i) => ({
    label: p.symbol,
    value: p.valuePLN,
    color: COLORS[i],
  }));
  if (restValue > 0) {
    slices.push({ label: 'Inne', value: restValue, color: COLORS[5] });
  }

  const total = slices.reduce((s, sl) => s + sl.value, 0);

  let cursor = 0;
  const arcs = slices.map((sl, i) => {
    const pct = sl.value / total;
    const startAngle = cursor;
    const endAngle = cursor + pct * 360;
    cursor = endAngle;
    const midAngle = (startAngle + endAngle) / 2;
    const labelPt = polarToXY(CX, CY, (R + INNER_R) / 2, midAngle);
    return { ...sl, pct, startAngle, endAngle, labelPt, i };
  });

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block', maxWidth: 220, margin: '0 auto' }}>
        {arcs.map((arc) => (
          <path
            key={arc.label}
            d={slicePath(CX, CY, R, INNER_R, arc.startAngle, arc.endAngle)}
            fill={arc.color}
            stroke="var(--panel, #1e2130)"
            strokeWidth={2}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onMouseEnter={e => setTooltip({ label: arc.label, value: arc.value, pct: arc.pct, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTooltip(null)}
          />
        ))}
        {arcs.map((arc) =>
          arc.pct > 0.05 ? (
            <text
              key={arc.label + '_lbl'}
              x={arc.labelPt.x}
              y={arc.labelPt.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#fff"
              style={{ pointerEvents: 'none', fontWeight: 600 }}
            >
              {(arc.pct * 100).toFixed(0)}%
            </text>
          ) : null
        )}
        {/* Center text */}
        <text x={CX} y={CY - 8} textAnchor="middle" fontSize={15} fontWeight="700" fill="var(--text, #e2e8f0)">
          {fmtPLN((totalValue || total) / fxRate)} {currency === 'PLN' ? 'PLN' : currency}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize={11} fill="var(--text-muted, #94a3b8)">
          Portfel
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginTop: 8 }}>
        {arcs.map((arc) => (
          <div key={arc.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: arc.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text, #e2e8f0)', fontWeight: 500 }}>{arc.label}</span>
            <span style={{ color: 'var(--text-muted, #94a3b8)', marginLeft: 'auto' }}>
              {(arc.pct * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', left: tooltip.x + 12, top: tooltip.y - 10,
          background: 'var(--panel, #1e2130)', border: '1px solid var(--border, #334155)',
          borderRadius: 8, padding: '6px 10px', fontSize: 12, pointerEvents: 'none',
          zIndex: 9999, color: 'var(--text, #e2e8f0)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}>
          <strong>{tooltip.label}</strong><br />
          {(tooltip.value / fxRate).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} {currency === 'PLN' ? 'PLN' : currency}
          &nbsp;·&nbsp;{(tooltip.pct * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
