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

function scoreColor(score) {
  if (score >= 7) return '#10b981';
  if (score >= 5) return '#f59e0b';
  return '#f43f5e';
}

function HealthBar({ label, score }) {
  const color = scoreColor(score);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>{score.toFixed(1)} / 10</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--panel-2)' }}>
        <div style={{ height: '100%', width: `${score * 10}%`, background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
    </div>
  );
}

function growthScore(g) {
  if (g == null) return null;
  if (g > 0.20) return 10;
  if (g > 0.15) return 9;
  if (g > 0.10) return 8;
  if (g > 0.07) return 7;
  if (g > 0.05) return 6;
  if (g > 0.02) return 5;
  if (g > 0)    return 4;
  if (g > -0.05) return 3;
  if (g > -0.10) return 2;
  return 1;
}

function profitScore(margin) {
  if (margin == null) return null;
  if (margin > 0.25) return 10;
  if (margin > 0.20) return 9;
  if (margin > 0.15) return 8;
  if (margin > 0.10) return 7;
  if (margin > 0.07) return 6;
  if (margin > 0.05) return 5;
  if (margin > 0.03) return 4;
  if (margin > 0)    return 3;
  if (margin > -0.05) return 2;
  return 1;
}

function cashFlowScore(margin) {
  if (margin == null) return null;
  if (margin > 0.20) return 10;
  if (margin > 0.15) return 9;
  if (margin > 0.10) return 8;
  if (margin > 0.07) return 7;
  if (margin > 0.05) return 6;
  if (margin > 0.03) return 5;
  if (margin > 0.01) return 4;
  if (margin > 0)    return 3;
  return 2;
}

