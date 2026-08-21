import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import Card from '../components/shared/Card';
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

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: t('oki_chart_regular'),
            data: regSeries,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34,197,94,0.08)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.25,
          },
          {
            label: t('oki_chart_oki'),
            data: okiSeries,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59,130,246,0.08)',
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
          legend: { labels: { color: '#e2e8f0', font: { size: 12, weight: '600' } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtMoney(ctx.parsed.y, locale)}` } },
        },
        scales: {
          x: { ticks: { color: '#8892a4', maxTicksLimit: 10 }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: {
            ticks: { color: '#8892a4', callback: v => fmtMoneyShort(v, locale) },
            grid:  { color: 'rgba(255,255,255,0.04)' },
            title: { display: true, text: t('oki_chart_net_gain'), color: '#8892a4', font: { size: 11 } },
          },
        },
      },
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [result, initialValue, locale, t]);

  const firstYear = result.rows[0];
  const advantage = result.advantage;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{t('oki_title')}</h2>

      <Card title={t('oki_params_title')}>
        <div style={{ padding: 16, display: 'grid', gap: 20 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('oki_initial_value')}</label>
              <input
                type="number" min="0" max="10000000" step="1000"
                value={initialValue}
                onChange={e => setInitialValue(parseInt(e.target.value, 10) || 0)}
                className="field-input"
                style={{ width: 140, textAlign: 'right' }}
              />
            </div>
            <input
              type="range" min="0" max="1000000" step="5000"
              value={Math.min(initialValue, 1_000_000)}
              onChange={e => setInitialValue(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              {t('oki_limit_hint').replace('{limit}', fmtMoney(OKI_LIMIT, locale))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('oki_annual_return')}</label>
              <span style={{ fontSize: 13, color: 'var(--up)', fontWeight: 600 }}>
                {annualReturn.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
              </span>
            </div>
            <input
              type="range" min="-20" max="30" step="0.5"
              value={annualReturn}
              onChange={e => setAnnualReturn(parseFloat(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              {t('oki_return_hint')}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <label style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('oki_horizon')}</label>
              <span style={{ fontSize: 13, color: 'var(--up)', fontWeight: 600 }}>
                {years} {t('oki_years')}
              </span>
            </div>
            <input
              type="range" min="1" max="40" step="1"
              value={years}
              onChange={e => setYears(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={activelyManaged}
              onChange={e => setActivelyManaged(e.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{t('oki_active_mgmt')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('oki_active_mgmt_hint')}</div>
            </div>
          </label>

          <div style={{ fontSize: 11, color: 'var(--text-faint)', background: 'rgba(255,176,32,0.06)', border: '1px solid rgba(255,176,32,0.2)', borderRadius: 6, padding: 10 }}>
            ⚠ {t('oki_disclaimer')}
          </div>
        </div>
      </Card>

      <Card title={t('oki_result_title')}>
        <div style={{ padding: 16 }}>
          <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
              {t('oki_result_headline').replace('{years}', years).replace('{yearsLabel}', t('oki_years'))}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: advantage >= 0 ? 'var(--up)' : 'var(--down)', marginTop: 4 }}>
              {advantage >= 0 ? '+' : ''}{fmtMoney(advantage, locale)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {t('oki_result_final')
                .replace('{oki}', fmtMoney(result.okiNet, locale))
                .replace('{reg}', fmtMoney(result.regularNet, locale))}
            </div>
          </div>

          {firstYear && (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                {t('oki_year1_mechanics')}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--down)', fontWeight: 700, marginBottom: 8 }}>{t('oki_regular_account')}</div>
                  <Row label={t('oki_gross_gain')}   value={fmtMoney(firstYear.regGrossEnd - firstYear.regStart, locale)} />
                  <Row label={`${t('oki_belka_tax')} (19%)`} value={`-${fmtMoney(firstYear.regTax, locale)}`} negative />
                  <Row label={t('oki_net_gain')}     value={fmtMoney(firstYear.regEnd - firstYear.regStart, locale)} bold />
                </div>
                <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--up)', fontWeight: 700, marginBottom: 8 }}>{t('oki_account')}</div>
                  <Row label={t('oki_gross_gain')}   value={fmtMoney(firstYear.okiStart * (Number(annualReturn) / 100), locale)} />
                  <Row label={t('oki_avg_excess_tax')} value={`-${fmtMoney(firstYear.okiTax, locale)}`} negative />
                  <Row label={t('oki_net_gain')}     value={fmtMoney(firstYear.okiEnd - firstYear.okiStart, locale)} bold />
                </div>
              </div>
            </>
          )}

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              {t('oki_chart_title').replace('{years}', years).replace('{yearsLabel}', t('oki_years'))}
            </div>
            <div style={{ height: 320 }}>
              <canvas ref={canvasRef} />
            </div>
          </div>

          <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-faint)', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            {t('oki_footer_note').replace('{limit}', fmtMoney(OKI_LIMIT, locale))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value, negative = false, bold = false }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span
        className="mono"
        style={{
          color: negative ? 'var(--down)' : bold ? 'var(--up)' : 'var(--text)',
          fontWeight: bold ? 700 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}
