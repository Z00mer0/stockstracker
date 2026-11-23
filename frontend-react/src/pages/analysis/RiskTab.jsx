import { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingDown, Gauge, ShieldCheck, Sigma, Hourglass } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { usePrivacy } from '../../context/PrivacyContext';
import { useFxBreakdown } from '../../hooks/useFxBreakdown';
import { Card, EmptyState, Stat, Table } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { formatNumber, formatPercent } from '../../utils/format.js';
import { snapshotRows } from '../../utils/capital.js';
import { twrSeries, maxDrawdown } from '../../utils/historyStats.js';
import { dailyReturns, volatility, sharpe, sortino, beta } from '../../utils/riskMetrics.js';
import { benchInPLN } from '../../utils/benchmarkCompare.js';
import { correlationMatrix, weightedAvgCorrelation } from '../../utils/correlation.js';

const MIN_SESSIONS = 60;

// Odpowiedź Yahoo /chart → [{ date, price }] rosnąco; cena skorygowana
// o dywidendy i splity, gdy Yahoo ją podaje.
function chartPoints(data) {
  const result = data?.chart?.result?.[0];
  const ts = result?.timestamp ?? [];
  const prices = result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close ?? [];
  return ts
    .map((s, i) => ({ date: new Date(s * 1000).toISOString().slice(0, 10), price: prices[i] }))
    .filter(p => p.price > 0);
}

