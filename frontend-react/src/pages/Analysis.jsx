import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import Spinner from '../components/shared/Spinner';

function calcDailyReturns(values) {
  const r = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i-1] > 0) {
      const ret = (values[i] - values[i-1]) / values[i-1];
      if (Math.abs(ret) <= 0.5) r.push(ret);
    }
  }
  return r;
}

function calcVolatility(values) {
  const r = calcDailyReturns(values);
  if (r.length < 10) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const variance = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

function calcMaxDrawdown(values) {
  let peak = -Infinity, maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

function calcSharpe(values, rf = 0.045) {
  const r = calcDailyReturns(values);
  if (r.length < 10) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length * 252;
  const vol = calcVolatility(values) / 100;
  return vol > 0 ? (mean - rf) / vol : null;
}

function calcSortino(values, rf = 0.045) {
  const r = calcDailyReturns(values);
  if (r.length < 10) return null;
  const mean = r.reduce((s, x) => s + x, 0) / r.length * 252;
  const downside = r.filter(x => x < 0);
  if (!downside.length) return null;
  const downVar = downside.reduce((s, x) => s + x ** 2, 0) / downside.length;
  const downVol = Math.sqrt(downVar * 252);
  return downVol > 0 ? (mean - rf) / downVol : null;
}

function calcBeta(portValues, bmValues) {
  const portR = calcDailyReturns(portValues);
  const bmR = [];
  for (let i = 1; i < portValues.length; i++) bmR.push(bmValues[i] != null && bmValues[i-1] != null ? (bmValues[i]-bmValues[i-1])/bmValues[i-1] : null);
  const pairs = portR.map((r, i) => [r, bmR[i]]).filter(([a,b]) => b != null);
  if (pairs.length < 10) return null;
  const n = pairs.length;
  const meanP = pairs.reduce((s,[p]) => s+p, 0) / n;
  const meanB = pairs.reduce((s,[,b]) => s+b, 0) / n;
  const cov = pairs.reduce((s,[p,b]) => s+(p-meanP)*(b-meanB), 0) / n;
  const varB = pairs.reduce((s,[,b]) => s+(b-meanB)**2, 0) / n;
  return varB > 0 ? cov / varB : null;
}

function RiskSection({ snapshots }) {
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map(s => s.total).filter(v => v > 0);
  const dates = sorted.map(s => s.date).filter((_, i) => sorted[i].total > 0);
  const daySpan = dates.length >= 2
    ? Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000)
    : 0;
  const [beta, setBeta] = useState(null);
  const [betaLoading, setBetaLoading] = useState(false);

  useEffect(() => {
    if (values.length < 10 || daySpan < 14) return;
    const ctrl = new AbortController();
    setBetaLoading(true);
    const dates = snapshots.map(s => s.date);
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5y';
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const result = data.chart?.result?.[0];
        if (!result) return;
        const timestamps = result.timestamp;
        const prices = result.indicators?.adjclose?.[0]?.adjclose;
        if (!timestamps || !prices) return;
        const priceMap = {};
        timestamps.forEach((ts, i) => {
          const d = new Date(ts * 1000).toISOString().slice(0, 10);
          priceMap[d] = prices[i];
        });
        const bmValues = dates.map(d => priceMap[d] ?? null);
        let last = null;
        const filled = bmValues.map(v => { if (v != null) last = v; return last; });
        setBeta(calcBeta(values, filled));
      })
      .catch(e => { if (e.name !== 'AbortError') console.warn('[risk/beta]', e.message); })
      .finally(() => setBetaLoading(false));
    return () => ctrl.abort();
  }, [snapshots.length]);

  const vol = calcVolatility(values);
  const maxDD = calcMaxDrawdown(values);
  const sharpe = calcSharpe(values);
  const sortino = calcSortino(values);

  if (values.length < 10 || daySpan < 14) return null;

  const metric = (label, value, tooltip) => (
    <div className="rounded-lg bg-slate-900/60 px-4 py-3 flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className="text-xl font-bold text-slate-100">{value ?? '—'}</span>
      <span className="text-xs text-slate-600">{tooltip}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">Analiza ryzyka</h2>
        <p className="text-xs text-slate-500 mt-0.5">Na podstawie historii snapshotów portfela</p>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metric('Zmienność (rok.)', vol != null ? <span className={vol < 15 ? 'text-emerald-400' : vol > 30 ? 'text-red-400' : 'text-amber-400'}>{vol.toFixed(1)}%</span> : '—', 'Odch. std. zwrotów × √252')}
        {metric('Max Drawdown', maxDD > 0 ? <span className={maxDD < 10 ? 'text-emerald-400' : maxDD > 25 ? 'text-red-400' : 'text-amber-400'}>-{maxDD.toFixed(1)}%</span> : '—', 'Największy spadek od szczytu')}
        {metric('Sharpe Ratio', sharpe != null ? <span className={sharpe >= 1 ? 'text-emerald-400' : sharpe < 0 ? 'text-red-400' : 'text-slate-300'}>{sharpe.toFixed(2)}</span> : '—', 'Zwrot / ryzyko (RF=4,5%)')}
        {metric('Sortino Ratio', sortino != null ? <span className={sortino >= 1 ? 'text-emerald-400' : sortino < 0 ? 'text-red-400' : 'text-slate-300'}>{sortino.toFixed(2)}</span> : '—', 'Jak Sharpe, tylko dół')}
        {metric('Beta (S&P 500)', betaLoading ? <span className="text-slate-500 text-sm">ładowanie…</span> : beta != null ? <span className="text-slate-100">{beta.toFixed(2)}</span> : '—', 'Korelacja z rynkiem US')}
      </div>
    </div>
  );
}

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const REBAL_KEY = 'myfund_rebalance_targets';

