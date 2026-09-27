import { useEffect, useMemo, useState } from 'react';
import { Target, Wallet, Percent, CalendarCheck, Hourglass, Coins, Sparkle } from 'lucide-react';
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip as ChartTooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { Card, Field, Input, Stat } from '../../components/ui';
import { lsSet } from '../../utils/safeStorage.js';
import { yearsToFire, runFireMonteCarlo } from '../../utils/fire.js';

const FIRE_KEY = 'myfund_fire_settings';
function loadFireSettings() {
  try { return JSON.parse(localStorage.getItem(FIRE_KEY) || '{}'); } catch { return {}; }
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-label font-semibold uppercase text-dim">{label}: {value}%</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full accent-[var(--accent)]" />
    </label>
  );
}

// Wszystko w walucie wyświetlania: wydatki i oszczędności wpisuje się w niej,
// więc wartość portfela też. Wcześniej przy walucie innej niż PLN wpisane
// dolary porównywano ze złotymi, a część kafelków pokazywała złote bez
// przeliczenia.
export default function FireTab({ totalValue }) {
  const t = useT();
  const { locale } = useLanguage();
  const { displayCurrency, fxRates } = useApp();
  const dispFx = fxRates[displayCurrency] ?? 1;
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const value = totalValue / dispFx;
  const fmt = (n, d = 0) => (n == null || isNaN(n) ? '—' : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  const money = n => `${fmt(n)} ${currLabel}`;

  const saved = loadFireSettings();
  const [expenses, setExpenses] = useState(saved.expenses ?? '');
  const [savings, setSavings] = useState(saved.savings ?? '');
  const [annReturn, setAnnReturn] = useState(saved.annReturn ?? 7);
  const [infl, setInfl] = useState(saved.infl ?? 3);
  const [vol, setVol] = useState(saved.vol ?? 15);
  useEffect(() => {
    lsSet(FIRE_KEY, JSON.stringify({ expenses, savings, annReturn, infl, vol }));
  }, [expenses, savings, annReturn, infl, vol]);

  const monthlyExp = parseFloat(expenses) || 0;
  const monthlySav = parseFloat(savings) || 0;
  const realReturn = (1 + annReturn / 100) / (1 + infl / 100) - 1;
  const target = monthlyExp * 12 * 25;
  const progress = target > 0 ? Math.min((value / target) * 100, 100) : 0;
  const monthlyPassive = value > 0 ? (value * 0.04) / 12 : 0;
  const years = yearsToFire({ start: value, monthlySav, realReturn, target });
  const fireYear = years != null ? new Date().getFullYear() + Math.ceil(years) : null;

  const mc = useMemo(() => {
    if (!(target > 0) || value >= target) return null;
    const horizon = Math.min(50, Math.max(10, Math.ceil((years ?? 30) * 1.6)));
    return runFireMonteCarlo({ start: value, monthlySav, realReturn, vol: vol / 100, target, maxYears: horizon });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, monthlySav, realReturn, vol, target]);

  const beyond = mc ? t('fire_mc_beyond').replace('{n}', mc.horizon) : '';

  return (
    <div className="space-y-4">
      <Card title={t('fire_title')}>
        <div className="grid gap-4 p-4">
          <p className="text-small text-faint">{t('fire_description')}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('fire_monthly_exp')}>
              <Input type="number" min="0" step="100" inputMode="decimal" suffix={currLabel} value={expenses} onChange={e => setExpenses(e.target.value)} placeholder={t('fire_exp_placeholder')} />
            </Field>
            <Field label={t('fire_monthly_sav')}>
              <Input type="number" min="0" step="100" inputMode="decimal" suffix={currLabel} value={savings} onChange={e => setSavings(e.target.value)} placeholder={t('fire_sav_placeholder')} />
            </Field>
            <Slider label={t('fire_ann_return')} value={annReturn} min={2} max={15} step={0.5} onChange={setAnnReturn} />
            <Slider label={t('fire_inflation')} value={infl} min={0} max={10} step={0.5} onChange={setInfl} />
          </div>
          {monthlyExp <= 0 && <p className="text-small italic text-faint">{t('fire_enter_expenses')}</p>}
        </div>
      </Card>

      {monthlyExp > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat icon={Target} label={t('fire_target')} value={money(target)} />
            <Stat icon={Wallet} label={t('fire_current')} value={money(value)} />
            <Stat icon={Percent} label={t('fire_progress')} value={`${fmt(progress, 1)}%`} tone={progress >= 100 ? 'up' : undefined} />
            <Stat icon={CalendarCheck} label={t('fire_year')} value={fireYear ?? t('fire_over_100')} tone={fireYear ? 'up' : undefined} />
            <Stat icon={Hourglass} label={t('fire_years_to')} value={years == null ? '—' : years === 0 ? t('fire_already_now') : fmt(years, 1)} tone={years === 0 ? 'up' : undefined} />
            <Stat icon={Coins} label={t('fire_passive_income')} value={money(monthlyPassive)} tone={monthlyPassive >= monthlyExp ? 'up' : undefined} />
          </div>

          <div>
            <div className="mb-1.5 flex justify-between text-[11px] text-faint">
              <span>0</span>
              <span className="font-semibold text-accent-text">{fmt(progress, 1)}% {t('fire_goal_pct')}</span>
              <span>{money(target)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
              <div className={progress >= 100 ? 'h-full rounded-full bg-up' : 'h-full rounded-full bg-accent'} style={{ width: `${progress}%` }} />
            </div>
          </div>

          {mc && (
            <Card
              title={<span className="inline-flex items-center gap-2"><Sparkle size={15} aria-hidden className="text-accent-text" />{t('fire_mc_title')}</span>}
              actions={<div className="w-56"><Slider label={t('fire_mc_vol')} value={vol} min={5} max={30} step={1} onChange={setVol} /></div>}
            >
              <div className="grid gap-4 p-4">
                <p className="text-small text-faint">{t('fire_mc_desc')}</p>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Stat label={t('fire_mc_optimistic')} value={mc.optimistic ?? beyond} tone="up" />
                  <Stat label={t('fire_mc_median')} value={mc.median ?? beyond} />
                  <Stat label={t('fire_mc_pessimistic')} value={mc.pessimistic ?? beyond} tone="warn" />
                  <Stat
                    label={t('fire_mc_prob').replace('{n}', mc.horizon)}
                    value={`${fmt(mc.probHit * 100, 0)}%`}
                    tone={mc.probHit >= 0.8 ? 'up' : mc.probHit >= 0.5 ? 'warn' : 'down'}
                  />
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={mc.rows} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                      <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text-faint)' }} tickLine={false} axisLine={false} width={56}
                        tickFormatter={v => Number(v).toLocaleString(locale, { notation: 'compact', maximumFractionDigits: 1 })} />
                      <ChartTooltip
                        contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                        labelStyle={{ color: 'var(--text-dim)', marginBottom: 4 }}
                        formatter={(v, name) => (name === 'median'
                          ? [money(v), t('fire_mc_median')]
                          : [`${fmt(v[0])} – ${money(v[1])}`, t('fire_mc_band')])}
                      />
                      <Area dataKey="band" stroke="none" fill="var(--accent)" fillOpacity={0.14} isAnimationActive={false} />
                      <Line dataKey="median" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <ReferenceLine y={target} stroke="var(--warn)" strokeDasharray="5 4"
                        label={{ value: t('fire_target'), position: 'insideTopRight', fontSize: 11, fill: 'var(--warn)' }} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] leading-relaxed text-faint">{t('fire_mc_note').replace('{vol}', String(vol))}</p>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
