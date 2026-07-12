import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import { useFxBreakdown } from '../hooks/useFxBreakdown';
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
  const t = useT();
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
        <Card title={t('risk_section')} collapsible collapseKey="an_risk">
          <div className="card-body">
            <p style={{ fontSize: 12, color: 'var(--text-faint)', padding: '4px 0' }}>
              {t('not_enough_history')} (min. 30 {t('days_of_history')}: {daySpan})
            </p>
          </div>
        </Card>
      );
    }
    return null;
  }
  const hasEnoughSessions = values.length >= MIN_SESSIONS;

  return (
    <Card title={t('risk_section')} collapsible collapseKey="an_risk">
      <div className="card-body">
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}></p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
          {[
            { label: t('volatility_label'), value: vol, fmt: v => `${v.toFixed(1)}%`, color: vol < 15 ? 'var(--up)' : vol > 30 ? 'var(--down)' : 'var(--warn)', sub: t('volatility_sub'), needsSessions: true },
            { label: t('max_drawdown_label'), value: maxDD > 0 ? maxDD : null, fmt: v => `-${v.toFixed(1)}%`, color: maxDD < 10 ? 'var(--up)' : maxDD > 25 ? 'var(--down)' : 'var(--warn)', sub: t('max_drawdown_sub') },
            { label: t('sharpe_label'), value: sharpe, fmt: v => v.toFixed(2), color: sharpe >= 1 ? 'var(--up)' : sharpe < 0 ? 'var(--down)' : 'var(--text)', sub: t('sharpe_sub') },
            { label: t('sortino_label'), value: sortino, fmt: v => v.toFixed(2), color: sortino >= 1 ? 'var(--up)' : sortino < 0 ? 'var(--down)' : 'var(--text)', sub: t('sortino_sub') },
            { label: t('beta_label'), value: betaLoading ? null : beta, fmt: v => v.toFixed(2), color: 'var(--text)', sub: t('beta_sub'), needsSessions: true },
          ].map(m => (
            <div key={m.label} className="kpi-card">
              <div className="kpi-label">{m.label}</div>
              <div className="kpi-value" style={{ fontSize: 22, color: m.needsSessions && !hasEnoughSessions ? 'var(--text-faint)' : m.value != null ? m.color : 'var(--text-faint)' }}>
                {m.needsSessions && !hasEnoughSessions
                  ? <div style={{ fontSize: 10, lineHeight: 1.3 }}>
                      {t('waiting_for_data')}
                      <div style={{ marginTop: 6, width: '100%', height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.round(values.length / MIN_SESSIONS * 100)}%`, background: '#34d399', borderRadius: 3 }} />
                      </div>
                      <div style={{ marginTop: 3, color: 'var(--text-faint)', fontSize: 9 }}>{values.length}/{MIN_SESSIONS}</div>
                    </div>
                  : betaLoading && m.label === t('beta_label') ? <span style={{ fontSize: 12 }}>{t('loading')}</span>
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

function fmt(n, decimals = 0, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const REBAL_KEY = 'myfund_rebalance_targets';

function loadTargets() {
  try { return JSON.parse(localStorage.getItem(REBAL_KEY) || '{}'); } catch { return {}; }
}

function saveTargets(t) {
  localStorage.setItem(REBAL_KEY, JSON.stringify(t));
}

function RebalanceSection({ enriched, totalValue }) {
  const t = useT();
  const { locale } = useLanguage();
  const { displayCurrency, fxRates } = useApp();
  const rebalFx = fxRates[displayCurrency] ?? 1;
  const rebalCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const rebalToDisp = v => v == null ? null : v / rebalFx;
  const [targets, setTargets] = useState(loadTargets);
  const [editMode, setEditMode] = useState(false);
  const [draftTargets, setDraftTargets] = useState({});

  // Compute current allocations
  const positions = enriched.filter(p => p.valuePLN != null && p.valuePLN > 0);
  const total = totalValue || positions.reduce((s, p) => s + p.valuePLN, 0);

  const hasTargets = Object.keys(targets).length > 0;
  const totalTargetPct = Object.values(targets).reduce((s, v) => s + (v || 0), 0);

  // Price map from enriched positions
  const priceMap = Object.fromEntries(enriched.map(p => [p.symbol, p.price ?? null]));

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

  // Orders enriched with action, price, shares
  const orders = suggestions.map(s => ({
    ...s,
    action: s.dev > 0 ? t('action_sell') : t('action_buy'),
    price: priceMap[s.symbol],
    shares: priceMap[s.symbol] ? Math.round(s.amt / priceMap[s.symbol]) : null,
  }));

  function exportOrdersCsv(ordersToExport) {
    const header = `${t('col_symbol')},${t('col_action')},${t('col_amount_pln')},${t('col_shares_approx')},${t('col_price_per_share')}\n`;
    const rows = ordersToExport.map(o =>
      `${o.symbol},${o.action},${o.amt.toFixed(2)},${o.shares ?? ''},${o.price?.toFixed(2) ?? ''}`
    ).join('\n');
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rebalance-orders.csv'; a.click();
    URL.revokeObjectURL(url);
  }

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
    return n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  return (
    <Card title={t('rebalance_section')} collapsible collapseKey="an_rebal" actions={
      <button onClick={editMode ? saveEdit : openEdit} className="btn" style={{ fontSize: 11 }}>
        {editMode ? t('save_goals') : t('set_goals')}
      </button>
    }>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Total target % indicator */}
        {hasTargets && (
          <p style={{ fontSize: 12, color: Math.abs(totalTargetPct - 100) < 1 ? 'var(--up)' : 'var(--warn)' }}>
            {t('rebal_target_sum')}: {fmtLocal(totalTargetPct, 1)}%
            {Math.abs(totalTargetPct - 100) >= 1 && ` ${t('rebal_should_be_100')}`}
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

        {/* Orders table */}
        {orders.length > 0 && (
          <div style={{ marginTop: 4, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>💡 {t('rebal_orders_title')}</p>
              <button className="btn" style={{ fontSize: 11 }} onClick={() => exportOrdersCsv(orders)}>{t('rebal_download_csv')}</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('col_symbol')}</th>
                    <th>{t('col_action')}</th>
                    <th className="right">{t('col_amount_pln')}</th>
                    <th className="right">{t('col_shares_approx')}</th>
                    <th className="right">{t('col_price_per_share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.symbol} style={{ color: o.action === t('action_buy') ? 'var(--up)' : 'var(--down)' }}>
                      <td style={{ fontWeight: 700 }}>{o.symbol}</td>
                      <td>{o.action === t('action_buy') ? `🟢 ${t('action_buy')}` : `🔻 ${t('action_sell')}`}</td>
                      <td className="right mono">{fmtLocal(rebalToDisp(o.amt))} {rebalCurrLabel}</td>
                      <td className="right mono">{o.shares ?? '—'}</td>
                      <td className="right mono">{o.price != null ? `${fmtLocal(rebalToDisp(o.price), 2)} ${rebalCurrLabel}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {hasTargets && suggestions.length === 0 && Math.abs(totalTargetPct - 100) < 1 && (
          <p style={{ fontSize: 12, color: 'var(--up)', paddingTop: 8 }}>{t('rebal_balanced')}</p>
        )}

        {!hasTargets && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', paddingTop: 4 }}>
            {t('rebal_hint')}
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

const FIRE_KEY = 'myfund_fire_settings';
function loadFireSettings() {
  try { return JSON.parse(localStorage.getItem(FIRE_KEY) || '{}'); } catch { return {}; }
}

function FireSection({ totalValue }) {
  const t = useT();
  const { locale } = useLanguage();
  const { displayCurrency, fxRates } = useApp();
  const fireFx = fxRates[displayCurrency] ?? 1;
  const fireCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const fireToDisp = v => v == null ? null : v / fireFx;
  const saved = loadFireSettings();
  const [expenses, setExpenses] = useState(saved.expenses ?? '');
  const [savings,  setSavings]  = useState(saved.savings  ?? '');
  const [annReturn, setAnnReturn] = useState(saved.annReturn ?? 7);
  const [infl,      setInfl]      = useState(saved.infl      ?? 3);

  useEffect(() => {
    localStorage.setItem(FIRE_KEY, JSON.stringify({ expenses, savings, annReturn, infl }));
  }, [expenses, savings, annReturn, infl]);

  const monthlyExp = parseFloat(expenses) || 0;
  const monthlySav = parseFloat(savings)  || 0;
  const realReturn = (1 + annReturn / 100) / (1 + infl / 100) - 1;
  const target = monthlyExp * 12 * 25;
  const progress = target > 0 ? Math.min((totalValue / target) * 100, 100) : 0;
  const monthlyPassive = totalValue > 0 ? (totalValue * 0.04) / 12 : 0;

  let yearsToFire = null;
  if (target > 0 && totalValue >= 0) {
    if (totalValue >= target) {
      yearsToFire = 0;
    } else {
      const mr = Math.pow(1 + realReturn, 1 / 12) - 1;
      let lo = 0, hi = 1200;
      while (lo < hi - 1) {
        const mid = Math.floor((lo + hi) / 2);
        const fv = totalValue * Math.pow(1 + mr, mid) +
          (mr > 0.000001
            ? monthlySav * (Math.pow(1 + mr, mid) - 1) / mr
            : monthlySav * mid);
        if (fv >= target) hi = mid; else lo = mid;
      }
      yearsToFire = hi <= 1199 ? hi / 12 : null;
    }
  }

  const fireYear = yearsToFire != null
    ? new Date().getFullYear() + Math.ceil(yearsToFire)
    : null;

  const inputStyle = {
    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
    color: 'var(--text)', fontSize: 13, padding: '6px 10px', width: '100%',
    outline: 'none',
  };
  const labelStyle = { fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, display: 'block' };

  return (
    <Card title={t('fire_title')} collapsible collapseKey="an_fire">
      <div className="card-body">
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>
          {t('fire_description')}
        </p>

        {/* Inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={labelStyle}>{t('fire_monthly_exp')}</label>
            <input style={inputStyle} type="number" min="0" step="100"
              value={expenses} onChange={e => setExpenses(e.target.value)}
              placeholder={t('fire_exp_placeholder')} />
          </div>
          <div>
            <label style={labelStyle}>{t('fire_monthly_sav')}</label>
            <input style={inputStyle} type="number" min="0" step="100"
              value={savings} onChange={e => setSavings(e.target.value)}
              placeholder={t('fire_sav_placeholder')} />
          </div>
          <div>
            <label style={labelStyle}>{t('fire_ann_return')}: {annReturn}%</label>
            <input type="range" min="2" max="15" step="0.5" value={annReturn}
              onChange={e => setAnnReturn(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
          <div>
            <label style={labelStyle}>{t('fire_inflation')}: {infl}%</label>
            <input type="range" min="0" max="10" step="0.5" value={infl}
              onChange={e => setInfl(parseFloat(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </div>
        </div>

        {monthlyExp > 0 ? (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              {[
                { label: t('fire_target'),        value: fmt(target, 0, locale),                color: 'var(--text)' },
                { label: t('fire_current'),       value: fmt(totalValue, 0, locale),             color: 'var(--text)' },
                { label: t('fire_progress'),      value: `${fmt(progress, 1, locale)}%`,      color: progress >= 100 ? 'var(--up)' : 'var(--accent)' },
                { label: t('fire_year'),          value: fireYear ?? t('fire_over_100'),      color: fireYear ? 'var(--up)' : 'var(--text-faint)' },
                { label: t('fire_years_to'),      value: yearsToFire == null ? '—' : yearsToFire === 0 ? t('fire_already_now') : `${fmt(yearsToFire, 1, locale)}`, color: yearsToFire === 0 ? 'var(--up)' : 'var(--text)' },
                { label: t('fire_passive_income'), value: `${fmt(fireToDisp(monthlyPassive), 0, locale)} ${fireCurrLabel}`, color: monthlyPassive >= monthlyExp ? 'var(--up)' : 'var(--text-dim)' },
              ].map(({ label, value, color }) => (
                <div key={label} className="kpi-card">
                  <div className="kpi-label">{label}</div>
                  <div className="kpi-value" style={{ fontSize: 18, color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Progress bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
                <span>0</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmt(progress, 1, locale)}% {t('fire_goal_pct')}</span>
                <span>{fmt(fireToDisp(target), 0, locale)} {fireCurrLabel}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--panel-2)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 4, transition: 'width 0.4s',
                  width: `${progress}%`,
                  background: progress >= 100 ? 'var(--up)' : 'linear-gradient(90deg, var(--accent), #818cf8)',
                }} />
              </div>
            </div>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-faint)', fontStyle: 'italic' }}>
            {t('fire_enter_expenses')}
          </p>
        )}
      </div>
    </Card>
  );
}

function SmartInsightsSection({ enrichedPositions }) {
  const t = useT();
  const { locale } = useLanguage();
  const rp = (key, vars) => Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, v), t(key));
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
      title: t('insight_conc_title'),
      lines: [
        rp('insight_conc_l1', { sym: biggest.sym, pct: biggest.pct.toFixed(0) }),
        t('insight_conc_l2'),
        '',
        t('insight_conc_opts'),
        rp('insight_conc_reduce', { sym: biggest.sym }),
        t('insight_conc_divers'),
        t('insight_conc_plan'),
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
      title: rp('insight_sec_title', { sec: topSec[0] }),
      lines: [
        rp('insight_sec_l1', { sec: topSec[0], pct: (topSec[1] / totalValue * 100).toFixed(0) }),
        '',
        t('insight_conc_opts'),
        t('insight_sec_add'),
        rp('insight_sec_reduce', { sec: topSec[0] }),
        t('insight_sec_etf'),
      ]
    });
  }

  // 3. Take profits
  const bigWin = valid.filter(p => p.pnlPct > 100).sort((a, b) => b.pnlPct - a.pnlPct)[0];
  if (bigWin) {
    const tax = bigWin.pnlPLN * 0.19;
    insights.push({
      icon: '📈', cardStyle: { background: 'var(--up-soft)', borderColor: 'var(--up)' },
      title: rp('insight_profit_title', { sym: bigWin.symbol, pct: bigWin.pnlPct.toFixed(0) }),
      lines: [
        rp('insight_profit_l1', { pln: bigWin.pnlPLN.toFixed(0) }),
        rp('insight_profit_l2', { tax: tax.toFixed(0) }),
        '',
        t('insight_profit_rec'),
        rp('insight_profit_sell', { sym: bigWin.symbol }),
        t('insight_profit_stop'),
        t('insight_profit_reinv'),
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
      title: rp('insight_tlh_title', { saving: saving.toFixed(0) }),
      lines: [
        t('insight_tlh_l1'),
        '',
        t('insight_tlh_cands'),
        ...li,
        '',
        t('insight_tlh_wash'),
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
        title: rp('insight_pe_exp_title', { sym: p.symbol }),
        lines: [
          rp('insight_pe_l1', { sym: p.symbol, pe: p.pe.toFixed(1), sec: p.sector, spe }),
          rp('insight_pe_exp_l2', { pct: diff.toFixed(0) }),
          '',
          t('insight_pe_rec'),
          rp('insight_pe_exp_limit', { sym: p.symbol }),
          t('insight_pe_exp_alert'),
          t('insight_pe_exp_alt'),
        ]
      });
      break;
    }
    if (diff < -15) {
      insights.push({
        icon: '🟢', cardStyle: { background: 'var(--up-soft)', borderColor: 'var(--up)' },
        title: rp('insight_pe_cheap_title', { sym: p.symbol }),
        lines: [
          rp('insight_pe_l1', { sym: p.symbol, pe: p.pe.toFixed(1), sec: p.sector, spe }),
          rp('insight_pe_cheap_l2', { pct: Math.abs(diff).toFixed(0) }),
          '',
          t('insight_pe_rec'),
          rp('insight_pe_cheap_buy', { sym: p.symbol }),
          t('insight_pe_cheap_chk'),
          t('insight_pe_cheap_ord'),
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
    const fmtD = ts => new Date(ts * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    const li = upcoming.slice(0, 4).map((p, i, a) =>
      `${i === a.length - 1 ? '└' : '├'}─ ${fmtD(p.earningsTs)}: ${p.symbol} ⭐`);
    insights.push({
      icon: '📅', cardStyle: { background: 'var(--panel-2)', borderColor: 'var(--border)' },
      title: t('insight_earn_title'),
      lines: [t('insight_earn_in14'), '', ...li, '', t('insight_earn_warn')],
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
    <Card title={t('smart_insights')} collapsible collapseKey="an_insights">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 4 }}>{t('smart_insights_sub')}</p>
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

const SECTOR_KEY_MAP = {
  'Technology': 'sector_Technology',
  'Financial Services': 'sector_FinancialServices',
  'Healthcare': 'sector_Healthcare',
  'Consumer Cyclical': 'sector_ConsumerCyclical',
  'Consumer Defensive': 'sector_ConsumerDefensive',
  'Industrials': 'sector_Industrials',
  'Basic Materials': 'sector_BasicMaterials',
  'Energy': 'sector_Energy',
  'Utilities': 'sector_Utilities',
  'Real Estate': 'sector_RealEstate',
  'Communication Services': 'sector_CommunicationServices',
  'Inne': 'sector_Other',
};

const SECTOR_COLORS = [
  '#6366f1','#22c55e','#f59e0b','#3b82f6','#ec4899',
  '#14b8a6','#f97316','#8b5cf6','#ef4444','#06b6d4','#84cc16',
];

function SectorAnalysisSection({ enriched, totalValue }) {
  const t = useT();
  const { locale } = useLanguage();
  const { displayCurrency, fxRates } = useApp();
  const secFx = fxRates[displayCurrency] ?? 1;
  const secCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const secToDisp = v => v == null ? null : v / secFx;
  const [view, setView] = useState('sector'); // 'sector' | 'industry'

  const positions = enriched.filter(p => p.valuePLN != null && p.valuePLN > 0);
  const total = totalValue || positions.reduce((s, p) => s + p.valuePLN, 0);

  const grouped = useMemo(() => {
    const map = {};
    for (const p of positions) {
      const key = view === 'sector'
        ? (p.sector || 'Inne')
        : (p.industry || p.sector || 'Inne');
      if (!map[key]) map[key] = { name: key, valuePLN: 0, plPLN: 0, positions: [] };
      map[key].valuePLN += p.valuePLN;
      map[key].plPLN   += p.plPLN ?? 0;
      map[key].positions.push(p.symbol);
    }
    return Object.values(map).sort((a, b) => b.valuePLN - a.valuePLN);
  }, [positions, view]);

  if (!positions.length) return null;
  const hasSectorData = positions.some(p => p.sector);
  if (!hasSectorData) return null;

  function fmtSec(n, d = 0) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  return (
    <Card title={t('sector_analysis')} collapsible collapseKey="an_sector" actions={
      <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
        {[['sector', t('sector_label')], ['industry', t('industry_label')]].map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={{
            padding: '3px 12px', fontSize: 11, fontWeight: 600,
            background: view === k ? 'var(--accent)' : 'var(--panel)',
            color: view === k ? '#fff' : 'var(--text-dim)',
            border: 'none', cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>
    }>
      <div className="card-body">
        {/* Bar chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {grouped.map((g, i) => {
            const pct = total > 0 ? (g.valuePLN / total) * 100 : 0;
            const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
            const label = SECTOR_KEY_MAP[g.name] ? t(SECTOR_KEY_MAP[g.name]) : g.name;
            return (
              <div key={g.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 500 }}>{label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{fmtSec(pct, 1)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--panel-2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.4s ease' }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{view === 'sector' ? t('sector_label') : t('industry_label')}</th>
                <th className="right">{t('col_value_short')}</th>
                <th className="right">{t('col_share')}</th>
                <th className="right">{t('gain_loss')}</th>
                <th>{t('col_companies')}</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((g, i) => {
                const pct   = total > 0 ? (g.valuePLN / total) * 100 : 0;
                const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
                const label = SECTOR_KEY_MAP[g.name] ? t(SECTOR_KEY_MAP[g.name]) : g.name;
                return (
                  <tr key={g.name}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
                      </div>
                    </td>
                    <td className="right mono" style={{ fontWeight: 600 }}>{fmtSec(secToDisp(g.valuePLN))} {secCurrLabel}</td>
                    <td className="right mono" style={{ color: 'var(--text-dim)' }}>{fmtSec(pct, 1)}%</td>
                    <td className="right mono" style={{ color: g.plPLN >= 0 ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
                      {g.plPLN >= 0 ? '+' : ''}{fmtSec(secToDisp(g.plPLN))} {secCurrLabel}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{g.positions.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

export default function Analysis() {
  const { portfolio, transactions, fxRates, loading, snapshots, displayCurrency } = useApp();
  const { isPrivate } = usePrivacy();
  const t = useT();
  const { locale } = useLanguage();
  const analysisFx = fxRates[displayCurrency] ?? 1;
  const analysisCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const analysisToDisp = v => v == null ? null : v / analysisFx;
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const { breakdown: fxBreakdown, fxLoading } = useFxBreakdown(enriched, transactions, fxRates);

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
        <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{t('no_portfolio_data')}</p>
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
          { label: t('num_positions'), value: portfolio.length, color: null },
          { label: t('profitable'), value: profitableCount, color: 'var(--up)' },
          { label: t('losing'), value: lossCount, color: 'var(--down)' },
          { label: t('avg_return'), value: avgReturn != null ? `${avgReturn >= 0 ? '+' : ''}${fmt(avgReturn, 1, locale)}%` : '—', color: avgReturn != null ? (avgReturn >= 0 ? 'var(--up)' : 'var(--down)') : null },
        ].map(({ label, value, color }) => (
          <div key={label} className="kpi-card">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value" style={{ fontSize: 26, color: color ?? 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Najlepsze/najgorsze */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PerformanceTable title={t('best_positions')} positions={best5} />
        <PerformanceTable title={t('worst_positions')} positions={worst5} />
      </div>

      {/* Alokacja walutowa */}
      <Card title={t('currency_alloc')} collapsible collapseKey="an_curr">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('col_currency')}</th>
                <th className="right">{t('col_value_short')}</th>
                <th className="right">{t('col_share')}</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byCurrency).sort((a, b) => b[1] - a[1]).map(([cur, val]) => (
                <tr key={cur}>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>{cur}</td>
                  <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`}>{fmt(analysisToDisp(val), 0, locale)} {analysisCurrLabel}</td>
                  <td className="right mono" style={{ color: 'var(--text-dim)' }}>
                    {totalValue > 0 ? `${fmt((val / totalValue) * 100, 1, locale)}%` : '—'}
                  </td>
                </tr>
              ))}
              <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                <td style={{ fontWeight: 700, color: 'var(--text)' }}>{t('total_row')}</td>
                <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontWeight: 700 }}>{fmt(analysisToDisp(totalValue), 0, locale)} {analysisCurrLabel}</td>
                <td className="right mono" style={{ color: 'var(--text-dim)' }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Koncentracja pozycji */}
      <Card title={t('position_concentration')} collapsible collapseKey="an_conc">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('col_symbol')}</th>
                <th className="right">{t('col_value_short')}</th>
                <th className="right">{t('col_share')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedByValue.map((pos) => (
                <tr key={pos.id ?? pos.symbol}>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--info)' }}>{pos.symbol}</td>
                  <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`}>{fmt(analysisToDisp(pos.valuePLN), 0, locale)} {analysisCurrLabel}</td>
                  <td className="right mono" style={{ color: 'var(--text-dim)' }}>
                    {totalValue > 0 ? `${fmt((pos.valuePLN / totalValue) * 100, 1, locale)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dekompozycja zwrotów walutowych */}
      <FxBreakdownSection
        enriched={enriched}
        breakdown={fxBreakdown}
        loading={fxLoading}
        isPrivate={isPrivate}
      />

      <SectorAnalysisSection enriched={enriched} totalValue={totalValue} />

      <FireSection totalValue={totalValue} />

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

function FxBreakdownSection({ enriched, breakdown, loading, isPrivate }) {
  const t = useT();
  const fxPositions = enriched.filter(p => p.currency && p.currency !== 'PLN' && p.price != null);

  if (!fxPositions.length) return null;

  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  }
  function fmtFx(v) {
    if (v == null) return '—';
    return v.toFixed(4);
  }
  function pctColor(v) {
    if (v == null) return 'var(--text-faint)';
    return v >= 0 ? 'var(--up)' : 'var(--down)';
  }

  return (
    <Card title={t('fx_decomp')} collapsible collapseKey="an_fx">
      <div className="card-body">
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 12 }}>
          {t('fx_description')}
        </p>
        {loading && (
          <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
            {t('fx_loading')}
          </p>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('col_symbol')}</th>
                <th>{t('col_currency')}</th>
                <th className="right">{t('col_buy_rate')}</th>
                <th className="right">{t('col_current_rate')}</th>
                <th className="right">{t('col_asset_return')}</th>
                <th className="right">{t('col_fx_impact')}</th>
                <th className="right">{t('col_total_pln')}</th>
              </tr>
            </thead>
            <tbody>
              {fxPositions.map(pos => {
                const bd = breakdown[pos.symbol];
                return (
                  <tr key={pos.symbol}>
                    <td className="mono" style={{ fontWeight: 700, color: 'var(--info)' }}>{pos.symbol}</td>
                    <td style={{ color: 'var(--text-dim)' }}>{pos.currency}</td>
                    <td className="right mono" style={{ color: 'var(--text-dim)' }}>
                      {bd ? fmtFx(bd.purchaseFx) : loading ? '…' : '—'}
                    </td>
                    <td className="right mono" style={{ color: 'var(--text-dim)' }}>
                      {bd ? fmtFx(bd.currentFx) : '—'}
                    </td>
                    <td className="right mono" style={{ color: bd ? pctColor(bd.assetReturn) : 'var(--text-faint)', fontWeight: 600 }}>
                      {bd ? fmtPct(bd.assetReturn) : loading ? '…' : '—'}
                    </td>
                    <td className="right mono" style={{ color: bd ? pctColor(bd.fxReturn) : 'var(--text-faint)', fontWeight: 600 }}>
                      {bd ? fmtPct(bd.fxReturn) : loading ? '…' : '—'}
                    </td>
                    <td className="right mono" style={{ color: bd ? pctColor(bd.totalReturn) : 'var(--text-faint)', fontWeight: 700 }}>
                      {bd ? fmtPct(bd.totalReturn) : loading ? '…' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 10, lineHeight: 1.5 }}>
          {t('fx_footer')}
        </p>
      </div>
    </Card>
  );
}

function PerformanceTable({ title, positions }) {
  const { isPrivate } = usePrivacy();
  const t = useT();
  const { locale } = useLanguage();
  const { displayCurrency, fxRates } = useApp();
  const perfFx = fxRates[displayCurrency] ?? 1;
  const perfCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  function fmtPerf(n, decimals = 0) {
    if (n == null || isNaN(n)) return '—';
    return (n / perfFx).toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  return (
    <Card title={title} collapsible>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('col_symbol')}</th>
              <th className="right">P&amp;L</th>
              <th className="right">{t('col_return')}</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const up = (pos.plPLN ?? 0) >= 0;
              return (
                <tr key={pos.id ?? pos.symbol}>
                  <td className="mono" style={{ fontWeight: 700, color: 'var(--info)' }}>{pos.symbol}</td>
                  <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                    {up ? '+' : ''}{fmtPerf(pos.plPLN)} {perfCurrLabel}
                  </td>
                  <td className="right mono" style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
                    {up ? '+' : ''}{fmtPerf(pos.returnPct, 1)}%
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