// Miary ryzyka na dziennych stopach ważonych czasem (bez wpłat i wypłat) —
// patrz utils/riskMetrics.js. Beta względem WIG i względem S&P 500
// przeliczonego na złote kursem z dnia: portfel liczony jest w złotych, a beta
// do indeksu w dolarach mieszała w wynik ruch kursu USD/PLN.
function RiskCard() {
  const t = useT();
  const { locale } = useLanguage();
  const { snapshots, transactions, fxRates, cash } = useApp();

  const cashPLN = Object.entries(cash ?? {}).reduce((s, [c, a]) => s + (a || 0) * (fxRates[c] ?? 1), 0);
  const series = useMemo(
    () => twrSeries(snapshotRows(snapshots, { transactions, fxRates, cashPLN }).filter(r => r.total > 0)),
    [snapshots, transactions, fxRates, cashPLN]
  );
  const returns = useMemo(() => dailyReturns(series), [series]);
  const daySpan = series.length >= 2
    ? Math.round((new Date(series[series.length - 1].date) - new Date(series[0].date)) / 86400000)
    : 0;
  const sessions = series.length;
  const enough = sessions >= MIN_SESSIONS;

  // Kurs USD z dnia snapshotu; przed pierwszym zapisanym — bieżący.
  const usdRate = fxRates.USD;
  const fxSeries = useMemo(() => {
    const pts = snapshots.filter(s => s.fx?.USD > 0).map(s => ({ date: s.date, rate: s.fx.USD }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return pts.length ? pts : [{ date: '1970-01-01', rate: usdRate ?? 1 }];
  }, [snapshots, usdRate]);

  const [betas, setBetas] = useState({ wig: null, spx: null });
  const [betaLoading, setBetaLoading] = useState(false);
  useEffect(() => {
    if (!enough) return;
    const ctrl = new AbortController();
    const get = url => fetch(url, { signal: ctrl.signal }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    const byDate = pts => Object.fromEntries(pts.map(p => [p.date, p.price]));
    const spxUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5y';
    setBetaLoading(true);
    Promise.allSettled([
      get('/api/bench-pl?s=WIG').then(pts => (Array.isArray(pts) ? beta(returns, byDate(pts)) : null)),
      get(`/api/proxy?url=${encodeURIComponent(spxUrl)}`).then(data => {
        const pts = chartPoints(data);
        return pts.length ? beta(returns, byDate(benchInPLN(pts, fxSeries))) : null;
      }),
    ]).then(([wig, spx]) => {
      if (ctrl.signal.aborted) return;
      for (const r of [wig, spx]) if (r.status === 'rejected') console.warn('[risk/beta]', r.reason?.message);
      setBetas({ wig: wig.value ?? null, spx: spx.value ?? null });
      setBetaLoading(false);
    });
    return () => ctrl.abort();
  }, [enough, returns, fxSeries]);

  if (sessions < 10 || daySpan < 30) {
    return (
      <EmptyState
        icon={Hourglass}
        title={t('risk_section')}
        description={`${t('not_enough_history')} (min. 30 ${t('days_of_history')}: ${daySpan})`}
      />
    );
  }

  const vol = volatility(returns);
  const mdd = maxDrawdown(series);
  const sh = sharpe(returns);
  const so = sortino(returns);
  const ratioTone = v => (v == null ? undefined : v >= 1 ? 'up' : v < 0 ? 'down' : undefined);
  const waiting = (
    <span className="block w-full min-w-[120px]">
      <span className="block text-faint">{t('waiting_for_data')}</span>
      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={sessions} aria-valuemin={0} aria-valuemax={MIN_SESSIONS}>
        <span className="block h-full rounded-full bg-up" style={{ width: `${Math.round(sessions / MIN_SESSIONS * 100)}%` }} />
      </span>
      <span className="mt-1 block text-[11px] font-normal text-faint">{sessions}/{MIN_SESSIONS}</span>
    </span>
  );

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Stat
        icon={Activity} label={t('volatility_label')} hint={!enough ? waiting : t('volatility_sub')}
        value={enough && vol != null ? formatPercent(vol, { locale, decimals: 1, showSign: false }) : '—'}
        tone={!enough || vol == null ? undefined : vol < 15 ? 'up' : vol > 30 ? 'down' : 'warn'}
      />
      <Stat
        icon={TrendingDown} label={t('max_drawdown_label')} hint={t('max_drawdown_sub')}
        value={mdd ? formatPercent(-mdd.pct, { locale, decimals: 1, showSign: false }) : '—'}
        tone={!mdd ? undefined : mdd.pct < 10 ? 'up' : mdd.pct > 25 ? 'down' : 'warn'}
      />
      <Stat icon={Gauge} label={t('sharpe_label')} hint={t('sharpe_sub')} value={sh != null ? formatNumber(sh, 2, locale) : '—'} tone={ratioTone(sh)} />
      <Stat icon={ShieldCheck} label={t('sortino_label')} hint={t('sortino_sub')} value={so != null ? formatNumber(so, 2, locale) : '—'} tone={ratioTone(so)} />
      <Stat
        icon={Sigma} label={t('beta_wig_label')} hint={!enough ? waiting : betaLoading ? t('loading') : t('beta_wig_sub')}
        value={enough && !betaLoading && betas.wig != null ? formatNumber(betas.wig, 2, locale) : '—'}
      />
      <Stat
        icon={Sigma} label={t('beta_label')} hint={!enough ? waiting : betaLoading ? t('loading') : t('beta_sub')}
        value={enough && !betaLoading && betas.spx != null ? formatNumber(betas.spx, 2, locale) : '—'}
      />
      <p className="col-span-full text-small text-faint">{t('risk_twr_note')}</p>
    </div>
  );
}

// Korelacja dziennych stóp między największymi pozycjami (rok notowań z
// Yahoo). Fundusze TFI i kontrakty mają kurs tylko ze stooq — pomijane.
const CORR_MAX = 12;
const STOOQ_ONLY = /^\d+\.N$|^STOOQ:/i;

function CorrelationCard({ enriched }) {
  const t = useT();
  const { locale } = useLanguage();
  const top = useMemo(
    () => enriched
      .filter(p => p.valuePLN > 0 && p.symbol && !STOOQ_ONLY.test(p.symbol))
      .sort((a, b) => b.valuePLN - a.valuePLN)
      .slice(0, CORR_MAX),
    [enriched]
  );
  const key = top.map(p => p.symbol).join(',');
  const [series, setSeries] = useState(null);   // null = ładowanie

  useEffect(() => {
    if (top.length < 2) return;
    const ctrl = new AbortController();
    setSeries(null);
    Promise.allSettled(top.map(p =>
      fetch(`/api/chart?symbol=${encodeURIComponent(p.symbol)}&interval=1d&range=1y`, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
        .then(chartPoints)
    )).then(res => {
      if (ctrl.signal.aborted) return;
      const out = {};
      res.forEach((r, i) => { if (r.status === 'fulfilled' && r.value.length) out[top[i].symbol] = r.value; });
      setSeries(out);
    });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const corr = useMemo(() => (series ? correlationMatrix(series) : null), [series]);
  if (top.length < 2) return null;

  const weights = Object.fromEntries(top.map(p => [p.symbol, p.valuePLN]));
  const avg = corr ? weightedAvgCorrelation(corr.pairs, weights) : null;
  const skipped = series ? top.map(p => p.symbol).filter(s => !series[s]) : [];
  const fmt = v => (v == null ? '—' : formatNumber(v, 2, locale));
  const verdict = avg == null ? null : avg < 0.3 ? 'corr_low' : avg < 0.6 ? 'corr_mid' : 'corr_high';
  // Kolor komórki: akcent dla dodatniej, niebieski dla ujemnej; nasycenie = siła.
  const cellBg = r => (r == null ? undefined
    : `color-mix(in srgb, var(${r >= 0 ? '--accent' : '--info'}) ${Math.round(Math.abs(r) * 70)}%, transparent)`);

  return (
    <Card title={t('corr_title')}>
      <div className="space-y-3 px-4 py-3">
        <p className="text-small text-faint">{t('corr_desc')}</p>
        {!corr ? (
          <p className="text-small text-faint">{t('loading')}</p>
        ) : corr.pairs.length === 0 ? (
          <p className="text-small text-faint">{t('corr_no_data')}</p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat
                label={t('corr_avg_label')} hint={verdict ? t(verdict) : t('corr_avg_sub')}
                value={fmt(avg)} tone={avg == null ? undefined : avg < 0.3 ? 'up' : avg >= 0.6 ? 'warn' : undefined}
              />
              <div className="rounded-[var(--radius-sm)] border border-line px-3 py-2.5">
                <p className="text-label uppercase text-faint">{t('corr_top_pairs')}</p>
                <ul className="mt-1.5 space-y-1 text-small">
                  {corr.pairs.slice(0, 3).map(p => (
                    <li key={`${p.a}-${p.b}`} className="flex justify-between gap-3">
                      <span className="text-dim">{p.a} – {p.b}</span>
                      <span className="font-semibold tabular-nums text-fg">{fmt(p.r)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="border-separate border-spacing-0.5 text-[11px] tabular-nums">
                <thead>
                  <tr>
                    <th />
                    {corr.symbols.map(s => <th key={s} className="px-1.5 py-1 font-semibold text-faint">{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {corr.symbols.map((s, i) => (
                    <tr key={s}>
                      <th className="whitespace-nowrap pr-2 text-left font-semibold text-faint">{s}</th>
                      {corr.matrix[i].map((r, j) => (
                        <td key={j} className={cx('min-w-[44px] rounded px-1.5 py-1 text-center', i === j ? 'text-faint' : 'text-fg')}
                          style={{ background: i === j ? undefined : cellBg(r) }}>
                          {i === j ? '·' : fmt(r)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {skipped.length > 0 && <p className="text-small text-faint">{t('corr_skipped')}: {skipped.join(', ')}</p>}
        <p className="text-[11px] leading-relaxed text-faint">{t('corr_note')}</p>
      </div>
    </Card>
  );
}

function FxBreakdownCard({ enriched }) {
  const t = useT();
  const { locale } = useLanguage();
  const { transactions, fxRates } = useApp();
  const { isPrivate } = usePrivacy();
  // Kursy z dat zakupu pobieramy dopiero po wejściu na tę zakładkę.
  const { breakdown, fxLoading } = useFxBreakdown(enriched, transactions, fxRates);
  const rows = enriched.filter(p => p.currency && p.currency !== 'PLN' && p.price != null);
  if (!rows.length) return null;

  const pct = v => (v == null ? '—' : formatPercent(v, { locale, decimals: 2 }));
  const tone = v => (v == null ? 'text-faint' : v >= 0 ? 'text-up' : 'text-down');
  const pending = fxLoading ? '…' : '—';
  const zl = v => (v == null ? '' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString(locale, { maximumFractionDigits: 0 })} zł`);
  const both = (pctKey, plnKey, bold) => p => cell(p, pctKey, v => (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className={cx(bold ? 'font-bold' : 'font-semibold', tone(v))}>{pct(v)}</span>
      <span className={cx('text-[11px] text-faint', isPrivate && 'privacy-blur')}>{zl(breakdown[p.symbol][plnKey])}</span>
    </span>
  ));
  const done = rows.map(p => breakdown[p.symbol]).filter(Boolean);
  const sum = k => done.reduce((s, b) => s + b[k], 0);
  const cell = (p, k, render) => {
    const bd = breakdown[p.symbol];
    return bd ? render(bd[k]) : <span className="text-faint">{pending}</span>;
  };

  return (
    <Card title={t('fx_decomp')}>
      <p className="px-4 pt-3 text-small text-faint">{t('fx_description')}</p>
      {done.length > 0 && (
        <div className="grid grid-cols-3 gap-3 px-4 pt-3">
          <Stat blur={isPrivate} label={t('fx_sum_stock')} value={zl(sum('stockPLN'))} tone={sum('stockPLN') >= 0 ? 'up' : 'down'} />
          <Stat blur={isPrivate} label={t('fx_sum_fx')} value={zl(sum('fxPLN'))} tone={sum('fxPLN') >= 0 ? 'up' : 'down'} />
          <Stat blur={isPrivate} label={t('fx_sum_total')} value={zl(sum('totalPLN'))} tone={sum('totalPLN') >= 0 ? 'up' : 'down'} />
        </div>
      )}
      <Table
        columns={[
          { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: p => <span className="font-semibold text-fg">{p.symbol}</span> },
          { key: 'currency', header: t('col_currency'), render: p => <span className="text-dim">{p.currency}</span> },
          { key: 'buy', header: t('col_buy_rate'), align: 'right', render: p => cell(p, 'purchaseFx', v => <span className="text-dim">{v?.toFixed(4) ?? '—'}</span>) },
          { key: 'cur', header: t('col_current_rate'), align: 'right', render: p => cell(p, 'currentFx', v => <span className="text-dim">{v?.toFixed(4) ?? '—'}</span>) },
          { key: 'asset', header: t('col_asset_return'), align: 'right', render: both('assetReturn', 'stockPLN') },
          { key: 'fx', header: t('col_fx_impact'), align: 'right', render: both('fxReturn', 'fxPLN') },
          { key: 'total', header: t('col_total_pln'), align: 'right', mobile: 'aside', render: both('totalReturn', 'totalPLN', true) },
        ]}
        rows={rows}
        rowKey={p => p.symbol}
      />
      <p className="px-4 pb-3 pt-2 text-[11px] leading-relaxed text-faint">{t('fx_footer')}</p>
    </Card>
  );
}

export default function RiskTab({ enriched }) {
  return (
    <div className="space-y-4">
      <RiskCard />
      <CorrelationCard enriched={enriched} />
      <FxBreakdownCard enriched={enriched} />
    </div>
  );
}
