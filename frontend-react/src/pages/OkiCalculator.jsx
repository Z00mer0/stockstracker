import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { TriangleAlert, Info } from 'lucide-react';
import { Callout, Card, Field, Input } from '../components/ui';
import { useLanguage, useT } from '../context/LanguageContext';
import { simulateOki, OKI_LIMIT, OKI_RATE, BELKA_RATE } from '../utils/okiCalc.js';

Chart.register(...registerables);

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
  // Motyw ustawia Layout atrybutem data-theme — obserwujemy go, żeby
  // przerysować wykres w kolorach nowego motywu.
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme'));
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(document.documentElement.getAttribute('data-theme')));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

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

  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const labels = result.rows.map(r => `R${r.year}`);
    const okiSeries = result.rows.map(r => r.okiEnd - initialValue);
    const regSeries = result.rows.map(r => r.regEnd - initialValue);

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    // Kolory z tokenów motywu — wcześniej na sztywno jasne napisy i białe
    // linie siatki, w jasnym motywie niewidoczne.
    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    const text = v('--text'), dim = v('--text-faint'), grid = v('--border');

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: t('oki_chart_regular'),
            data: regSeries,
            borderColor: v('--up'),
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
          },
          {
            label: t('oki_chart_oki'),
            data: okiSeries,
            borderColor: v('--accent'),
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: text, font: { size: 12, weight: '600' } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, locale)}` } },
        },
        scales: {
          x: { ticks: { color: dim, maxTicksLimit: 10 }, grid: { color: grid } },
          y: {
            ticks: { color: dim, callback: val => fmtMoneyShort(val, locale) },
            grid:  { color: grid },
            title: { display: true, text: t('oki_chart_net_gain'), color: dim, font: { size: 11 } },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [result, initialValue, locale, t, theme]);

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
            <div className="h-80"><canvas ref={canvasRef} /></div>
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
