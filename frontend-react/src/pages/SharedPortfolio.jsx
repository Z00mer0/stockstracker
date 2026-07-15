import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Publiczny widok portfela — tylko struktura w %, bez kwot i ilości.
// Renderowany bez logowania (route /s/:token omija AuthGate).

const COLORS = ['#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#22d3ee', '#f472b6', '#64748b'];

function fmt(n, dec = 1) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
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
    const top = data.positions.slice(0, 7);
    const rest = data.positions.slice(7).reduce((s, p) => s + p.pct, 0);
    return rest > 0 ? [...top, { symbol: 'Inne', pct: parseFloat(rest.toFixed(1)) }] : top;
  })() : [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
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

        {data && (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', overflow: 'hidden' }}>
            {data.positions.length === 0 ? (
              <p style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>Portfel jest pusty.</p>
            ) : (
              <>
                <div style={{ width: '100%', height: 240, padding: '16px 0 0' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="pct" nameKey="symbol" innerRadius="55%" outerRadius="85%"
                        paddingAngle={2} strokeWidth={0} isAnimationActive={false}>
                        {pieData.map((p, i) => (
                          <Cell key={p.symbol} fill={COLORS[i % COLORS.length]} />
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
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: i < 7 ? COLORS[i] : COLORS[7], marginRight: 8, verticalAlign: 'baseline' }} />
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
              </>
            )}
          </div>
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