function loadTargets() {
  try { return JSON.parse(localStorage.getItem(REBAL_KEY) || '{}'); } catch { return {}; }
}

function saveTargets(t) {
  localStorage.setItem(REBAL_KEY, JSON.stringify(t));
}

function RebalanceSection({ enriched, totalValue }) {
  const [targets, setTargets] = useState(loadTargets);
  const [editMode, setEditMode] = useState(false);
  const [draftTargets, setDraftTargets] = useState({});

  // Compute current allocations
  const positions = enriched.filter(p => p.valuePLN != null && p.valuePLN > 0);
  const total = totalValue || positions.reduce((s, p) => s + p.valuePLN, 0);

  const hasTargets = Object.keys(targets).length > 0;
  const totalTargetPct = Object.values(targets).reduce((s, v) => s + (v || 0), 0);

  // Suggestions: only when targets are set AND total target = 100
  const suggestions = hasTargets && Math.abs(totalTargetPct - 100) < 1
    ? positions
        .map(p => {
          const curPct = total > 0 ? (p.valuePLN / total) * 100 : 0;
          const tgtPct = targets[p.symbol] ?? 0;
          const dev = curPct - tgtPct;
          if (Math.abs(dev) < 2) return null; // within 2% — no suggestion
          const amt = Math.abs(dev / 100 * total);
          return { symbol: p.symbol, dev, amt };
        })
        .filter(Boolean)
        .sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev))
    : [];

  function openEdit() {
    const draft = {};
    positions.forEach(p => { draft[p.symbol] = targets[p.symbol] ?? ''; });
    setDraftTargets(draft);
    setEditMode(true);
  }

  function saveEdit() {
    const parsed = Object.fromEntries(
      Object.entries(draftTargets).map(([k, v]) => [k, parseFloat(v) || 0])
    );
    setTargets(parsed);
    saveTargets(parsed);
    setEditMode(false);
  }

  function fmtLocal(n, d = 0) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Rebalansowanie portfela</h2>
        <button
          onClick={editMode ? saveEdit : openEdit}
          className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
        >
          {editMode ? '✓ Zapisz cele' : '✎ Ustaw cele'}
        </button>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* Total target % indicator */}
        {hasTargets && (
          <p className={`text-xs ${Math.abs(totalTargetPct - 100) < 1 ? 'text-emerald-400' : 'text-amber-400'}`}>
            Suma celów: {fmtLocal(totalTargetPct, 1)}%
            {Math.abs(totalTargetPct - 100) >= 1 && ' — powinna wynosić 100%'}
          </p>
        )}

        {/* Position rows */}
        {positions.map(p => {
          const curPct = total > 0 ? (p.valuePLN / total) * 100 : 0;
          const tgtPct = targets[p.symbol] ?? null;
          const dev = tgtPct != null ? curPct - tgtPct : null;
          const absDev = dev != null ? Math.abs(dev) : 0;
          const devColor = dev == null ? 'text-slate-500'
            : absDev < 2 ? 'text-emerald-400'
            : absDev < 8 ? 'text-amber-400'
            : 'text-rose-400';

          return (
            <div key={p.symbol} className="flex items-center gap-3">
              <span className="w-20 font-bold text-indigo-400 text-sm truncate">{p.symbol}</span>
              <div className="flex-1 relative h-2 bg-slate-700 rounded-full overflow-visible">
                {/* Current allocation bar */}
                <div
                  className="absolute top-0 left-0 h-2 rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.min(curPct, 100).toFixed(1)}%` }}
                />
                {/* Target tick */}
                {tgtPct != null && tgtPct > 0 && (
                  <div
                    className="absolute top-[-3px] w-0.5 h-4 bg-amber-400 rounded-full"
                    style={{ left: `${Math.min(tgtPct, 100)}%` }}
                  />
                )}
              </div>
              <span className="w-12 text-right text-xs text-slate-300">{fmtLocal(curPct, 1)}%</span>
              {editMode ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={draftTargets[p.symbol] ?? ''}
                  onChange={e => setDraftTargets(prev => ({ ...prev, [p.symbol]: e.target.value }))}
                  className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-0.5 text-xs text-slate-100 outline-none focus:border-amber-500 text-right"
                  placeholder="0"
                />
              ) : (
                <span className={`w-12 text-right text-xs ${devColor}`}>
                  {tgtPct != null ? (
                    dev != null && absDev >= 0.05
                      ? `${dev > 0 ? '▲ +' : '▼ '}${fmtLocal(dev, 1)}%`
                      : '✓'
                  ) : (
                    <span className="text-slate-600">{fmtLocal(tgtPct ?? 0, 0)}%</span>
                  )}
                </span>
              )}
            </div>
          );
        })}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-700 space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">💡 Sugestie rebalansowania</p>
            {suggestions.map(s => (
              <div key={s.symbol} className="text-xs text-slate-300">
                {s.dev > 0
                  ? <span>🔻 Ogranicz <strong className="text-rose-400">{s.symbol}</strong>: sprzedaj lub unikaj dokupowania ~{fmtLocal(s.amt)} zł</span>
                  : <span>🟢 Dokup <strong className="text-emerald-400">{s.symbol}</strong>: ~{fmtLocal(s.amt)} zł</span>
                }
              </div>
            ))}
          </div>
        )}

        {hasTargets && suggestions.length === 0 && Math.abs(totalTargetPct - 100) < 1 && (
          <p className="text-xs text-emerald-400 pt-2">✓ Portfel mieści się w 2% od wszystkich celów</p>
        )}

        {!hasTargets && (
          <p className="text-xs text-slate-500 pt-1">
            Kliknij „Ustaw cele" aby zdefiniować docelową alokację i zobaczyć sugestie rebalansowania.
          </p>
        )}
      </div>
    </div>
  );
}

