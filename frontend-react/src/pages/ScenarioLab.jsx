// frontend-react/src/pages/ScenarioLab.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import Annotation from 'chartjs-plugin-annotation';
import { useApp } from '../context/AppContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { fetchOptionChain, getMdApiKey } from '../services/MarketDataService';
import {
  calcSigma, makePrices, calcPayoff, calcKPIs, calcGreeks,
} from '../utils/scenarioLab';
import Card from '../components/shared/Card';

function dteToDateStr(days) {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, days));
  return d.toISOString().slice(0, 10);
}

function dateStrToDte(str) {
  if (!str) return 1;
  const diff = Math.round((new Date(str) - new Date()) / 86400000);
  return Math.max(1, diff);
}

Chart.register(...registerables, Annotation);

const STRATEGIES = [
  { value: 'long-call',        label: 'Long Call' },
  { value: 'long-put',         label: 'Long Put' },
  { value: 'covered-call',     label: 'Covered Call' },
  { value: 'protective-put',   label: 'Protective Put' },
  { value: 'csp',              label: 'Cash-Secured Put' },
  { value: 'bull-call-spread', label: 'Bull Call Spread' },
  { value: 'bear-put-spread',  label: 'Bear Put Spread' },
  { value: 'iron-condor',      label: 'Iron Condor' },
];

const SPREAD_STRATEGIES = new Set(['bull-call-spread','bear-put-spread','iron-condor']);
const WING_STRATEGIES   = new Set(['iron-condor']);
const HEDGED_STRATEGIES = new Set(['covered-call','protective-put']);

const STRIKE_LABELS = {
  'long-call':        'Strike Call ($)',
  'long-put':         'Strike Put ($)',
  'covered-call':     'Strike Call ($)',
  'protective-put':   'Strike Put ($)',
  'csp':              'Strike Put ($)',
  'bull-call-spread': 'Long Call Strike ($)',
  'bear-put-spread':  'Long Put Strike ($)',
  'iron-condor':      'Short Put Strike ($)',
};

const STRIKE2_LABELS = {
  'bull-call-spread': 'Short Call Strike ($)',
  'bear-put-spread':  'Short Put Strike ($)',
  'iron-condor':      'Short Call Strike ($)',
};

const PREMIUM_LABELS = {
  'bull-call-spread': 'Net Debit ($)',
  'bear-put-spread':  'Net Debit ($)',
  'iron-condor':      'Net Credit ($)',
};

function fmtDollar(n) {
  if (isNaN(n)) return '—';
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? '-$' : '$') + abs;
}

const colorVarMap = {
  blue:   'var(--info)',
  green:  'var(--up)',
  red:    'var(--down)',
  yellow: 'var(--warn)',
  muted:  'var(--text-dim)',
};

