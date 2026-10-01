import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TriangleAlert, Info } from 'lucide-react';
import { axisProps, gridProps, legendProps, tooltipProps } from '../components/charts/theme.js';
import { Callout, Card, Field, Input } from '../components/ui';
import { useLanguage, useT } from '../context/LanguageContext';
import { simulateOki, OKI_LIMIT } from '../utils/okiCalc.js';

function fmtMoney(v, locale) {
  const n = Math.round(Number(v) || 0);
  return `${n.toLocaleString(locale)} zł`;
}

function fmtMoneyShort(v, locale) {
  const n = Math.round(Number(v) || 0);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000)     return `${Math.round(n / 1_000).toLocaleString(locale)}k`;
  return n.toLocaleString(locale);
}

export default function OkiCalculator() {
  const t = useT();
  const { locale } = useLanguage();
  const [initialValue, setInitialValue] = useState(100_000);
  const [annualReturn, setAnnualReturn] = useState(10);
  const [years, setYears] = useState(20);
  const [activelyManaged, setActivelyManaged] = useState(true);

  const result = useMemo(() => simulateOki({
    initialValue: Math.max(0, Number(initialValue) || 0),
    annualReturnPct: Number(annualReturn) || 0,
    years: Math.max(1, Math.min(50, Number(years) || 1)),
    activelyManaged,
  }), [initialValue, annualReturn, years, activelyManaged]);

  // Zysk netto (ponad wpłatę) w obu wariantach, rok po roku.
  const chartData = result.rows.map(r => ({
    label: `R${r.year}`,
    reg: r.regEnd - initialValue,
    oki: r.okiEnd - initialValue,
  }));

  const firstYear = result.rows[0];
  const advantage = result.advantage;
  const pct = v => `${v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  return (
    <div className="max-w-4xl space-y-4">
      <Card title={t('oki_params_title')}>
        <div className="grid gap-5 p-4">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Field label={t('oki_initial_value')}>
                <Input type="number" min="0" max="10000000" step="1000" inputMode="numeric" suffix="zł" className="w-40 text-right"
                  value={initialValue} onChange={e => setInitialValue(parseInt(e.target.value, 10) || 0)} />
              </Field>
            </div>
            <input type="range" min="0" max="1000000" step="5000" aria-label={t('oki_initial_value')} className="w-full accent-[var(--accent)]"
              value={Math.min(initialValue, 1_000_000)} onChange={e => setInitialValue(parseInt(e.target.value, 10))} />
            <p className="text-[11px] text-faint">{t('oki_limit_hint').replace('{limit}', fmtMoney(OKI_LIMIT, locale))}</p>
          </div>

          <label className="grid gap-2">
            <span className="flex justify-between text-label font-semibold uppercase text-dim">{t('oki_annual_return')}<span className="text-small normal-case text-accent-text">{pct(annualReturn)}</span></span>
            <input type="range" min="-20" max="30" step="0.5" className="w-full accent-[var(--accent)]" value={annualReturn} onChange={e => setAnnualReturn(parseFloat(e.target.value))} />
            <span className="text-[11px] text-faint">{t('oki_return_hint')}</span>
          </label>

          <label className="grid gap-2">
            <span className="flex justify-between text-label font-semibold uppercase text-dim">{t('oki_horizon')}<span className="text-small normal-case text-accent-text">{years} {t('oki_years')}</span></span>
            <input type="range" min="1" max="40" step="1" className="w-full accent-[var(--accent)]" value={years} onChange={e => setYears(parseInt(e.target.value, 10))} />
          </label>

          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--accent)]" checked={activelyManaged} onChange={e => setActivelyManaged(e.target.checked)} />
            <span>
              <span className="block text-[13px] text-fg">{t('oki_active_mgmt')}</span>
              <span className="block text-[11px] text-faint">{t('oki_active_mgmt_hint')}</span>
            </span>
          </label>

          <Callout tone="warn" icon={TriangleAlert}>{t('oki_disclaimer')}</Callout>
        </div>
      </Card>

      <Card title={t('oki_result_title')}>
        <div className="grid gap-5 p-4">
          <div className="text-center">
            <p className="text-small text-faint">{t('oki_result_headline').replace('{years}', years).replace('{yearsLabel}', t('oki_years'))}</p>
            <p className={advantage >= 0 ? 'mt-1 text-[36px] font-bold text-up' : 'mt-1 text-[36px] font-bold text-down'}>
              {advantage >= 0 ? '+' : ''}{fmtMoney(advantage, locale)}
            </p>
            <p className="mt-1 text-small text-dim">
              {t('oki_result_final').replace('{oki}', fmtMoney(result.okiNet, locale)).replace('{reg}', fmtMoney(result.regularNet, locale))}
            </p>
          </div>

          {firstYear && (
            <div>
              <p className="mb-2 text-label font-semibold uppercase text-faint">{t('oki_year1_mechanics')}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-card-sm border border-line bg-panel-2 p-3">
                  <p className="mb-2 text-small font-bold text-dim">{t('oki_regular_account')}</p>
                  <Row label={t('oki_gross_gain')} value={fmtMoney(firstYear.regGrossEnd - firstYear.regStart, locale)} />
                  <Row label={`${t('oki_belka_tax')} (19%)`} value={`-${fmtMoney(firstYear.regTax, locale)}`} negative />
                  <Row label={t('oki_net_gain')} value={fmtMoney(firstYear.regEnd - firstYear.regStart, locale)} bold />
                </div>
                <div className="rounded-card-sm border border-line bg-panel-2 p-3">
                  <p className="mb-2 text-small font-bold text-accent-text">{t('oki_account')}</p>
                  <Row label={t('oki_gross_gain')} value={fmtMoney(firstYear.okiStart * (Number(annualReturn) / 100), locale)} />
                  <Row label={t('oki_avg_excess_tax')} value={`-${fmtMoney(firstYear.okiTax, locale)}`} negative />
                  <Row label={t('oki_net_gain')} value={fmtMoney(firstYear.okiEnd - firstYear.okiStart, locale)} bold />
                </div>
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg">{t('oki_chart_title').replace('{years}', years).replace('{yearsLabel}', t('oki_years'))}</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" {...axisProps} minTickGap={16} />
                  <YAxis {...axisProps} width={56} tickFormatter={v => fmtMoneyShort(v, locale)} />
                  <Tooltip {...tooltipProps} formatter={(v, name) => [fmtMoney(v, locale), name]} />
                  <Legend {...legendProps} />
                  <Line name={t('oki_chart_regular')} dataKey="reg" stroke="var(--up)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line name={t('oki_chart_oki')} dataKey="oki" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-faint">{t('oki_chart_net_gain')}</p>
          </div>

          <Callout tone="info" icon={Info}>{t('oki_footer_note').replace('{limit}', fmtMoney(OKI_LIMIT, locale))}</Callout>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, negative = false, bold = false }) {
  return (
    <div className="flex justify-between py-1 text-[13px]">
      <span className="text-dim">{label}</span>
      <span className={negative ? 'font-medium text-down' : bold ? 'font-bold text-up' : 'font-medium text-fg'}>{value}</span>
    </div>
  );
}
