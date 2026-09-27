import { useMemo, useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Coins, Percent, CalendarClock, Sigma, Plus, Info, Pencil, Trash2, CalendarX, Sprout, Target } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Chip from '../components/shared/Chip';
import AddDividendModal from '../components/AddDividendModal';
import useDividendEvents from '../hooks/useDividendEvents';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import { lsSet } from '../utils/safeStorage.js';
import { normalizeType } from '../utils/transactions.js';
import { PageSkeleton } from '../components/RouteFallback';
import {
  Button, Callout, Card, EmptyState, Field, IconButton, Input, SegmentedControl, Spinner, Stat, Table, Tabs, TabPanel,
} from '../components/ui';
import { cx } from '../components/ui/cx.js';
import {
  fetchDividendHistory,
  calcAnnualDivPerShare,
  calcYoC,
  getTaxRate,
  DIV_MODE_KEY,
} from '../services/dividendService';

// Strona dywidend. Układ: przełącznik brutto/netto i „Dodaj" na górze (dotyczą
// całej strony), jeden rząd kafelków, cel dochodu, kula śnieżna (DRIP),
// nadchodzące wypłaty i jedna karta „Wypłaty" z zakładkami. Wcześniej było tu
// 9 sekcji jedna pod drugą, w tym trzy widoki tych samych wypłat i drugi rząd
// kafelków na dole.

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

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
  const blur = isPrivate ? 'privacy-blur' : undefined;
  const perMonth = (v, d = 0) => t('div_per_month').replace('{v}', fmt(v, d, locale)).replace('{curr}', dCurr);

  function fmtMonthYear(ym) {
    const [y, m] = ym.split('-');
    const months = t('months');
    return `${Array.isArray(months) ? months[parseInt(m) - 1] : ym} ${y}`;
  }

  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);

  // Pozycje z ceną rynkową. Surowe pozycje z useApp nie mają pola price, więc
  // `pos.price ?? pos.avgPrice` zawsze brało cenę zakupu — stopa dywidendy
  // i yield w DRIP wychodziły od kosztu, choć opis mówi o wartości portfela.
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);
  const positions = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );
  // Bez notowania — po koszcie, jak w nagłówku portfela (computePortfolioValue).
  const valueOf = p => p.valuePLN ?? p.costPLN ?? 0;

  const {
    manualDividends, allCalendarEvents,
    loading: divLoading, addDividend, editDividend, deleteDividend,
  } = useDividendEvents(symbols);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [isNet, setIsNet] = useState(() => localStorage.getItem(DIV_MODE_KEY) === 'net');
  const [yocMap, setYocMap] = useState({});
  const [yocLoading, setYocLoading] = useState(false);
  const [tab, setTab] = useState('timeline');

  const [fireGoal, setFireGoal] = useState(() => {
    const v = localStorage.getItem('myfund_fire_goal_monthly');
    return v ? parseFloat(v) : null;
  });
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  const [dripYears, setDripYears] = useState(() => {
    const v = parseInt(localStorage.getItem('myfund_drip_years'), 10);
    return [10, 20, 30].includes(v) ? v : 10;
  });
  const [dripGrowth, setDripGrowth] = useState(() => {
    const v = parseFloat(localStorage.getItem('myfund_drip_growth'));
    return [0, 3, 5, 8].includes(v) ? v : 3;
  });

  function saveGoal() {
    const v = parseFloat(goalInput);
    if (!isNaN(v) && v > 0) {
      const pln = v * dispFx;
      setFireGoal(pln);
      lsSet('myfund_fire_goal_monthly', String(pln));
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

  // normalizeType: transakcje „DIVIDEND" (import brokera) też są dywidendami —
  // wcześniej ta strona je pomijała, choć Portfel je liczył.
  const dividends = useMemo(() =>
    transactions.filter(tx => normalizeType(tx.type) === 'DIV').sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')),
    [transactions]
  );

  const grossPLN = d => (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
  const netPLN = d => grossPLN(d) * (1 - getTaxRate(d.symbol, d.currency, accountType));
  const dispPLN = d => (isNet ? netPLN(d) : grossPLN(d));

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

  const upcoming = useMemo(() => allCalendarEvents.filter(e => e.date >= today), [allCalendarEvents, today]);
  const upcoming30d = useMemo(() =>
    allCalendarEvents.filter(e => e.date >= today && e.date <= in30cutoff),
    [allCalendarEvents, today, in30cutoff]
  );

  const portfolioYield = useMemo(() => {
    let totalAnnualDiv = 0, totalValue = 0;
    positions.forEach(pos => {
      const data = yocMap[pos.symbol];
      if (!data?.annual) return;
      totalAnnualDiv += pos.qty * data.annual * (fxRates[pos.currency] ?? 1);
      totalValue += valueOf(pos);
    });
    return totalValue > 0 ? (totalAnnualDiv / totalValue) * 100 : null;
  }, [positions, yocMap, fxRates]);

  // ── Kula śnieżna (DRIP): dochód roczny rośnie o (1+wzrost)·(1+yield) przy
  //    reinwestycji, o (1+wzrost) bez niej; yield efektywny = wypłaty 12m / wartość portfela
  const drip = useMemo(() => {
    const valuePLN = positions.reduce((s, p) => s + valueOf(p), 0);
    if (annualDivPLN <= 0 || valuePLN <= 0) return null;
    const y = annualDivPLN / valuePLN;
    const g = dripGrowth / 100;
    const startYear = new Date().getFullYear();
    const rows = [];
    let withDrip = annualDivPLN, without = annualDivPLN;
    for (let i = 0; i <= dripYears; i++) {
      rows.push({ year: startYear + i, drip: withDrip / 12 / dispFx, noDrip: without / 12 / dispFx });
      withDrip *= (1 + g) * (1 + y);
      without *= (1 + g);
    }
    const goalYear = fireGoal ? rows.find(r => r.drip >= fireGoal / dispFx)?.year ?? null : null;
    return { rows, yieldPct: y * 100, last: rows[rows.length - 1], goalYear };
  }, [positions, annualDivPLN, dripGrowth, dripYears, dispFx, fireGoal]);

  const bySymbol = useMemo(() => {
    const map = {};
    dividends.forEach(d => {
      const key = d.symbol ?? t('pf_sector_other');
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
      const ym = (d.date ?? '').slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = { ym, items: [], totalPLN: 0 };
      const amount = dispPLN(d);
      byMonth[ym].items.push({ ...d, dispPLN: amount });
      byMonth[ym].totalPLN += amount;
    });
    return Object.values(byMonth).sort((a, b) => b.ym.localeCompare(a.ym));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dividends, fxRates, isNet]);

  function openAdd() { setEditTarget(null); setModalOpen(true); }
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

  if (loading && !transactions.length) return <PageSkeleton />;

  const modeLabel = isNet ? t('net') : t('gross');
  const hasGpw = symbols.some(s => s.endsWith('.WA'));

  // ── Cel miesięcznego dochodu ──
  const monthlyPLN = annualDivPLN / 12;
  const goalPct = fireGoal ? (monthlyPLN / fireGoal) * 100 : 0;
  const goalCard = (
    <Card
      title={<span className="inline-flex items-center gap-2"><Target size={15} aria-hidden className="text-dim" />{t('div_goal_title')}</span>}
      actions={fireGoal && !editingGoal && (
        <Button size="sm" variant="ghost" onClick={() => { setGoalInput(String(Math.round(fireGoal / dispFx))); setEditingGoal(true); }}>
          {t('change_goal')}
        </Button>
      )}
    >
      <div className="px-5 py-4">
        {editingGoal ? (
          <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); saveGoal(); }}>
            <Field label={t('div_goal_input').replace('{curr}', dCurr)} className="w-44">
              <Input
                type="number"
                min="1"
                inputMode="decimal"
                autoFocus
                suffix={dCurr}
                value={goalInput}
                placeholder={t('pf_eg').replace('{v}', '3000')}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setEditingGoal(false); }}
              />
            </Field>
            <Button type="submit" variant="primary">{t('save_btn')}</Button>
            <Button variant="ghost" onClick={() => setEditingGoal(false)}>{t('cancel')}</Button>
          </form>
        ) : !fireGoal ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-[13px] text-dim">{t('div_goal_hint')}</p>
            <Button variant="primary" icon={Target} onClick={() => { setGoalInput(''); setEditingGoal(true); }}>{t('div_goal_set')}</Button>
          </div>
        ) : (
          <>
            <div className="mb-2.5 flex flex-wrap items-baseline gap-2 text-[13px] text-dim">
              <span className={cx('text-[15px] font-bold text-warn', blur)}>{perMonth(monthlyPLN / dispFx, 2)}</span>
              <span className="text-faint">→</span>
              <span className={blur}>{t('div_goal_of').replace('{v}', fmt(fireGoal / dispFx, 0, locale)).replace('{curr}', dCurr)}</span>
            </div>
            <div
              className="mb-2.5 h-2.5 overflow-hidden rounded-full bg-panel-2"
              role="progressbar"
              aria-valuenow={Math.round(Math.min(goalPct, 100))}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('div_goal_title')}
            >
              <div
                className={cx('h-full rounded-full transition-[width] duration-500', goalPct >= 100 ? 'bg-accent' : goalPct >= 50 ? 'bg-up' : 'bg-warn')}
                style={{ width: `${Math.min(goalPct, 100)}%` }}
              />
            </div>
            <p className="text-[13px] text-dim">
              <span className={cx('text-[17px] font-bold', goalPct >= 100 ? 'text-accent-text' : goalPct >= 50 ? 'text-up' : 'text-warn')}>{fmt(goalPct, 1, locale)}%</span>
              {' '}{t('of_monthly_goal')}
            </p>
            {goalPct >= 100 && <p className="mt-2 text-[13px] font-semibold text-up">{t('goal_achieved')}</p>}
          </>
        )}
      </div>
    </Card>
  );

  // ── Tabele ──
  const upcomingColumns = [
    { key: 'symbol', header: t('col_company'), mobile: 'title', render: ev => <span className="font-bold text-fg">{ev.symbol}</span> },
    { key: 'date', header: t('ex_date_label'), render: ev => <span className="text-fg">{ev.date}</span> },
    { key: 'payDate', header: t('pay_date_label'), render: ev => <span className="text-dim">{ev.payDate ?? '—'}</span> },
    {
      key: 'amount', header: t('div_per_share').replace('{mode}', modeLabel), align: 'right', mobile: 'aside',
      render: ev => {
        const amount = ev.amount != null ? (isNet ? ev.amount * (1 - getTaxRate(ev.symbol, ev.currency, accountType)) : ev.amount) : null;
        return <span className={cx('font-semibold text-warn', blur)}>{amount != null ? `${fmt(amount, 2, locale)} ${CUR_SYMBOLS[ev.currency] ?? ev.currency ?? ''}` : '—'}</span>;
      },
    },
    { key: 'source', header: t('col_source'), render: ev => <span className="text-[11px] text-faint">{ev.isManual ? t('manual_source') : t('auto_source')}</span> },
    {
      key: 'actions', header: '', align: 'right',
      render: ev => ev.isManual && (
        <span className="inline-flex gap-1">
          <IconButton icon={Pencil} size="sm" label={`${t('edit')}: ${ev.symbol}`} onClick={() => { const src = manualDividends.find(d => d.id === ev.id); if (src) openEdit(src); }} />
          <IconButton icon={Trash2} size="sm" label={`${t('delete_btn')}: ${ev.symbol}`} onClick={() => deleteDividend(ev.id)} />
        </span>
      ),
    },
  ];

  const companyColumns = [
    {
      key: 'symbol', header: t('col_company'), sortable: true, mobile: 'title',
      render: r => <span className="font-bold text-fg">{r.symbol}{r.name && r.name !== r.symbol && <span className="ml-2 text-[11px] font-normal text-faint">{r.name}</span>}</span>,
    },
    { key: 'count', header: t('col_payments'), align: 'right', sortable: true, firstDir: 'desc', render: r => <span className="text-dim">{r.count}×</span> },
    {
      key: 'totalPLN', header: t('div_total_col').replace('{curr}', dCurr).replace('{mode}', modeLabel), align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside',
      render: r => <span className={cx('font-semibold text-warn', blur)}>{fmt(r.totalPLN / dispFx, 2, locale)} {dCurr}</span>,
    },
    {
      key: 'yoc', header: 'YoC', align: 'right', sortable: true, firstDir: 'desc', value: r => yocMap[r.symbol]?.yoc,
      render: r => {
        const yoc = yocMap[r.symbol]?.yoc;
        return yoc != null ? <Chip value={yoc} /> : <span className="text-[11px] text-faint">{yocLoading ? '…' : '—'}</span>;
      },
    },
  ];

  const historyColumns = [
    { key: 'date', header: t('col_date'), sortable: true, firstDir: 'desc', render: d => <span className="text-dim">{d.date}</span> },
    {
      key: 'symbol', header: t('col_company'), sortable: true, mobile: 'title',
      render: d => <span className="font-bold text-fg">{d.symbol}{d.name && d.name !== d.symbol && <span className="ml-2 text-[11px] font-normal text-faint">{d.name}</span>}</span>,
    },
    {
      key: 'perShare', header: t('div_per_share').replace('{mode}', modeLabel), align: 'right',
      render: d => <span className={cx('font-semibold text-warn', blur)}>{fmt(isNet ? d.price * (1 - getTaxRate(d.symbol, d.currency, accountType)) : d.price, 2, locale)} {CUR_SYMBOLS[d.currency] ?? d.currency}</span>,
    },
    { key: 'qty', header: t('qty_short'), align: 'right', render: d => <span className="text-dim">{d.qty ?? '—'}</span> },
    {
      // Kwota w walucie wyświetlania — nagłówek mówił „≈ PLN" także wtedy,
      // gdy wyświetlana waluta była inna.
      key: 'approx', header: `≈ ${dCurr}`, align: 'right', sortable: true, firstDir: 'desc', mobile: 'aside', value: d => dispPLN(d),
      render: d => <span className={cx('font-semibold text-fg', blur)}>{fmt(dispPLN(d) / dispFx, 2, locale)} {dCurr}</span>,
    },
    { key: 'note', header: t('col_note'), render: d => <span className="text-[11px] text-faint">{d.note || '—'}</span> },
  ];

  return (
    <div className="space-y-4">
      {/* Przełącznik i akcja dotyczą całej strony — stąd na górze. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-small text-dim">{t('display_mode')}</span>
        <SegmentedControl
          options={[{ value: 'gross', label: t('gross') }, { value: 'net', label: t('net') }]}
          value={isNet ? 'net' : 'gross'}
          onChange={v => { setIsNet(v === 'net'); lsSet(DIV_MODE_KEY, v); }}
        />
        <Button variant="primary" icon={Plus} onClick={openAdd}>{t('div_add')}</Button>
      </div>

      {hasGpw && <Callout tone="info" icon={Info}>{t('div_gpw_note')}</Callout>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          blur={isPrivate}
          icon={Coins}
          label={`${t('div_12m_label')} · ${modeLabel}`}
          value={`${fmt(annualDivPLN / dispFx, 2, locale)} ${dCurr}`}
          hint={t('last_12m_sub')}
        />
        <Stat
          blur={isPrivate}
          icon={Percent}
          label={t('div_yield_label')}
          value={portfolioYield != null ? `${fmt(portfolioYield, 2, locale)}%` : '—'}
          hint={yocLoading ? <span className="inline-flex items-center gap-1.5"><Spinner size="sm" />{t('loading')}</span> : t('yield_sub')}
        />
        <Stat
          icon={CalendarClock}
          label={t('upcoming_30d')}
          value={upcoming30d.length}
          hint={upcoming30d.length > 0 ? upcoming30d.map(e => e.symbol).join(', ') : t('no_upcoming_div')}
        />
        <Stat
          blur={isPrivate}
          icon={Sigma}
          label={`${t('total_dividends')} · ${modeLabel}`}
          value={`${fmt(totalPLN / dispFx, 2, locale)} ${dCurr}`}
          hint={t('div_total_hint').replace('{n}', dividends.length).replace('{m}', bySymbol.length)}
        />
      </div>

      {goalCard}

      {/* ── Kula śnieżna dywidend (DRIP) ── */}
      {drip && (
        <Card title={t('drip_title')} collapsible collapseKey="div_drip">
          <div className="px-5 pb-4 pt-3">
            <div className="mb-3.5 flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-dim">{t('drip_horizon_label')}</span>
                <SegmentedControl
                  options={[10, 20, 30].map(v => ({ value: v, label: `${v} ${t('drip_years_unit')}` }))}
                  value={dripYears}
                  onChange={v => { setDripYears(v); lsSet('myfund_drip_years', String(v)); }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-dim">{t('drip_growth_label')}</span>
                <SegmentedControl
                  options={[0, 3, 5, 8].map(v => ({ value: v, label: `${v}%` }))}
                  value={dripGrowth}
                  onChange={v => { setDripGrowth(v); lsSet('myfund_drip_growth', String(v)); }}
                />
              </div>
            </div>

            <p className="mb-3 text-[13px] text-dim">
              {t('drip_now')}: <span className={cx('font-bold text-warn', blur)}>{perMonth(annualDivPLN / 12 / dispFx)}</span>
              {' '}→ {drip.last.year}: <span className={cx('font-bold text-warn', blur)}>{perMonth(drip.last.drip)}</span>
              {' '}{t('drip_with')} (<span className={blur}>{fmt(drip.last.noDrip, 0, locale)} {dCurr}</span> {t('drip_without')})
            </p>

            <div className={cx('h-[220px] w-full', blur)}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={drip.rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} width={60}
                    tickFormatter={v => Number(v).toLocaleString(locale, { maximumFractionDigits: 0 })} />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: 'var(--text-dim)', marginBottom: 4 }}
                    formatter={(v, name) => [perMonth(v), name === 'drip' ? t('drip_with') : t('drip_without')]}
                  />
                  <Legend formatter={name => <span className="text-xs text-dim">{name === 'drip' ? t('drip_with') : t('drip_without')}</span>} />
                  <Line type="monotone" dataKey="drip" stroke="var(--warn)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="noDrip" stroke="var(--info)" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {fireGoal && (
              <p className={cx('mt-2.5 text-[13px]', drip.goalYear ? 'font-semibold text-up' : 'text-dim')}>
                {(drip.goalYear ? t('drip_goal_hit') : t('drip_goal_miss'))
                  .replace('{goal}', fmt(fireGoal / dispFx, 0, locale))
                  .replace('{curr}', dCurr)
                  .replace('{year}', String(drip.goalYear ?? ''))}
              </p>
            )}
            <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
              {t('drip_assumptions')
                .replace('{yield}', fmt(drip.yieldPct, 1, locale))
                .replace('{growth}', fmt(dripGrowth, 0, locale))
                .replace('{mode}', modeLabel)}
            </p>
          </div>
        </Card>
      )}

      {/* ── Nadchodzące dywidendy ── */}
      <Card title={t('upcoming_dividends')} actions={divLoading && <Spinner size="sm" label={t('loading')} />}>
        {divLoading && !upcoming.length ? (
          <div className="flex justify-center py-8"><Spinner label={t('loading')} /></div>
        ) : (
          <Table
            columns={upcomingColumns}
            rows={upcoming}
            rowKey={ev => ev.id ?? `${ev.symbol}|${ev.date}`}
            empty={
              <EmptyState
                icon={CalendarX}
                title={t('no_upcoming_div')}
                description={symbols.some(s => !s.includes('.')) ? t('us_no_data_note') : undefined}
                className="py-8"
              />
            }
          />
        )}
      </Card>

      {/* ── Wypłaty: oś czasu / według spółek / wszystkie ── */}
      <Card title={t('div_payments_title')}>
        {dividends.length === 0 ? (
          <EmptyState
            icon={Sprout}
            title={t('div_empty_title')}
            description={t('no_div_hint')}
            action={<Button variant="primary" icon={Plus} onClick={openAdd}>{t('div_add')}</Button>}
          />
        ) : (
          <>
            <div className="px-4 pt-2">
              <Tabs
                id="div"
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'timeline', label: t('div_tab_timeline') },
                  { value: 'companies', label: t('div_tab_companies'), count: bySymbol.length },
                  { value: 'history', label: t('div_tab_history'), count: dividends.length },
                ]}
              />
            </div>
            <TabPanel tabsId="div" value={tab}>
              {tab === 'timeline' && (
                <div>
                  {timeline.map(({ ym, items, totalPLN: monthTotal }) => (
                    <section key={ym} className="border-b border-line last:border-b-0">
                      <div className="flex items-center justify-between bg-bg-2 px-5 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-dim">{fmtMonthYear(ym)}</span>
                        <span className={cx('text-[11px] font-semibold text-warn', blur)}>{fmt(monthTotal / dispFx, 2, locale)} {dCurr} {modeLabel}</span>
                      </div>
                      {items.map(d => (
                        <div key={d.id ?? d.date + d.symbol} className="flex items-center justify-between gap-4 px-5 py-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="shrink-0 text-[13px] font-bold text-fg">{d.symbol}</span>
                            {d.name && d.name !== d.symbol && <span className="truncate text-[11px] text-faint">{d.name}</span>}
                            <span className="shrink-0 text-[11px] text-faint">{d.date}</span>
                          </div>
                          <span className={cx('shrink-0 text-[13px] font-semibold text-warn', blur)}>{fmt(d.dispPLN / dispFx, 2, locale)} {dCurr}</span>
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
              )}
              {tab === 'companies' && (
                <Table columns={companyColumns} rows={bySymbol} rowKey={r => r.symbol} defaultSort={{ key: 'totalPLN', dir: 'desc' }} />
              )}
              {tab === 'history' && (
                <Table columns={historyColumns} rows={dividends} rowKey={d => d.id ?? d.date + d.symbol} defaultSort={{ key: 'date', dir: 'desc' }} pageSize={50} />
              )}
            </TabPanel>
          </>
        )}
      </Card>

      <AddDividendModal isOpen={modalOpen} onClose={handleCloseModal} onSave={handleSave} initialData={editTarget} />
    </div>
  );
}
