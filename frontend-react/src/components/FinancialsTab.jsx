import React, { useState, useEffect, useRef } from 'react';

const AUTH_KEY = 'myfund_auth_token';

function fmtM(val) {
  if (val == null) return '—';
  const m = val / 1e6;
  return m.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(val) {
  if (val == null) return '—';
  return (val * 100).toFixed(1) + '%';
}

function fmtX(val) {
  if (val == null) return '—';
  return val.toFixed(1) + 'x';
}

function fmtLarge(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e12) return (val / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9)  return (val / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (val / 1e6).toFixed(0) + 'M';
  return val.toLocaleString('pl-PL');
}

function growthColor(v) {
  if (v == null) return 'var(--text-dim)';
  return v >= 0 ? 'var(--up)' : 'var(--down)';
}

const COL_W = '110px';
const NUM_COLS = 4;

function TableRow({ label, values, fmt = fmtM }) {
  const cols = values.slice(0, NUM_COLS);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '4px 10px',
      fontSize: 12,
    }}>
      <span style={{ color: 'var(--text)' }}>{label}</span>
      {cols.map((v, i) => (
        <span key={i} style={{
          color: 'var(--text)',
          fontWeight: i === 0 ? 700 : 400,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        }}>{fmt(v)}</span>
      ))}
      {Array.from({ length: NUM_COLS - cols.length }).map((_, i) => <span key={`e${i}`} />)}
    </div>
  );
}

function SubRow({ label, values, fmt = fmtPct }) {
  const cols = values.slice(0, NUM_COLS);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '2px 10px 3px',
      fontSize: 10,
    }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      {cols.map((v, i) => (
        <span key={i} style={{
          color: fmt === fmtPct ? growthColor(v) : 'var(--text-dim)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {fmt === fmtPct && v != null && v >= 0 ? '+' : ''}{fmt(v)}
        </span>
      ))}
      {Array.from({ length: NUM_COLS - cols.length }).map((_, i) => <span key={`e${i}`} />)}
    </div>
  );
}

function ColumnHeaders({ periods }) {
  const cols = periods.slice(0, NUM_COLS);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '5px 10px',
      fontSize: 10,
      color: 'var(--text-faint)',
      borderBottom: '1px solid var(--border)',
    }}>
      <span />
      {cols.map((p, i) => (
        <span key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--text-dim)' : 'var(--text-faint)' }}>
          {p.label}
        </span>
      ))}
      {Array.from({ length: NUM_COLS - cols.length }).map((_, i) => <span key={`e${i}`} />)}
    </div>
  );
}

function Accordion({ title, unit, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '7px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ color: open ? 'var(--text)' : 'var(--text-dim)', fontWeight: 600, fontSize: 12 }}>
          {open ? '▾' : '▸'} {title}
        </span>
        {unit && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{unit}</span>}
      </div>
      {open && children}
    </div>
  );
}

function ValuationCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--panel)',
      borderRadius: 8,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function FinancialsTab({ symbol, currentPrice }) {
  const [period, setPeriod]         = useState('quarterly');
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const token = localStorage.getItem(AUTH_KEY) || '';
    fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}&period=${period}`, {
      headers: { 'X-Auth-Token': token },
    })
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'no_data' : 'fetch_error');
        return r.json();
      })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message === 'no_data' ? 'no_data' : 'fetch_error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, period]);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const token = localStorage.getItem(AUTH_KEY) || '';
      const resp = await fetch('/api/financials/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ symbol, period, image_b64: base64 }),
      });
      if (resp.status === 422) throw new Error('parse_failed');
      if (!resp.ok) throw new Error('upload_error');
      const d = await resp.json();
      setData(d);
      setUploadOpen(false);
    } catch (e) {
      if (e.message === 'parse_failed') {
        setUploadError('Nie udało się odczytać tabeli — spróbuj z wyraźniejszym screenshotem');
      } else {
        setUploadError('Błąd przesyłania — spróbuj ponownie');
      }
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        handleUpload(item.getAsFile());
        break;
      }
    }
  }

  const periods  = data?.periods ?? [];
  const val      = data?.valuation ?? {};
  const currency = data?.currency ?? '';
  const sourceLabel = data
    ? `${data.source === 'yahoo' ? 'Yahoo Finance' : 'Screenshot'} · ${periods[0]?.label ?? ''}`
    : '';

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Ładowanie danych finansowych…</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 20px' }} onPaste={handlePaste}>
      {/* Controls row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8 }}>
          {[['quarterly', 'Kwartalne'], ['annual', 'Roczne']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                background: period === k ? 'var(--bg-2)' : 'transparent',
                color: period === k ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: period === k ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                transition: 'background 0.15s',
              }}
            >{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sourceLabel && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{sourceLabel}</span>}
          <button
            onClick={() => setUploadOpen(o => !o)}
            style={{
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 10,
              color: 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >📎 Importuj screen</button>
        </div>
      </div>

      {/* Upload panel */}
      {uploadOpen && (
        <div style={{
          background: 'rgba(124, 158, 255, 0.06)',
          border: '1px solid rgba(124, 158, 255, 0.2)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
          fontSize: 11,
        }}>
          <div style={{ color: 'var(--info)', fontWeight: 600, marginBottom: 4 }}>
            📎 Import ze screenshota
          </div>
          <div style={{ color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 8 }}>
            Wrzuć screen z InvestingPro / Bloomberg / innego źródła → Claude odczyta tabelę i uzupełni dane. Ważność: 90 dni.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                background: 'var(--info)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: uploading ? 'wait' : 'pointer',
              }}
            >{uploading ? 'Wczytuję…' : 'Wrzuć plik'}</button>
            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>lub wklej ze schowka (Ctrl+V)</span>
          </div>
          {uploadError && (
            <div style={{ color: 'var(--down)', fontSize: 11, marginTop: 6 }}>{uploadError}</div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files?.[0])}
          />
        </div>
      )}

      {/* No data state */}
      {error === 'no_data' && (
        <div style={{
          background: 'rgba(124, 158, 255, 0.06)',
          border: '1px solid rgba(124, 158, 255, 0.15)',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 10,
          fontSize: 12,
          color: 'var(--info)',
        }}>
          Brak danych z Yahoo Finance — wrzuć screenshot z InvestingPro lub innego źródła
        </div>
      )}

      {error === 'fetch_error' && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
          Błąd pobierania danych. Spróbuj ponownie później.
        </div>
      )}

      {/* Data tables */}
      {data && periods.length > 0 && (
        <>
          {/* RZiS */}
          <Accordion title="Rachunek Zysków i Strat" unit={`mln ${currency}`} defaultOpen={true}>
            <ColumnHeaders periods={periods} />
            <TableRow label="Przychody" values={periods.map(p => p.revenue)} />
            <SubRow label="Wzrost r/r" values={periods.map(p => p.revenueGrowthYoY)} fmt={fmtPct} />
            <TableRow label="Zysk brutto" values={periods.map(p => p.grossProfit)} />
            <SubRow label="Marża brutto" values={periods.map(p => p.grossMargin)} fmt={v => v != null ? (v * 100).toFixed(1) + '%' : '—'} />
            <TableRow label="Koszty oper." values={periods.map(p => p.operatingCost)} />
            <TableRow label="Zysk oper." values={periods.map(p => p.operatingIncome)} />
            <TableRow label="EBITDA" values={periods.map(p => p.ebitda)} />
            <SubRow label="Marża EBITDA" values={periods.map(p => p.ebitdaMargin)} fmt={v => v != null ? (v * 100).toFixed(1) + '%' : '—'} />
            <TableRow label="Zysk netto" values={periods.map(p => p.netIncome)} />
            <TableRow label="Dług netto" values={periods.map(p => p.netDebt)} />
          </Accordion>

          {/* Bilans */}
          <Accordion title="Bilans" unit={`mln ${currency}`} defaultOpen={false}>
            <ColumnHeaders periods={periods} />
            <TableRow label="Aktywa ogółem" values={periods.map(p => p.totalAssets)} />
            <TableRow label="Zobowiązania" values={periods.map(p => p.totalLiabilities)} />
            <TableRow label="Kapitał własny" values={periods.map(p => p.equity)} />
            <TableRow label="Gotówka" values={periods.map(p => p.cashAndEquivalents)} />
            <TableRow label="Dług całkowity" values={periods.map(p => p.totalDebt)} />
          </Accordion>

          {/* Przepływy */}
          <Accordion title="Przepływy pieniężne" unit={`mln ${currency}`} defaultOpen={false}>
            <ColumnHeaders periods={periods} />
            <TableRow label="CFO (oper.)" values={periods.map(p => p.operatingCashFlow)} />
            <TableRow label="CAPEX" values={periods.map(p => p.capex)} />
            <TableRow label="FCF" values={periods.map(p => p.fcf)} />
            <TableRow label="Skup akcji" values={periods.map(p => p.shareRepurchases)} />
          </Accordion>

          {/* Wycena */}
          <Accordion title="Wycena" defaultOpen={true}>
            <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ValuationCard
                label="P/E (trailing)"
                value={fmtX(val.peRatio)}
                sub={val.forwardPE != null ? `Forward P/E: ${fmtX(val.forwardPE)}` : null}
              />
              <ValuationCard
                label="EV/EBITDA"
                value={fmtX(val.evEbitda)}
                sub={val.ev != null ? `EV: ${fmtLarge(val.ev)}` : null}
              />
              <ValuationCard
                label="P/S"
                value={fmtX(val.ps)}
                sub={val.marketCap != null ? `Market Cap: ${fmtLarge(val.marketCap)}` : null}
              />
              <ValuationCard
                label="P/FCF"
                value={fmtX(val.pfcf)}
                sub={val.marketCap != null && val.pfcf != null ? `TTM FCF: ${fmtLarge(val.marketCap / val.pfcf)}` : null}
              />
              <ValuationCard
                label="EqV (Market Cap)"
                value={val.marketCap != null ? fmtLarge(val.marketCap) : '—'}
                sub={val.sharesOutstanding != null ? `${fmtLarge(val.sharesOutstanding)} akcji` : null}
              />
              <ValuationCard
                label="EV"
                value={val.ev != null ? fmtLarge(val.ev) : '—'}
                sub={val.netDebtLatest != null
                  ? `Dług netto: ${val.netDebtLatest < 0 ? '' : '+'}${fmtLarge(val.netDebtLatest)}`
                  : null}
              />
            </div>
          </Accordion>
        </>
      )}
    </div>
  );
}
