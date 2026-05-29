import React, { useState, useEffect } from 'react';

function fmt(val, opts = {}) {
  if (val == null || val === '' || (typeof val === 'number' && !isFinite(val))) return '—';
  const { decimals = 2, suffix = '', prefix = '', percent = false } = opts;
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return '—';
  const v = percent ? num * 100 : num;
  return prefix + v.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
}

function fmtCap(val) {
  if (val == null) return '—';
  if (val >= 1e12) return (val / 1e12).toFixed(2) + ' T';
  if (val >= 1e9)  return (val / 1e9).toFixed(2)  + ' B';
  if (val >= 1e6)  return (val / 1e6).toFixed(2)  + ' M';
  return val.toFixed(0);
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const REC_LABEL = {
  'strong_buy':  ['Silny kupno', '#10b981'],
  'buy':         ['Kupno', '#34d399'],
  'hold':        ['Trzymaj', '#f59e0b'],
  'underperform':['Sprzedaj', '#f43f5e'],
  'sell':        ['Silna sprzedaż', '#ef4444'],
};

function StatRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: valueColor || 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function KeyStatsTab({ symbol, livePrice, currency }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setData(null);
    setError(null);
    fetch(`/api/financials/keystats?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [symbol]);

  if (loading) return (
    <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
      Ładowanie wskaźników…
    </div>
  );

  if (error || !data) return (
    <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-faint)' }}>
      Brak danych
    </div>
  );

  const rec = data.recommendationKey ? REC_LABEL[data.recommendationKey.toLowerCase()] : null;

  const price = livePrice;
  const low52  = data.fiftyTwoWeekLow;
  const high52 = data.fiftyTwoWeekHigh;
  const pct52  = (price != null && low52 != null && high52 != null && high52 > low52)
    ? ((price - low52) / (high52 - low52)) * 100 : null;

  return (
    <div style={{ padding: '12px 20px 20px' }}>

      <Section title="Wycena">
        <StatRow label="C/Z (TTM)"    value={fmt(data.trailingPE)} />
        <StatRow label="C/Z (forward)" value={fmt(data.forwardPE)} />
        <StatRow label="C/WK (P/B)"   value={fmt(data.priceToBook)} />
        <StatRow label="PEG"           value={fmt(data.pegRatio)} />
        <StatRow label="Beta"          value={fmt(data.beta)} />
        <StatRow label="Kap. rynkowa"  value={fmtCap(data.marketCap)} />
      </Section>

      <Section title="Zysk">
        <StatRow label="EPS (TTM)"     value={fmt(data.trailingEps)} />
        <StatRow label="EPS (forward)" value={fmt(data.forwardEps)} />
      </Section>

      {(data.dividendYield != null || data.dividendRate != null) && (
        <Section title="Dywidenda">
          <StatRow label="Stopa dywidendowa" value={fmt(data.dividendYield, { percent: true, suffix: '%' })} />
          <StatRow label="DPS"               value={fmt(data.dividendRate)} />
        </Section>
      )}

      <Section title="52-tygodniowy zakres">
        <StatRow
          label="Min"
          value={fmt(low52, { decimals: 2 })}
        />
        <StatRow
          label="Maks"
          value={fmt(high52, { decimals: 2 })}
        />
        {pct52 != null && (
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {fmt(low52, { decimals: 2 })}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {fmt(high52, { decimals: 2 })}
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--panel-2)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, pct52))}%`, background: 'var(--accent)', borderRadius: 2 }} />
            </div>
            {price != null && (
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                Aktualna cena: {pct52.toFixed(0)}% zakresu
              </div>
            )}
          </div>
        )}
      </Section>

      {(data.targetMeanPrice != null || data.nextEarningsDate != null) && (
        <Section title="Analitycy">
          {data.targetMeanPrice != null && (
            <StatRow label="Cel (średni)" value={fmt(data.targetMeanPrice, { decimals: 2 })} />
          )}
          {data.targetLowPrice != null && data.targetHighPrice != null && (
            <StatRow
              label="Cel (min – maks)"
              value={`${fmt(data.targetLowPrice, { decimals: 2 })} – ${fmt(data.targetHighPrice, { decimals: 2 })}`}
            />
          )}
          {data.numberOfAnalystOpinions != null && (
            <StatRow label="Liczba analityków" value={String(data.numberOfAnalystOpinions)} />
          )}
          {rec && (
            <StatRow label="Rekomendacja" value={rec[0]} valueColor={rec[1]} />
          )}
          {data.nextEarningsDate != null && (
            <StatRow label="Nast. wyniki" value={fmtDate(data.nextEarningsDate)} />
          )}
        </Section>
      )}

    </div>
  );
}
