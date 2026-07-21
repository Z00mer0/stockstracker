import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Publiczny widok portfela — tylko struktura w %, bez kwot i ilości.
// Renderowany bez logowania (route /s/:token omija AuthGate).

const COLORS = [
  '#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa',
  '#22d3ee', '#f472b6', '#fb7185', '#a3e635', '#fbbf24',
  '#c084fc', '#4ade80', '#38bdf8', '#facc15', '#fb923c',
  '#64748b',
];
const REST_COLOR = '#475569';
const CHART_TOP_N = 15;        // ile spółek trafia na wykres przed "Inne"
const LABEL_MIN_PCT = 3;       // etykiety % rysujemy tylko dla ≥3% (żeby się nie kotłowały)

function fmt(n, dec = 1) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// Etykieta % rysowana bezpośrednio na wycinku (label prop <Pie/>)
function renderSliceLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, payload }) {
  const pct = (percent ?? 0) * 100;
  if (pct < LABEL_MIN_PCT) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}>
      {payload.symbol} {pct.toFixed(pct >= 10 ? 0 : 1)}%
    </text>
  );
}

function Kpi({ label, value, tone }) {
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--text)';
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 120,
      background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

export default function SharedPortfolio() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/shared?token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(setData)
      .catch(() => setError('not_found'));
  }, [token]);

  const pieData = data ? (() => {
    const top = data.positions.slice(0, CHART_TOP_N);
    const rest = data.positions.slice(CHART_TOP_N).reduce((s, p) => s + p.pct, 0);
    return rest > 0.5 ? [...top, { symbol: 'Inne', pct: parseFloat(rest.toFixed(1)) }] : top;
  })() : [];

  const m = data?.metrics || {};

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <p style={{ fontSize: 12, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
            myfund · portfel publiczny
          </p>
          {data && <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{data.name}</h1>}
        </div>

        {error && (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 32, marginBottom: 8 }}>🔒</p>
            <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>Ten link wygasł lub został odwołany.</p>
          </div>
        )}

        {!data && !error && (
          <p style={{ textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>Ładowanie…</p>
        )}

        {data && data.positions.length === 0 && (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Portfel jest pusty.</p>
          </div>
        )}

        {data && data.positions.length > 0 && (
          <>
            {/* ── KPI tiles ─────────────────────────────────────────── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {m.plPct != null && (
                <Kpi label="Wynik" tone={m.plPct >= 0 ? 'up' : 'down'}
                  value={`${m.plPct >= 0 ? '+' : ''}${fmt(m.plPct, 1)}%`} />
              )}
              {m.moic != null && (
                <Kpi label="MOIC" value={`${fmt(m.moic, 2)}x`} />
              )}
              {m.irrPct != null && (
                <Kpi label="IRR (roczne)" tone={m.irrPct >= 0 ? 'up' : 'down'}
                  value={`${m.irrPct >= 0 ? '+' : ''}${fmt(m.irrPct, 1)}%`} />
              )}
              {m.positionsCount != null && (
                <Kpi label="Pozycji" value={String(m.positionsCount)} />
              )}
              {m.top3Pct != null && (
                <Kpi label="Top 3 udział" value={`${fmt(m.top3Pct, 1)}%`} />
              )}
              {(m.winnersCount != null || m.losersCount != null) && (
                <Kpi label="Zielone / Czerwone"
                  value={
                    <span>
                      <span style={{ color: 'var(--up)' }}>{m.winnersCount ?? 0}</span>
                      <span style={{ color: 'var(--text-faint)', margin: '0 4px' }}>/</span>
                      <span style={{ color: 'var(--down)' }}>{m.losersCount ?? 0}</span>
                    </span>
                  } />
              )}
              {m.best && (
                <Kpi label="Najlepsza" tone="up"
                  value={<><span style={{ fontSize: 13 }}>{m.best.symbol}</span>{' '}<span>{m.best.plPct >= 0 ? '+' : ''}{fmt(m.best.plPct, 1)}%</span></>} />
              )}
              {m.worst && (
                <Kpi label="Najsłabsza" tone="down"
                  value={<><span style={{ fontSize: 13 }}>{m.worst.symbol}</span>{' '}<span>{m.worst.plPct >= 0 ? '+' : ''}{fmt(m.worst.plPct, 1)}%</span></>} />
              )}
            </div>

            {/* ── Chart + table ─────────────────────────────────────── */}
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', overflow: 'hidden' }}>
              <div style={{ width: '100%', height: 320, padding: '16px 0 0' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="pct" nameKey="symbol"
                      innerRadius="45%" outerRadius="88%"
                      paddingAngle={1.2} strokeWidth={0} isAnimationActive={false}
                      label={renderSliceLabel} labelLine={false}>
                      {pieData.map((p, i) => (
                        <Cell key={p.symbol} fill={p.symbol === 'Inne' ? REST_COLOR : COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      formatter={(v, name) => [`${fmt(v)}%`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Pozycja', 'Udział', 'Wynik'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 16px', fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.positions.map((p, i) => (
                    <tr key={p.symbol} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '9px 16px', fontWeight: 600 }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: i < CHART_TOP_N ? COLORS[i % COLORS.length] : REST_COLOR, marginRight: 8, verticalAlign: 'baseline' }} />
                        {p.symbol}
                      </td>
                      <td className="mono" style={{ padding: '9px 16px', textAlign: 'right' }}>{fmt(p.pct)}%</td>
                      <td className="mono" style={{ padding: '9px 16px', textAlign: 'right', color: p.plPct == null ? 'var(--text-faint)' : p.plPct >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                        {p.plPct == null ? '—' : `${p.plPct >= 0 ? '+' : ''}${fmt(p.plPct)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', marginTop: 16, lineHeight: 1.6 }}>
          Widok pokazuje wyłącznie strukturę portfela w procentach — bez kwot i liczby akcji.
          <br />
          <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Prowadź własny portfel w myfund →</a>
        </p>
      </div>
    </div>
  );
}
