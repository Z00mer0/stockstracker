import { useState } from 'react';
import { Compass, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { valueBond, fetchCpiSeries } from '../services/bondService';
import { buildReviewContext } from '../utils/reviewContext.js';
import { Button, Callout, Card, Spinner } from './ui';

// ── mini-markdown (ten sam wzorzec co FinancialsTab) ─────────────────────────
function parseInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-fg">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderReview(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="mb-1.5 mt-4 text-label font-bold uppercase text-accent-text">{line.slice(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={i} className="mb-1.5 mt-4 text-[14px] font-bold text-fg">{line.slice(3)}</h2>;
    if (/^\s*[-*] /.test(line)) return <div key={i} className="mb-1 pl-3 text-small leading-relaxed text-dim">• {parseInline(line.replace(/^\s*[-*] /, ''))}</div>;
    if (line.trim() === '') return <div key={i} className="h-1.5" />;
    return <p key={i} className="mb-1 text-small leading-relaxed text-dim">{parseInline(line)}</p>;
  });
}

export default function PortfolioReview() {
  const {
    portfolio, bonds, otherAssets, cash, fxRates, transactions,
    activePortfolio, activePortfolioId,
  } = useApp();
  const t = useT();
  const { locale } = useLanguage();

  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [meta, setMeta]         = useState(null);
  const [started, setStarted]   = useState(false);

  async function buildContext() {
    // Obligacje skarbowe (wycena CPI; bez CPI — nominał)
    let bondItems = [];
    if (bonds.length) {
      try {
        const cpiMap = await fetchCpiSeries();
        bondItems = bonds.map(b => { const v = valueBond(b, cpiMap); return { type: b.type, valuePLN: Math.round(v.totalValue), maturity: v.maturityDate }; });
      } catch {
        bondItems = bonds.map(b => ({ type: b.type, valuePLN: (Number(b.count) || 0) * 100 }));
      }
    }
    return buildReviewContext({
      portfolio, bonds: bondItems, cash, otherAssets, fxRates, transactions,
      accountType: activePortfolio?.accountType || '',
    });
  }

  async function generate(force = false) {
    setLoading(true); setError(''); setText(''); setMeta(null); setStarted(true);
    try {
      const ctx = await buildContext();
      if (!ctx) { setError('err_empty_portfolio'); return; }
      const resp = await fetch('/api/portfolio-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ context: ctx, portfolioKey: activePortfolioId || 'all', force }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'err_groq_failed');
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.meta) setMeta(parsed.meta);
            if (parsed.error) { setError(parsed.error); break; }
            if (parsed.text) setText(prev => prev + parsed.text);
          } catch { /* partial line */ }
        }
      }
    } catch (e) {
      setError(e.message || 'err_groq_failed');
    } finally {
      setLoading(false);
    }
  }

  const errorLabel = {
    err_empty_portfolio: t('review_err_empty'),
    err_rate_limit: t('review_err_rate_limit'),
    err_no_groq_key: t('review_err_no_key'),
  }[error] || (error ? t('review_err_failed') : '');

  return (
    <Card
      title={<span className="inline-flex items-center gap-2"><Compass size={15} aria-hidden className="text-accent-text" />{t('review_title')}</span>}
      actions={started && !loading && text
        ? <Button size="sm" icon={RefreshCw} onClick={() => generate(true)}>{t('review_regenerate')}</Button>
        : (!started || (!loading && !text)) && <Button size="sm" variant="primary" icon={Sparkles} onClick={() => generate(false)}>{t('review_generate')}</Button>}
    >
      <div className="grid gap-3 p-4">
        <p className="max-w-2xl text-small leading-relaxed text-faint">{t('review_intro')}</p>
        {meta?.cached && meta.createdAt && (
          <p className="text-[11px] text-faint">
            {t('review_cached_at')} {new Date(meta.createdAt).toLocaleDateString(locale)} · {t('review_cached_hint')}
          </p>
        )}
        {loading && !text && (
          <div className="flex items-center gap-2.5 text-small text-faint"><Spinner size="sm" /> {t('review_generating')}</div>
        )}
        {errorLabel && <Callout tone="down" icon={TriangleAlert}>{errorLabel}</Callout>}
        {text && (
          <div className="border-t border-line pt-1">
            {renderReview(text)}
            {loading && <span className="text-accent-text">▍</span>}
          </div>
        )}
      </div>
    </Card>
  );
}
