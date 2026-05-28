import React, { useState, useEffect, useRef, useMemo } from 'react';
import FinancialsTab from './FinancialsTab';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];
const PERIODS = [
  { key: '1M', days: 30 },
  { key: '3M', days: 90 },
  { key: '6M', days: 180 },
  { key: '1R', days: 365 },
];
const CM = { top: 8, right: 8, bottom: 22, left: 8 };
const CHART_H = 150;

function MiniChart({ data, period }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(440);

  useEffect(() => {
    const obs = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const p = PERIODS.find(x => x.key === period);
    if (!p) return data;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - p.days);
    const cutStr = cutoff.toISOString().slice(0, 10);
    return data.filter(d => d.date >= cutStr);
  }, [data, period]);

  if (filtered.length < 2) return <div ref={containerRef} style={{ height: CHART_H + CM.top + CM.bottom }} />;

  const chartW = width - CM.left - CM.right;
  const totalH = CHART_H + CM.top + CM.bottom;
  const prices = filtered.map(d => d.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const pad = range * 0.1;

  const xScale = i => CM.left + (i / (filtered.length - 1)) * chartW;
  const yScale = v => CM.top + CHART_H - ((v - minP + pad) / (range + pad * 2)) * CHART_H;

  const linePath = filtered.map((d, i) =>
    `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(d.price).toFixed(1)}`
  ).join(' ');
  const areaPath = `${linePath} L${xScale(filtered.length - 1).toFixed(1)},${(CM.top + CHART_H).toFixed(1)} L${CM.left.toFixed(1)},${(CM.top + CHART_H).toFixed(1)} Z`;

  const isUp = filtered[filtered.length - 1].price >= filtered[0].price;
  const lineColor = isUp ? '#10b981' : '#f43f5e';

  const labelStep = Math.max(1, Math.floor(filtered.length / 5));
  const dateLabels = filtered
    .map((d, i) => ({ i, date: d.date }))
    .filter((_, i) => i % labelStep === 0 || i === filtered.length - 1);

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={totalH}>
        <defs>
          <linearGradient id="sdm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#sdm-area)" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        {dateLabels.map(({ i, date }) => (
          <text key={i} x={xScale(i)} y={totalH - 4} fill="#64748b" fontSize={9} textAnchor="middle">
            {date.slice(5).replace('-', '/')}
          </text>
        ))}
      </svg>
    </div>
  );
}

