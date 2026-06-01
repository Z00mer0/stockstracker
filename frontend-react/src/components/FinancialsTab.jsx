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

const LFL_DATA = {
  'DNP.WA': {
    '2026-03-31': 0.044,
    '2025-12-31': 0.061,
    '2025-09-30': 0.072,
    '2025-06-30': 0.085,
  },
};

const RC_H = 80;
const RC_MT = 8;
const RC_MB = 20;
const RC_ML = 8;
const RC_MR = 8;

function RevenueChart({ periods, currency }) {
  const containerRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(380);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setChartWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const pts = periods.filter(p => p.revenue != null).slice(-8);
  if (pts.length < 2) return null;

  const revenues = pts.map(p => p.revenue);
  const maxRev = Math.max(...revenues);
  const baseline = Math.min(...revenues) * 0.85;
  const range = maxRev - baseline || 1;

  const innerW = chartWidth - RC_ML - RC_MR;
  const totalH = RC_H + RC_MT + RC_MB;
  const barSlot = innerW / pts.length;
  const barPad = barSlot * 0.18;

  const yS = v => RC_MT + RC_H - ((v - baseline) / range) * RC_H;
  const xC = i => RC_ML + (i + 0.5) * barSlot;

  // linear regression
  const n = pts.length;
  const sumX = revenues.reduce((a, _, i) => a + i, 0);
  const sumY = revenues.reduce((a, v) => a + v, 0);
  const sumXY = revenues.reduce((a, v, i) => a + i * v, 0);
  const sumX2 = revenues.reduce((a, _, i) => a + i * i, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return (
    <div ref={containerRef} style={{ width: '100%', padding: '8px 10px 4px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 2 }}>
        Przychody kwartalne · mln {currency}
      </div>
      <svg width={chartWidth} height={totalH}>
        {pts.map((p, i) => {
          const barTop = yS(p.revenue);
          const barBot = RC_MT + RC_H;
          return (
            <g key={i}>
              <rect
                x={RC_ML + i * barSlot + barPad}
                y={barTop}
                width={barSlot - barPad * 2}
                height={barBot - barTop}
                fill="var(--accent)"
                fillOpacity={0.45}
                rx={1}
              />
              <text x={xC(i)} y={totalH - 5} textAnchor="middle" fontSize={8} fill="#64748b">
                {p.date
                  ? `Q${Math.ceil(parseInt(p.date.slice(5, 7)) / 3)} '${p.date.slice(2, 4)}`
                  : (p.label ?? '').slice(-5)}
              </text>
            </g>
          );
        })}
        <line
          x1={xC(0)} y1={yS(intercept)}
          x2={xC(n - 1)} y2={yS(slope * (n - 1) + intercept)}
          stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4,3"
        />
      </svg>
    </div>
  );
}

const COL_W = '110px';
const NUM_COLS = 4;

function TableRow({ label, values, fmt = fmtM }) {
  const cols = values.slice(0, NUM_COLS);
  const allEmpty = cols.every(v => v == null);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '4px 10px',
      fontSize: 12,
      opacity: allEmpty ? 0.35 : 1,
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
  const allEmpty = cols.every(v => v == null);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '2px 10px 3px',
      fontSize: 10,
      opacity: allEmpty ? 0.35 : 1,
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
      background: 'var(--panel-2)',
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

export default function FinancialsTab({ symbol, livePrice }) {
  const [period, setPeriod]         = useState('quarterly');
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [csvCurrency, setCsvCurrency] = useState('PLN');
  const fileRef = useRef(null);
  const csvRef  = useRef(null);

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

  // ── CSV import (no API needed) ────────────────────────────────────────
  function parseCsvLine(line) {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') { q = !q; }
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur);
    return out;
  }

  function labelToDate(label) {
    const l = label.trim();
    if (/^ltm$/i.test(l)) return null;
    if (/^\d{4}$/.test(l)) return `${l}-12-31`;
    const qm = l.match(/Q([1-4])\s*[`']?(\d{2,4})/i);
    if (qm) {
      const q = parseInt(qm[1]);
      let yr = qm[2]; if (yr.length === 2) yr = '20' + yr;
      return `${yr}-${['03','06','09','12'][q-1]}-${['31','30','30','31'][q-1]}`;
    }
    return null;
  }

  function matchCsvField(name) {
    const l = name.toLowerCase().trim();
    const MAP = [
      ['revenue',                ['revenue','przychody','revenues','total revenue','net revenue','sales']],
      ['grossProfit',            ['gross profit','zysk brutto']],
      ['operatingCost',          ['operating expense','operating cost','koszty oper','opex']],
      ['operatingIncome',        ['operating income','operating profit','ebit','zysk oper']],
      ['ebitda',                 ['ebitda']],
      ['netIncome',              ['net income','zysk netto','net income to stockholders','net profit','net earnings']],
      ['sharesOutstandingPer',   ['shares outstanding','liczba akcji']],
      ['totalCurrentAssets',     ['total current assets','aktywa obrotowe','current assets']],
      ['totalAssets',            ['total assets','aktywa ogółem','total asset']],
      ['totalCurrentLiabilities',['total current liabilities','zobowiązania bieżące','current liabilities']],
      ['totalLiabilities',       ['total liabilities','zobowiązania ogółem','zobowiązania']],
      ['equity',                 ['total equity','stockholders equity','shareholders equity','kapitał własny']],
      ['totalDebt',              ['total debt','dług całkowity']],
      ['cashAndEquivalents',     ['cash and equiv','cash & equiv','cash and cash equiv','gotówka']],
      ['netDebt',                ['net debt','dług netto']],
      ['operatingCashFlow',      ['cash from operations','operating cash flow','cfo','cash flows from operating']],
      ['capex',                  ['capex','capital expenditure','capital expenditures','cash from investing']],
      ['cashFromFinancing',      ['cash from financing','financing activities','cash flows from financing']],
      ['fcf',                    ['levered free cash flow','free cash flow','fcf']],
      ['shareRepurchases',       ['share repurchases','buyback','skup akcji']],
    ];
    for (const [field, keys] of MAP) {
      if (keys.some(k => l.includes(k))) return field;
    }
    return null;
  }

  function parseNumMln(str) {
    if (!str) return null;
    const s = str.trim().replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
    const n = parseFloat(s);
    return isNaN(n) ? null : Math.round(n * 1e6);
  }

  function parseCsvToData(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Za mało wierszy w CSV');
    const header = parseCsvLine(lines[0]);
    const labels = header.slice(1).map(l => l.trim()).filter(Boolean);
    if (!labels.length) throw new Error('Brak kolumn z danymi');
    const isQuarterly = labels.some(l => /Q[1-4]/i.test(l));
    const empty = () => ({
      revenue: null, revenueGrowthYoY: null, grossProfit: null, grossMargin: null,
      operatingCost: null, operatingIncome: null, ebitda: null, ebitdaMargin: null,
      netIncome: null, netDebt: null,
      totalCurrentAssets: null, totalAssets: null,
      totalCurrentLiabilities: null, totalLiabilities: null,
      equity: null, cashAndEquivalents: null, totalDebt: null,
      operatingCashFlow: null, capex: null, cashFromFinancing: null, fcf: null,
      shareRepurchases: null, sharesOutstandingPer: null,
    });
    const periods = labels.map(label => ({ label, date: labelToDate(label), ...empty() }));
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const field = matchCsvField(row[0] || '');
      if (!field) continue;
      row.slice(1).forEach((val, idx) => { if (idx < periods.length) periods[idx][field] = parseNumMln(val); });
    }
    periods.forEach((p, i) => {
      if (p.revenue && p.grossProfit) p.grossMargin = p.grossProfit / p.revenue;
      if (p.revenue && p.ebitda) p.ebitdaMargin = p.ebitda / p.revenue;
      if ((p.fcf == null || p.fcf === 0) && p.operatingCashFlow != null && p.capex != null)
        p.fcf = p.operatingCashFlow - Math.abs(p.capex);
      if (i > 0 && p.revenue && periods[i-1].revenue)
        p.revenueGrowthYoY = (p.revenue - periods[i-1].revenue) / Math.abs(periods[i-1].revenue);
    });
    // extract sharesOutstanding from last non-null period into valuation (raw: multiply by 1e6)
    const lastShares = [...periods].reverse().find(p => p.sharesOutstandingPer != null);
    return {
      periods,
      valuation: {
        peRatio: null, forwardPE: null, evEbitda: null, ps: null, marketCap: null,
        sharesOutstanding: lastShares ? lastShares.sharesOutstandingPer : null,
        ev: null, pfcf: null, netDebtLatest: null,
      },
      currency: csvCurrency,
      period: isQuarterly ? 'quarterly' : 'annual',
    };
  }

  async function handleCsvUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const text = await file.text();
      const parsed = parseCsvToData(text);
      const token = localStorage.getItem(AUTH_KEY) || '';
      const resp = await fetch('/api/financials/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ symbol, period: parsed.period, data: parsed }),
      });
      if (!resp.ok) { const b = await resp.json().catch(() => ({})); throw new Error(b.error || 'save_error'); }
      const d = await resp.json();
      setData(d);
      setUploadOpen(false);
    } catch (e) {
      setUploadError(`Błąd: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  // ── Screenshot import (requires Anthropic API key) ────────────────────
  async function compressImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_W = 1600;
        let { width, height } = img;
        if (width > MAX_W) { height = Math.round(height * MAX_W / width); width = MAX_W; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          const reader = new FileReader();
          reader.onload = e => resolve(e.target.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.88);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  async function handleScreenshotUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const base64 = await compressImage(file);
      const token = localStorage.getItem(AUTH_KEY) || '';
      const resp = await fetch('/api/financials/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ symbol, period, image_b64: base64 }),
      });
      if (resp.status === 422) throw new Error('parse_failed');
      if (resp.status === 503) throw new Error('api_key_missing');
      if (!resp.ok) { const b = await resp.json().catch(() => ({})); throw new Error(b.error || 'upload_error'); }
      const d = await resp.json();
      setData(d);
      setUploadOpen(false);
    } catch (e) {
      if (e.message === 'parse_failed') setUploadError('Nie udało się odczytać tabeli — spróbuj z wyraźniejszym screenshotem');
      else if (e.message === 'api_key_missing') setUploadError('Brak klucza API na serwerze');
      else setUploadError(`Błąd: ${e.message}`);
    } finally {
      setUploading(false);
    }
  }

  function handlePaste(e) {
    if (!uploadOpen) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) { handleScreenshotUpload(item.getAsFile()); break; }
    }
  }

  const periods  = data?.periods ?? [];
  const currency = data?.currency ?? '';

  // auto-compute valuation from live price + stored shares; fall back to stored values
  const storedVal = data?.valuation ?? {};
  const lastPeriod = periods.length > 0 ? periods[periods.length - 1] : null;
  const shares = storedVal.sharesOutstanding ?? null; // raw units
  const liveMarketCap = (livePrice && shares) ? livePrice * shares : null;

  // For income statement items use TTM (sum of last 4 quarters) when in quarterly mode
  const isQuarterly = period === 'quarterly';
  const last4 = isQuarterly ? periods.slice(-4) : null;
  function ttmSum(field) {
    if (!last4) return lastPeriod?.[field] ?? null;
    const vals = last4.map(p => p[field]).filter(v => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
  }
  const ttmNetIncome = ttmSum('netIncome');
  const ttmRevenue   = ttmSum('revenue');
  const ttmEbitda    = ttmSum('ebitda');
  const ttmFcf       = ttmSum('fcf');

  // Balance sheet → most recent period
  const liveNetDebt = (lastPeriod?.totalDebt != null && lastPeriod?.cashAndEquivalents != null)
    ? lastPeriod.totalDebt - lastPeriod.cashAndEquivalents : null;
  const liveEV = (liveMarketCap != null && liveNetDebt != null) ? liveMarketCap + liveNetDebt : null;
  const val = {
    peRatio:         liveMarketCap && ttmNetIncome ? liveMarketCap / ttmNetIncome : storedVal.peRatio,
    forwardPE:       storedVal.forwardPE,
    evEbitda:        liveEV        && ttmEbitda    ? liveEV        / ttmEbitda    : storedVal.evEbitda,
    ps:              liveMarketCap && ttmRevenue   ? liveMarketCap / ttmRevenue   : storedVal.ps,
    pfcf:            liveMarketCap && ttmFcf       ? liveMarketCap / ttmFcf       : storedVal.pfcf,
    marketCap:       liveMarketCap ?? storedVal.marketCap,
    sharesOutstanding: shares,
    ev:              liveEV        ?? storedVal.ev,
    netDebtLatest:   liveNetDebt   ?? storedVal.netDebtLatest,
  };
  const sourceLabel = data
    ? `${data.source === 'yahoo' ? 'Yahoo Finance' : data.source === 'manual' ? 'CSV' : 'Screenshot'} · ${periods[0]?.label ?? ''}`
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

      {/* Import panel */}
      {uploadOpen && (
        <div style={{
          background: 'rgba(124, 158, 255, 0.06)',
          border: '1px solid rgba(124, 158, 255, 0.2)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
          fontSize: 11,
        }}>
          {/* CSV — primary (free) */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ color: 'var(--info)', fontWeight: 600, marginBottom: 4 }}>📄 Import CSV (bezpłatnie)</div>
            <div style={{ color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 6 }}>
              Format: pierwsza kolumna = nazwa wskaźnika, kolejne = lata/kwartały. Wartości w milionach.{' '}
              <a
                href="data:text/csv;charset=utf-8,Metric%2C2022%2C2023%2C2024%2C2025%0ARevenue%2C%2C%2C%2C%0AOperating%20Income%2C%2C%2C%2C%0AEBITDA%2C%2C%2C%2C%0ANet%20Income%2C%2C%2C%2C%0ATotal%20Assets%2C%2C%2C%2C%0ATotal%20Liabilities%2C%2C%2C%2C%0ATotal%20Equity%2C%2C%2C%2C%0ATotal%20Debt%2C%2C%2C%2C%0ACash%20from%20Operations%2C%2C%2C%2C%0ACapEx%2C%2C%2C%2C%0AFCF%2C%2C%2C%2C"
                download="financials_template.csv"
                style={{ color: 'var(--info)', textDecoration: 'underline' }}
              >pobierz szablon</a>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={() => csvRef.current?.click()}
                disabled={uploading}
                style={{ background: 'var(--info)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer' }}
              >{uploading ? 'Wczytuję…' : 'Wrzuć CSV'}</button>
              <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>Waluta:</span>
              <select
                value={csvCurrency}
                onChange={e => setCsvCurrency(e.target.value)}
                disabled={uploading}
                style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 6px', fontSize: 11 }}
              >
                {['PLN','EUR','USD','GBP','CHF','CZK','SEK','NOK','DKK'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Screenshot — secondary (requires API) */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div style={{ color: 'var(--text-dim)', fontWeight: 600, marginBottom: 4, fontSize: 10 }}>📎 Ze screenshota (wymaga Anthropic API)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ background: 'var(--panel-2)', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: uploading ? 'wait' : 'pointer' }}
              >Wrzuć obraz</button>
              <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>lub Ctrl+V</span>
            </div>
          </div>

          {uploadError && (
            <div style={{ color: 'var(--down)', fontSize: 11, marginTop: 6 }}>{uploadError}</div>
          )}
          <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
            onChange={e => { handleCsvUpload(e.target.files?.[0]); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { handleScreenshotUpload(e.target.files?.[0]); e.target.value = ''; }} />
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
          Brak danych z Yahoo Finance — zaimportuj CSV lub screenshot z InvestingPro / Bloomberg
        </div>
      )}

      {error === 'fetch_error' && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
          Błąd pobierania danych. Spróbuj ponownie później.
        </div>
      )}

      {data && periods.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
          Brak danych za wybrany okres
        </div>
      )}

      {/* Data tables */}
      {data && periods.length > 0 && (
        <>
          {/* Revenue chart + LFL KPI */}
          {isQuarterly && (
            <div style={{ background: 'var(--panel)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
              <RevenueChart periods={periods} currency={currency} />
            </div>
          )}

          {/* RZiS */}
          <Accordion title="Rachunek Zysków i Strat" unit={`mln ${currency}`} defaultOpen={true}>
            <ColumnHeaders periods={periods} />
            <TableRow label="Przychody" values={periods.map(p => p.revenue)} />
            <SubRow label="Wzrost r/r" values={periods.map(p => p.revenueGrowthYoY)} fmt={fmtPct} />
            {LFL_DATA[symbol] && (
              <SubRow label="Wzrost LFL (r/r)" values={periods.map(p => LFL_DATA[symbol][p.date] ?? null)} fmt={fmtPct} />
            )}
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
            <TableRow label="Aktywa obrotowe" values={periods.map(p => p.totalCurrentAssets)} />
            <TableRow label="Aktywa ogółem" values={periods.map(p => p.totalAssets)} />
            <TableRow label="Zob. bieżące" values={periods.map(p => p.totalCurrentLiabilities)} />
            <TableRow label="Zobowiązania" values={periods.map(p => p.totalLiabilities)} />
            <TableRow label="Kapitał własny" values={periods.map(p => p.equity)} />
            <TableRow label="Gotówka" values={periods.map(p => p.cashAndEquivalents)} />
            <TableRow label="Dług całkowity" values={periods.map(p => p.totalDebt)} />
          </Accordion>

          {/* Przepływy */}
          <Accordion title="Przepływy pieniężne" unit={`mln ${currency}`} defaultOpen={false}>
            <ColumnHeaders periods={periods} />
            <TableRow label="CFO (oper.)" values={periods.map(p => p.operatingCashFlow)} />
            <TableRow label="CAPEX / Inwest." values={periods.map(p => p.capex)} />
            <SubRow label="Stopa Reinwest." values={periods.map(p =>
              p.capex != null && p.operatingCashFlow != null && Math.abs(p.operatingCashFlow) > 0
                ? Math.abs(p.capex) / Math.abs(p.operatingCashFlow)
                : null
            )} fmt={v => v == null ? '—' : (v * 100).toFixed(0) + '%'} />
            <TableRow label="Finansowanie" values={periods.map(p => p.cashFromFinancing)} />
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
