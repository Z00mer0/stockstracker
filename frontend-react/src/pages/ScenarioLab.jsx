// frontend-react/src/pages/ScenarioLab.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import Annotation from 'chartjs-plugin-annotation';
import { useApp } from '../context/AppContext';
import { fetchOptionChain, getMdApiKey } from '../services/MarketDataService';
import {
  calcSigma, makePrices, calcPayoff, calcKPIs, calcGreeks,
} from '../utils/scenarioLab';

const FINNHUB_TOKEN = 'd7uhj69r01qnv95nm3e0d7uhj69r01qnv95nm3eg';

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

function StatCard({ label, value, color = 'muted' }) {
  const colorMap = {
    blue:   'text-blue-400',
    green:  'text-emerald-400',
    red:    'text-rose-400',
    yellow: 'text-amber-400',
    muted:  'text-slate-400',
  };
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
      <div className="text-xs text-slate-400 font-semibold mb-1 uppercase tracking-wide">{label}</div>
      <div className={`text-base font-bold ${colorMap[color] || 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

const inputCls = "bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 text-sm w-full outline-none focus:border-indigo-500";

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export default function ScenarioLab() {
  const { portfolio } = useApp();
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  const [strategy, setStrategy] = useState('long-call');
  const [entry,    setEntry]    = useState(100);
  const [qty,      setQty]      = useState(1);
  const [strike,   setStrike]   = useState(105);
  const [strike2,  setStrike2]  = useState(110);
  const [premium,  setPremium]  = useState(3.50);
  const [dte,      setDte]      = useState(30);
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
    fetch(`https://finnhub.io/api/v1/quote?symbol=${selectedSymbol}&token=${FINNHUB_TOKEN}`)
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
    if (!ticker) { setChainError('Wprowadź ticker (np. AAPL)'); return; }
    if (!getMdApiKey()) { setChainError('Brak klucza API — ustaw go w Ustawienia → Klucze API'); return; }
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
      if (c.dte   != null) setDte(c.dte);
      if (c.iv    != null) setIv(Math.round(c.iv * 100));
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
        if (c1.dte != null) setDte(c1.dte);
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
        label: 'Tylko Akcje',
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
      label: 'Dzisiaj (T+0)',
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
            title: { display: true, text: 'Zysk / Strata ($)', color: '#8892a4', font: { size: 11 } },
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
      <h2 className="text-lg font-bold text-slate-100">🧪 Scenario Lab — Akcje vs Opcje</h2>

      {/* Stock picker + chain fetch */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 space-y-3">
        {/* Row 1: portfolio selector */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
            Spółka z portfela
          </label>
          <select
            value={selectedSymbol}
            onChange={e => { setSelectedSymbol(e.target.value); if (e.target.value) setChainTicker(e.target.value); }}
            className={inputCls + ' max-w-xs'}
          >
            <option value="">— własne wartości —</option>
            {portfolio.map(pos => (
              <option key={pos.id ?? pos.symbol} value={pos.symbol}>
                {pos.symbol}{pos.name && pos.name !== pos.symbol ? ` — ${pos.name}` : ''}
              </option>
            ))}
          </select>
          {fetchingPrice && <span className="text-xs text-slate-400 animate-pulse">Pobieranie kursu…</span>}
          {livePrice != null && !fetchingPrice && (
            <span className="text-xs bg-indigo-900/60 border border-indigo-700 text-indigo-300 rounded-md px-2 py-1 font-mono">
              {livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
          {selectedSymbol && !fetchingPrice && (
            <button onClick={() => setSelectedSymbol('')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto">
              ✕ wyczyść
            </button>
          )}
        </div>

        {/* Row 2: ticker input + fetch button */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">
            Ticker opcji
          </label>
          <input
            type="text"
            value={chainTicker}
            onChange={e => setChainTicker(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleFetchChain()}
            placeholder="np. AAPL"
            className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm w-28 outline-none focus:border-indigo-500 font-mono uppercase"
          />
          <button
            onClick={handleFetchChain}
            disabled={chainLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-wait text-sm font-semibold transition-colors"
          >
            {chainLoading
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : '🔍'}
            Pobierz łańcuch
          </button>
          {chain && !chainLoading && (
            <span className="text-xs text-emerald-400">
              ✓ {chain.contracts.length} kontraktów ({chain.expirations.length} dat)
            </span>
          )}
          {chainError && <span className="text-xs text-rose-400">{chainError}</span>}
        </div>

        {/* Row 3: chain dropdowns */}
        {chain && (
          <div className="border-t border-slate-700 pt-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                Wygaśnięcie
              </label>
              <select
                value={selectedExpiry}
                onChange={e => { setSelectedExpiry(e.target.value); setSelectedSym1(''); setSelectedSym2(''); }}
                className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500"
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
                <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                  Kontrakt
                </label>
                <select
                  value={selectedSym1}
                  onChange={e => applyContract(e.target.value, false)}
                  className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500 flex-1 min-w-[200px]"
                >
                  <option value="">— wybierz strike —</option>
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
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                    {strategy === 'iron-condor' ? 'Short Put' : 'Noga długa'}
                  </label>
                  <select
                    value={selectedSym1}
                    onChange={e => applyContract(e.target.value, false)}
                    className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500 flex-1 min-w-[200px]"
                  >
                    <option value="">— wybierz strike —</option>
                    {leg1Contracts.map(c => (
                      <option key={c.optionSymbol} value={c.optionSymbol}>
                        ${c.strike} · mid {c.mid != null ? `$${c.mid.toFixed(2)}` : '—'} · IV {c.iv != null ? `${(c.iv*100).toFixed(0)}%` : '—'} · Δ {c.delta != null ? c.delta.toFixed(2) : '—'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap w-24">
                    {strategy === 'iron-condor' ? 'Short Call' : 'Noga krótka'}
                  </label>
                  <select
                    value={selectedSym2}
                    onChange={e => applyContract(e.target.value, true)}
                    className="bg-slate-700 border border-slate-600 rounded-md px-3 py-1.5 text-slate-100 text-sm outline-none focus:border-indigo-500 flex-1 min-w-[200px]"
                  >
                    <option value="">— wybierz strike —</option>
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
      </div>

      {/* Form grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
          <Field label="Strategia">
            <select value={strategy} onChange={e => setStrategy(e.target.value)} className={inputCls}>
              {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Cena wejścia ($)">
            <input type="number" value={entry} min="0.01" step="0.01"
              onChange={e => setEntry(parseFloat(e.target.value) || 100)} className={inputCls} />
          </Field>
          {!isSpread && (
            <Field label="Ilość akcji / kontraktów">
              <input type="number" value={qty} min="1" step="1"
                onChange={e => setQty(parseInt(e.target.value) || 1)} className={inputCls} />
            </Field>
          )}
        </div>

        {/* Right panel */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
          <Field label={STRIKE_LABELS[strategy] || 'Strike ($)'}>
            <input type="number" value={strike} min="0.01" step="0.01"
              onChange={e => setStrike(parseFloat(e.target.value) || 100)} className={inputCls} />
          </Field>
          {isSpread && (
            <Field label={STRIKE2_LABELS[strategy] || 'Strike 2 ($)'}>
              <input type="number" value={strike2} min="0.01" step="0.01"
                onChange={e => setStrike2(parseFloat(e.target.value) || 110)} className={inputCls} />
            </Field>
          )}
          {isWing && (
            <Field label="Wing Width ($)">
              <input type="number" value={wing} min="0.5" step="0.5"
                onChange={e => setWing(parseFloat(e.target.value) || 5)} className={inputCls} />
            </Field>
          )}
          <Field label={PREMIUM_LABELS[strategy] || 'Premia ($ / opcja)'}>
            <input type="number" value={premium} min="0" step="0.01"
              onChange={e => setPremium(parseFloat(e.target.value) || 0)} className={inputCls} />
          </Field>
          <Field label="Dni do wygaśnięcia (DTE)">
            <input type="number" value={dte} min="1" step="1"
              onChange={e => setDte(parseInt(e.target.value) || 30)} className={inputCls} />
          </Field>
          <Field label="IV — Implied Volatility (%)">
            <input type="number" value={iv} min="1" max="500" step="1"
              onChange={e => setIv(parseFloat(e.target.value) || 30)} className={inputCls} />
          </Field>
        </div>
      </div>

      {/* Hide stock checkbox */}
      <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 select-none">
        <input type="checkbox" checked={hideStock} onChange={e => setHideStock(e.target.checked)}
          className="w-4 h-4 accent-indigo-500 cursor-pointer" />
        Ukryj linię bazową akcji
      </label>

      {/* KPI cards */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          {kpis.breakevens.length === 1 ? (
            <StatCard label="Break-even" value={fmtDollar(kpis.breakevens[0])} color="blue" />
          ) : (
            <>
              <StatCard label="BE dolny"  value={fmtDollar(kpis.breakevens[0])} color="blue" />
              <StatCard label="BE górny"  value={fmtDollar(kpis.breakevens[1])} color="blue" />
            </>
          )}
          <StatCard label="Max Zysk"   value={fmtDollar(kpis.maxProfit)} color="green" />
          <StatCard label="Max Strata" value={fmtDollar(kpis.maxLoss)}   color="red"   />
          <StatCard label="PoP"        value={(kpis.pop * 100).toFixed(1) + '%'} color="yellow" />
          {kpis.bpe > 0 && (
            <StatCard label="BPE (depozyt)" value={fmtDollar(kpis.bpe)} color="muted" />
          )}
          {kpis.moic != null && (
            <StatCard label="MOIC" value={kpis.moic.toFixed(2) + 'x'} color="yellow" />
          )}
          {sigma != null && (
            <StatCard label="±1σ zakres" value={'±$' + sigma.toFixed(2)} color="muted" />
          )}
        </div>
      )}

      {/* Chart */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4" style={{height: '360px'}}>
        <canvas ref={canvasRef} />
      </div>

      {/* Greeks */}
      {greeks && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Δ Delta (pozycja)</div>
            <div className={`text-xl font-bold ${greeks.posDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {greeks.posDelta.toFixed(3)}
            </div>
            <div className="text-xs text-slate-500 mt-1">zmiana P&L na $1 ruchu akcji</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-1">Θ Theta (dzienny, na opcję)</div>
            <div className={`text-xl font-bold ${greeks.posTheta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {greeks.posTheta.toFixed(4)}
            </div>
            <div className="text-xs text-slate-500 mt-1">dzienny upływ wartości czasowej</div>
          </div>
        </div>
      )}
    </div>
  );
}
