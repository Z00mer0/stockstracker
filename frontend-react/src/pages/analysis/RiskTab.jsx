import { useEffect, useMemo, useState } from 'react';
import { Activity, TrendingDown, Gauge, ShieldCheck, Sigma, Hourglass } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage, useT } from '../../context/LanguageContext';
import { useFxBreakdown } from '../../hooks/useFxBreakdown';
import { Card, EmptyState, Stat, Table } from '../../components/ui';
import { cx } from '../../components/ui/cx.js';
import { formatPercent } from '../../utils/format.js';
import { snapshotRows } from '../../utils/capital.js';
import { twrSeries, maxDrawdown } from '../../utils/historyStats.js';
import { dailyReturns, volatility, sharpe, sortino, beta } from '../../utils/riskMetrics.js';

const MIN_SESSIONS = 60;

// Miary ryzyka na dziennych stopach ważonych czasem (bez wpłat i wypłat) —
// patrz utils/riskMetrics.js. Beta względem S&P 500.
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

  const [betaVal, setBetaVal] = useState(null);
  const [betaLoading, setBetaLoading] = useState(false);
  useEffect(() => {
    if (!enough) return;
    const ctrl = new AbortController();
    setBetaLoading(true);
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=5y';
    fetch(`/api/proxy?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        const result = data.chart?.result?.[0];
        const ts = result?.timestamp, prices = result?.indicators?.adjclose?.[0]?.adjclose;
        if (!ts || !prices) return;
        const byDate = {};
        ts.forEach((s, i) => { if (prices[i] != null) byDate[new Date(s * 1000).toISOString().slice(0, 10)] = prices[i]; });
        setBetaVal(beta(returns, byDate));
      })
      .catch(e => { if (e.name !== 'AbortError') console.warn('[risk/beta]', e.message); })
      .finally(() => setBetaLoading(false));
    return () => ctrl.abort();
  }, [enough, returns]);

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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
      <Stat icon={Gauge} label={t('sharpe_label')} hint={t('sharpe_sub')} value={sh != null ? sh.toFixed(2) : '—'} tone={ratioTone(sh)} />
      <Stat icon={ShieldCheck} label={t('sortino_label')} hint={t('sortino_sub')} value={so != null ? so.toFixed(2) : '—'} tone={ratioTone(so)} />
      <Stat
        className="col-span-2 sm:col-span-1"
        icon={Sigma} label={t('beta_label')} hint={!enough ? waiting : betaLoading ? t('loading') : t('beta_sub')}
        value={enough && !betaLoading && betaVal != null ? betaVal.toFixed(2) : '—'}
      />
      <p className="col-span-full text-small text-faint">{t('risk_twr_note')}</p>
    </div>
  );
}

function FxBreakdownCard({ enriched }) {
  const t = useT();
  const { locale } = useLanguage();
  const { transactions, fxRates } = useApp();
  // Kursy z dat zakupu pobieramy dopiero po wejściu na tę zakładkę.
  const { breakdown, fxLoading } = useFxBreakdown(enriched, transactions, fxRates);
  const rows = enriched.filter(p => p.currency && p.currency !== 'PLN' && p.price != null);
  if (!rows.length) return null;

  const pct = v => (v == null ? '—' : formatPercent(v, { locale, decimals: 2 }));
  const tone = v => (v == null ? 'text-faint' : v >= 0 ? 'text-up' : 'text-down');
  const pending = fxLoading ? '…' : '—';
  const cell = (p, k, render) => {
    const bd = breakdown[p.symbol];
    return bd ? render(bd[k]) : <span className="text-faint">{pending}</span>;
  };

  return (
    <Card title={t('fx_decomp')}>
      <p className="px-4 pt-3 text-small text-faint">{t('fx_description')}</p>
      <Table
        columns={[
          { key: 'symbol', header: t('col_symbol'), mobile: 'title', render: p => <span className="font-semibold text-fg">{p.symbol}</span> },
          { key: 'currency', header: t('col_currency'), render: p => <span className="text-dim">{p.currency}</span> },
          { key: 'buy', header: t('col_buy_rate'), align: 'right', render: p => cell(p, 'purchaseFx', v => <span className="text-dim">{v?.toFixed(4) ?? '—'}</span>) },
          { key: 'cur', header: t('col_current_rate'), align: 'right', render: p => cell(p, 'currentFx', v => <span className="text-dim">{v?.toFixed(4) ?? '—'}</span>) },
          { key: 'asset', header: t('col_asset_return'), align: 'right', render: p => cell(p, 'assetReturn', v => <span className={cx('font-semibold', tone(v))}>{pct(v)}</span>) },
          { key: 'fx', header: t('col_fx_impact'), align: 'right', render: p => cell(p, 'fxReturn', v => <span className={cx('font-semibold', tone(v))}>{pct(v)}</span>) },
          { key: 'total', header: t('col_total_pln'), align: 'right', mobile: 'aside', render: p => cell(p, 'totalReturn', v => <span className={cx('font-bold', tone(v))}>{pct(v)}</span>) },
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
      <FxBreakdownCard enriched={enriched} />
    </div>
  );
}