export default function StockDetailModal({ item, existingPortfolio, onSave, onClose }) {
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState('3M');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(item.currency || (item.symbol?.endsWith('.WA') ? 'PLN' : 'USD'));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [funding, setFunding] = useState('topup');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('wykres');
  const [financialsMounted, setFinancialsMounted] = useState(false);

  function switchTab(tab) {
    setActiveTab(tab);
    if (tab === 'finanse') setFinancialsMounted(true);
  }

  useEffect(() => {
    setChartLoading(true);
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1d&range=1y`;
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10000),
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(json => {
        const result = json?.chart?.result?.[0];
        if (!result) return;
        const timestamps = result.timestamp ?? [];
        const closes = result.indicators?.quote?.[0]?.close ?? [];
        const pts = timestamps
          .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), price: closes[i] }))
          .filter(p => p.price != null);
        setChartData(pts);
        if (pts.length > 0) setPrice(pts[pts.length - 1].price.toFixed(2));
      })
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [item.symbol]);

  const currentPrice = chartData.length > 0 ? chartData[chartData.length - 1].price : null;
  const prevClose = chartData.length > 1 ? chartData[chartData.length - 2].price : null;
  const dayChangePct = currentPrice != null && prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : null;

  const existing = existingPortfolio?.find(h => h.symbol === item.symbol);

  async function handleSave() {
    const qtyNum = parseFloat(qty);
    const priceNum = parseFloat(price);
    if (isNaN(qtyNum) || qtyNum <= 0) { setError('Podaj ilość akcji'); return; }
    if (isNaN(priceNum) || priceNum <= 0) { setError('Podaj cenę zakupu'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: item.symbol, qty: qtyNum, price: priceNum, currency, date, note: note.trim(), funding });
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-2)', border: '1px solid var(--border)',
          borderRadius: 12, width: '100%', maxWidth: 480,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Stock header */}
        <div style={{ padding: '18px 20px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 38, height: 38, borderRadius: 8, background: 'var(--panel-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
            }}>{item.symbol?.slice(0, 2)}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{item.symbol}</div>
              {item.name && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1 }}>{item.name}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {currentPrice != null && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {currentPrice.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                </div>
                {dayChangePct != null && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: dayChangePct >= 0 ? 'var(--up)' : 'var(--down)', marginTop: 2 }}>
                    {dayChangePct >= 0 ? '▲' : '▼'} {Math.abs(dayChangePct).toFixed(2)}%
                  </div>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}
            >✕</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, margin: '12px 20px 0', borderBottom: '1px solid var(--border)' }}>
          {[['wykres', 'Wykres'], ['pozycja', 'Pozycja'], ['finanse', 'Finanse']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => switchTab(k)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === k ? '2px solid var(--accent)' : '2px solid transparent',
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: activeTab === k ? 600 : 400,
                color: activeTab === k ? 'var(--text)' : 'var(--text-dim)',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >{l}</button>
          ))}
        </div>

        {/* Wykres tab */}
        {activeTab === 'wykres' && (
        <div style={{ padding: '8px 20px 0' }}>
          {chartLoading ? (
            <div style={{ height: CHART_H + CM.top + CM.bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wykresu…</span>
            </div>
          ) : chartData.length >= 2 ? (
            <>
              <MiniChart data={chartData} period={chartPeriod} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setChartPeriod(p.key)}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: chartPeriod === p.key ? 'var(--accent)' : 'var(--panel-2)',
                      color: chartPeriod === p.key ? '#fff' : 'var(--text-dim)',
                      fontWeight: chartPeriod === p.key ? 600 : 400,
                      transition: 'background 0.15s',
                    }}
                  >{p.key}</button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Brak danych wykresu</span>
            </div>
          )}
        </div>
        )}

        {/* Pozycja tab */}
        {activeTab === 'pozycja' && (
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Dodaj do portfela</div>

          {existing && (
            <p style={{ fontSize: 11, color: 'var(--warn)', marginBottom: 12, padding: '6px 10px', background: 'rgba(245,158,11,0.08)', borderRadius: 6 }}>
              Masz już {existing.qty} szt. po śr. {existing.avgPrice} {existing.currency} — zostanie uśrednione
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="field-label">Ilość akcji *</label>
              <input
                type="number" min="0" step="any" className="field-input"
                placeholder="10" value={qty}
                onChange={e => setQty(e.target.value)} autoFocus
              />
            </div>
            <div>
              <label className="field-label">Cena zakupu *</label>
              <input
                type="number" min="0" step="any" className="field-input"
                placeholder="150.00" value={price}
                onChange={e => setPrice(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label className="field-label">Waluta</label>
              <select className="field-input" value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Data zakupu</label>
              <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="field-label">Notatka (opcjonalna)</label>
            <input
              className="field-input"
              placeholder="np. długoterminowo…"
              value={note} onChange={e => setNote(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="field-label">Źródło środków</label>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8 }}>
              {[['topup', '💼 Dopłata'], ['cash', '💵 Gotówka']].map(([k, l]) => (
                <button
                  key={k} type="button" onClick={() => setFunding(k)}
                  style={{
                    flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 600,
                    border: 'none', borderRadius: 6, cursor: 'pointer',
                    background: funding === k ? 'var(--bg-2)' : 'transparent',
                    color: funding === k ? 'var(--text)' : 'var(--text-dim)',
                    boxShadow: funding === k ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >{l}</button>
              ))}
            </div>
          </div>

          {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" style={{ flex: 1 }} onClick={onClose}>Anuluj</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
              {saving ? 'Zapisuję…' : 'Dodaj do portfela'}
            </button>
          </div>
        </div>
        )}

        {/* Finanse tab — lazy mount */}
        {financialsMounted && (
          <div style={{ display: activeTab === 'finanse' ? 'block' : 'none' }}>
            <FinancialsTab symbol={item.symbol} />
          </div>
        )}
      </div>
    </div>
  );
}
