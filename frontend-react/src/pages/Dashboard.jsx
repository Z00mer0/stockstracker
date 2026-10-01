import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, TrendingUp, Coins, Wallet, TriangleAlert, WifiOff, Briefcase,
  ArrowUp, ArrowDown, MoonStar, RefreshCw, LineChart,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import StockDetailModal from '../components/StockDetailModal';
import { usePrivacy } from '../context/PrivacyContext';
import { useLanguage, useT } from '../context/LanguageContext';
import Sparkline from '../components/shared/Sparkline';
import TickerLogo from '../components/shared/TickerLogo';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import useDividendEvents from '../hooks/useDividendEvents';
import { formatPercent } from '../utils/format.js';
import InsightStrip from '../components/shared/InsightStrip';
import StackedAllocation from '../components/shared/StackedAllocation';
import WinnersLosers from '../components/shared/WinnersLosers';
import HistoryChart from '../components/HistoryChart';
import UnrealizedPnlBar from '../components/shared/UnrealizedPnlBar';
import { computePortfolioValue, dailyChangePLN } from '../utils/portfolioValue.js';
import { todayCapital, withCapital } from '../utils/capital.js';
import { normalizeType } from '../utils/transactions.js';
import { computeRealizedTrades } from '../utils/realizedPL.js';
import { PageSkeleton } from '../components/RouteFallback';
import {
  Button, Callout, Card, EmptyState, Field, Input, Modal, PageHeader, SegmentedControl, Stat,
} from '../components/ui';
import { cx } from '../components/ui/cx.js';

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


// Wiersz „Top ruchy dzisiaj" — cały jest przyciskiem otwierającym spółkę.
function MoverRow({ pos, onOpen, locale, fmtN }) {
  const up = pos.dailyChg >= 0;
  return (
    <button
      type="button"
      onClick={() => onOpen(pos)}
      className="flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left transition-colors last:border-b-0 hover:bg-panel-hover"
    >
      <TickerLogo symbol={pos.symbol} size={28} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-fg">{pos.symbol.replace('.WA', '')}</div>
        {pos.name && <div className="truncate text-[11px] text-faint">{pos.name}</div>}
      </div>
      <div className="min-w-[58px] text-right">
        <div className={cx('text-[13px] font-semibold', up ? 'text-up' : 'text-down')}>
          {formatPercent(pos.dailyChg, { locale, decimals: 2 })}
        </div>
        {pos.price != null && <div className="text-[11px] text-faint">{fmtN(pos.price)}</div>}
      </div>
    </button>
  );
}

function MoverGroup({ tone, label, items, ...rowProps }) {
  const Arrow = tone === 'up' ? ArrowUp : ArrowDown;
  return (
    <>
      <div className={cx('flex items-center gap-1 px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider', tone === 'up' ? 'text-up' : 'text-down')}>
        <Arrow size={11} aria-hidden /> {label}
      </div>
      {items.length === 0
        ? <div className="px-4 pb-2 pt-1 text-small text-faint">—</div>
        : items.map(pos => <MoverRow key={pos.symbol} pos={pos} {...rowProps} />)}
    </>
  );
}

