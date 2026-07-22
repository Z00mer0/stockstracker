import React from 'react';

function MiniSparkline({ data, width = 62, height = 24, up = true }) {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const range = mx - mn || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - mn) / range) * height;
    return `${x},${y}`;
  });
  const color = up ? 'var(--up)' : 'var(--down)';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ flexShrink: 0 }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

export default function KpiPro({ label, value, chip, chipUp, sub, subWrap, icon, spark, sparkUp, hero, tone, onClick }) {
  const chipClass = chipUp === true ? 'up' : chipUp === false ? 'down' : 'neutral';
  const valueClass = tone === 'up' ? ' up' : tone === 'down' ? ' down' : '';
  return (
    <div className={'kpi-pro' + (hero ? ' hero' : '') + (onClick ? ' clickable' : '')} onClick={onClick}>
      <div className="kp-top">
        <span className="kp-label">{label}</span>
        {icon && <span className="kp-ico">{icon}</span>}
      </div>
      <div className={'kp-value' + valueClass}>{value}</div>
      <div className="kp-foot">
        <div className={'kp-sub' + (subWrap ? ' wrap' : '')} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {chip != null && (
            <span className={'chip-sm ' + chipClass}>{chip}</span>
          )}
          {sub && <span>{sub}</span>}
        </div>
        {spark && spark.length >= 2 && (
          <MiniSparkline data={spark} up={sparkUp !== false} />
        )}
      </div>
    </div>
  );
}
