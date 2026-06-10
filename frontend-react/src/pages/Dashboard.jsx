import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Sparkline from '../components/shared/Sparkline';
import Spinner from '../components/shared/Spinner';
import TickerLogo from '../components/shared/TickerLogo';
import Chip from '../components/shared/Chip';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import useDividendEvents from '../hooks/useDividendEvents';
import { COLUMN_DEFS, loadColumnConfig } from '../utils/portfolioColumns';
import KpiPro from '../components/shared/KpiPro';
import InsightStrip from '../components/shared/InsightStrip';
import StackedAllocation from '../components/shared/StackedAllocation';
import WinnersLosers from '../components/shared/WinnersLosers';
import SegmentedControl from '../components/shared/SegmentedControl';
import HistoryChart from '../components/HistoryChart';

function xirr(cashflows) {
  if (cashflows.length < 2) return null;
  const t0 = new Date(cashflows[0].date).getTime();
  const days = cashflows.map(cf => (new Date(cf.date).getTime() - t0) / 86400000);
  let rate = 0.1;
  for (let iter = 0; iter < 100; iter++) {
    let f = 0, df = 0;
    for (let i = 0; i < cashflows.length; i++) {
      const t = days[i] / 365;
      const denom = Math.pow(1 + rate, t);
      f  += cashflows[i].amount / denom;
      df -= t * cashflows[i].amount / (denom * (1 + rate));
    }
    if (Math.abs(f) < 1e-7) return rate;
    const next = rate - f / df;
    if (!isFinite(next)) return null;
    rate = next;
  }
  return Math.abs(rate) < 50 ? rate : null;
}

function toPlnRate(currency, fx) {
  return fx[currency] ?? 1;
}

function fmt(n, decimals = 2, locale = 'pl-PL') {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CUR_FLAG_DASH = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };
const COL_LABEL_DASH = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.label]));

function renderCellDash(key, pos, isPrivate) {
  const flag = CUR_FLAG_DASH[pos.currency] ?? pos.currency;
  switch (key) {
    case 'qty':
      return <span style={{ color: 'var(--text)' }}>{fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}</span>;
    case 'avgPrice':
      return <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.avgPrice)} <span className="text-xs">{flag}</span></span>;
    case 'price':
      return pos.price != null
        ? <span style={{ color: 'var(--text)' }}>{fmt(pos.price)} <span className="text-xs">{flag}</span></span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'dailyChg': {
      if (pos.dailyChg == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.dailyChg >= 0;
      return <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>{up ? '+' : ''}{fmt(pos.dailyChg, 2)}%</span>;
    }
    case 'costPLN':
      return <span style={{ color: 'var(--text)', fontWeight: 600 }} className={isPrivate ? 'privacy-blur' : ''}>{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span style={{ color: 'var(--text)', fontWeight: 600 }} className={isPrivate ? 'privacy-blur' : ''}>{fmt(pos.valuePLN)} zł</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.plPLN >= 0;
      return <span style={{ color: up ? 'var(--up)' : 'var(--down)', fontWeight: 600 }} className={isPrivate ? 'privacy-blur' : ''}>{up ? '+' : ''}{fmt(pos.plPLN)} zł</span>;
    }
    case 'period':
      return <span style={{ color: 'var(--text-dim)' }}>{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null ? <span style={{ color: 'var(--text)' }}>{fmt(pos.moic, 2)}x</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'irr': {
      if (pos.irr == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.irr >= 0;
      return <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>{up ? '+' : ''}{fmt(pos.irr, 1)}%</span>;
    }
    case 'pe':
      return pos.pe != null ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pe, 1)}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'peFwd':
      return pos.peFwd != null ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.peFwd, 1)}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'pb':
      return pos.pb != null ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pb, 2)}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    default:
      return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  }
}


