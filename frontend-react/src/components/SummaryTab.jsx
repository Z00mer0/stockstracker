import React, { useState, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

function fmt(val, decimals = 2, locale = 'pl-PL') {
  if (val == null || !isFinite(val)) return '—';
  return val.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function UpsideCard({ label, value, upside, note }) {
  const { locale } = useLanguage();
  if (upside == null) return null;
  const color = upside >= 0 ? '#10b981' : '#f43f5e';
  return (
    <div style={{
      background: 'var(--panel-2)',
      borderRadius: 8,
      padding: '10px 14px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    }}>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{label}</div>
        {note && <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>{note}</div>}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
          {fmt(value, 2, locale)}
        </div>
        <div style={{ fontSize: 12, color, fontWeight: 500 }}>
          {upside >= 0 ? '+' : ''}{upside.toFixed(1)}% {upside >= 0 ? '▲' : '▼'}
        </div>
      </div>
    </div>
  );
}

export default function SummaryTab({ symbol, livePrice }) {
  const [raw, setRaw] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  useEffect(() => {
    if (!symbol) return;
    setRaw(null);
    setSummary(null);
    setSummaryError(null);
    fetch(`/api/financials/keystats?symbol=${encodeURIComponent(symbol)}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => setRaw(json.error ? null : json))
      .catch(() => {});
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

  const dcfUpside = livePrice && raw?.dcfFairValue
    ? ((raw.dcfFairValue - livePrice) / livePrice) * 100 : null;
  const analystUpside = livePrice && raw?.targetMeanPrice
    ? ((raw.targetMeanPrice - livePrice) / livePrice) * 100 : null;

  return (
    <div style={{ padding: '12px 20px 20px' }}>

      {(dcfUpside != null || analystUpside != null) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
            Wycena
          </div>
          <UpsideCard
            label="Wycena DCF"
            value={raw?.dcfFairValue}
            upside={dcfUpside}
            note="Zysk DCF: 5Y, dysk. 10%, wzrost hist., term. 3%"
          />
          <UpsideCard
            label="Cel analityków (śr.)"
            value={raw?.targetMeanPrice}
            upside={analystUpside}
          />
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
        Podsumowanie AI
      </div>

      {summary ? (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          {summary}
          <span
            style={{ display: 'inline-block', marginLeft: 8, fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={fetchSummary}
          >
            Odśwież
          </span>
        </div>
      ) : (
        <div>
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
    </div>
  );
}
