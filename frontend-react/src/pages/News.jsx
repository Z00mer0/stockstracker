// src/pages/News.jsx
import { useCallback, useEffect, useState } from 'react';
import { Newspaper, RefreshCw, Search, TriangleAlert, ExternalLink } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import TickerLogo from '../components/shared/TickerLogo';
import { Badge, Button, Callout, EmptyState, Input, Skeleton } from '../components/ui';
import { authHeader } from '../utils/auth.js';

const SENTIMENT_TONE = { positive: 'up', negative: 'down', neutral: 'neutral' };

function fmtDateTime(iso, locale) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function NewsCard({ item, locale, t }) {
  return (
    <article className="rounded-card border border-line bg-panel px-4 py-3.5 shadow-card">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <TickerLogo symbol={item.symbol} />
        <span className="text-[14px] font-bold text-fg">{item.symbol}</span>
        {item.sentiment && <Badge tone={SENTIMENT_TONE[item.sentiment] ?? 'neutral'}>{t(`sentiment_${item.sentiment}`)}</Badge>}
      </div>
      <p className="text-[13px] leading-relaxed text-dim">{item.summary || item.title}</p>
      {item.summary && <p className="mt-1 text-small leading-snug text-faint">{item.title}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
        <span>{item.source}</span><span aria-hidden>·</span><span>{fmtDateTime(item.publishedAt, locale)}</span>
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-semibold text-accent-text hover:underline">
          {t('news_read_more').replace(/\s*→$/, '')}<ExternalLink size={12} aria-hidden />
        </a>
      </div>
    </article>
  );
}

export default function News() {
  const { portfolio } = useApp();
  const t = useT();
  const { locale } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const symbolsKey = [...new Set(portfolio.map(p => p.symbol).filter(Boolean))].join(',');

  const load = useCallback(async () => {
    if (!symbolsKey) return;
    setLoading(true); setError(null);
    try {
      const base = import.meta.env.VITE_API_URL ?? '';
      const r = await fetch(`${base}/api/newsfeed?symbols=${encodeURIComponent(symbolsKey)}`, { headers: authHeader(), signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message || t('error'));
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  useEffect(() => { load(); }, [load]);

  if (!symbolsKey) return <EmptyState icon={Newspaper} title={t('news_empty')} className="py-16" />;

  const q = filter.trim().toLowerCase();
  const items = (data?.items || []).filter(it => !q || it.symbol.toLowerCase().includes(q));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input icon={Search} aria-label={t('news_filter_placeholder')} placeholder={t('news_filter_placeholder')} value={filter} onChange={e => setFilter(e.target.value)} className="w-full max-w-xs" />
        {data?.generatedAt && <span className="text-small text-faint">{t('news_updated_at')}: {fmtDateTime(data.generatedAt, locale)}</span>}
        <Button size="sm" icon={RefreshCw} loading={loading} onClick={load} className="ml-auto">{t('news_refresh')}</Button>
      </div>

      {error && <Callout tone="down" icon={TriangleAlert}>{error}</Callout>}

      {loading && !data && (
        <div className="grid gap-2.5" aria-busy="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="grid gap-2 rounded-card border border-line bg-panel px-4 py-3.5">
              <Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}

      {!loading && data && items.length === 0 && <EmptyState icon={Newspaper} title={t('news_no_results')} />}

      <div className="grid gap-2.5">
        {items.map((item, i) => <NewsCard key={`${item.symbol}-${item.url}-${i}`} item={item} locale={locale} t={t} />)}
      </div>
    </div>
  );
}