export default function Dashboard() {
  const { portfolio, transactions, snapshots, loading, fxRates, cash, otherAssets, saveCash, invested, saveSnapshot, displayName, displayCurrency } = useApp();
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const { openChart } = useChart();
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();
  const fmtN = (n, decimals = 2) => fmt(n, decimals, locale);
  const [cols] = useState(loadColumnConfig);
  const [tf, setTf] = useState('MAX');
  const { enrichPosition } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { allCalendarEvents } = useDividendEvents(symbols);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nextDividend = allCalendarEvents.find(e => e.date >= todayStr);

  // ── Live positions (market prices + enrichment) ──────────────────────────
  const allPositions = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const topPositions = useMemo(
    () => [...portfolio]
      .sort((a, b) => (b.qty * b.avgPrice * toPlnRate(b.currency, fxRates)) - (a.qty * a.avgPrice * toPlnRate(a.currency, fxRates)))
      .slice(0, 7)
      .map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const topMovers = useMemo(() => {
    const withChg = allPositions.filter(p => p.dailyChg != null);
    const sorted = [...withChg].sort((a, b) => b.dailyChg - a.dailyChg);
    return { gainers: sorted.slice(0, 3), losers: sorted.slice(-3).reverse() };
  }, [allPositions]);

  // ── KPI — real-time values from live positions, not stale snapshots ────────
  const kpi = useMemo(() => {
    // Transaction-derived (no live price needed)
    const realizedPLN = transactions
      .filter(t => t.type === 'SELL')
      .reduce((sum, tx) => {
        const rate = toPlnRate(tx.currency, fxRates);
        const pl   = tx.overridePL != null
          ? tx.overridePL
          : (tx.price - (tx.costBasis ?? tx.avgPrice ?? tx.price)) * tx.qty;
        return sum + pl * rate;
      }, 0);

    const dividendsPLN = transactions
      .filter(t => t.type === 'DIV')
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const yearCutStr = yearAgo.toISOString().slice(0, 10);
    const annualDivPLN = transactions
      .filter(t => t.type === 'DIV' && t.date >= yearCutStr)
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const sorted      = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const sparkValues = sorted.slice(-60).map(s => s.total ?? 0);

    // Live values — use real-time position prices, fall back to cost for unpriced positions
    const positionsValue   = allPositions.reduce((s, p) => s + (p.valuePLN ?? p.costPLN ?? 0), 0);
    const cashValue        = Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const otherAssetsValue = otherAssets.reduce((s, a) => s + (a.value || 0) * (fxRates[a.currency] ?? 1), 0);
    const totalValue       = positionsValue + cashValue + otherAssetsValue;

    // Unrealized P&L: sum of per-position P&L (null if price unknown → 0)
    const costBasis  = invested ?? 0; // = sum(qty * avgPrice * fx) for current holdings
    const unrealPLN  = allPositions.reduce((s, p) => s + (p.plPLN ?? 0), 0);
    const unrealPct  = costBasis > 0 ? (unrealPLN / costBasis) * 100 : 0;

    // Total ROI: (positionsValue + realizedPLN + dividendsPLN - costBasis) / costBasis
    const totalROI = costBasis > 0
      ? ((positionsValue + realizedPLN + dividendsPLN - costBasis) / costBasis) * 100
      : null;

    const pricesLoaded = allPositions.some(p => p.valuePLN != null);

    console.log('[KPI] Total Invested vs Total Value', {
      costBasis:       costBasis.toFixed(2),
      positionsValue:  positionsValue.toFixed(2),
      cashValue:       cashValue.toFixed(2),
      totalValue:      totalValue.toFixed(2),
      unrealPLN:       unrealPLN.toFixed(2),
      unrealPct:       unrealPct.toFixed(2) + '%',
      totalROI:        totalROI != null ? totalROI.toFixed(2) + '%' : 'n/a',
      pricesLoaded,
    });

    return {
      totalValue, positionsValue, cashValue, costBasis,
      unrealPLN, unrealPct, totalROI,
      realizedPLN, dividendsPLN, annualDivPLN,
      sparkValues, pricesLoaded,
    };
  }, [allPositions, snapshots, transactions, fxRates, cash, invested]);

  // ── Portfolio IRR — requires ≥30 days of history ──────────────────────────
  const { portfolioIrr, irrMissingSymbols, irrDaySpan } = useMemo(() => {
    const symbolsWithBuy = new Set(
      transactions.filter(t => t.type === 'BUY').map(t => t.symbol)
    );
    const missingSymbols = allPositions
      .filter(p => !symbolsWithBuy.has(p.symbol))
      .map(p => p.symbol);

    const cashflows = transactions
      .filter(t => t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIV')
      .map(t => ({
        amount: t.type === 'BUY'
          ? -(t.qty * t.price * (fxRates[t.currency] ?? 1))
          :  +(t.qty * t.price * (fxRates[t.currency] ?? 1)),
        date: t.date,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    if (!cashflows.length) return { portfolioIrr: null, irrMissingSymbols: missingSymbols, irrDaySpan: 0 };

    // Require at least 30 days of history — shorter periods give misleading annualized rates
    const daySpan = Math.round((Date.now() - new Date(cashflows[0].date).getTime()) / 86400000);
    if (daySpan < 30) return { portfolioIrr: null, irrMissingSymbols: missingSymbols, irrDaySpan: daySpan };

    // Only include positions with documented BUY transactions to avoid inflating IRR
    const terminalValue = allPositions
      .filter(p => symbolsWithBuy.has(p.symbol))
      .reduce((s, p) => s + (p.valuePLN ?? 0), 0);
    if (terminalValue <= 0) return { portfolioIrr: null, irrMissingSymbols: missingSymbols, irrDaySpan: daySpan }; // prices not loaded yet

    cashflows.push({ amount: terminalValue, date: new Date().toISOString().slice(0, 10) });
    return { portfolioIrr: xirr(cashflows), irrMissingSymbols: missingSymbols, irrDaySpan: daySpan };
  }, [transactions, fxRates, allPositions]);

  // ── Snapshot — only save when real prices are loaded ─────────────────────
  const positionsValueKey = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0).toFixed(0);
  useEffect(() => {
    if (loading) return;
    const pricesLoaded = allPositions.some(p => p.valuePLN != null);
    if (!pricesLoaded) return; // wait until market data arrives

    const totalValue    = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0)
      + Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const investedValue = allPositions.reduce((s, p) => s + (p.costPLN ?? 0), 0);
    if (totalValue > 0 && investedValue > 0) {
      saveSnapshot(totalValue, investedValue);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsValueKey, loading]);

  const dailyChange = useMemo(() => {
    let contributing = 0;
    const pln = allPositions.reduce((sum, pos) => {
      if (pos.valuePLN != null && pos.dailyChg != null) {
        contributing++;
        return sum + pos.valuePLN * pos.dailyChg / 100;
      }
      return sum;
    }, 0);
    if (contributing === 0) return { pln: null, pct: null };
    const pct = kpi.totalValue > 0 ? (pln / kpi.totalValue) * 100 : null;
    return { pln, pct };
  }, [allPositions, kpi.totalValue]);

  const snapshotsFiltered = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    if (tf === 'MAX') return sorted;
    const days = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 }[tf] || 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return sorted.filter(s => s.date >= cutoff);
  }, [snapshots, tf]);

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  const fmtVal = (n, d = 0) => n == null || isNaN(n)
    ? '—'
    : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });

  const isWeekend = [0, 6].includes(new Date().getDay());

  const dayChipVal = dailyChange.pct != null
    ? (dailyChange.pct >= 0 ? '+' : '') + fmtVal(dailyChange.pct, 2) + '%'
    : null;
  const unrealChipVal = kpi.unrealPct != null
    ? (kpi.unrealPct >= 0 ? '+' : '') + fmtVal(kpi.unrealPct, 2) + '%'
    : null;
  const irrChipVal = portfolioIrr != null
    ? (portfolioIrr * 100).toFixed(1) + '%/r'
    : null;

  const TF_OPTIONS = ['1T', '1M', '3M', '6M', '1R', 'MAX'];

  return (
    <div>
      {/* page-head */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div>
          <h1 className="page-title">{t('greeting')}, {displayName ?? t('investor_fallback')}</h1>
          <p className="page-sub">
            {new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* InsightStrip */}
      {allPositions.length > 0 && (
        <InsightStrip positions={allPositions} dailyChangePLN={dailyChange.pln} />
      )}

      {/* KPI grid */}
      <div className="kpi-grid" style={{ gap: 14, marginBottom: 18 }}>
        <KpiPro
          hero
          label={t('portfolio_value')}
          value={`${fmtVal(kpi.totalValue)} ${currLabel}`}
          chip={dayChipVal}
          chipUp={dailyChange.pln >= 0}
          sub={t('today')}
          spark={kpi.sparkValues.slice(-24)}
          sparkUp={dailyChange.pln >= 0}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>}
        />
        <KpiPro
          label={t('gain_loss')}
          tone={kpi.unrealPLN >= 0 ? 'up' : 'down'}
          value={`${kpi.unrealPLN >= 0 ? '+' : ''}${fmtVal(kpi.unrealPLN)} ${currLabel}`}
          chip={unrealChipVal}
          chipUp={kpi.unrealPLN >= 0}
          sub={t('unrealized')}
          spark={kpi.sparkValues.slice(-24)}
          sparkUp={kpi.unrealPLN >= 0}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
        />
        <KpiPro
          label={t('dividends_ytd')}
          value={`${fmtVal(kpi.annualDivPLN)} ${currLabel}`}
          sub={nextDividend ? `${t('next_prefix')}: ${nextDividend.symbol}` : t('last_12m')}
          spark={kpi.sparkValues.slice(-24)}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>}
        />
        <KpiPro
          label={t('free_cash')}
          value={`${fmtVal(kpi.cashValue)} ${currLabel}`}
          chip={irrChipVal}
          chipUp={portfolioIrr != null && portfolioIrr >= 0}
          sub={t('account_pln')}
          spark={kpi.sparkValues.slice(-24)}
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>}
        />
      </div>

      {/* Chart + Top movers */}
      <div className="detail-grid" style={{ gap: 16, marginBottom: 18 }}>
        <div className="card chart-card">
          <div style={{ padding: '18px 20px 4px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-faint)', fontWeight: 600, marginBottom: 4 }}>
                {t('portfolio_value_tf')} · {tf}
              </div>
              <div className={isPrivate ? 'privacy-blur' : ''} style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
                {fmtVal(kpi.totalValue)} {currLabel}
              </div>
            </div>
            <SegmentedControl
              options={TF_OPTIONS}
              value={tf}
              onChange={setTf}
            />
          </div>
          <div style={{ padding: '4px 12px 18px' }}>
            {snapshotsFiltered.length >= 2
              ? <HistoryChart data={snapshotsFiltered} />
              : <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)', fontSize: 12 }}>{t('not_enough_history')}</div>
            }
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div className="card-title">{t('top_movers_today')}</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className={isWeekend ? 'dot-status closed' : 'dot-status'} />
              {isWeekend ? t('market_closed_status') : t('market_live')}
            </span>
          </div>
          <div>
            {[...topMovers.gainers, ...topMovers.losers].length === 0
              ? <p style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-faint)' }}>{isWeekend ? t('market_closed') : t('no_data')}</p>
              : [...topMovers.gainers, ...topMovers.losers].map(pos => (
                <div key={pos.symbol} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                  <TickerLogo symbol={pos.symbol} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>{pos.symbol.replace('.WA', '')}</div>
                    {pos.name && <div style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pos.name}</div>}
                  </div>
                  <div className={isPrivate ? 'privacy-blur' : ''} style={{ textAlign: 'right', minWidth: 58 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13, color: pos.dailyChg >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {pos.dailyChg >= 0 ? '+' : ''}{pos.dailyChg?.toFixed(2)}%
                    </div>
                    {pos.price != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{fmtN(pos.price)}</div>
                    )}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Allocation + Winners/Losers */}
      {allPositions.length > 0 && (
        <div className="detail-grid detail-grid-alloc" style={{ gap: 16, marginBottom: 18 }}>
          <div className="card">
            <div className="card-head">
              <div className="card-title">{t('sector_alloc')}</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <StackedAllocation positions={allPositions} totalValue={kpi.positionsValue} />
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div className="card-title">{t('winners_losers')}</div>
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('returns_pct')}</span>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <WinnersLosers positions={allPositions} />
            </div>
          </div>
        </div>
      )}

      {!portfolio.length && !loading && (
        <div style={{ textAlign: 'center', padding: '64px 0', color: 'var(--text-faint)' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
          <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>{t('no_portfolio_data')}</p>
          <p style={{ fontSize: 14, marginTop: 4 }}>{t('add_positions_hint')}</p>
        </div>
      )}
    </div>
  );
}
