import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { useT, useLanguage } from '../context/LanguageContext';
import Spinner from '../components/shared/Spinner';
import TickerLogo from '../components/shared/TickerLogo';

function authHeader() {
  return { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' };
}

function fmtDateTime(iso, locale = 'pl-PL') {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return ''; }
}

const SENTIMENT_STYLE = {
  positive: { bg: 'rgba(34,197,94,0.12)', color: 'var(--up)' },
  negative: { bg: 'rgba(239,68,68,0.12)', color: 'var(--down)' },
  neutral:  { bg: 'var(--panel-2)', color: 'var(--text-faint)' },
};

export default function News() {
  const { portfolio } = useApp();
  const t = useT();
  const { locale } = useLanguage();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [filter, setFilter]   = useState('');

  const allSymbols = [...new Set(portfolio.map(p => p.symbol).filter(Boolean))];

  const load = useCallback(async () => {
    if (!allSymbols.length) return;
    setLoading(true); setError(null);
    try {
      const base = import.meta.env.VITE_API_URL ?? '';
      const r = await fetch(`${base}/api/newsfeed?symbols=${encodeURIComponent(allSymbols.join(','))}`, {
        headers: authHeader(),
        signal: AbortSignal.timeout(90000),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e.message || t('error'));
    } finally { setLoading(false); }
  }, [allSymbols.join(',')]);

  useEffect(() => { load(); }, [load]);

  if (!allSymbols.length) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-faint)' }}>
        <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{t('news_empty')}</p>
      </div>
    );
  }

  const items = data?.items || [];
  const filtered = filter.trim()
    ? items.filter(it => it.symbol.toLowerCase().includes(filter.trim().toLowerCase()))
    : items;

  return (
    <div className="space-y-5">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {t('news_title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>
            {t('news_subtitle')}
            {data?.generatedAt && ` · ${t('news_updated_at')}: ${fmtDateTime(data.generatedAt, locale)}`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          style={{ fontSize: 11, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer', background: 'var(--panel-2)', color: 'var(--text-dim)' }}
        >
          {loading ? <Spinner size="sm" /> : `↺ ${t('news_refresh')}`}
        </button>
      </div>

      <input
        className="field-input"
        style={{ maxWidth: 320 }}
        placeholder={t('news_filter_placeholder')}
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />

      {error && (
        <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--down-soft)', border: '1px solid var(--down)', color: 'var(--down)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Spinner size="lg" />
        </div>
      )}

      {!loading && data && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-faint)', fontSize: 13 }}>
          {t('news_no_results')}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map((item, i) => (
          <NewsCard key={`${item.symbol}-${item.url}-${i}`} item={item} locale={locale} t={t} />
        ))}
      </div>
    </div>
  );
}

function NewsCard({ item, locale, t }) {
  const sentimentKey = item.sentiment ? `sentiment_${item.sentiment}` : null;
  const sentimentStyle = item.sentiment ? SENTIMENT_STYLE[item.sentiment] : null;

  return (
    <div className="card" style={{ padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <TickerLogo symbol={item.symbol} />
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.symbol}</span>
        {sentimentStyle && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
            background: sentimentStyle.bg, color: sentimentStyle.color,
          }}>
            {t(sentimentKey)}
          </span>
        )}
      </div>

      <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, margin: 0 }}>
        {item.summary || item.title}
      </p>
      {item.summary && (
        <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5, margin: '4px 0 0' }}>
          {item.title}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11, color: 'var(--text-faint)' }}>
        <span>{item.source}</span>
        <span>·</span>
        <span>{fmtDateTime(item.publishedAt, locale)}</span>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ marginLeft: 'auto', color: 'var(--info)', fontWeight: 600, textDecoration: 'none' }}
        >
          {t('news_read_more')}
        </a>
      </div>
    </div>
  );
}