export default function Dashboard() {
  const { portfolio, transactions, snapshots, loading, error, fxRates, fxStale, cash, otherAssets, saveCash, invested, saveSnapshot, saveBatchSnapshots, activePortfolioId, portfolios, displayName, displayCurrency, addPosition, refresh } = useApp();
  const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const { isPrivate } = usePrivacy();
  const { locale } = useLanguage();
  const t = useT();
  const navigate = useNavigate();
  const fmtN = (n, decimals = 2) => fmt(n, decimals, locale);
  const [tf, setTf] = useState('MAX');
  const [selectedStock, setSelectedStock] = useState(null);
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashEdit, setCashEdit] = useState({});
  const [savingCash, setSavingCash] = useState(false);
  const [wlMode, setWlMode] = useState('pct');
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

  const topMovers = useMemo(() => {
    const withChg = allPositions.filter(p => p.dailyChg != null);
    const sorted = [...withChg].sort((a, b) => b.dailyChg - a.dailyChg);
    return { gainers: sorted.slice(0, 3), losers: sorted.slice(-3).reverse() };
  }, [allPositions]);

  // ── KPI — real-time values from live positions, not stale snapshots ────────
  const kpi = useMemo(() => {
    // Transaction-derived (no live price needed)
    // Ta sama sciezka co Portfel, Analiza i Zamkniete pozycje. Wlasne liczenie,
    // ktore tu bylo, brało costBasis wprost z transakcji — a SELL-e z importu
    // brokera go nie maja. Fallback na `tx.price` dawal wtedy
    // (price - price) * qty = 0, wiec kazda taka sprzedaz liczyla sie jako zero
    // zysku. Na koncie uzytkownika 636 z 640 SELL-ow nie ma costBasis, stad
    // kafel pokazywal +114 zamiast pelnej kwoty.
    //
    // computeRealizedTrades odtwarza koszt nabycia z historii BUY (ta sama
    // srednia wazona co avgPrice w portfelu) i pomija tylko te sprzedaze,
    // dla ktorych naprawde nie ma pokrycia w zakupach.
    const realizedPLN = computeRealizedTrades(transactions, fxRates)
      .reduce((sum, t) => sum + t.plPLN, 0);

    // normalizeType: „DIVIDEND" z importu brokera to też dywidenda — wcześniej
    // kafelek i ROI ją pomijały (Transakcje i Dywidendy już ją liczą).
    const dividendsPLN = transactions
      .filter(t => normalizeType(t.type) === 'DIV')
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const yearCutStr = yearAgo.toISOString().slice(0, 10);
    const annualDivPLN = transactions
      .filter(t => normalizeType(t.type) === 'DIV' && t.date >= yearCutStr)
      .reduce((sum, d) => sum + (d.price || 0) * (d.qty || 1) * toPlnRate(d.currency, fxRates), 0);

    const jan1 = `${new Date().getFullYear()}-01-01`;
    const ytdRealizedPLN = transactions
      .filter(t => t.type === 'SELL' && t.date >= jan1)
      .reduce((sum, tx) => {
        const rate = toPlnRate(tx.currency, fxRates);
        const pl   = tx.overridePL != null
          ? tx.overridePL
          : (tx.price - (tx.costBasis ?? tx.avgPrice ?? tx.price)) * tx.qty;
        return sum + pl * rate;
      }, 0);

    const sorted      = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const sparkValues = sorted.slice(-60).map(s => s.total ?? 0);

    const cashValue        = Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const otherAssetsValue = otherAssets.reduce((s, a) => s + (a.value || 0) * (fxRates[a.currency] ?? 1), 0);

    // Ta sama funkcja co w Portfolio — patrz utils/portfolioValue.js.
    const { totalValue, positionsValue, pricesLoaded, staleTotal, partialPrices } =
      computePortfolioValue(allPositions, snapshots, cashValue + otherAssetsValue);

    // Unrealized P&L / ROI: sumuje po pozycjach z ceną (bez ceny → 0).
    const costBasis  = invested ?? 0;
    const unrealPLN  = allPositions.reduce((s, p) => s + (p.plPLN ?? 0), 0);
    const unrealPct  = pricesLoaded && costBasis > 0 ? (unrealPLN / costBasis) * 100 : null;
    const totalROI   = pricesLoaded && costBasis > 0
      ? ((positionsValue + realizedPLN + dividendsPLN - costBasis) / costBasis) * 100
      : null;

    return {
      totalValue, positionsValue, cashValue, costBasis,
      unrealPLN, unrealPct, totalROI,
      realizedPLN, dividendsPLN, annualDivPLN,
      ytdRealizedPLN,
      sparkValues, pricesLoaded, staleTotal, partialPrices,
    };
  }, [allPositions, snapshots, transactions, fxRates, cash, otherAssets, invested]);

  // ── Portfolio IRR — requires ≥30 days of history ──────────────────────────
  const { portfolioIrr } = useMemo(() => {
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

  // ── Snapshot — only save when ALL positions are priced ──────────────────
  // `.some` zapisywał częściowy total gdy tylko jedna pozycja miała cenę
  // (weekend/rate-limit YF) — 2026-07-19/20 zapisały ~25% prawdziwej wartości.
  const positionsValueKey = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0).toFixed(0);
  useEffect(() => {
    if (loading) return;
    if (allPositions.length === 0) return;
    const allPriced = allPositions.every(p => p.valuePLN != null);
    if (!allPriced) return;

    // Zamrażamy fx dnia razem ze snapshotem — historyczne wartości nie
    // będą się już zmieniać z aktualnym kursem NBP (PR #15).
    const fxSnapshot = { ...fxRates };
    const totalValue = allPositions.reduce((s, p) => s + (p.valuePLN ?? 0), 0)
      + Object.entries(cash).reduce((s, [cur, amt]) => s + (amt || 0) * (fxRates[cur] ?? 1), 0);
    const investedValue = allPositions.reduce((s, p) => s + (p.costPLN ?? 0), 0);
    if (!(totalValue > 0 && investedValue > 0)) return;
    // Kapitał własny (wpłaty − wypłaty) — Historia odejmuje go od wartości,
    // żeby wpłaty i zakupy nie liczyły się jako zysk. Patrz utils/capital.js.
    const today = new Date().toISOString().slice(0, 10);
    const { capital, native } = todayCapital({ snapshots, holdings: portfolio, cash, transactions, fxRates, today });
    if (activePortfolioId === 'all') {
      // Widok „Wszystkie" łączy ten sam symbol z kilku portfeli pod jednym
      // _portfolioId i nie zna gotówki per portfel — zapis per portfel był
      // więc błędny (bez gotówki, cudze akcje w obcym portfelu). Przy jednym
      // portfelu dane są jego własne; przy kilku zostawiamy to schedulerowi.
      if (portfolios.length !== 1) return;
      saveBatchSnapshots({
        [portfolios[0].id]: { total: totalValue, invested: investedValue, fx: fxSnapshot, capital, capitalNative: native },
      });
    } else {
      saveSnapshot(totalValue, investedValue, fxSnapshot, { capital, native });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positionsValueKey, loading]);

  const dailyChange = useMemo(() => {
    const pln = dailyChangePLN(allPositions);
    if (pln == null) return { pln: null, pct: null };
    // Procent względem wczorajszej wartości, nie dzisiejszej.
    const prev = kpi.totalValue - pln;
    const pct = prev > 0 ? (pln / prev) * 100 : null;
    return { pln, pct };
  }, [allPositions, kpi.totalValue]);

  const snapshotsFiltered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    // Always inject today's live value so current period has an endpoint
    if (kpi.totalValue > 0 && (sorted.length === 0 || sorted[sorted.length - 1].date !== today)) {
      // fx dnia dołączony — chart używa per-pkt fx, więc live endpoint
      // musi być rysowany po dzisiejszym kursie (spójnie z resztą punktów).
      const { capital } = todayCapital({ snapshots, holdings: portfolio, cash, transactions, fxRates, today });
      sorted = [...sorted, { date: today, total: kpi.totalValue, invested: invested ?? null, capital, fx: { ...fxRates } }];
    }
    // Linia przerywana to kapitał własny (wpłaty), nie koszt pozycji: wartość
    // obejmuje gotówkę, więc przy koszcie różnica między liniami była
    // „zyskiem + gotówką". Dni bez zapisanego kapitału — szacunek.
    sorted = withCapital(sorted, { transactions, fxRates, cashPLN: kpi.cashValue })
      .map(s => ({ ...s, invested: s.capital }));
    if (tf === 'MAX') return sorted;
    const days = { '1T': 7, '1M': 30, '3M': 90, '6M': 180, '1R': 365 }[tf] || 30;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const inRange = sorted.filter(s => s.date >= cutoff);
    // If fewer than 2 points in range, prepend the last known snapshot before cutoff as anchor
    if (inRange.length < 2) {
      const before = sorted.filter(s => s.date < cutoff);
      if (before.length > 0) return [before[before.length - 1], ...inRange];
    }
    return inRange;
  }, [snapshots, tf, kpi.totalValue, kpi.cashValue, invested, fxRates, portfolio, cash, transactions]);

  const blur = isPrivate;

  if (loading && !portfolio.length) {
    return <PageSkeleton />;
  }

  // Fetch danych padł (backend nie odpowiada) i nie mamy nic w pamięci — pokaż
  // uczciwy błąd połączenia z retry zamiast mylących „0 zł" jak przy pustym portfelu.
  if (error && !loading && !portfolio.length) {
    return (
      <EmptyState
        icon={WifiOff}
        title={t('connection_error')}
        description={t('connection_error_hint')}
        action={<Button variant="primary" icon={RefreshCw} onClick={() => refresh()}>{t('refresh_data')}</Button>}
        className="py-16"
      />
    );
  }

  const fmtVal = (n, d = 0) => n == null || isNaN(n)
    ? '—'
    : n.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  const dispFx = fxRates[displayCurrency] ?? 1;
  const fmtDisp = (n, d = 0) => fmtVal(n == null ? null : n / dispFx, d);
  const sign = v => (v >= 0 ? '+' : '');

  const isWeekend = [0, 6].includes(new Date().getDay());

  // Niezrealizowany P&L per pozycja (waluta wyświetlania) — top 5 + worst 5
  const unrealRows = (() => {
    const rows = allPositions
      .filter(p => p.plPLN != null)
      .map(p => ({ symbol: p.symbol, pl: parseFloat((p.plPLN / dispFx).toFixed(2)) }))
      .sort((a, b) => b.pl - a.pl);
    return rows.length > 10 ? [...rows.slice(0, 5), ...rows.slice(-5)] : rows;
  })();

  const dayChipVal = dailyChange.pct != null
    ? (dailyChange.pct >= 0 ? '+' : '') + fmtVal(dailyChange.pct, 2) + '%'
    : null;
  const unrealChipVal = kpi.unrealPct != null
    ? (kpi.unrealPct >= 0 ? '+' : '') + fmtVal(kpi.unrealPct, 2) + '%'
    : null;
  const irrChipVal = portfolioIrr != null
    // Z etykietą: bez niej roczna stopa zwrotu całego portfela stała pod
    // „Wolne środki" i czytała się jak oprocentowanie gotówki.
    ? `IRR ${formatPercent(portfolioIrr * 100, { locale, decimals: 1 })}/r`
    : null;

  // Nieaktualny kurs walut idzie przed resztą: fałszuje przeliczenie
  // każdej pozycji w obcej walucie, więc jest gorszy niż brak ceny.
  const valueHint = fxStale ? (fxStale === 'fallback' ? t('fx_fallback') : t('fx_stale'))
    : kpi.staleTotal ? t('last_session')
    : kpi.partialPrices ? t('prices_partial')
    : kpi.pricesLoaded ? t('today') : t('loading_prices');
  const valueHintWarn = Boolean(fxStale || kpi.staleTotal || kpi.partialPrices);

  const currentGainPLN = (kpi.unrealPLN ?? 0) + (kpi.realizedPLN ?? 0);
  const currentGainPct = kpi.costBasis > 0 ? (currentGainPLN / kpi.costBasis) * 100 : null;
  const gainUp = currentGainPLN >= 0;

  const notFound = allPositions.filter(p => p.notFound).map(p => p.symbol);
  const TF_OPTIONS = ['1T', '1M', '3M', '6M', '1R', 'MAX'];

  return (
    <div>
      <PageHeader
        title={`${t('greeting')}, ${displayName ?? t('investor_fallback')}`}
        subtitle={new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
      />

      {allPositions.length > 0 && (
        <InsightStrip
          positions={allPositions}
          dailyChangePLN={dailyChange.pln}
          dailyChangePct={dailyChange.pct}
          onSymbolClick={setSelectedStock}
          displayCurrency={displayCurrency}
          fxRate={dispFx}
        />
      )}

      {/* Bledne tickery — pokazujemy wprost. Bez tego jeden zly ticker
          (jak SMSN zamiast SMSN.IL) siedzial w portfelu 20 dni bez sygnalu:
          scheduler po cichu pomijal snapshoty calego portfela. */}
      {notFound.length > 0 && (
        <Callout
          tone="warn"
          icon={TriangleAlert}
          title={`${t('ticker_not_found')}: ${notFound.join(', ')}`}
          onClick={() => navigate('/portfolio')}
          className="mb-4"
        >
          {t('ticker_not_found_hint')}
        </Callout>
      )}

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          hero
          blur={blur}
          icon={Activity}
          label={t('portfolio_value')}
          value={kpi.totalValue == null ? '—' : `${fmtDisp(kpi.totalValue)} ${currLabel}`}
          delta={(kpi.pricesLoaded || kpi.partialPrices) ? dayChipVal : null}
          deltaTone={dailyChange.pln >= 0 ? 'up' : 'down'}
          hint={valueHint}
          hintTone={valueHintWarn ? 'warn' : undefined}
          spark={kpi.sparkValues.length >= 2 ? <Sparkline data={kpi.sparkValues.slice(-24)} width={72} height={26} /> : null}
          onClick={() => navigate('/portfolio')}
        />
        <Stat
          blur={blur}
          icon={TrendingUp}
          label={t('current_gain')}
          tone={gainUp ? 'up' : 'down'}
          value={`${sign(currentGainPLN)}${fmtDisp(currentGainPLN)} ${currLabel}`}
          delta={currentGainPct != null ? `${sign(currentGainPct)}${fmtVal(currentGainPct, 2)}%` : null}
          deltaTone={gainUp ? 'up' : 'down'}
          hint={
            <span className={blur ? 'privacy-blur' : undefined}>
              {t('realized_short')}: <span className={kpi.realizedPLN >= 0 ? 'text-up' : 'text-down'}>{sign(kpi.realizedPLN)}{fmtDisp(kpi.realizedPLN)}</span>
              {' · '}
              {t('paper_short')}: <span className={kpi.unrealPLN >= 0 ? 'text-up' : 'text-down'}>{sign(kpi.unrealPLN)}{fmtDisp(kpi.unrealPLN)}</span>
            </span>
          }
          onClick={() => navigate('/closed')}
        />
        <Stat
          blur={blur}
          icon={Coins}
          label={t('div_12m_label')}
          value={`${fmtDisp(kpi.annualDivPLN)} ${currLabel}`}
          hint={nextDividend ? `${t('next_prefix')}: ${nextDividend.symbol}` : t('last_12m')}
          onClick={() => navigate('/dividends')}
        />
        <Stat
          blur={blur}
          icon={Wallet}
          label={t('free_cash')}
          value={`${fmtDisp(kpi.cashValue)} ${currLabel}`}
          delta={irrChipVal}
          deltaTone={portfolioIrr != null && portfolioIrr >= 0 ? 'up' : 'down'}
          hint={`${t('account_label')} · ${displayCurrency}`}
          onClick={() => { setCashEdit({ ...cash }); setShowCashModal(true); }}
        />
      </div>

      {/* Wykres + top ruchy */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-1 pt-4">
            <div className="min-w-0">
              <div className="text-label font-semibold uppercase text-faint">{t('portfolio_value_tf')} · {tf}</div>
              <div className={cx('mt-1 whitespace-nowrap text-[22px] font-semibold tracking-tight text-fg', blur && 'privacy-blur')}>
                {kpi.totalValue == null ? '—' : `${fmtDisp(kpi.totalValue)} ${currLabel}`}
                {kpi.staleTotal && <span className="ml-2 text-[11px] font-medium text-faint">~ {t('last_session')}</span>}
              </div>
            </div>
            <SegmentedControl options={TF_OPTIONS} value={tf} onChange={setTf} />
          </div>
          <div className="px-3 pb-4 pt-1">
            {snapshotsFiltered.length >= 2
              ? <HistoryChart data={snapshotsFiltered} displayCurrency={displayCurrency} fxRate={fxRates[displayCurrency] ?? 1} />
              : <EmptyState icon={LineChart} title={t('not_enough_history')} className="py-8" />}
          </div>
        </Card>

        <Card
          title={t('top_movers_today')}
          actions={
            <span className="flex items-center gap-1.5 text-[11px] text-dim">
              <span className={isWeekend ? 'dot-status closed' : 'dot-status'} />
              {isWeekend ? t('market_closed_status') : t('market_live')}
            </span>
          }
        >
          {topMovers.gainers.length === 0 && topMovers.losers.length === 0
            ? <EmptyState icon={isWeekend ? MoonStar : Activity} title={isWeekend ? t('market_closed') : t('no_data')} className="py-8" />
            : (
              <div className="pb-1">
                <MoverGroup tone="up" label={t('movers_best')} items={topMovers.gainers} onOpen={setSelectedStock} locale={locale} fmtN={fmtN} />
                <MoverGroup tone="down" label={t('movers_worst')} items={topMovers.losers} onOpen={setSelectedStock} locale={locale} fmtN={fmtN} />
              </div>
            )}
        </Card>
      </div>

      {/* Niezrealizowany zysk per pozycja */}
      {unrealRows.length > 0 && (
        <Card className="mb-4">
          <div className="card-head items-start">
            <div>
              <div className="card-title">{t('unreal_pl_title')}</div>
              <div className="mt-0.5 text-[11px] text-faint">{t('unreal_pl_sub')}</div>
            </div>
            <div className={cx('whitespace-nowrap text-right', blur && 'privacy-blur', kpi.unrealPLN >= 0 ? 'text-up' : 'text-down')}>
              <div className="text-base font-bold">{sign(kpi.unrealPLN)}{fmtDisp(kpi.unrealPLN, 2)} {currLabel}</div>
              {unrealChipVal && <div className="text-[11px]">{unrealChipVal}</div>}
            </div>
          </div>
          <div className="px-2 pb-3 pt-1" style={{ height: unrealRows.length * 30 + 40 }}>
            <UnrealizedPnlBar
              rows={unrealRows}
              currLabel={currLabel}
              locale={locale}
              fmt={(v, d) => fmtVal(v, d)}
              onSymbolClick={(sym) => {
                const pos = allPositions.find(p => p.symbol === sym);
                if (pos) setSelectedStock(pos);
              }}
            />
          </div>
        </Card>
      )}

      {/* Alokacja + wygrani/przegrani */}
      {allPositions.length > 0 && (
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Card title={t('sector_alloc')}>
            <div className="px-5 py-4">
              <StackedAllocation positions={allPositions} totalValue={kpi.positionsValue} currency={displayCurrency} fxRate={dispFx} />
            </div>
          </Card>
          <Card
            title={t('winners_losers')}
            actions={
              <SegmentedControl
                options={[{ value: 'pct', label: t('wl_mode_pct') }, { value: 'abs', label: currLabel }]}
                value={wlMode}
                onChange={setWlMode}
              />
            }
          >
            <div className="px-5 py-4">
              <WinnersLosers positions={allPositions} onSymbolClick={setSelectedStock} mode={wlMode} fxRate={dispFx} currLabel={currLabel} locale={locale} />
            </div>
          </Card>
        </div>
      )}

      {!portfolio.length && !loading && (
        <EmptyState
          icon={Briefcase}
          title={t('no_portfolio_data')}
          description={t('add_positions_hint')}
          action={<Button variant="primary" onClick={() => navigate('/portfolio')}>{t('go_to_portfolio')}</Button>}
          className="py-16"
        />
      )}

      {selectedStock && (
        <StockDetailModal
          item={selectedStock}
          existingPortfolio={portfolio}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => setSelectedStock(null)}
        />
      )}

      {showCashModal && (
        <Modal
          size="sm"
          title={t('free_cash')}
          description={Object.keys(cashEdit).length === 0 ? t('cash_empty_hint') : undefined}
          onClose={() => setShowCashModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setShowCashModal(false)}>{t('cancel')}</Button>
              <Button
                variant="primary"
                loading={savingCash}
                onClick={async () => {
                  setSavingCash(true);
                  try { await saveCash(cashEdit); setShowCashModal(false); }
                  finally { setSavingCash(false); }
                }}
              >
                {t('save_btn')}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {['PLN', 'USD', 'EUR', 'GBP'].map(cur => (
              <Field key={cur} label={cur}>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={cashEdit[cur] ?? ''}
                  placeholder="0"
                  onChange={e => setCashEdit(prev => ({ ...prev, [cur]: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))}
                />
              </Field>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
