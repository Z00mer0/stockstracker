import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Spinner from './shared/Spinner';
import { valueBond, fetchCpiSeries } from '../services/bondService';
import { getTaxRate } from '../services/dividendService';

const AUTH_KEY = 'myfund_auth_token';

// ── mini-markdown (ten sam wzorzec co FinancialsTab) ─────────────────────────
function parseInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--text)' }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderReview(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('### ')) {
      return <h3 key={i} style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', margin: '18px 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{line.slice(4)}</h3>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={i} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '18px 0 6px' }}>{line.slice(3)}</h2>;
    }
    if (/^\s*[-*] /.test(line)) {
      return <div key={i} style={{ paddingLeft: 12, marginBottom: 4, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7 }}>• {parseInline(line.replace(/^\s*[-*] /, ''))}</div>;
    }
    if (line.trim() === '') return <div key={i} style={{ height: 6 }} />;
    return <p key={i} style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.7, margin: '0 0 4px' }}>{parseInline(line)}</p>;
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
    const toPLN = (v, cur) => (v || 0) * (fxRates[cur] ?? 1);

    // Akcje / ETF
    const positions = portfolio.map(p => {
      const valuePLN = toPLN(p.qty * (p.price ?? p.avgPrice), p.currency);
      const plPct = p.avgPrice > 0 && p.price != null
        ? ((p.price - p.avgPrice) / p.avgPrice) * 100 : null;
      return { symbol: p.symbol, name: p.name || undefined, currency: p.currency, valuePLN: Math.round(valuePLN), plPct: plPct != null ? Math.round(plPct * 10) / 10 : null };
    }).filter(p => p.valuePLN > 0);

    // Obligacje skarbowe (wycena CPI)
    let bondsPLN = 0;
    const bondItems = [];
    if (bonds.length) {
      try {
        const cpiMap = await fetchCpiSeries();
        bonds.forEach(b => {
          const v = valueBond(b, cpiMap);
          bondsPLN += v.totalValue;
          bondItems.push({ type: b.type, valuePLN: Math.round(v.totalValue), maturity: v.maturityDate });
        });
      } catch {
        bonds.forEach(b => { const nominal = (Number(b.count) || 0) * 100; bondsPLN += nominal; bondItems.push({ type: b.type, valuePLN: nominal }); });
      }
    }

    const cashPLN = Object.entries(cash).reduce((s, [cur, v]) => s + toPLN(v, cur), 0);
    const otherPLN = otherAssets.reduce((s, a) => s + toPLN(a.value, a.currency), 0);
    const stocksPLN = positions.reduce((s, p) => s + p.valuePLN, 0);
    const totalPLN = stocksPLN + bondsPLN + cashPLN + otherPLN;
    if (totalPLN <= 0) return null;

    const pct = v => Math.round((v / totalPLN) * 1000) / 10;

    // Ekspozycja walutowa (akcje wg waluty notowania + gotówka)
    const curExp = {};
    positions.forEach(p => { curExp[p.currency] = (curExp[p.currency] || 0) + p.valuePLN; });
    Object.entries(cash).forEach(([cur, v]) => { curExp[cur] = (curExp[cur] || 0) + toPLN(v, cur); });
    curExp['PLN'] = (curExp['PLN'] || 0) + bondsPLN;
    const currencyExposure = Object.fromEntries(
      Object.entries(curExp).filter(([, v]) => v > 0).map(([k, v]) => [k, `${pct(v)}%`])
    );

    // Dywidendy 12 mies. (brutto, PLN)
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const accountType = activePortfolio?.accountType || '';
    const divs = transactions.filter(tx => tx.type === 'DIV' && tx.date >= cutoffStr);
    const divGrossPLN = divs.reduce((s, d) => s + toPLN((d.price || 0) * (d.qty || 1), d.currency), 0);
    const divNetPLN = divs.reduce((s, d) => {
      const g = toPLN((d.price || 0) * (d.qty || 1), d.currency);
      return s + g * (1 - getTaxRate(d.symbol, d.currency, accountType));
    }, 0);

    return {
      totalValuePLN: Math.round(totalPLN),
      accountType: accountType || 'standardowe (opodatkowane)',
      allocation: {
        stocks: `${pct(stocksPLN)}%`,
        treasuryBonds: `${pct(bondsPLN)}%`,
        cash: `${pct(cashPLN)}%`,
        otherAssets: `${pct(otherPLN)}%`,
      },
      currencyExposure,
      positions: positions
        .sort((a, b) => b.valuePLN - a.valuePLN)
        .map(p => ({ ...p, weight: `${pct(p.valuePLN)}%` })),
      bonds: bondItems.length ? bondItems : undefined,
      otherAssets: otherAssets.length
        ? otherAssets.map(a => ({ name: a.name, category: a.category, valuePLN: Math.round(toPLN(a.value, a.currency)) }))
        : undefined,
      dividends12m: divs.length
        ? { grossPLN: Math.round(divGrossPLN), netPLN: Math.round(divNetPLN), payments: divs.length }
        : undefined,
    };
  }

  async function generate(force = false) {
    setLoading(true); setError(''); setText(''); setMeta(null); setStarted(true);
    try {
      const ctx = await buildContext();
      if (!ctx) { setError('err_empty_portfolio'); return; }
      const resp = await fetch('/api/portfolio-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': localStorage.getItem(AUTH_KEY) || '' },
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
    <div className="space-y-4">
      <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ maxWidth: 520 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
              🧭 {t('review_title')}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.6, margin: 0 }}>
              {t('review_intro')}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {started && !loading && text && (
              <button className="btn" style={{ fontSize: 12 }} onClick={() => generate(true)}>
                {t('review_regenerate')}
              </button>
            )}
            {(!started || (!loading && !text)) && (
              <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => generate(false)} disabled={loading}>
                {t('review_generate')}
              </button>
            )}
          </div>
        </div>

        {meta?.cached && meta.createdAt && (
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '10px 0 0' }}>
            {t('review_cached_at')} {new Date(meta.createdAt).toLocaleDateString(locale)} · {t('review_cached_hint')}
          </p>
        )}

        {loading && !text && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, color: 'var(--text-faint)', fontSize: 13 }}>
            <Spinner size="sm" /> {t('review_generating')}
          </div>
        )}

        {errorLabel && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'var(--down-soft)', border: '1px solid var(--down)', color: 'var(--down)', fontSize: 12 }}>
            {errorLabel}
          </div>
        )}

        {text && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 4 }}>
            {renderReview(text)}
            {loading && <span style={{ color: 'var(--accent)' }}>▍</span>}
          </div>
        )}
      </div>
    </div>
  );
}
