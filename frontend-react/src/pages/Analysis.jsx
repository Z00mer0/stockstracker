import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import Spinner from '../components/shared/Spinner';
import Card from '../components/shared/Card';

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
  // Filter out anomalous snapshots from the race condition bug where stock prices
  // hadn't loaded yet (total showed only cash). Threshold: 40% of all-time high.
  const maxTotal = Math.max(...snapshots.map(s => s.total), 0);
  const cleanSnapshots = maxTotal > 0
    ? snapshots.filter(s => s.total >= maxTotal * 0.4)
    : snapshots;

  const sorted = [...cleanSnapshots].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map(s => s.total).filter(v => v > 0);
  const dates = sorted.map(s => s.date).filter((_, i) => sorted[i].total > 0);
  const daySpan = dates.length >= 2
    ? Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000)
    : 0;
  const [beta, setBeta] = useState(null);
  const [betaLoading, setBetaLoading] = useState(false);

  const MIN_SESSIONS = 60;

  useEffect(() => {
    if (values.length < MIN_SESSIONS) return;
    const ctrl = new AbortController();
    setBetaLoading(true);
    const dates = sorted.map(s => s.date);
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5y';
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: ctrl.signal, headers: { 'X-Auth-Token': localStorage.getItem('myfund_auth_token') || '' } })
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

  if (values.length < 10 || daySpan < 30) {
    if (daySpan > 0) {
      return (
        <Card title="Analiza ryzyka">
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 0' }}>
              Za krótka historia do obliczeń statystycznych — potrzeba min. 30 dni snapshotów (masz {daySpan} {daySpan === 1 ? 'dzień' : 'dni'}).
              Metryki pojawią się automatycznie gdy portfel będzie aktywny wystarczająco długo.
            </p>
          </div>
        </Card>
      );
    }
    return null;
  }
  const hasEnoughSessions = values.length >= MIN_SESSIONS;

  return (
    <Card title="Analiza ryzyka">
      <div className="card-body">
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>Na podstawie historii snapshotów portfela</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          {[
            { label: 'Zmienność (rok.)', value: vol, fmt: v => `${v.toFixed(1)}%`, color: vol < 15 ? 'var(--up)' : vol > 30 ? 'var(--down)' : 'var(--warn)', sub: 'Odch. std. × √252', needsSessions: true },
            { label: 'Max Drawdown', value: maxDD > 0 ? maxDD : null, fmt: v => `-${v.toFixed(1)}%`, color: maxDD < 10 ? 'var(--up)' : maxDD > 25 ? 'var(--down)' : 'var(--warn)', sub: 'Największy spadek' },
            { label: 'Sharpe Ratio', value: sharpe, fmt: v => v.toFixed(2), color: sharpe >= 1 ? 'var(--up)' : sharpe < 0 ? 'var(--down)' : 'var(--text)', sub: 'Zwrot/ryzyko (RF=4.5%)' },
            { label: 'Sortino Ratio', value: sortino, fmt: v => v.toFixed(2), color: sortino >= 1 ? 'var(--up)' : sortino < 0 ? 'var(--down)' : 'var(--text)', sub: 'Jak Sharpe, tylko dół' },
            { label: 'Beta (S&P 500)', value: betaLoading ? null : beta, fmt: v => v.toFixed(2), color: 'var(--text)', sub: 'Korelacja z rynkiem US', needsSessions: true },
          ].map(m => (
            <div key={m.label} className="kpi-card">
              <div className="kpi-label">{m.label}</div>
              <div className="kpi-value" style={{ fontSize: 22, color: m.needsSessions && !hasEnoughSessions ? 'var(--text-faint)' : m.value != null ? m.color : 'var(--text-faint)' }}>
                {m.needsSessions && !hasEnoughSessions
                  ? <span style={{ fontSize: 10, lineHeight: 1.3 }}>Oczekiwanie<br/>na dane<br/>({values.length}/{MIN_SESSIONS})</span>
                  : betaLoading && m.label.includes('Beta') ? <span style={{ fontSize: 12 }}>ładowanie…</span>
                  : m.value != null ? m.fmt(m.value) : '—'}
              </div>
              <div className="kpi-sub">{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
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
    <Card title="Rebalansowanie portfela" actions={
      <button onClick={editMode ? saveEdit : openEdit} className="btn" style={{ fontSize: 11 }}>
        {editMode ? '✓ Zapisz cele' : '✎ Ustaw cele'}
      </button>
    }>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Total target % indicator */}
        {hasTargets && (
          <p style={{ fontSize: 12, color: Math.abs(totalTargetPct - 100) < 1 ? 'var(--up)' : 'var(--warn)' }}>
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
          const devColor = dev == null ? 'var(--text-faint)'
            : absDev < 2 ? 'var(--up)'
            : absDev < 8 ? 'var(--warn)'
            : 'var(--down)';

          return (
            <div key={p.symbol} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 80, fontWeight: 700, color: 'var(--accent)', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.symbol}</span>
              <div style={{ flex: 1, height: 16, borderRadius: 4, background: 'var(--panel-2)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(curPct, 100).toFixed(1)}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s', opacity: 0.7 }} />
                {tgtPct != null && tgtPct > 0 && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${Math.min(tgtPct, 100)}%`, width: 2, background: 'var(--accent)' }} />
                )}
              </div>
              <span style={{ width: 48, textAlign: 'right', fontSize: 12, color: 'var(--text)' }}>{fmtLocal(curPct, 1)}%</span>
              {editMode ? (
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={draftTargets[p.symbol] ?? ''}
                  onChange={e => setDraftTargets(prev => ({ ...prev, [p.symbol]: e.target.value }))}
                  style={{ width: 64, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: 'var(--text)', outline: 'none', textAlign: 'right' }}
                  placeholder="0"
                />
              ) : (
                <span style={{ width: 48, textAlign: 'right', fontSize: 12, color: devColor }}>
                  {tgtPct != null ? (
                    dev != null && absDev >= 0.05
                      ? `${dev > 0 ? '▲ +' : '▼ '}${fmtLocal(dev, 1)}%`
                      : '✓'
                  ) : (
                    <span style={{ color: 'var(--text-faint)' }}>{fmtLocal(tgtPct ?? 0, 0)}%</span>
                  )}
                </span>
              )}
            </div>
          );
        })}

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 Sugestie rebalansowania</p>
            {suggestions.map(s => (
              <div key={s.symbol} style={{ fontSize: 12, color: 'var(--text)' }}>
                {s.dev > 0
                  ? <span>🔻 Ogranicz <strong style={{ color: 'var(--down)' }}>{s.symbol}</strong>: sprzedaj lub unikaj dokupowania ~{fmtLocal(s.amt)} zł</span>
                  : <span>🟢 Dokup <strong style={{ color: 'var(--up)' }}>{s.symbol}</strong>: ~{fmtLocal(s.amt)} zł</span>
                }
              </div>
            ))}
          </div>
        )}

        {hasTargets && suggestions.length === 0 && Math.abs(totalTargetPct - 100) < 1 && (
          <p style={{ fontSize: 12, color: 'var(--up)', paddingTop: 8 }}>✓ Portfel mieści się w 2% od wszystkich celów</p>
        )}

        {!hasTargets && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', paddingTop: 4 }}>
            Kliknij „Ustaw cele" aby zdefiniować docelową alokację i zobaczyć sugestie rebalansowania.
          </p>
        )}
      </div>
    </Card>
  );
}

const _SECTOR_PE = {
  'Technology': 26, 'Financial Services': 15, 'Healthcare': 22,
  'Consumer Cyclical': 20, 'Consumer Defensive': 20, 'Energy': 14,
  'Industrials': 19, 'Communication Services': 21, 'Real Estate': 24,
  'Basic Materials': 16, 'Utilities': 18, 'Financial': 15,
};

function SmartInsightsSection({ enrichedPositions }) {
  const valid = enrichedPositions.filter(p => p.valuePLN != null && p.costPLN > 0);
  if (valid.length === 0) return null;

  const totalValue  = valid.reduce((s, p) => s + p.valuePLN, 0);
  const totalCost   = valid.reduce((s, p) => s + p.costPLN, 0);
  const totalPnlPct = totalCost > 0 ? (valid.reduce((s, p) => s + p.pnlPLN, 0) / totalCost) * 100 : 0;

  const insights = [];

  // 1. Single-stock concentration
  const biggest = valid.map(p => ({ sym: p.symbol, pct: p.valuePLN / totalValue * 100 }))
    .sort((a, b) => b.pct - a.pct)[0];
  if (biggest?.pct > 25) {
    insights.push({
      icon: '⚠️', cardStyle: { background: 'rgba(255,176,32,0.08)', borderColor: 'rgba(255,176,32,0.3)' },
      title: 'Ryzyko koncentracji pozycji',
      lines: [
        `${biggest.sym} stanowi ${biggest.pct.toFixed(0)}% portfela.`,
        'Zalecane max dla jednej spółki: 20–25%.',
        '',
        'Możliwości:',
        `├─ Zmniejsz pozycję ${biggest.sym}`,
        '├─ Dokup spółki z innych sektorów',
        '└─ Ustaw target-weight i trzymaj się planu',
      ]
    });
  }

  // 2. Sector concentration (from Yahoo Finance sector field)
  const secMap = {};
  for (const p of valid) {
    const sec = p.sector || 'Inne';
    secMap[sec] = (secMap[sec] || 0) + p.valuePLN;
  }
  const topSec = Object.entries(secMap).sort((a, b) => b[1] - a[1])[0];
  if (topSec && topSec[1] / totalValue > 0.30 && topSec[0] !== 'Inne') {
    insights.push({
      icon: '⚠️', cardStyle: { background: 'rgba(255,176,32,0.08)', borderColor: 'rgba(255,176,32,0.3)' },
      title: `Koncentracja sektora: ${topSec[0]}`,
      lines: [
        `Sektor ${topSec[0]} = ${(topSec[1] / totalValue * 100).toFixed(0)}% portfela (max: 30%).`,
        '',
        'Możliwości:',
        '├─ Dodaj spółki z Energy / Healthcare / Utilities',
        `├─ Zmniejsz ekspozycję na ${topSec[0]}`,
        '└─ Rozważ ETF na szeroki rynek dla dywersyfikacji',
      ]
    });
  }

  // 3. Take profits
  const bigWin = valid.filter(p => p.pnlPct > 100).sort((a, b) => b.pnlPct - a.pnlPct)[0];
  if (bigWin) {
    const tax = bigWin.pnlPLN * 0.19;
    insights.push({
      icon: '📈', cardStyle: { background: 'var(--up-soft)', borderColor: 'var(--up)' },
      title: `Realizacja zysku: ${bigWin.symbol} +${bigWin.pnlPct.toFixed(0)}%`,
      lines: [
        `Niezrealizowany zysk: ${bigWin.pnlPLN.toFixed(0)} PLN.`,
        `Podatek przy realizacji: ~${tax.toFixed(0)} PLN (19%).`,
        '',
        'Rekomendacja:',
        `├─ Rozważ sprzedaż części pozycji ${bigWin.symbol}`,
        '├─ Ustaw stop-loss by chronić zysk',
        '└─ Reinwestuj w niedoważone sektory',
      ]
    });
  }

  // 4. Tax loss harvesting
  const losers = valid.filter(p => p.pnlPLN < -500).sort((a, b) => a.pnlPLN - b.pnlPLN);
  const hasGain = valid.some(p => p.pnlPLN > 500);
  if (losers.length && hasGain) {
    const totalLoss = losers.reduce((s, p) => s + p.pnlPLN, 0);
    const saving = Math.abs(totalLoss) * 0.19;
    const li = losers.slice(0, 3).map((p, i, a) =>
      `${i === a.length - 1 ? '└' : '├'}─ ${p.symbol}: ${p.pnlPLN.toFixed(0)} PLN`);
    insights.push({
      icon: '💚', cardStyle: { background: 'var(--up-soft)', borderColor: 'var(--up)' },
      title: `Tax Loss Harvesting — oszczędność ~${saving.toFixed(0)} PLN`,
      lines: [
        'Realizując straty możesz obniżyć podatek od zysków.',
        '',
        'Kandydaci do sprzedaży:',
        ...li,
        '',
        'Uwaga: wash-sale — nie odkupuj przez 30 dni.',
      ]
    });
  }

  // 5. Valuation alert (P/E vs sector benchmark)
  for (const p of valid) {
    const spe = p.sector ? _SECTOR_PE[p.sector] : null;
    if (!spe || !p.pe || p.pe <= 0) continue;
    const diff = (p.pe - spe) / spe * 100;
    if (diff > 30) {
      insights.push({
        icon: '🔴', cardStyle: { background: 'var(--down-soft)', borderColor: 'var(--down)' },
        title: `Wycena: ${p.symbol} drogi vs sektor`,
        lines: [
          `P/E ${p.symbol}: ${p.pe.toFixed(1)}x, sektor ${p.sector}: ${spe}x`,
          `(${diff.toFixed(0)}% powyżej średniej).`,
          '',
          'Rekomendacja:',
          `├─ Ogranicz dokupowanie ${p.symbol}`,
          '├─ Ustaw alert cenowy na korekcie',
          '└─ Szukaj tańszych alternatyw w sektorze',
        ]
      });
      break;
    }
    if (diff < -15) {
      insights.push({
        icon: '🟢', cardStyle: { background: 'var(--up-soft)', borderColor: 'var(--up)' },
        title: `Okazja: ${p.symbol} tańszy od sektora`,
        lines: [
          `P/E ${p.symbol}: ${p.pe.toFixed(1)}x, sektor ${p.sector}: ${spe}x`,
          `(${Math.abs(diff).toFixed(0)}% poniżej średniej — potencjalny dobry punkt wejścia).`,
          '',
          'Rekomendacja:',
          `├─ Rozważ dokupienie ${p.symbol}`,
          '├─ Potwierdź fundamenty (ROE, marże, dług)',
          '└─ Ustaw order limit poniżej ceny rynkowej',
        ]
      });
      break;
    }
  }

  // 6. Upcoming earnings (next 14 days)
  const now  = Date.now();
  const in14 = now + 14 * 86400000;
  const upcoming = valid
    .filter(p => p.earningsTs && p.earningsTs * 1000 > now && p.earningsTs * 1000 < in14)
    .sort((a, b) => a.earningsTs - b.earningsTs);
  if (upcoming.length) {
    const fmtD = ts => new Date(ts * 1000).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
    const li = upcoming.slice(0, 4).map((p, i, a) =>
      `${i === a.length - 1 ? '└' : '├'}─ ${fmtD(p.earningsTs)}: ${p.symbol} ⭐`);
    insights.push({
      icon: '📅', cardStyle: { background: 'var(--panel-2)', borderColor: 'var(--border)' },
      title: 'Nadchodzące wyniki finansowe',
      lines: ['Za najbliższe 14 dni:', '', ...li, '', 'Uwaga: możliwa podwyższona zmienność ⚠️'],
    });
  }

  // 7. Health Score (4 dimensions: dywersyfikacja, wycena, wyniki, ryzyko)
  const n = valid.length;
  const bigPct = biggest?.pct || 0;
  let divScore = Math.min(10, Math.max(2, n));
  if (bigPct > 40) divScore = Math.max(2, divScore - 3);
  else if (bigPct > 30) divScore = Math.max(3, divScore - 2);

  const perfScore = totalPnlPct > 50 ? 10 : totalPnlPct > 20 ? 8 : totalPnlPct > 0 ? 6 : totalPnlPct > -20 ? 4 : 2;

  const withPE = valid.filter(p => p.pe > 0 && p.sector && _SECTOR_PE[p.sector]);
  let valScore = 6;
  if (withPE.length) {
    const overCnt = withPE.filter(p => p.pe > _SECTOR_PE[p.sector] * 1.2).length;
    valScore = Math.max(1, Math.round(10 - (overCnt / withPE.length) * 6));
  }

  const riskScore = bigPct > 40 ? 4 : bigPct > 30 ? 5 : bigPct > 20 ? 7 : 8;
  const total     = Math.round((divScore + valScore + perfScore + riskScore) / 4);
  const healthLabel = total >= 8 ? 'DOBRY ✅' : total >= 6 ? 'OK 🟡' : 'DO POPRAWY 🔴';
  insights.push({
    icon: '🏥', cardStyle: { background: 'var(--panel-2)', borderColor: 'var(--border)' },
    title: `Health Score: ${total}/10 — ${healthLabel}`,
    lines: [
      `├─ Dywersyfikacja: ${divScore}/10`,
      `├─ Wycena: ${valScore}/10`,
      `├─ Wyniki: ${perfScore}/10`,
      `└─ Ryzyko konc.: ${riskScore}/10`,
      '',
      total >= 8 ? 'Rekomendacja: HOLD & MONITOR' :
      total >= 6 ? 'Rekomendacja: MONITORUJ, popraw dywersyfikację' :
                   'Rekomendacja: PRZEJRZYJ skład i zredukuj ryzyko',
    ]
  });

  return (
    <Card title="Smart Insights">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>Automatyczne rekomendacje na podstawie Twojego portfela</p>
        {insights.map((ins, i) => (
          <div key={i} style={{ borderRadius: 8, border: '1px solid', ...ins.cardStyle, padding: '12px 16px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{ins.icon} {ins.title}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {ins.lines.join('\n')}
            </div>
          </div>
        ))}
      </div>
    </Card>
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
      <div className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
        <div className="text-5xl mb-3">📊</div>
        <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Brak danych portfela</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RiskSection snapshots={snapshots ?? []} />
      <RebalanceSection enriched={enriched} totalValue={totalValue} />

      {/* Statystyki */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
        {[
          { label: 'Liczba pozycji', value: portfolio.length, color: null },
          { label: 'Zyskowne', value: profitableCount, color: 'var(--up)' },
          { label: 'Stratne', value: lossCount, color: 'var(--down)' },
          { label: 'Śr. zwrot', value: avgReturn != null ? `${avgReturn >= 0 ? '+' : ''}${fmt(avgReturn, 1)}%` : '—', color: avgReturn != null ? (avgReturn >= 0 ? 'var(--up)' : 'var(--down)') : null },
        ].map(({ label, value, color }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: 26, color: color ?? 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Najlepsze/najgorsze */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PerformanceTable title="Najlepsze pozycje" positions={best5} />
        <PerformanceTable title="Najgorsze pozycje" positions={worst5} />
      </div>

      {/* Alokacja walutowa */}
      <Card title="Alokacja walutowa">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Waluta</th>
                <th className="right">Wartość</th>
                <th className="right">Udział</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byCurrency).sort((a, b) => b[1] - a[1]).map(([cur, val]) => (
                <tr key={cur}>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{cur}</td>
                  <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`}>{fmt(val)} zł</td>
                  <td className="right mono" style={{ color: 'var(--text-dim)' }}>
                    {totalValue > 0 ? `${fmt((val / totalValue) * 100, 1)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                <td style={{ fontWeight: 700, color: 'var(--text)' }}>Razem</td>
                <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontWeight: 700 }}>{fmt(totalValue)} zł</td>
                <td className="right mono" style={{ color: 'var(--text-dim)' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Koncentracja pozycji */}
      <Card title="Koncentracja pozycji">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="right">Wartość</th>
                <th className="right">Udział</th>
              </tr>
            </thead>
            <tbody>
              {sortedByValue.map((pos) => (
                <tr key={pos.id ?? pos.symbol}>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--info)' }}>{pos.symbol}</td>
                  <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`}>{fmt(pos.valuePLN)} zł</td>
                  <td className="right mono" style={{ color: 'var(--text-dim)' }}>
                    {totalValue > 0 ? `${fmt((pos.valuePLN / totalValue) * 100, 1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SmartInsightsSection
        enrichedPositions={enriched.map(p => ({
          ...p,
          pnlPLN: p.plPLN ?? 0,
          pnlPct: p.costPLN > 0 ? ((p.plPLN ?? 0) / p.costPLN) * 100 : 0,
        }))}
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
    <Card title={title}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="right">P&amp;L</th>
              <th className="right">Zwrot</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const up = (pos.plPLN ?? 0) >= 0;
              return (
                <tr key={pos.id ?? pos.symbol}>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--info)' }}>{pos.symbol}</td>
                  <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                    {up ? '+' : ''}{fmt(pos.plPLN)} zł
                  </td>
                  <td className="right mono" style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                    {up ? '+' : ''}{fmt(pos.returnPct, 1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
