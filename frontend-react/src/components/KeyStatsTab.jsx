import React, { useState, useEffect } from 'react';

function fmt(val, opts = {}) {
  if (val == null || (typeof val === 'number' && !isFinite(val))) return '—';
  const { decimals = 2, suffix = '', percent = false } = opts;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '—';
  const v = percent ? num * 100 : num;
  return v.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
}

function fmtLarge(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e12) return (val / 1e12).toFixed(2) + ' T';
  if (abs >= 1e9)  return (val / 1e9).toFixed(2)  + ' B';
  if (abs >= 1e6)  return (val / 1e6).toFixed(2)  + ' M';
  return val.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const REC_LABEL = {
  'strong_buy':   ['Silny kupno', '#10b981'],
  'buy':          ['Kupno',       '#34d399'],
  'hold':         ['Trzymaj',     '#f59e0b'],
  'underperform': ['Sprzedaj',    '#f43f5e'],
  'sell':         ['Silna sprzedaż', '#ef4444'],
};

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: color || 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

export default function KeyStatsTab({ symbol, livePrice }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setRaw(null);
    fetch(`/api/financials/keystats?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => setRaw(json.error ? null : json))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return (
    <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wskaźników…</div>
  );

  // Compute derived metrics from raw TTM values + live price
  const shares = raw?.sharesOutstanding ?? null;
  const liveMarketCap = livePrice && shares ? livePrice * shares : null;
  const netDebt = (raw?.totalDebt != null && raw?.cashAndEquivalents != null)
    ? raw.totalDebt - raw.cashAndEquivalents : null;
  const liveEV = liveMarketCap != null && netDebt != null ? liveMarketCap + netDebt : null;

  const peRatio    = liveMarketCap && raw?.ttmNetIncome  ? liveMarketCap / raw.ttmNetIncome  : null;
  const psRatio    = liveMarketCap && raw?.ttmRevenue    ? liveMarketCap / raw.ttmRevenue    : null;
  const evEbitda   = liveEV        && raw?.ttmEbitda     ? liveEV        / raw.ttmEbitda     : null;
  const pfcf       = liveMarketCap && raw?.ttmFcf        ? liveMarketCap / raw.ttmFcf        : null;
  const epsTtm     = raw?.ttmNetIncome && shares         ? raw.ttmNetIncome / shares          : null;

  const low52  = raw?.fiftyTwoWeekLow;
  const high52 = raw?.fiftyTwoWeekHigh;
  const pct52  = livePrice != null && low52 != null && high52 != null && high52 > low52
    ? ((livePrice - low52) / (high52 - low52)) * 100 : null;

  const rec = raw?.recommendationKey ? REC_LABEL[raw.recommendationKey.toLowerCase()] : null;

  // Check if we have anything useful to show
  const hasValuation = peRatio || psRatio || evEbitda || pfcf || raw?.forwardPE;
  const hasProfit    = epsTtm || raw?.forwardEps;
  const hasDividend  = raw?.dividendYield != null || raw?.dividendRate != null;
  const has52W       = low52 != null || high52 != null;
  const hasAnalysts  = raw?.targetMeanPrice != null || rec || raw?.nextEarningsDate;

  if (!hasValuation && !has52W && !hasAnalysts && !hasDividend && !hasProfit) {
    return (
      <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
        Brak danych — załaduj dane finansowe w zakładce Finanse
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 20px 20px' }}>

      {hasValuation && (
        <Section title="Wycena">
          {peRatio  != null && <Row label="C/Z (TTM)"     value={fmt(peRatio,  { decimals: 1, suffix: 'x' })} />}
          {raw?.forwardPE != null && <Row label="C/Z (forward)" value={fmt(raw.forwardPE, { decimals: 1, suffix: 'x' })} />}
          {psRatio  != null && <Row label="C/P"           value={fmt(psRatio,  { decimals: 1, suffix: 'x' })} />}
          {evEbitda != null && <Row label="EV/EBITDA"     value={fmt(evEbitda, { decimals: 1, suffix: 'x' })} />}
          {pfcf     != null && <Row label="C/FCF"         value={fmt(pfcf,     { decimals: 1, suffix: 'x' })} />}
          {raw?.priceToBook != null && <Row label="C/WK (P/B)"  value={fmt(raw.priceToBook,  { decimals: 2, suffix: 'x' })} />}
          {raw?.pegRatio    != null && <Row label="PEG"          value={fmt(raw.pegRatio,     { decimals: 2 })} />}
          {liveMarketCap    != null && <Row label="Kap. rynkowa" value={fmtLarge(liveMarketCap)} />}
          {liveEV           != null && <Row label="EV"           value={fmtLarge(liveEV)} />}
        </Section>
      )}

      {(hasProfit || raw?.beta != null) && (
        <Section title="Zysk / Ryzyko">
          {epsTtm        != null && <Row label="EPS (TTM)"     value={fmt(epsTtm, { decimals: 2 })} />}
          {raw?.forwardEps != null && <Row label="EPS (forward)" value={fmt(raw.forwardEps, { decimals: 2 })} />}
          {raw?.beta       != null && <Row label="Beta"          value={fmt(raw.beta, { decimals: 2 })} />}
        </Section>
      )}

      {hasDividend && (
        <Section title="Dywidenda">
          <Row label="Stopa dywidendowa" value={raw.dividendYield != null ? fmt(raw.dividendYield, { percent: true, suffix: '%' }) : '—'} />
          {raw.dividendRate != null && <Row label="DPS" value={fmt(raw.dividendRate)} />}
        </Section>
      )}

      {has52W && (
        <Section title="52-tygodniowy zakres">
          <Row label="Min"  value={fmt(low52,  { decimals: 2 })} />
          <Row label="Maks" value={fmt(high52, { decimals: 2 })} />
          {pct52 != null && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmt(low52,  { decimals: 2 })}</span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmt(high52, { decimals: 2 })}</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--panel-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct52))}%`, background: 'var(--accent)', borderRadius: 2 }} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Kurs: {pct52.toFixed(0)}% zakresu
              </div>
            </div>
          )}
        </Section>
      )}

      {hasAnalysts && (
        <Section title="Analitycy">
          {raw.targetMeanPrice != null && <Row label="Cel (średni)" value={fmt(raw.targetMeanPrice, { decimals: 2 })} />}
          {raw.targetLowPrice  != null && raw.targetHighPrice != null && (
            <Row label="Cel (min–maks)" value={`${fmt(raw.targetLowPrice, { decimals: 2 })} – ${fmt(raw.targetHighPrice, { decimals: 2 })}`} />
          )}
          {raw.numberOfAnalystOpinions != null && <Row label="Analityków" value={String(raw.numberOfAnalystOpinions)} />}
          {rec && <Row label="Rekomendacja" value={rec[0]} color={rec[1]} />}
          {raw.nextEarningsDate != null && <Row label="Nast. wyniki" value={fmtDate(raw.nextEarningsDate)} />}
        </Section>
      )}

    </div>
  );
}
