import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CalendarRange, TrendingUp, TrendingDown, Wallet, Coins, ArrowLeftRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import { monthlyReport, monthBounds, shiftMonth, changePct } from '../utils/monthlyReport.js';
import { fetchPriceOnDate } from '../utils/priceOnDate.js';
import { normalizeType } from '../utils/transactions.js';
import TickerLogo from '../components/shared/TickerLogo';
import { Button, Card, EmptyState, IconButton, PageHeader, Stat } from '../components/ui';
import { cx } from '../components/ui/cx.js';

// Raport miesięczny: wynik bez wpłat, aktywność, najlepsze i najsłabsze
// spółki miesiąca i portfel na tle WIG20 i S&P 500. Otwierany też z pusha
// wysyłanego pierwszego dnia miesiąca (?m=RRRR-MM).
const thisMonth = () => new Date().toISOString().slice(0, 7);

async function wig20On(date) {
  try {
    const r = await fetch('/api/bench-pl?s=WIG20', { signal: AbortSignal.timeout(15000) });
    const pts = await r.json();
    const hit = Array.isArray(pts) ? [...pts].reverse().find(p => p.date <= date) : null;
    return hit?.price ?? null;
  } catch { return null; }
}

export default function MonthlyReport() {
  const t = useT();
  const { locale } = useLanguage();
  const { isPrivate } = usePrivacy();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { snapshots, transactions, fxRates, portfolio, displayCurrency } = useApp();
  const { histFx } = usePortfolioMetrics(portfolio, transactions, fxRates);
  const param = new URLSearchParams(search).get('m');
  const month = /^\d{4}-\d{2}$/.test(param || '') ? param : shiftMonth(thisMonth(), -1);
  const go = m => navigate(`/report?m=${m}`, { replace: true });

  const report = useMemo(
    () => monthlyReport({ snapshots, transactions, fxRates, hist: histFx, month }),
    [snapshots, transactions, fxRates, histFx, month],
  );

  // Spółki miesiąca: posiadane dziś i sprzedane w tym miesiącu.
  const { prevEnd, start, end } = monthBounds(month);
  const today = new Date().toISOString().slice(0, 10);
  const until = end < today ? end : today;
  const symbols = useMemo(() => {
    const sold = transactions.filter(x => normalizeType(x.type) === 'SELL' && x.date >= start && x.date <= end).map(x => x.symbol);
    return [...new Set([...portfolio.filter(p => p.qty > 0).map(p => p.symbol), ...sold])].filter(Boolean).slice(0, 30);
  }, [portfolio, transactions, start, end]);
  const [movers, setMovers] = useState(null);
  const [bench, setBench] = useState({});
  useEffect(() => {
    let cancelled = false;
    setMovers(null); setBench({});
    Promise.all(symbols.map(async s => {
      const [a, b] = await Promise.all([fetchPriceOnDate(s, prevEnd).catch(() => null), fetchPriceOnDate(s, until).catch(() => null)]);
      return { symbol: s, pct: changePct(a?.price, b?.price) };
    })).then(list => { if (!cancelled) setMovers(list.filter(m => m.pct != null).sort((x, y) => y.pct - x.pct)); });
    Promise.all([
      Promise.all([fetchPriceOnDate('^GSPC', prevEnd).catch(() => null), fetchPriceOnDate('^GSPC', until).catch(() => null)]),
      Promise.all([wig20On(prevEnd), wig20On(until)]),
    ]).then(([[a, b], [w1, w2]]) => { if (!cancelled) setBench({ sp500: changePct(a?.price, b?.price), wig20: changePct(w1, w2) }); });
    return () => { cancelled = true; };
  }, [symbols.join(','), prevEnd, until]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispFx = fxRates[displayCurrency] ?? 1;
  const cur = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const money = (v, sign = false) => `${sign && v > 0 ? '+' : ''}${(v / dispFx).toLocaleString(locale, { maximumFractionDigits: 0 })} ${cur}`;
  const pct = v => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
  const tone = v => (v == null ? 'text-faint' : v >= 0 ? 'text-up' : 'text-down');
  const label = new Date(`${month}-15T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const best = movers?.slice(0, 3) ?? [];
  const worst = movers ? [...movers].reverse().slice(0, 3).filter(m => !best.includes(m)) : [];

  const nav = (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronLeft} label={t('report_prev')} onClick={() => go(shiftMonth(month, -1))} />
      <IconButton icon={ChevronRight} label={t('report_next')} disabled={month >= thisMonth()} onClick={() => go(shiftMonth(month, 1))} />
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={`${t('report_title')} — ${label}`} subtitle={report ? `${new Date(`${report.startDate}T12:00:00`).toLocaleDateString(locale)} → ${new Date(`${report.endDate}T12:00:00`).toLocaleDateString(locale)}${report.partial ? ` · ${t('report_partial')}` : ''}` : undefined} actions={nav} />
      {!report ? (
        <EmptyState icon={CalendarRange} title={t('report_empty')} description={t('report_empty_hint')} className="py-16" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat blur={isPrivate} icon={report.result >= 0 ? TrendingUp : TrendingDown} label={t(report.net ? 'report_result' : 'report_value_change')}
              value={<span className={tone(report.result)}>{money(report.result, true)}</span>} hint={pct(report.pct)} />
            <Stat blur={isPrivate} icon={Wallet} label={t('report_end_value')} value={money(report.endValue)} hint={`${t('report_start')}: ${money(report.startValue)}`} />
            <Stat blur={isPrivate} icon={ArrowLeftRight} label={t('report_flows')} value={report.net ? money(report.flows, true) : '—'} />
            <Stat blur={isPrivate} icon={Coins} label={t('report_dividends')} value={money(report.dividends)} hint={`${t('report_realized')}: ${money(report.realized, true)}`} />
          </div>

          <Card title={t('report_vs_market')}>
            <div className="grid grid-cols-3 gap-3 px-4 py-3 text-center">
              {[[t('report_portfolio'), report.pct], ['WIG20', bench.wig20], ['S&P 500', bench.sp500]].map(([n, v]) => (
                <div key={n} className="grid gap-0.5">
                  <span className="text-small text-dim">{n}</span>
                  <span className={cx('text-lg font-bold tabular-nums', tone(v))}>{pct(v)}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {[['report_best', best], ['report_worst', worst]].map(([k, list]) => (
              <Card key={k} title={t(k)}>
                <div className="grid">
                  {movers == null && <p className="px-4 py-3 text-small text-faint">{t('loading')}</p>}
                  {movers != null && list.length === 0 && <p className="px-4 py-3 text-small text-faint">—</p>}
                  {list.map(m => (
                    <div key={m.symbol} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
                      <TickerLogo symbol={m.symbol} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-fg">{m.symbol}</span>
                      <span className={cx('font-semibold tabular-nums', tone(m.pct))}>{pct(m.pct)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          <Card title={t('report_activity')}>
            <p className="px-4 py-3 text-small text-dim">
              {t('report_activity_line').replace('{buys}', report.buys).replace('{sells}', report.sells).replace('{fees}', money(report.fees))}
            </p>
          </Card>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={() => navigate('/history')}>{t('report_to_history')}</Button>
          </div>
        </>
      )}
    </div>
  );
}