export default function KeyStatsTab({ symbol, livePrice, yearChangePct }) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setRaw(null);
    setSummary(null);
    setSummaryError(null);
    fetch(`/api/financials/keystats?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => setRaw(json.error ? null : json))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [symbol]);

  function fetchSummary() {
    setSummaryLoading(true);
    setSummaryError(null);
    fetch(`/api/financials/summary?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => {
        if (json.summary) setSummary(json.summary);
        else setSummaryError(json.error || 'Brak danych finansowych — załaduj dane w zakładce Finanse');
      })
      .catch(() => setSummaryError('Błąd połączenia z serwerem'))
      .finally(() => setSummaryLoading(false));
  }

  if (loading) return (
    <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wskaźników…</div>
  );

  const shares        = raw?.sharesOutstanding ?? null;
  const liveMarketCap = livePrice && shares ? livePrice * shares : null;
  const netDebt       = (raw?.totalDebt != null && raw?.cashAndEquivalents != null)
    ? raw.totalDebt - raw.cashAndEquivalents : null;
  const liveEV        = liveMarketCap != null && netDebt != null ? liveMarketCap + netDebt : null;

  const peRatio  = liveMarketCap && raw?.ttmNetIncome  ? liveMarketCap / raw.ttmNetIncome  : null;
  const psRatio  = liveMarketCap && raw?.ttmRevenue    ? liveMarketCap / raw.ttmRevenue    : null;
  const evEbitda = liveEV        && raw?.ttmEbitda     ? liveEV        / raw.ttmEbitda     : null;
  const pfcf     = liveMarketCap && raw?.ttmFcf        ? liveMarketCap / raw.ttmFcf        : null;
  const epsTtm   = raw?.ttmNetIncome && shares         ? raw.ttmNetIncome / shares          : null;
  const fcfYield = liveMarketCap && raw?.ttmFcf        ? (raw.ttmFcf / liveMarketCap) * 100 : null;

  const netMargin = raw?.ttmNetIncome && raw?.ttmRevenue ? raw.ttmNetIncome / raw.ttmRevenue : null;
  const fcfMargin = raw?.ttmFcf       && raw?.ttmRevenue ? raw.ttmFcf       / raw.ttmRevenue : null;

  const gScore  = growthScore(raw?.revenueGrowthYoY);
  const pScore  = profitScore(netMargin);
  const cfScore = cashFlowScore(fcfMargin);
  const hasHealth = gScore != null || pScore != null || cfScore != null;

  const low52  = raw?.fiftyTwoWeekLow;
  const high52 = raw?.fiftyTwoWeekHigh;
  const pct52  = livePrice != null && low52 != null && high52 != null && high52 > low52
    ? ((livePrice - low52) / (high52 - low52)) * 100 : null;

  const rec = raw?.recommendationKey ? REC_LABEL[raw.recommendationKey.toLowerCase()] : null;
  const analystUpside = livePrice && raw?.targetMeanPrice
    ? ((raw.targetMeanPrice - livePrice) / livePrice) * 100 : null;
  const dcfUpside = livePrice && raw?.dcfFairValue
    ? ((raw.dcfFairValue - livePrice) / livePrice) * 100 : null;
  const hasFundamentalValuation = analystUpside != null || dcfUpside != null;

  const hasValuation = peRatio || psRatio || evEbitda || pfcf || raw?.forwardPE;
  const hasProfit    = epsTtm || raw?.forwardEps;
  const hasDividend  = raw?.dividendYield != null || raw?.dividendRate != null;
  const has52W       = low52 != null || high52 != null;
  const hasAnalysts  = raw?.targetMeanPrice != null || rec || raw?.nextEarningsDate;
  const hasFundamentals = raw?.ttmRevenue || raw?.bookPerShare || fcfYield != null;

  if (!hasValuation && !has52W && !hasAnalysts && !hasDividend && !hasProfit && !hasFundamentals) {
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
          {fcfYield != null && <Row label="FCF Yield"     value={fmt(fcfYield, { decimals: 2, suffix: '%' })} color={fcfYield > 0 ? '#10b981' : '#f43f5e'} />}
          {raw?.priceToBook != null && <Row label="C/WK (P/B)"  value={fmt(raw.priceToBook,  { decimals: 2, suffix: 'x' })} />}
          {raw?.pegRatio    != null && <Row label="PEG"          value={fmt(raw.pegRatio,     { decimals: 2 })} />}
          {liveMarketCap    != null && <Row label="Kap. rynkowa" value={fmtLarge(liveMarketCap)} />}
          {liveEV           != null && <Row label="EV"           value={fmtLarge(liveEV)} />}
          {(raw?.epsRevisionsUp30d != null || raw?.epsRevisionsDown30d != null) && (
            <Row
              label="Rewizje EPS (30d)"
              value={`↑${raw.epsRevisionsUp30d ?? 0} ↓${raw.epsRevisionsDown30d ?? 0}`}
              color={
                (raw.epsRevisionsUp30d ?? 0) > (raw.epsRevisionsDown30d ?? 0) ? '#10b981' :
                (raw.epsRevisionsDown30d ?? 0) > (raw.epsRevisionsUp30d ?? 0) ? '#f43f5e' :
                undefined
              }
            />
          )}
          {raw?.forwardRevenueEstimate != null && (
            <Row label="Prognoza przychodów (nast. rok)" value={fmtLarge(raw.forwardRevenueEstimate)} />
          )}
        </Section>
      )}

      {hasFundamentals && (
        <Section title="Fundamenty">
          {raw?.ttmRevenue    != null && (
            <Row
              label={raw?.revenueGrowthYoY != null
                ? `Przychody TTM (${raw.revenueGrowthYoY >= 0 ? '+' : ''}${(raw.revenueGrowthYoY * 100).toFixed(1)}% r/r)`
                : 'Przychody TTM'}
              value={fmtLarge(raw.ttmRevenue)}
              color={raw?.revenueGrowthYoY != null ? (raw.revenueGrowthYoY >= 0 ? '#10b981' : '#f43f5e') : undefined}
            />
          )}
          {raw?.bookPerShare  != null && <Row label="Wartość księgowa/akcję" value={fmt(raw.bookPerShare, { decimals: 2 })} />}
          {netMargin          != null && <Row label="Marża netto"            value={fmt(netMargin * 100, { decimals: 1, suffix: '%' })} color={netMargin > 0 ? '#10b981' : '#f43f5e'} />}
        </Section>
      )}

      {(hasProfit || raw?.beta != null || yearChangePct != null) && (
        <Section title="Zysk / Ryzyko">
          {epsTtm          != null && <Row label="EPS (TTM)"       value={fmt(epsTtm, { decimals: 2 })} />}
          {raw?.forwardEps != null && <Row label="EPS (forward)"   value={fmt(raw.forwardEps, { decimals: 2 })} />}
          {raw?.beta       != null && <Row label="Beta"            value={fmt(raw.beta, { decimals: 2 })} />}
          {yearChangePct   != null && (
            <Row
              label="Zmiana 1 rok"
              value={`${yearChangePct >= 0 ? '+' : ''}${yearChangePct.toFixed(1)}%`}
              color={yearChangePct >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
        </Section>
      )}

      {hasDividend && (
        <Section title="Dywidenda">
          <Row label="Stopa dywidendowa" value={raw.dividendYield != null ? fmt(raw.dividendYield, { percent: true, suffix: '%' }) : '—'} />
          {raw.dividendRate != null && <Row label="DPS" value={fmt(raw.dividendRate)} />}
          {raw?.dividendGrowthStreak != null && raw?.dividendRate != null && (
            <Row
              label="Wzrost dywidendy z rzędu"
              value={raw.dividendGrowthStreak > 0 ? `${raw.dividendGrowthStreak} lat` : '0 lat'}
              color={raw.dividendGrowthStreak >= 5 ? '#10b981' : raw.dividendGrowthStreak >= 1 ? '#f59e0b' : undefined}
            />
          )}
        </Section>
      )}

      {has52W && (
        <Section title="52-tygodniowy zakres">
          <Row label="Min"  value={fmt(low52,  { decimals: 2 })} />
          <Row label="Maks" value={fmt(high52, { decimals: 2 })} />
          {pct52 != null && (
            <div style={{ marginTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{fmt(low52, { decimals: 2 })}</span>
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

      {hasFundamentalValuation && (
        <Section title="Wycena Fundamentalna">
          {analystUpside != null && (
            <Row
              label="Cel analityków (śr.)"
              value={`${fmt(raw.targetMeanPrice, { decimals: 2 })}  ${analystUpside >= 0 ? '+' : ''}${analystUpside.toFixed(1)}% ${analystUpside >= 0 ? '▲' : '▼'}`}
              color={analystUpside >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
          {dcfUpside != null && (
            <Row
              label="Wycena DCF"
              value={`${fmt(raw.dcfFairValue, { decimals: 2 })}  ${dcfUpside >= 0 ? '+' : ''}${dcfUpside.toFixed(1)}% ${dcfUpside >= 0 ? '▲' : '▼'}`}
              color={dcfUpside >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
            Zysk DCF: 5Y, dysk. 10%, wzrost hist., term. 3%
          </div>
        </Section>
      )}

      {hasHealth && (
        <Section title="Kondycja finansowa">
          {gScore  != null && <HealthBar label="Wzrost"        score={gScore} />}
          {pScore  != null && <HealthBar label="Rentowność"    score={pScore} />}
          {cfScore != null && <HealthBar label="Przepływy FCF" score={cfScore} />}
        </Section>
      )}

      <Section title="Podsumowanie AI">
        {summary ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, padding: '4px 0' }}>
            {summary}
            <span
              style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}
              onClick={fetchSummary}
            >
              Odśwież
            </span>
          </div>
        ) : (
          <div style={{ padding: '4px 0' }}>
            <button
              onClick={fetchSummary}
              disabled={summaryLoading}
              style={{
                fontSize: 12, padding: '6px 14px', borderRadius: 6,
                background: 'var(--accent)', color: '#fff', border: 'none',
                cursor: summaryLoading ? 'default' : 'pointer',
                opacity: summaryLoading ? 0.6 : 1,
              }}
            >
              {summaryLoading ? 'Generuję…' : 'Generuj podsumowanie'}
            </button>
            {summaryError && (
              <div style={{ fontSize: 11, color: '#f43f5e', marginTop: 6 }}>{summaryError}</div>
            )}
            {!summaryError && (
              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>
                Claude AI · cache 7 dni
              </div>
            )}
          </div>
        )}
      </Section>

    </div>
  );
}