function SmartInsightsSection({ enrichedPositions, transactions, fxRates }) {
  const valid = enrichedPositions.filter(p => p.valuePLN != null && p.costPLN > 0);
  if (valid.length === 0) return null;

  const totalValue = valid.reduce((s, p) => s + p.valuePLN, 0);
  const totalCost  = valid.reduce((s, p) => s + p.costPLN, 0);
  const totalPnlPct = totalCost > 0 ? (valid.reduce((s, p) => s + p.pnlPLN, 0) / totalCost) * 100 : 0;

  let sectorMap = {};
  try { sectorMap = JSON.parse(localStorage.getItem('finnhub_sectors') || '{}'); } catch {}

  const insights = [];

  const biggest = valid.map(p => ({ sym: p.symbol, pct: p.valuePLN / totalValue * 100 }))
    .sort((a, b) => b.pct - a.pct)[0];
  if (biggest?.pct > 25) {
    insights.push({
      icon: '⚠️', bg: 'bg-amber-950/40 border-amber-800/40',
      title: 'Ryzyko koncentracji pozycji',
      lines: [
        `${biggest.sym} stanowi ${biggest.pct.toFixed(0)}% portfela.`,
        'Zalecane max dla jednej spółki: 20–25%.',
        'Rozważ zmniejszenie pozycji lub dokupienie innych spółek.',
      ]
    });
  }

  const secMap = {};
  for (const p of valid) {
    const sec = sectorMap[p.symbol] || 'Inne';
    secMap[sec] = (secMap[sec] || 0) + p.valuePLN;
  }
  const topSec = Object.entries(secMap).sort((a, b) => b[1] - a[1])[0];
  if (topSec && topSec[1] / totalValue > 0.30 && topSec[0] !== 'Inne') {
    insights.push({
      icon: '⚠️', bg: 'bg-amber-950/40 border-amber-800/40',
      title: `Koncentracja sektora: ${topSec[0]}`,
      lines: [
        `Sektor ${topSec[0]} = ${(topSec[1] / totalValue * 100).toFixed(0)}% portfela (max zalecane: 30%).`,
        'Dodaj spółki z innych sektorów dla lepszej dywersyfikacji.',
      ]
    });
  }

  const bigWin = valid.filter(p => p.pnlPct > 100).sort((a, b) => b.pnlPct - a.pnlPct)[0];
  if (bigWin) {
    const tax = bigWin.pnlPLN * 0.19;
    insights.push({
      icon: '📈', bg: 'bg-blue-950/40 border-blue-800/40',
      title: `Realizacja zysku: ${bigWin.symbol} +${bigWin.pnlPct.toFixed(0)}%`,
      lines: [
        `Niezrealizowany zysk: ${bigWin.pnlPLN.toFixed(0)} PLN.`,
        `Podatek przy realizacji: ~${tax.toFixed(0)} PLN (19%).`,
        'Rozważ częściową sprzedaż i reinwestycję w niedoważone sektory.',
      ]
    });
  }

  const losers = valid.filter(p => p.pnlPLN < -500).sort((a, b) => a.pnlPLN - b.pnlPLN);
  const hasGain = valid.some(p => p.pnlPLN > 500);
  if (losers.length && hasGain) {
    const totalLoss = losers.reduce((s, p) => s + p.pnlPLN, 0);
    const saving = Math.abs(totalLoss) * 0.19;
    insights.push({
      icon: '💚', bg: 'bg-emerald-950/40 border-emerald-800/40',
      title: `Tax Loss Harvesting — oszczędność ~${saving.toFixed(0)} PLN`,
      lines: [
        'Realizując straty możesz obniżyć podatek od zysków.',
        `Kandydaci: ${losers.slice(0, 3).map(p => `${p.symbol} (${p.pnlPLN.toFixed(0)} PLN)`).join(', ')}.`,
        'Uwaga: nie odkupuj w ciągu 30 dni (wash-sale).',
      ]
    });
  }

  const n = valid.length;
  const bigPct = biggest?.pct || 0;
  const divScore   = Math.min(10, Math.max(2, n)) - (bigPct > 40 ? 3 : bigPct > 30 ? 2 : 0);
  const perfScore  = totalPnlPct > 50 ? 10 : totalPnlPct > 20 ? 8 : totalPnlPct > 0 ? 6 : totalPnlPct > -20 ? 4 : 2;
  const riskScore  = bigPct > 40 ? 4 : bigPct > 30 ? 5 : bigPct > 20 ? 7 : 8;
  const total      = Math.round((Math.max(2, divScore) + perfScore + riskScore) / 3);
  const healthLabel = total >= 8 ? 'DOBRY ✅' : total >= 6 ? 'OK 🟡' : 'DO POPRAWY 🔴';
  insights.push({
    icon: '🏥', bg: 'bg-slate-900/60 border-slate-700/60',
    title: `Health Score: ${total}/10 — ${healthLabel}`,
    lines: [
      `Dywersyfikacja: ${Math.max(2, divScore)}/10`,
      `Wyniki: ${perfScore}/10`,
      `Ryzyko konc.: ${riskScore}/10`,
      total >= 8 ? 'Rekomendacja: HOLD & MONITOR' : total >= 6 ? 'Rekomendacja: Popraw dywersyfikację' : 'Rekomendacja: Przejrzyj skład portfela',
    ]
  });

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">Smart Insights</h2>
        <p className="text-xs text-slate-500 mt-0.5">Automatyczne rekomendacje na podstawie Twojego portfela</p>
      </div>
      <div className="p-4 space-y-3">
        {insights.map((ins, i) => (
          <div key={i} className={`rounded-lg border px-4 py-3 ${ins.bg}`}>
            <div className="text-sm font-semibold text-slate-200 mb-1">{ins.icon} {ins.title}</div>
            <ul className="space-y-0.5">
              {ins.lines.map((line, j) => (
                <li key={j} className="text-xs text-slate-400">{line}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Analysis() {
  const { portfolio, transactions, fxRates, loading, snapshots } = useApp();
  const { isPrivate } = usePrivacy();
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const totalValue = enriched.reduce((s, p) => s + (p.valuePLN ?? 0), 0);

  const withReturn = enriched
    .filter(p => p.costPLN > 0)
    .map(p => ({ ...p, returnPct: (p.plPLN ?? 0) / p.costPLN * 100 }));

  const sortedByReturn = [...withReturn].sort((a, b) => b.returnPct - a.returnPct);
  const best5 = sortedByReturn.slice(0, 5);
  const worst5 = [...sortedByReturn].reverse().slice(0, 5);

  const byCurrency = enriched.reduce((acc, p) => {
    const k = p.currency;
    acc[k] = (acc[k] ?? 0) + (p.valuePLN ?? 0);
    return acc;
  }, {});

  const sortedByValue = [...enriched]
    .filter(p => p.valuePLN != null)
    .sort((a, b) => b.valuePLN - a.valuePLN);

  const avgReturn = withReturn.length > 0
    ? withReturn.reduce((s, p) => s + p.returnPct, 0) / withReturn.length
    : null;

  const profitableCount = withReturn.filter(p => (p.plPLN ?? 0) >= 0).length;
  const lossCount = withReturn.filter(p => (p.plPLN ?? 0) < 0).length;

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!portfolio.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">📊</div>
        <p className="text-slate-400 font-semibold">Brak danych portfela</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RiskSection snapshots={snapshots ?? []} />
      <RebalanceSection enriched={enriched} totalValue={totalValue} />

      {/* Statystyki */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Liczba pozycji', value: portfolio.length },
          { label: 'Zyskowne', value: profitableCount, green: true },
          { label: 'Stratne', value: lossCount, red: true },
          { label: 'Śr. zwrot', value: avgReturn != null ? `${avgReturn >= 0 ? '+' : ''}${fmt(avgReturn, 1)}%` : '—', trend: avgReturn },
        ].map(({ label, value, green, red, trend }) => (
          <div key={label} className={`rounded-xl border px-5 py-4 ${
            green ? 'border-emerald-800/60 bg-emerald-950/30' :
            red ? 'border-rose-800/60 bg-rose-950/30' :
            trend != null && trend >= 0 ? 'border-emerald-800/60 bg-emerald-950/30' :
            trend != null && trend < 0 ? 'border-rose-800/60 bg-rose-950/30' :
            'border-slate-700 bg-slate-800'
          }`}>
            <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${
              green ? 'text-emerald-400' : red ? 'text-rose-400' :
              trend != null ? (trend >= 0 ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-100'
            }`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Najlepsze/najgorsze */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PerformanceTable title="Najlepsze pozycje" positions={best5} />
        <PerformanceTable title="Najgorsze pozycje" positions={worst5} />
      </div>

      {/* Alokacja walutowa */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Alokacja walutowa</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Waluta</th>
              <th className="text-right px-5 py-2.5">Wartość</th>
              <th className="text-right px-5 py-2.5">Udział</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byCurrency).sort((a, b) => b[1] - a[1]).map(([cur, val]) => (
              <tr key={cur} className="border-t border-slate-700/60 hover:bg-slate-700/30">
                <td className="px-5 py-2.5 font-semibold text-slate-300">{cur}</td>
                <td className={`px-5 py-2.5 text-right text-slate-200${isPrivate ? ' privacy-blur' : ''}`}>{fmt(val)} zł</td>
                <td className="px-5 py-2.5 text-right text-slate-400">
                  {totalValue > 0 ? `${fmt((val / totalValue) * 100, 1)}%` : '—'}
                </td>
              </tr>
            ))}
            <tr className="border-t border-slate-600 bg-slate-900/30">
              <td className="px-5 py-2.5 font-bold text-slate-300">Razem</td>
              <td className={`px-5 py-2.5 text-right font-bold text-slate-100${isPrivate ? ' privacy-blur' : ''}`}>{fmt(totalValue)} zł</td>
              <td className="px-5 py-2.5 text-right text-slate-400">100%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Koncentracja pozycji */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Koncentracja pozycji</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Symbol</th>
                <th className="text-right px-5 py-2.5">Wartość</th>
                <th className="text-right px-5 py-2.5">Udział</th>
              </tr>
            </thead>
            <tbody>
              {sortedByValue.map((pos) => (
                <tr key={pos.id ?? pos.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30">
                  <td className="px-5 py-2.5 font-bold text-indigo-400">{pos.symbol}</td>
                  <td className={`px-5 py-2.5 text-right text-slate-200${isPrivate ? ' privacy-blur' : ''}`}>{fmt(pos.valuePLN)} zł</td>
                  <td className="px-5 py-2.5 text-right text-slate-400">
                    {totalValue > 0 ? `${fmt((pos.valuePLN / totalValue) * 100, 1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <SmartInsightsSection
        enrichedPositions={enriched.map(p => ({
          ...p,
          pnlPLN: p.plPLN ?? 0,
          pnlPct: p.costPLN > 0 ? ((p.plPLN ?? 0) / p.costPLN) * 100 : 0,
        }))}
        transactions={transactions}
        fxRates={fxRates}
      />
    </div>
  );
}

function PerformanceTable({ title, positions }) {
  const { isPrivate } = usePrivacy();
  function fmt(n, decimals = 0) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
            <th className="text-left px-5 py-2.5">Symbol</th>
            <th className="text-right px-5 py-2.5">P&amp;L</th>
            <th className="text-right px-5 py-2.5">Zwrot</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => {
            const up = (pos.plPLN ?? 0) >= 0;
            return (
              <tr key={pos.id ?? pos.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30">
                <td className="px-5 py-2.5 font-bold text-indigo-400">{pos.symbol}</td>
                <td className={`px-5 py-2.5 text-right font-medium ${up ? 'text-emerald-400' : 'text-rose-400'}${isPrivate ? ' privacy-blur' : ''}`}>
                  {up ? '+' : ''}{fmt(pos.plPLN)} zł
                </td>
                <td className={`px-5 py-2.5 text-right ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {up ? '+' : ''}{fmt(pos.returnPct, 1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
