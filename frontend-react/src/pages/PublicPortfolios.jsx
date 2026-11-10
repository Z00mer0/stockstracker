import { useEffect, useState } from 'react';
import { ExternalLink, Trophy, Users } from 'lucide-react';
import { api } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { formatPercent } from '../utils/format.js';
import { isAggregateView } from '../utils/portfolioView.js';
import { Callout, Card, EmptyState, Table } from '../components/ui';
import { PageSkeleton } from '../components/RouteFallback';

// Katalog portfeli, które właściciele sami upublicznili (Dashboard →
// „Pokaż znajomym”). Same procenty — bez kwot i bez loginów.
export default function PublicPortfolios() {
  const t = useT();
  const { locale } = useLanguage();
  const { activePortfolioId } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const mineId = isAggregateView(activePortfolioId) ? '' : activePortfolioId;

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(false);
    api.get(`/api/public-portfolios${mineId ? `?portfolio_id=${encodeURIComponent(mineId)}` : ''}`)
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [mineId]);

  if (error) return <Callout tone="warn">{t('pub_error')}</Callout>;
  if (!data) return <PageSkeleton />;

  const rows = data.portfolios.map((p, i) => ({ ...p, rank: i + 1 }));
  const mine = data.mine?.plPct;
  const ranked = rows.filter(r => r.plPct != null);
  const beaten = mine != null ? ranked.filter(r => r.plPct < mine).length : null;
  const pct = v => (v != null ? formatPercent(v, { locale, decimals: 1 }) : '—');
  const tone = v => (v == null ? 'text-dim' : v >= 0 ? 'text-up' : 'text-down');

  const columns = [
    { key: 'rank', header: '#', render: r => <span className="tabular-nums text-faint">{r.rank}</span> },
    {
      key: 'name', header: t('pub_col_name'), mobile: 'title',
      render: r => (
        <a href={`/s/${r.token}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-fg hover:text-info">
          {r.name} <ExternalLink size={12} aria-hidden className="text-faint" />
        </a>
      ),
    },
    { key: 'plPct', header: t('pub_col_result'), align: 'right', mobile: 'aside', render: r => <span className={`font-semibold tabular-nums ${tone(r.plPct)}`}>{pct(r.plPct)}</span> },
    { key: 'irr', header: t('pub_col_irr'), align: 'right', render: r => <span className={`tabular-nums ${tone(r.irr)}`}>{pct(r.irr)}</span> },
    { key: 'positionsCount', header: t('pub_col_positions'), align: 'right', render: r => <span className="text-dim">{r.positionsCount}</span> },
    { key: 'top', header: t('pub_col_top'), render: r => <span className="text-small text-dim">{r.top.map(x => `${x.symbol} ${x.pct.toLocaleString(locale, { maximumFractionDigits: 0 })}%`).join(' · ')}</span> },
  ];

  return (
    <div className="space-y-4">
      {mine != null && ranked.length > 0 && (
        <Callout tone="info" icon={Trophy} title={t('pub_mine_title').replace('{pct}', pct(mine))}>
          {t('pub_mine_desc').replace('{n}', beaten).replace('{m}', ranked.length)}
        </Callout>
      )}
      <Card title={`${t('nav_public')} · ${rows.length}`}>
        <Table
          columns={columns}
          rows={rows}
          rowKey={r => r.token}
          empty={<EmptyState icon={Users} title={t('pub_empty_title')} description={t('pub_empty_desc')} />}
        />
        <p className="px-4 pb-4 pt-2 text-small text-faint">{t('pub_footnote')}</p>
      </Card>
    </div>
  );
}
