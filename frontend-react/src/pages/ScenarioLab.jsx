// frontend-react/src/pages/ScenarioLab.jsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chart, registerables } from 'chart.js';
import Annotation from 'chartjs-plugin-annotation';
import {
  calcSigma, makePrices, calcPayoff, calcKPIs, calcGreeks,
} from '../utils/scenarioLab';

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

  const isSpread = SPREAD_STRATEGIES.has(strategy);
  const isWing   = WING_STRATEGIES.has(strategy);
  const isHedged = HEDGED_STRATEGIES.has(strategy);

  const [kpis,   setKpis]   = useState(null);
  const [greeks, setGreeks] = useState(null);
  const [sigma,  setSigma]  = useState(null);

  const renderChart = useCallback(() => {
    if (!canvasRef.current) return;

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

    if ((isHedged || isSpread) && !hideStock) {
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
  }, [strategy, entry, qty, strike, strike2, premium, dte, iv, wing, hideStock, isHedged, isSpread]);

  useEffect(() => {
    renderChart();
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [renderChart]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h2 className="text-lg font-bold text-slate-100">🧪 Scenario Lab — Akcje vs Opcje</h2>

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
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <canvas ref={canvasRef} height={320} />
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
