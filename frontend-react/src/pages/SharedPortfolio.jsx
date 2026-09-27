import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Lock, PieChart as PieIcon } from 'lucide-react';
import { useLanguage, useT } from '../context/LanguageContext';
import { Card, EmptyState, Skeleton, Stat, Table } from '../components/ui';
import { cx } from '../components/ui/cx.js';

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

export default function SharedPortfolio() {
  const { token } = useParams();
  const t = useT();
  const { locale } = useLanguage();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/shared?token=${encodeURIComponent(token)}`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(setData)
      .catch(() => setError('not_found'));
  }, [token]);

  const fmt = (n, dec = 1) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }));
  const signedPct = (n, dec = 1) => `${n >= 0 ? '+' : ''}${fmt(n, dec)}%`;

  const pieData = data ? (() => {
    const top = data.positions.slice(0, CHART_TOP_N);
    const rest = data.positions.slice(CHART_TOP_N).reduce((s, p) => s + p.pct, 0);
    return rest > 0.5 ? [...top, { symbol: t('shared_other'), pct: parseFloat(rest.toFixed(1)), rest: true }] : top;
  })() : [];

  const m = data?.metrics || {};

  return (
    <div className="min-h-screen bg-bg px-4 py-8 text-fg">
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <header className="text-center">
          <p className="text-label font-semibold uppercase tracking-[0.1em] text-faint">{t('shared_kicker')}</p>
          {data && <h1 className="mt-1 text-h1 text-fg">{data.name}</h1>}
        </header>

        {error && <Card><EmptyState icon={Lock} title={t('shared_expired')} /></Card>}

        {!data && !error && (
          <div className="grid gap-3" aria-busy="true">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-20" rounded="rounded-card" />)}</div>
            <Skeleton className="h-80" rounded="rounded-card" />
          </div>
        )}

        {data && data.positions.length === 0 && <Card><EmptyState icon={PieIcon} title={t('shared_empty')} /></Card>}

        {data && data.positions.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {m.plPct != null && <Stat label={t('shared_result')} tone={m.plPct >= 0 ? 'up' : 'down'} value={signedPct(m.plPct)} />}
              {m.moic != null && <Stat label="MOIC" value={`${fmt(m.moic, 2)}x`} />}
              {m.irrPct != null && <Stat label={t('shared_irr')} tone={m.irrPct >= 0 ? 'up' : 'down'} value={signedPct(m.irrPct)} />}
              {m.positionsCount != null && <Stat label={t('shared_positions')} value={String(m.positionsCount)} />}
              {m.top3Pct != null && <Stat label={t('shared_top3')} value={`${fmt(m.top3Pct)}%`} />}
              {(m.winnersCount != null || m.losersCount != null) && (
                <Stat
                  label={t('shared_winners_losers')}
                  value={<><span className="text-up">{m.winnersCount ?? 0}</span><span className="mx-1 text-faint">/</span><span className="text-down">{m.losersCount ?? 0}</span></>}
                />
              )}
              {m.best && <Stat label={t('shared_best')} tone="up" value={signedPct(m.best.plPct)} hint={m.best.symbol} />}
              {m.worst && <Stat label={t('shared_worst')} tone={m.worst.plPct >= 0 ? 'up' : 'down'} value={signedPct(m.worst.plPct)} hint={m.worst.symbol} />}
            </div>

            <Card>
              <div className="h-80 px-2 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} dataKey="pct" nameKey="symbol"
                      innerRadius="45%" outerRadius="88%"
                      paddingAngle={1.2} strokeWidth={0} isAnimationActive={false}
                      label={renderSliceLabel} labelLine={false}>
                      {pieData.map((p, i) => (
                        <Cell key={p.symbol} fill={p.rest ? REST_COLOR : COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                      itemStyle={{ color: 'var(--text)' }}
                      formatter={(v, name) => [`${fmt(v)}%`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <Table
                columns={[
                  {
                    key: 'symbol', header: t('shared_col_position'), mobile: 'title',
                    render: p => (
                      <span className="inline-flex items-center gap-2 font-semibold text-fg">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: p.i < CHART_TOP_N ? COLORS[p.i % COLORS.length] : REST_COLOR }} />
                        {p.symbol}
                      </span>
                    ),
                  },
                  { key: 'pct', header: t('col_share_pct'), align: 'right', render: p => <span className="tabular-nums">{fmt(p.pct)}%</span> },
                  {
                    key: 'plPct', header: t('shared_result'), align: 'right', mobile: 'aside',
                    render: p => <span className={cx('font-semibold tabular-nums', p.plPct == null ? 'text-faint' : p.plPct >= 0 ? 'text-up' : 'text-down')}>{p.plPct == null ? '—' : signedPct(p.plPct)}</span>,
                  },
                ]}
                rows={data.positions.map((p, i) => ({ ...p, i }))}
                rowKey={p => p.symbol}
              />
            </Card>
          </>
        )}

        <p className="text-center text-[11px] leading-relaxed text-faint">
          {t('shared_footer')}
          <br />
          <a href="/" className="text-accent-text hover:underline">{t('shared_cta')}</a>
        </p>
      </div>
    </div>
  );
}