function StatCard({ label, value, color = 'muted' }) {
  return (
    <div className="kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 16, color: colorVarMap[color] || 'var(--text)' }}>{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

export default function ScenarioLab() {
  const { portfolio } = useApp();
  const t = useT();
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const [strategy, setStrategy] = useState('long-call');
  const [entry,    setEntry]    = useState(100);
  const [qty,      setQty]      = useState(1);
  const [strike,   setStrike]   = useState(105);
  const [strike2,  setStrike2]  = useState(110);
  const [premium,  setPremium]  = useState(3.50);
  const [dte,      setDte]      = useState(30);
  const [expiryDate, setExpiryDate] = useState(() => dteToDateStr(30));
  const [iv,       setIv]       = useState(30);
  const [wing,     setWing]     = useState(5);
  const [hideStock, setHideStock] = useState(false);

  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [livePrice,      setLivePrice]      = useState(null);
  const [fetchingPrice,  setFetchingPrice]  = useState(false);

  const [chain,          setChain]          = useState(null);
  const [chainLoading,   setChainLoading]   = useState(false);
  const [chainError,     setChainError]     = useState(null);
  const [chainTicker,    setChainTicker]    = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedSym1,   setSelectedSym1]   = useState('');
  const [selectedSym2,   setSelectedSym2]   = useState('');

  useEffect(() => {
    if (!selectedSymbol) { setLivePrice(null); return; }
    const pos = portfolio.find(p => p.symbol === selectedSymbol);
    setFetchingPrice(true);
    fetch(`/api/finnhub/v1/quote?symbol=${selectedSymbol}`, {
      headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        const price = data?.c > 0 ? data.c : pos?.avgPrice ?? 100;
        setLivePrice(data?.c > 0 ? data.c : null);
        setEntry(price);
        if (pos && !SPREAD_STRATEGIES.has(strategy)) {
          setQty(Math.round(pos.qty) || 1);
        }
        // suggested strike near ATM
        setStrike(parseFloat((price * 1.05).toFixed(2)));
        setStrike2(parseFloat((price * 1.10).toFixed(2)));
      })
      .catch(() => {
        if (pos) { setEntry(pos.avgPrice); setStrike(parseFloat((pos.avgPrice * 1.05).toFixed(2))); }
      })
      .finally(() => setFetchingPrice(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol]);

  const expiryContracts = chain
    ? chain.contracts.filter(c => c.expiry === selectedExpiry)
    : [];

  const leg1Side = ['long-put','protective-put','csp','bear-put-spread'].includes(strategy) ? 'put'
                 : strategy === 'iron-condor' ? 'put'
                 : 'call';
  const leg2Side = ['bull-call-spread','iron-condor'].includes(strategy) ? 'call' : 'put';

  const leg1Contracts = expiryContracts.filter(c => c.side === leg1Side);
  const leg2Contracts = expiryContracts.filter(c => c.side === leg2Side);

  async function handleFetchChain() {
    const ticker = (chainTicker || selectedSymbol || '').toUpperCase().trim();
    if (!ticker) { setChainError(t('scenario_err_enter_ticker')); return; }
    if (!getMdApiKey()) { setChainError(t('scenario_err_no_api')); return; }
    setChainLoading(true);
    setChainError(null);
    setChain(null);
    setSelectedExpiry('');
    setSelectedSym1('');
    setSelectedSym2('');
    try {
      const data = await fetchOptionChain(ticker);
      setChain(data);
      if (data.expirations.length) setSelectedExpiry(data.expirations[0]);
    } catch (e) {
      setChainError(e.message);
    } finally {
      setChainLoading(false);
    }
  }

  function applyContract(sym, isLeg2 = false) {
    const c = chain?.contracts.find(x => x.optionSymbol === sym);
    if (!c) return;
    if (!isLeg2) {
      setSelectedSym1(sym);
      setStrike(c.strike);
      if (c.dte != null) { setDte(c.dte); setExpiryDate(dteToDateStr(c.dte)); }
      if (c.iv  != null) setIv(Math.round(c.iv * 100));
      if (!SPREAD_STRATEGIES.has(strategy)) {
        const mid = c.mid ?? (c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : null);
        if (mid != null) setPremium(parseFloat(mid.toFixed(2)));
      }
    } else {
      setSelectedSym2(sym);
      setStrike2(c.strike);
    }

    const sym1 = isLeg2 ? selectedSym1 : sym;
    const sym2 = isLeg2 ? sym : selectedSym2;
    if (SPREAD_STRATEGIES.has(strategy) && sym1 && sym2) {
      const c1 = chain.contracts.find(x => x.optionSymbol === sym1);
      const c2 = chain.contracts.find(x => x.optionSymbol === sym2);
      if (c1 && c2) {
        if (c1.dte != null) { setDte(c1.dte); setExpiryDate(dteToDateStr(c1.dte)); }
        if (c1.iv  != null) setIv(Math.round(c1.iv * 100));
        const mid1 = c1.mid ?? (c1.bid != null && c1.ask != null ? (c1.bid + c1.ask) / 2 : 0);
        const mid2 = c2.mid ?? (c2.bid != null && c2.ask != null ? (c2.bid + c2.ask) / 2 : 0);
        if (strategy === 'iron-condor') {
          const longPut  = chain.contracts.find(x => x.side === 'put'  && Math.abs(x.strike - (c1.strike - wing)) < 0.01 && x.expiry === c1.expiry);
          const longCall = chain.contracts.find(x => x.side === 'call' && Math.abs(x.strike - (c2.strike + wing)) < 0.01 && x.expiry === c2.expiry);
          const lp = longPut?.mid  ?? longPut?.ask  ?? 0;
          const lc = longCall?.mid ?? longCall?.ask ?? 0;
          setPremium(parseFloat(Math.max(0, mid1 + mid2 - lp - lc).toFixed(2)));
        } else {
          setPremium(parseFloat(Math.max(0, mid1 - mid2).toFixed(2)));
        }
      }
    }
  }

  function resetParams() {
    const base = livePrice ?? entry;
    setIv(30);
    setDte(30);
    setExpiryDate(dteToDateStr(30));
    setPremium(3.50);
    setQty(1);
    if (livePrice) {
      setEntry(livePrice);
      setStrike(parseFloat((livePrice * 1.05).toFixed(2)));
      setStrike2(parseFloat((livePrice * 1.10).toFixed(2)));
    } else {
      setStrike(parseFloat((base * 1.05).toFixed(2)));
      setStrike2(parseFloat((base * 1.10).toFixed(2)));
    }
  }

  const isSpread = SPREAD_STRATEGIES.has(strategy);
  const isWing   = WING_STRATEGIES.has(strategy);
  const isHedged = HEDGED_STRATEGIES.has(strategy);

  const [kpis,   setKpis]   = useState(null);
  const [greeks, setGreeks] = useState(null);
  const [sigma,  setSigma]  = useState(null);

  const renderChart = useCallback(() => {
    if (!canvasRef.current) return;

    const isSpreadLocal = SPREAD_STRATEGIES.has(strategy);
    const isHedgedLocal = HEDGED_STRATEGIES.has(strategy);

    const ivDec  = iv / 100;
    const T      = dte / 365;
    const sig    = calcSigma(entry, ivDec, dte);
    const prices = makePrices(entry, ivDec, dte);

    const params = { entry, qty, strike, strike2, premium, T, iv: ivDec, wing };
    const { expiry, t0, stock } = calcPayoff(strategy, prices, params);
    const kpisCalc   = calcKPIs(strategy, params);
    const greeksCalc = calcGreeks(strategy, params);

    setKpis(kpisCalc);
    setGreeks(greeksCalc);
    setSigma(sig);

    // Find index of price closest to target
    const findIdx = (target) => prices.reduce((best, p, i) =>
      Math.abs(p - target) < Math.abs(prices[best] - target) ? i : best, 0);

    const labels   = prices.map(p => '$' + p.toFixed(0));
    const datasets = [];

    if ((isHedgedLocal || isSpreadLocal) && !hideStock) {
      datasets.push({
        label: t('scenario_stock_only'),
        data: stock,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,.05)',
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0.1,
      });
    }

    datasets.push({
      label: STRATEGIES.find(s => s.value === strategy)?.label || strategy,
      data: expiry,
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,.08)',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0.1,
    });

    datasets.push({
      label: t('scenario_today_t0'),
      data: t0,
      borderColor: '#c084fc',
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderDash: [4, 3],
      pointRadius: 0,
      tension: 0.3,
    });

    const annotations = {
      entryLine: {
        type: 'line', xMin: findIdx(entry), xMax: findIdx(entry),
        borderColor: 'rgba(248,250,252,0.2)', borderWidth: 1, borderDash: [2, 4],
        label: { content: 'Entry', display: true, color: '#94a3b8', font: { size: 10 }, position: 'start' },
      },
      sigma1Lo: {
        type: 'line', xMin: findIdx(entry - sig), xMax: findIdx(entry - sig),
        borderColor: 'rgba(99,102,241,0.5)', borderWidth: 1, borderDash: [4, 4],
        label: { content: '-1σ', display: true, color: '#818cf8', font: { size: 10 }, position: 'start' },
      },
      sigma1Hi: {
        type: 'line', xMin: findIdx(entry + sig), xMax: findIdx(entry + sig),
        borderColor: 'rgba(99,102,241,0.5)', borderWidth: 1, borderDash: [4, 4],
        label: { content: '+1σ', display: true, color: '#818cf8', font: { size: 10 }, position: 'start' },
      },
    };

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#e2e8f0', font: { size: 12, weight: '600' } } },
          tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + fmtDollar(ctx.parsed.y) } },
          annotation: { annotations },
        },
        scales: {
          x: { ticks: { color: '#8892a4', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,.04)' } },
          y: {
            ticks: { color: '#8892a4', callback: v => fmtDollar(v) },
            grid: { color: 'rgba(255,255,255,.04)' },
            title: { display: true, text: t('scenario_pnl_axis'), color: '#8892a4', font: { size: 11 } },
          },
        },
      },
    });
  }, [strategy, entry, qty, strike, strike2, premium, dte, iv, wing, hideStock]);

  useEffect(() => {
    renderChart();
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [renderChart]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{t('scenario_title')}</h2>

      {/* Stock picker + chain fetch */}
      <Card title={t('scenario_stock_chain')}>
        {/* Row 1: portfolio selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="field-label whitespace-nowrap">
            {t('scenario_portfolio_stock')}
          </label>
          <select
            value={selectedSymbol}
            onChange={e => { setSelectedSymbol(e.target.value); if (e.target.value) setChainTicker(e.target.value); }}
            className="field-input max-w-xs"
          >
            <option value="">{t('scenario_own_values')}</option>
            {portfolio.map(pos => (
              <option key={pos.id ?? pos.symbol} value={pos.symbol}>
                {pos.symbol}{pos.name && pos.name !== pos.symbol ? ` — ${pos.name}` : ''}
              </option>
            ))}
          </select>
          {fetchingPrice && <span className="text-xs animate-pulse" style={{ color: 'var(--text-dim)' }}>{t('scenario_fetching_price')}</span>}
          {livePrice != null && !fetchingPrice && (
            <span className="text-xs rounded-md px-2 py-1 font-mono" style={{ background: 'var(--panel-2)', border: '1px solid var(--border)', color: 'var(--info)' }}>
              {livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {selectedSymbol && !fetchingPrice && (
            <button onClick={() => setSelectedSymbol('')} className="btn text-xs ml-auto">
              {t('scenario_clear')}
            </button>
          )}
        </div>

        {/* Row 2: ticker input + fetch button */}
        <div className="flex items-center gap-2 flex-wrap mt-3">
          <label className="field-label whitespace-nowrap">
            {t('scenario_ticker_option')}
          </label>
          <input
            type="text"
            value={chainTicker}
            onChange={e => setChainTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleFetchChain()}
            placeholder="np. AAPL"
            className="field-input w-28 font-mono"
            style={{ textTransform: 'uppercase' }}
          />
          <button
            onClick={handleFetchChain}
            disabled={chainLoading}
            className="btn btn-primary"
          >
            {chainLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : '🔍'}
            {t('scenario_fetch_chain')}
          </button>
          {chain && !chainLoading && (
            <span className="text-xs" style={{ color: 'var(--up)' }}>
              ✓ {chain.contracts.length} {t('scenario_contracts_count')} ({chain.expirations.length} {t('scenario_dates_count')})
            </span>
          )}
          {chainError && <span className="text-xs" style={{ color: 'var(--down)' }}>{chainError}</span>}
        </div>

        {/* Row 3: chain dropdowns */}
        {chain && (
          <div className="flex flex-col gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="field-label whitespace-nowrap w-24">
                {t('scenario_expiry')}
              </label>
              <select
                value={selectedExpiry}
                onChange={e => { setSelectedExpiry(e.target.value); setSelectedSym1(''); setSelectedSym2(''); }}
                className="field-input"
              >
                {chain.expirations.map(exp => {
                  const c = chain.contracts.find(x => x.expiry === exp);
                  return (
                    <option key={exp} value={exp}>
                      {exp}{c?.dte != null ? ` (${c.dte}d)` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            {!SPREAD_STRATEGIES.has(strategy) && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="field-label whitespace-nowrap w-24">
                  {t('scenario_contract')}
                </label>
                <select
                  value={selectedSym1}
                  onChange={e => applyContract(e.target.value, false)}
                  className="field-input flex-1 min-w-[200px]"
                >
                  <option value="">{t('scenario_choose_strike')}</option>
                  {leg1Contracts.map(c => (
                    <option key={c.optionSymbol} value={c.optionSymbol}>
                      ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {SPREAD_STRATEGIES.has(strategy) && (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="field-label whitespace-nowrap w-24">
                    {strategy === 'iron-condor' ? 'Short Put' : t('scenario_long_leg')}
                  </label>
                  <select
                    value={selectedSym1}
                    onChange={e => applyContract(e.target.value, false)}
                    className="field-input flex-1 min-w-[200px]"
                  >
                    <option value="">{t('scenario_choose_strike')}</option>
                    {leg1Contracts.map(c => (
                      <option key={c.optionSymbol} value={c.optionSymbol}>
                        ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="field-label whitespace-nowrap w-24">
                    {strategy === 'iron-condor' ? 'Short Call' : t('scenario_short_leg')}
                  </label>
                  <select
                    value={selectedSym2}
                    onChange={e => applyContract(e.target.value, true)}
                    className="field-input flex-1 min-w-[200px]"
                  >
                    <option value="">{t('scenario_choose_strike')}</option>
                    {leg2Contracts.map(c => (
                      <option key={c.optionSymbol} value={c.optionSymbol}>
                        ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Toolbar */}
      <div className="flex justify-end">
        <button onClick={resetParams} className="btn">
          {t('scenario_reset')}
        </button>
      </div>

      {/* Form grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Left panel */}
        <Card title={t('scenario_basic_params')}>
          <div className="flex flex-col gap-3">
            <Field label="Strategia">
              <select value={strategy} onChange={e => setStrategy(e.target.value)} className="field-input">
                {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label={t('scenario_entry_price')}>
              <input type="number" value={entry} min="0.01" step="0.01"
                onChange={e => setEntry(parseFloat(e.target.value) || 100)} className="field-input" />
              {strategy === 'covered-call' && livePrice != null && Math.abs((entry - livePrice) / livePrice) > 0.15 && (
                <span className="text-xs" style={{ color: 'var(--warn)' }}>{t('scenario_price_warning')} ({livePrice.toFixed(2)})</span>
              )}
            </Field>
            {!isSpread && (
              <Field label={t('scenario_qty_contracts')}>
                <input type="number" value={qty} min="1" step="1"
                  onChange={e => setQty(parseInt(e.target.value) || 1)} className="field-input" />
              </Field>
            )}
          </div>
        </Card>

        {/* Right panel */}
        <Card title={t('scenario_option_params')}>
          <div className="flex flex-col gap-3">
            <Field label={STRIKE_LABELS[strategy] || 'Strike ($)'}>
              <input type="number" value={strike} min="0.01" step="0.01"
                onChange={e => setStrike(parseFloat(e.target.value) || 100)} className="field-input" />
            </Field>
            {isSpread && (
              <Field label={STRIKE2_LABELS[strategy] || 'Strike 2 ($)'}>
                <input type="number" value={strike2} min="0.01" step="0.01"
                  onChange={e => setStrike2(parseFloat(e.target.value) || 110)} className="field-input" />
              </Field>
            )}
            {isWing && (
              <Field label="Wing Width ($)">
                <input type="number" value={wing} min="0.5" step="0.5"
                  onChange={e => setWing(parseFloat(e.target.value) || 5)} className="field-input" />
              </Field>
            )}
            <Field label={PREMIUM_LABELS[strategy] || 'Premium ($ / option)'}>
              <input type="number" value={premium} min="0" step="0.01"
                onChange={e => setPremium(parseFloat(e.target.value) || 0)} className="field-input" />
            </Field>
            <Field label={t('scenario_expiry_date').replace('{dte}', dte)}>
              <input
                type="date"
                value={expiryDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => { setExpiryDate(e.target.value); setDte(dateStrToDte(e.target.value)); }}
                className="field-input"
              />
            </Field>
            <Field label="IV — Implied Volatility (%)">
              <input type="number" value={iv} min="1" max="500" step="1"
                onChange={e => setIv(parseFloat(e.target.value) || 30)} className="field-input" />
            </Field>
          </div>
        </Card>
      </div>

      {/* Hide stock checkbox */}
      <label className="flex items-center gap-2 cursor-pointer text-sm select-none" style={{ color: 'var(--text-dim)' }}>
        <input type="checkbox" checked={hideStock} onChange={e => setHideStock(e.target.checked)}
          className="w-4 h-4 accent-indigo-500 cursor-pointer" />
        {t('scenario_hide_stock')}
      </label>

      {/* KPI cards */}
      {kpis && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {kpis.breakevens.length === 1 ? (
            <StatCard label="Break-even" value={fmtDollar(kpis.breakevens[0])} color="blue" />
          ) : (
            <>
              <StatCard label={t('scenario_be_lower')}  value={fmtDollar(kpis.breakevens[0])} color="blue" />
              <StatCard label={t('scenario_be_upper')}  value={fmtDollar(kpis.breakevens[1])} color="blue" />
            </>
          )}
          <StatCard label={t('scenario_max_profit')}   value={fmtDollar(kpis.maxProfit)} color="green" />
          <StatCard label={t('scenario_max_loss')} value={fmtDollar(kpis.maxLoss)}   color="red"   />
          <StatCard label="PoP"        value={(kpis.pop * 100).toFixed(1) + '%'} color="yellow" />
          {kpis.bpe > 0 && (
            <StatCard label={t('scenario_bpe')} value={fmtDollar(kpis.bpe)} color="muted" />
          )}
          {kpis.moic != null && (
            <StatCard label="MOIC" value={kpis.moic.toFixed(2) + 'x'} color="yellow" />
          )}
          {isFinite(kpis.maxProfit) && isFinite(kpis.maxLoss) && kpis.maxLoss !== 0 && (
            <StatCard
              label="R/R Ratio"
              value={(Math.abs(kpis.maxProfit) / Math.abs(kpis.maxLoss)).toFixed(2) + ' : 1'}
              color="muted"
            />
          )}
          {kpis.bpe > 0 && isFinite(kpis.maxProfit) && (
            <StatCard
              label="Return on Capital"
              value={((kpis.maxProfit / kpis.bpe) * 100).toFixed(1) + '%'}
              color={kpis.maxProfit >= 0 ? 'green' : 'red'}
            />
          )}
          {sigma != null && (
            <StatCard label={t('scenario_sigma_range')} value={'±$' + sigma.toFixed(2)} color="muted" />
          )}
        </div>
      )}

      {/* Chart */}
      <Card>
        <div style={{ height: 360 }}>
          <canvas ref={canvasRef} />
        </div>
      </Card>

      {/* Greeks */}
      {greeks && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Card>
            <div className="kpi-label">Δ Delta</div>
            <div className="kpi-value" style={{ fontSize: 20, color: greeks.posDelta >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {greeks.posDelta.toFixed(3)}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{t('scenario_delta_sub')}</div>
          </Card>
          <Card>
            <div className="kpi-label">{t('scenario_theta_label')}</div>
            <div className="kpi-value" style={{ fontSize: 20, color: greeks.posTheta >= 0 ? 'var(--up)' : 'var(--down)' }}>
              {greeks.posTheta.toFixed(4)}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{t('scenario_theta_sub')}</div>
          </Card>
        </div>
      )}

      <RunwayCalculator />
    </div>
  );
}

function RunwayCalculator() {
  const t = useT();
  const { locale } = useLanguage();
  const [capital,    setCapital]    = useState(500000);
  const [monthly,    setMonthly]    = useState(5000);
  const [returnPct,  setReturnPct]  = useState(5);
  const [inflation,  setInflation]  = useState(3);

  const fmt = (n) => n.toLocaleString(locale, { maximumFractionDigits: 0 });

  const r  = (1 + returnPct / 100) / (1 + inflation / 100) - 1;
  const rm = Math.pow(1 + r, 1 / 12) - 1;

  let totalMonths = null;
  let isEternal   = false;

  if (rm <= 0) {
    totalMonths = monthly > 0 ? Math.floor(capital / monthly) : Infinity;
  } else {
    const ratio = capital * rm / monthly;
    if (ratio >= 1) {
      isEternal = true;
    } else {
      totalMonths = Math.floor(-Math.log(1 - ratio) / Math.log(1 + rm));
    }
  }

  const years  = isEternal ? null : Math.floor(totalMonths / 12);
  const months = isEternal ? null : totalMonths % 12;

  const capitalAfterYears = (N) => {
    if (rm === 0) return capital - monthly * 12 * N;
    return capital * Math.pow(1 + rm, 12 * N) - monthly * (Math.pow(1 + rm, 12 * N) - 1) / rm;
  };

  const milestones = [5, 10, 20, 30];

  const mainColor = isEternal
    ? 'var(--up)'
    : years >= 20
      ? 'var(--up)'
      : years >= 10
        ? 'var(--warn)'
        : 'var(--down)';

  return (
    <div style={{
      border: '1px solid var(--border)',
      background: 'var(--bg-2)',
      borderRadius: 12,
      padding: 24,
    }}>
      <div className="text-lg font-bold" style={{ color: 'var(--text)', marginBottom: 16 }}>
        {t('runway_title')}
      </div>

      {/* Inputs 2x2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="flex flex-col gap-1">
          <label className="field-label">{t('runway_capital')}</label>
          <input
            type="number"
            className="field-input"
            value={capital}
            min="0"
            step="10000"
            onChange={e => setCapital(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="field-label">{t('runway_monthly_exp')}</label>
          <input
            type="number"
            className="field-input"
            value={monthly}
            min="0"
            step="100"
            onChange={e => setMonthly(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="field-label">{t('runway_return_pct')}</label>
          <input
            type="number"
            className="field-input"
            value={returnPct}
            min="0"
            max="100"
            step="0.5"
            onChange={e => setReturnPct(parseFloat(e.target.value) || 0)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="field-label">{t('runway_inflation')}</label>
          <input
            type="number"
            className="field-input"
            value={inflation}
            min="0"
            max="50"
            step="0.5"
            onChange={e => setInflation(parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>

      {/* Separator */}
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 20 }} />

      {/* Main result */}
      <div style={{ marginBottom: 20 }}>
        {isEternal ? (
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--up)' }}>
            {t('runway_eternal')}
          </div>
        ) : (
          <div style={{ fontSize: 32, fontWeight: 800, color: mainColor, fontVariantNumeric: 'tabular-nums' }}>
            {t('runway_years_months').replace('{y}', years).replace('{m}', months)}
          </div>
        )}
        {!isEternal && (
          <div className="text-xs" style={{ color: 'var(--text-dim)', marginTop: 4 }}>
            {t('runway_real_return')}: {(r * 100).toFixed(2)}% / rok &nbsp;·&nbsp; miesięcznie: {(rm * 100).toFixed(3)}%
          </div>
        )}
      </div>

      {/* Milestones table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-dim)', fontWeight: 600 }}>{t('runway_year_col')}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--text-dim)', fontWeight: 600 }}>{t('runway_remaining_capital')}</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-dim)', fontWeight: 600 }}>{t('runway_status_col')}</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map(yr => {
            const k = capitalAfterYears(yr);
            const exhausted = !isEternal && totalMonths != null && yr * 12 > totalMonths;
            const remaining = exhausted ? 0 : k;
            const ratio = remaining / capital;
            const dot = exhausted || remaining <= 0
              ? '🔴'
              : ratio >= 0.5
                ? '🟢'
                : '🟡';
            return (
              <tr key={yr} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '7px 8px', color: 'var(--text)' }}>{yr}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text)' }}>
                  {exhausted || remaining <= 0 ? '—' : fmt(remaining) + ' zł'}
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'center' }}>{dot}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
