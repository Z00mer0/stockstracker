import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Spinner from '../components/shared/Spinner';
import Chip from '../components/shared/Chip';
import SegmentedControl from '../components/shared/SegmentedControl';
import AddDividendModal from '../components/AddDividendModal';
import useDividendEvents from '../hooks/useDividendEvents';
import {
  fetchDividendHistory,
  calcAnnualDivPerShare,
  calcYoC,
  getTaxRate,
  getUsTaxRate,
  DIV_MODE_KEY,
} from '../services/dividendService';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function SectionToggle({ label, isOpen, onToggle, children, actions }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <div className="flex items-center gap-3">
          {actions}
          <span style={{ fontSize: 12, color: 'var(--text-faint)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
        </div>
      </button>
      {isOpen && children}
    </div>
  );
}

function fmt(n, decimals = 2, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Dividends() {
  const { transactions, loading, fxRates, portfolio, saveTransactions, activePortfolio, displayCurrency } = useApp();
  const accountType = activePortfolio?.accountType;
  // Kwoty liczone są wewnętrznie w PLN — wyświetlamy w walucie portfela
  const dispFx = fxRates[displayCurrency] ?? 1;
  const dCurr = CUR_SYMBOLS[displayCurrency] || displayCurrency;
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();

  function fmtMonthYear(ym) {
    const [y, m] = ym.split('-');
    const months = t('months');
    return `${Array.isArray(months) ? months[parseInt(m) - 1] : ym} ${y}`;
  }

  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);

  const {
    manualDividends, allCalendarEvents,
    loading: divLoading, addDividend, editDividend, deleteDividend,
  } = useDividendEvents(symbols);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isNet, setIsNet]           = useState(() => localStorage.getItem(DIV_MODE_KEY) === 'net');
  const [yocMap, setYocMap]         = useState({});
  const [yocLoading, setYocLoading] = useState(false);

  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('myfund_div_collapsed') || '{}'); } catch { return {}; }
  });
  const toggle = (key) => setCollapsed(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem('myfund_div_collapsed', JSON.stringify(next));
    return next;
  });

  const [fireGoal, setFireGoal] = useState(() => {
    const v = localStorage.getItem('myfund_fire_goal_monthly');
    return v ? parseFloat(v) : null;
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  function saveGoal() {
    const v = parseFloat(goalInput);
    if (!isNaN(v) && v > 0) {
      const pln = v * dispFx;
      setFireGoal(pln);
      localStorage.setItem('myfund_fire_goal_monthly', String(pln));
    }
    setEditingGoal(false);
  }

  useEffect(() => {
    if (!portfolio.length) return;
    let cancelled = false;
    setYocLoading(true);
    Promise.all(
      portfolio.map(async pos => {
        const hist = await fetchDividendHistory(pos.symbol);
        const annual = calcAnnualDivPerShare(hist);
        return { symbol: pos.symbol, annual, yoc: calcYoC(annual, pos.avgPrice) };
      })
    ).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { map[r.symbol] = r; });
      setYocMap(map);
      setYocLoading(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols.join(',')]);

  const today = new Date().toISOString().slice(0, 10);

  const yearCutoff = useMemo(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  const in30cutoff = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }, []);

  const dividends = useMemo(() =>
    [...transactions.filter(t => t.type === 'DIV')].sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const grossPLN = (d) => (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
  const netPLN   = (d) => grossPLN(d) * (1 - getTaxRate(d.symbol, d.currency, accountType));
  const dispPLN  = (d) => isNet ? netPLN(d) : grossPLN(d);

  const annualDivPLN = useMemo(() =>
    dividends.filter(d => d.date >= yearCutoff).reduce((s, d) => s + dispPLN(d), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividends, fxRates, isNet, yearCutoff]
  );

  const totalPLN = useMemo(() =>
    dividends.reduce((s, d) => s + dispPLN(d), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dividends, fxRates, isNet]
  );

  const upcoming = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today), [allCalendarEvents, today]
  );

  const upcoming30d = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today && e.date <= in30cutoff),
    [allCalendarEvents, today, in30cutoff]
  );

  const portfolioYield = useMemo(() => {
    let totalAnnualDiv = 0, totalValue = 0;
    portfolio.forEach(pos => {
      const data = yocMap[pos.symbol];
      if (!data?.annual) return;
      const rate = fxRates[pos.currency] ?? 1;
      totalAnnualDiv += pos.qty * data.annual * rate;
      totalValue += pos.qty * (pos.price ?? pos.avgPrice) * rate;
    });
    return totalValue > 0 ? (totalAnnualDiv / totalValue) * 100 : null;
  }, [portfolio, yocMap, fxRates]);

  const bySymbol = useMemo(() => {
    const map = {};
    dividends.forEach(d => {
      const key = d.symbol ?? 'INNE';
      if (!map[key]) map[key] = { symbol: key, name: d.name, totalPLN: 0, count: 0 };
      map[key].totalPLN += dispPLN(d);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.totalPLN - a.totalPLN);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividends, fxRates, isNet]);

  const timeline = useMemo(() => {
    const byMonth = {};
    [...dividends].reverse().forEach(d => {
      const ym = d.date.slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = { ym, items: [], totalPLN: 0 };
      const amount = dispPLN(d);
      byMonth[ym].items.push({ ...d, dispPLN: amount });
      byMonth[ym].totalPLN += amount;
    });
    return Object.values(byMonth).sort((a, b) => b.ym.localeCompare(a.ym));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividends, fxRates, isNet]);

  function openEdit(div) { setEditTarget(div); setModalOpen(true); }
  async function handleSave(formData) {
    if (editTarget) {
      editDividend(editTarget.id, formData);
    } else {
      const heldQty = portfolio.find(p => p.symbol === formData.symbol)?.qty;
      const newTx = {
        id: Date.now().toString(),
        type: 'DIV',
        symbol: formData.symbol,
        date: formData.exDate,
        price: formData.amount,
        qty: heldQty != null && heldQty > 0 ? heldQty : 1,
        currency: formData.currency,
        note: formData.note || '',
      };
      await saveTransactions(prev => [...prev, newTx]);
      addDividend(formData);
    }
    setEditTarget(null);
  }
  function handleCloseModal() { setModalOpen(false); setEditTarget(null); }

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const modeLabel = isNet ? t('net') : t('gross');

  return (
    <div className="space-y-5">

      {/* ── Stats panel ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            {t('nav_dividends')} (12 mies.) · {modeLabel}
          </p>
          <p className={`text-2xl font-bold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>
            {fmt(annualDivPLN / dispFx, 2, locale)} {dCurr}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{t('last_12m_sub')}</p>
        </div>

        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }} className="flex items-center gap-2">
            Yield (proj.)
            {yocLoading && <Spinner size="sm" />}
          </p>
          {portfolioYield != null ? (
            <p className={`text-2xl font-bold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--up)' }}>
              {fmt(portfolioYield, 2, locale)}%
            </p>
          ) : (
            <p className="text-2xl font-bold" style={{ color: 'var(--text-faint)' }}>—</p>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>{t('yield_sub')}</p>
        </div>

        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('upcoming_30d')}</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--info)' }}>{upcoming30d.length}</p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>
            {upcoming30d.length > 0
              ? upcoming30d.map(e => e.symbol).join(', ')
              : t('no_upcoming_div')}
          </p>
        </div>
      </div>

      {/* ── FIRE Goal Tracker ── */}
      {(() => {
        const monthlyPLN = annualDivPLN / 12;
        const pct = fireGoal ? (monthlyPLN / fireGoal) * 100 : 0;
        const barPct = Math.min(pct, 100);
        const barColor = pct >= 100 ? 'var(--accent)' : pct >= 50 ? 'var(--up)' : 'var(--warn)';
        const textColor = barColor;

        if (editingGoal) {
          return (
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{t('set_monthly_goal')}</p>
              <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min="1"
                  value={goalInput}
                  onChange={e => setGoalInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                  placeholder="np. 3000"
                  autoFocus
                  style={{ fontSize: 15, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', width: 160 }}
                />
                <button onClick={saveGoal} className="btn btn-primary" style={{ fontSize: 13 }}>{t('save_btn')}</button>
                <button onClick={() => setEditingGoal(false)} style={{ fontSize: 13, background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer' }}>{t('cancel')}</button>
              </div>
            </div>
          );
        }

        if (!fireGoal) {
          return (
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                {t('set_monthly_goal')}
              </p>
              <button
                onClick={() => { setGoalInput(''); setEditingGoal(true); }}
                className="btn btn-primary"
                style={{ fontSize: 13, whiteSpace: 'nowrap' }}
              >{t('set_monthly_goal')}</button>
            </div>
          );
        }

        return (
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('next_dividend')}
              </p>
              <button
                onClick={() => { setGoalInput(String(Math.round(fireGoal / dispFx))); setEditingGoal(true); }}
                style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}
              >{t('change_goal')}</button>
            </div>
            <div className="flex items-center gap-2" style={{ marginBottom: 10, fontSize: 13, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
              <span>
                <span className={isPrivate ? 'privacy-blur' : ''} style={{ fontWeight: 700, color: 'var(--warn)', fontSize: 15 }}>{fmt(monthlyPLN / dispFx, 2, locale)} {dCurr}/mies.</span>
              </span>
              <span style={{ color: 'var(--text-faint)' }}>→</span>
              <span>
                cel: <span style={{ fontWeight: 600, color: 'var(--text)' }}><span className={isPrivate ? 'privacy-blur' : ''}>{fmt(fireGoal / dispFx, 0, locale)}</span> {dCurr}/mies.</span>
              </span>
            </div>
            <div style={{ height: 10, borderRadius: 6, background: 'var(--border)', overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${barPct}%`, background: barColor, borderRadius: 6, transition: 'width 0.4s ease' }} />
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: textColor }}>
                {fmt(pct, 1, locale)}%
              </span>
              {' '}{t('of_monthly_goal')}{' '}
              (<span className={isPrivate ? 'privacy-blur' : ''}>{fmt(monthlyPLN / dispFx, 2, locale)} {dCurr}</span> / <span className={isPrivate ? 'privacy-blur' : ''}>{fmt(fireGoal / dispFx, 0, locale)} {dCurr}</span>)
            </p>
            {pct >= 100 && (
              <p style={{ marginTop: 8, fontSize: 13, color: 'var(--up)', fontWeight: 600 }}>
                {t('goal_achieved')}
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Netto / Brutto toggle ── */}
      <div className="card flex items-center justify-between flex-wrap gap-3" style={{ padding: '12px 20px' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t('display_mode')}</p>
        </div>
        <SegmentedControl
          options={[t('gross').toUpperCase(), t('net').toUpperCase()]}
          value={isNet ? t('net').toUpperCase() : t('gross').toUpperCase()}
          onChange={v => { setIsNet(v === t('net').toUpperCase()); localStorage.setItem(DIV_MODE_KEY, v === t('net').toUpperCase() ? 'net' : 'gross'); }}
        />
      </div>

      {/* ── Banner + dodaj GPW ── */}
      <SectionToggle label={t('add_dividend_gpw')} isOpen={!collapsed.gpw} onToggle={() => toggle('gpw')}>
        <div style={{ padding: '0 20px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--info)', lineHeight: 1.5, maxWidth: 520 }}>
            <span className="font-semibold">ℹ️</span> {t('gpw_dividends_note')}
          </p>
          <button
            onClick={() => { setEditTarget(null); setModalOpen(true); }}
            className="btn btn-primary" style={{ fontSize: 13 }}
          >
            {t('add_dividend_gpw')}
          </button>
        </div>
      </SectionToggle>

      {/* ── Nadchodzące dywidendy ── */}
      <SectionToggle
        label={t('upcoming_dividends')}
        isOpen={!collapsed.upcoming}
        onToggle={() => toggle('upcoming')}
        actions={<>{divLoading && <Spinner size="sm" />}</>}
      >
        {divLoading && !upcoming.length ? (
          <div className="flex justify-center py-8"><Spinner size="md" /></div>
        ) : upcoming.length === 0 ? (
          <div className="card-body text-center" style={{ color: 'var(--text-faint)', fontSize: 13 }}>
            {t('no_upcoming_div')}
            {symbols.some(s => !s.includes('.')) && (
              <span className="block mt-1" style={{ fontSize: 11 }}>{t('us_no_data_note')}</span>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('col_company')}</th>
                  <th>{t('ex_date_label')}</th>
                  <th>{t('pay_date_label')}</th>
                  <th className="right">{t('amount_per_share')} ({modeLabel})</th>
                  <th>{t('col_source')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {upcoming.map((ev, i) => {
                  const cur = CUR_SYMBOLS[ev.currency] ?? ev.currency ?? '';
                  const taxRate = getTaxRate(ev.symbol, ev.currency, accountType);
                  const dispAmount = ev.amount != null
                    ? (isNet ? ev.amount * (1 - taxRate) : ev.amount)
                    : null;
                  return (
                    <tr key={ev.id ?? i}>
                      <td className="font-bold" style={{ color: 'var(--text)' }}>💰 {ev.symbol}</td>
                      <td style={{ color: 'var(--text)' }}>{ev.date}</td>
                      <td style={{ color: 'var(--text-dim)' }}>{ev.payDate ?? '—'}</td>
                      <td className={`right mono${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)', fontWeight: 600 }}>
                        {dispAmount != null ? `${fmt(dispAmount, 2, locale)} ${cur}` : '—'}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                        {ev.isManual ? t('manual_source') : t('auto_source')}
                      </td>
                      <td className="right">
                        {ev.isManual && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => { const src = manualDividends.find(d => d.id === ev.id); if (src) openEdit(src); }}
                              style={{ fontSize: 11, color: 'var(--info)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >{t('edit')}</button>
                            <button
                              onClick={() => deleteDividend(ev.id)}
                              style={{ fontSize: 11, color: 'var(--down)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >{t('delete_btn')}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionToggle>

      {/* ── Timeline wypłat ── */}
      {timeline.length > 0 && (
        <SectionToggle label={t('payment_timeline')} isOpen={!collapsed.timeline} onToggle={() => toggle('timeline')}>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {timeline.map(({ ym, items, totalPLN: monthTotal }) => (
              <div key={ym} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '8px 20px', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {fmtMonthYear(ym)}
                  </span>
                  <span className={`mono${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 11, fontWeight: 600, color: 'var(--warn)' }}>
                    {fmt(monthTotal / dispFx, 2, locale)} {dCurr} {modeLabel}
                  </span>
                </div>
                {items.map(d => (
                  <div key={d.id ?? d.date + d.symbol} style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-bold shrink-0" style={{ fontSize: 13, color: 'var(--text)' }}>{d.symbol}</span>
                      {d.name && d.name !== d.symbol && (
                        <span className="truncate" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.name}</span>
                      )}
                      <span className="shrink-0" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.date}</span>
                    </div>
                    <span className={`mono shrink-0 ml-4${isPrivate ? ' privacy-blur' : ''}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>
                      {fmt(d.dispPLN / dispFx, 2, locale)} {dCurr}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SectionToggle>
      )}

      {/* ── KPI summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('total_dividends')} ({modeLabel})</p>
          <p className={`text-2xl font-bold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>{fmt(totalPLN / dispFx, 2, locale)} {dCurr}</p>
        </div>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('num_payments')}</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{dividends.length}</p>
        </div>
        <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', padding: '16px 20px' }}>
          <p style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t('dividend_companies')}</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{bySymbol.length}</p>
        </div>
      </div>

      {/* ── Per spółka + YoC ── */}
      <SectionToggle
        label={t('div_per_company')}
        isOpen={!collapsed.perCompany}
        onToggle={() => toggle('perCompany')}
        actions={yocLoading ? <Spinner size="sm" /> : null}
      >
        {bySymbol.length === 0 ? (
          <div className="card-body text-center">
            <div className="text-4xl mb-3">🌱</div>
            <p className="font-semibold" style={{ color: 'var(--text-dim)' }}>{t('no_div_companies')}</p>
            <p style={{ marginTop: 4, fontSize: 11, color: 'var(--text-faint)' }}>{t('no_div_hint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('col_company')}</th>
                  <th className="right">{t('col_payments')}</th>
                  <th className="right">{t('total_pln_header')} ({modeLabel})</th>
                  <th className="right">YoC</th>
                </tr>
              </thead>
              <tbody>
                {bySymbol.map(row => {
                  const yoc = yocMap[row.symbol]?.yoc;
                  return (
                    <tr key={row.symbol}>
                      <td className="font-bold" style={{ color: 'var(--text)' }}>
                        {row.symbol}
                        {row.name && row.name !== row.symbol && (
                          <span className="ml-2 font-normal" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{row.name}</span>
                        )}
                      </td>
                      <td className="right" style={{ color: 'var(--text-dim)' }}>{row.count}×</td>
                      <td className={`right mono font-semibold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>
                        {fmt(row.totalPLN / dispFx, 2, locale)} {dCurr}
                      </td>
                      <td className="right">
                        {yoc != null
                          ? <Chip value={yoc} />
                          : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>{yocLoading ? '…' : '—'}</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionToggle>

      {/* ── Historia wypłat ── */}
      {dividends.length > 0 && (
        <SectionToggle
          label={t('payment_history')}
          isOpen={!collapsed.history}
          onToggle={() => toggle('history')}
          actions={<span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{dividends.length} {t('entries')}</span>}
        >
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('col_date')}</th>
                  <th>{t('col_company')}</th>
                  <th className="right">{t('amount_per_share')} ({modeLabel})</th>
                  <th className="right">{t('qty_short')}</th>
                  <th className="right">≈ PLN</th>
                  <th>{t('col_note')}</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map(d => {
                  const taxRate  = getTaxRate(d.symbol, d.currency, accountType);
                  const dispPricePerShare = isNet ? d.price * (1 - taxRate) : d.price;
                  const approxPLN = dispPLN(d);
                  return (
                    <tr key={d.id ?? d.date + d.symbol}>
                      <td style={{ color: 'var(--text-dim)' }}>{d.date}</td>
                      <td className="font-bold" style={{ color: 'var(--text)' }}>
                        {d.symbol}
                        {d.name && d.name !== d.symbol && (
                          <span className="ml-2 font-normal" style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.name}</span>
                        )}
                      </td>
                      <td className={`right mono font-semibold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--warn)' }}>
                        {fmt(dispPricePerShare, 2, locale)} {CUR_SYMBOLS[d.currency] ?? d.currency}
                      </td>
                      <td className="right mono" style={{ color: 'var(--text-dim)' }}>{d.qty ?? '—'}</td>
                      <td className={`right mono font-semibold${isPrivate ? ' privacy-blur' : ''}`} style={{ color: 'var(--text)' }}>
                        {fmt(approxPLN / dispFx, 2, locale)} {dCurr}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-faint)' }}>{d.note || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionToggle>
      )}

      <AddDividendModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        initialData={editTarget}
      />
    </div>
  );
}
