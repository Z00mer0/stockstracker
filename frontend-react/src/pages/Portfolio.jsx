// frontend-react/src/pages/Portfolio.jsx
//
// Strona Portfela: dane i okna. Poszczególne części żyją w pages/portfolio/:
//   PortfolioOverview  — karty na górze (wykres, statystyki, skład, alokacja, YTD)
//   PositionsTable     — tabela pozycji (telefon: karty) z paskiem narzędzi
//   OtherAssetsSection, BondsSection, AddCryptoModal (eksport: utils/exporters)
// Wcześniej wszystko było w jednym pliku na ~2050 linii.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Upload, TriangleAlert, WifiOff, RefreshCw } from 'lucide-react';
import { isAuthed } from '../utils/auth.js';
import { useApp } from '../context/AppContext';
import { useT } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import AddStockModal from '../components/AddStockModal';
import SellStockModal from '../components/SellStockModal';
import EditPositionModal from '../components/EditPositionModal';
import AddDividendModal from '../components/AddDividendModal';
import StockDetailModal from '../components/StockDetailModal';
import AlertModal from '../components/AlertModal';
import ConfirmModal from '../components/ConfirmModal';
import IkeLimitCard from '../components/IkeLimitCard';
import { PageSkeleton } from '../components/RouteFallback';
import { Button, Callout, EmptyState } from '../components/ui';
import { usePortfolioMetrics } from '../hooks/usePortfolioMetrics';
import useDividendEvents from '../hooks/useDividendEvents';
import { useSplitDetector } from '../hooks/useSplitDetector';
import { addRetro, loadJournal, setThesis } from '../services/journalService';
import { apiLoadWatchlist, apiSaveWatchlist, addAlertToItems } from '../services/watchlistService';
import { computePortfolioValue } from '../utils/portfolioValue.js';
import { computeRealizedTrades } from '../utils/realizedPL.js';
import PortfolioOverview from './portfolio/PortfolioOverview.jsx';
import PositionsTable from './portfolio/PositionsTable.jsx';
import OtherAssetsSection from './portfolio/OtherAssetsSection.jsx';
import BondsSection from './portfolio/BondsSection.jsx';
import AddCryptoModal from './portfolio/AddCryptoModal.jsx';
import { toggleWatchlist } from './portfolio/watchlistLocal.js';
import { exportPositions, exportTransactions, exportSnapshots } from '../utils/exporters.js';

// Modal importu ciągnie za sobą parser xlsx — ładujemy go dopiero po otwarciu.
const CsvImportModal = lazy(() => import('../components/CsvImportModal'));

export default function Portfolio() {
  const {
    portfolio, transactions, snapshots, loading, error, fxRates, fxStale,
    saveHoldings, saveTransactions, renameSymbol, addPosition, editPosition, removePosition, sellPosition,
    refresh, displayCurrency, activePortfolioId, watchlistMigrationPending,
  } = useApp();
  const t = useT();
  const { showToast } = useToast();

  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddCrypto, setShowAddCrypto] = useState(false);
  const [addSymbol, setAddSymbol] = useState('');
  const [sellTarget, setSellTarget] = useState(null);
  const [divTarget, setDivTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [alertTarget, setAlertTarget] = useState(null); // { symbol, price, currency }
  const [notes, setNotes] = useState({});
  const [watchItems, setWatchItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loadJournal().then(j => { if (!cancelled) setNotes(j.theses || {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Alerty żyją w /api/watchlist — Portfolio tylko czyta bieżący stan, żeby
  // wiedzieć, przy których pozycjach zapalić dzwonek, i mutuje ten sam zasób
  // przez API, gdy użytkownik ustawi alert z menu ⋯.
  useEffect(() => {
    if (!isAuthed()) return;
    apiLoadWatchlist().then(data => { if (Array.isArray(data)) setWatchItems(data); }).catch(e => console.warn('[Portfolio] watchlist load failed:', e));
  }, []);

  const { addDividend } = useDividendEvents(portfolio.map(p => p.symbol));
  const { alerts: splitAlerts, dismissAlert } = useSplitDetector(portfolio, transactions);
  const { enrichPosition, metricsLoading } = usePortfolioMetrics(portfolio, transactions, fxRates);

  const divBySymbol = useMemo(() => {
    const map = {};
    for (const tx of transactions) {
      const type = tx.type?.toUpperCase();
      if (type !== 'DIV' && type !== 'DIVIDEND') continue;
      const sym = tx.symbol;
      if (!sym) continue;
      // amount = qty * price (if qty present), else just price, converted to PLN
      const amount = tx.qty != null && tx.qty > 0 ? (tx.qty * (tx.price ?? 0)) : (tx.price ?? 0);
      map[sym] = (map[sym] ?? 0) + amount * (fxRates[tx.currency] ?? 1);
    }
    return map;
  }, [transactions, fxRates]);

  const ytdChartData = useMemo(() => {
    const jan1 = `${new Date().getFullYear()}-01-01`;
    const dispFx = fxRates[displayCurrency] ?? 1;
    // Idziemy przez computeRealizedTrades bo robi backfill costBasis z historii
    // BUY. Bez tego bezposredni filtr `tx.costBasis != null` gubil SELL-e z
    // importu brokera — u realnego uzytkownika 636 z 640 SELL-ow ni ma
    // costBasis, wiec karta pokazywala +114 zamiast +1927. Sortujemy
    // rosnaco (computeRealizedTrades zwraca od najnowszych).
    const trades = computeRealizedTrades(transactions, fxRates)
      .filter(tr => tr.date >= jan1)
      .sort((a, b) => a.date.localeCompare(b.date));
    let cum = 0;
    const points = [];
    for (const tr of trades) {
      // plPLN jest juz przeliczone przez fxRates[currency]; do waluty
      // wyswietlania dzielimy przez fx tej waluty.
      cum += tr.plPLN / dispFx;
      if (points.length && points[points.length - 1].date === tr.date) points[points.length - 1].pl = parseFloat(cum.toFixed(2));
      else points.push({ date: tr.date, pl: parseFloat(cum.toFixed(2)) });
    }
    return points;
  }, [transactions, fxRates, displayCurrency]);

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  // Unrealized (paper) P&L on open positions, in display currency
  const unrealizedData = useMemo(() => {
    const dispFx = fxRates[displayCurrency] ?? 1;
    const rows = [];
    let totalPl = 0, totalCost = 0;
    for (const p of enriched) {
      if (p.plPLN == null) continue;
      rows.push({ symbol: p.symbol, pl: parseFloat((p.plPLN / dispFx).toFixed(2)) });
      totalPl += p.plPLN / dispFx;
      totalCost += (p.costPLN ?? 0) / dispFx;
    }
    rows.sort((a, b) => b.pl - a.pl);
    // keep the chart readable: best 5 + worst 5 when there are many positions
    const chartRows = rows.length > 10 ? [...rows.slice(0, 5), ...rows.slice(-5)] : rows;
    return { chartRows, total: totalPl, pct: totalCost > 0 ? (totalPl / totalCost) * 100 : null };
  }, [enriched, fxRates, displayCurrency]);

  // Ile alertów mamy per symbol z portfela — do zapalenia dzwonka przy pozycji.
  const alertsPerSymbol = useMemo(() => {
    const m = new Map();
    for (const item of watchItems) {
      if ((item.alerts ?? []).length) m.set(item.symbol, item.alerts.length);
    }
    return m;
  }, [watchItems]);

  const totalCostPLN = enriched.reduce((sum, p) => sum + (p.costPLN ?? 0), 0);
  // Ta sama funkcja co w Dashboard — patrz utils/portfolioValue.js. Bez
  // extraValue, bo nagłówek portfela pokazuje same pozycje, bez gotówki
  // i innych aktywów.
  const {
    totalValue: totalValuePLN,
    positionsValue: positionsValuePLN,
    anyPriceLoaded, staleTotal, partialPrices,
  } = computePortfolioValue(enriched, snapshots);
  const portFx = fxRates[displayCurrency] ?? 1;
  const portCurrLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
  const portToDisp = v => v / portFx;

  const dailyContribs = enriched.filter(p => p.valuePLN != null && p.dailyChg != null);
  const dailyChangePLN = dailyContribs.length
    ? dailyContribs.reduce((sum, pos) => sum + pos.valuePLN * pos.dailyChg / 100, 0)
    : null;

  async function handleTickerRename(oldSymbol, newSymbol) {
    const sym = newSymbol.trim().toUpperCase();
    if (!sym || sym === oldSymbol) return;
    await renameSymbol(oldSymbol, sym);
    showToast(`${oldSymbol} → ${sym}`, { type: 'success' });
    refresh();
  }

  function handleSaveNote(symbol, text) {
    const updated = text.trim()
      ? { ...notes, [symbol]: { text: text.trim(), updatedAt: new Date().toISOString() } }
      : (() => { const n = { ...notes }; delete n[symbol]; return n; })();
    setNotes(updated);
    setThesis(symbol, text).catch(() => {});
  }

  function handleAction(kind, pos) {
    switch (kind) {
      case 'buy': setAddSymbol(pos.symbol); setShowAdd(true); break;
      case 'sell': setSellTarget(pos); break;
      case 'edit': setEditTarget(pos); break;
      case 'dividend': setDivTarget(pos.symbol); break;
      case 'watch': {
        const added = toggleWatchlist(pos.symbol);
        showToast(`${pos.symbol} ${added ? t('added_watchlist') : t('removed_watchlist')}`, { type: 'success' });
        break;
      }
      case 'alert': setAlertTarget({ symbol: pos.symbol, price: pos.price, currency: pos.currency }); break;
      case 'delete': setConfirmDel(pos.symbol); break;
      default: break;
    }
  }

  function handleExport(kind, format, sortedPositions) {
    if (kind === 'positions') exportPositions(sortedPositions, t, format);
    else if (kind === 'transactions') exportTransactions(transactions, t, format);
    else exportSnapshots(snapshots, t, format);
  }

  if (loading && !portfolio.length) return <PageSkeleton />;

  // Fetch danych padł (backend nie odpowiada) — pokaż błąd połączenia z retry
  // zamiast „Brak pozycji" (który sugeruje pusty portfel, nie awarię).
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

  const modals = (
    <>
      {showImport && (
        <Suspense fallback={null}>
          <CsvImportModal
            existingHoldings={portfolio}
            onSave={async (holdings, rawRows) => {
              await saveHoldings(holdings);
              if (rawRows?.length) {
                const newTxs = rawRows.map(r => ({
                  id: Math.random().toString(36).slice(2, 10),
                  type: 'BUY',
                  symbol: r.symbol,
                  qty: r.qty,
                  price: r.avgPrice,
                  currency: r.currency,
                  date: r.date,
                  note: 'Import CSV',
                }));
                await saveTransactions(prev => [...prev, ...newTxs]);
              }
              refresh();
            }}
            onClose={() => setShowImport(false)}
          />
        </Suspense>
      )}
      {showAdd && (
        <AddStockModal
          existingPortfolio={portfolio}
          initialSymbol={addSymbol}
          onSave={async data => { await addPosition(data); refresh(); }}
          onClose={() => { setShowAdd(false); setAddSymbol(''); }}
        />
      )}
      {showAddCrypto && (
        <AddCryptoModal
          onSave={async data => { await addPosition(data); refresh(); }}
          onClose={() => setShowAddCrypto(false)}
        />
      )}
      {sellTarget && (
        <SellStockModal
          holding={sellTarget}
          onSave={async ({ retro, ...sale }) => {
            const txId = await sellPosition(sale);
            if (retro && txId) {
              addRetro(txId, { symbol: sale.symbol, date: sale.date, ...retro }).catch(() => {});
            }
            refresh();
          }}
          onClose={() => setSellTarget(null)}
        />
      )}
      {editTarget && (
        <EditPositionModal
          holding={editTarget}
          onSave={async data => { await editPosition(data); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
        />
      )}
      {divTarget && (
        <AddDividendModal
          isOpen={!!divTarget}
          initialData={{ symbol: divTarget, exDate: '', payDate: '', amount: '' }}
          onSave={async data => {
            const heldQty = portfolio.find(p => p.symbol === divTarget)?.qty;
            const newTx = {
              id: Math.random().toString(36).slice(2, 10),
              type: 'DIV',
              symbol: data.symbol,
              date: data.exDate,
              price: data.amount,
              qty: heldQty != null && heldQty > 0 ? heldQty : 1,
              currency: data.currency,
              note: data.note || '',
            };
            await saveTransactions(prev => [...prev, newTx]);
            addDividend(data);
            setDivTarget(null);
            showToast(t('pf_div_saved').replace('{symbol}', divTarget), { type: 'success' });
          }}
          onClose={() => setDivTarget(null)}
        />
      )}
      {confirmDel && (
        <ConfirmModal
          message={t('pf_delete_confirm').replace('{name}', confirmDel)}
          detail={t('confirm_delete_pos')}
          confirmLabel={t('delete_btn')}
          onConfirm={() => { const sym = confirmDel; setConfirmDel(null); removePosition(sym).then(() => refresh()); }}
          onCancel={() => setConfirmDel(null)}
        />
      )}
      {selectedItem && (
        <StockDetailModal
          item={selectedItem}
          existingPortfolio={portfolio}
          totalPortfolioValue={positionsValuePLN}
          onSave={async data => { await addPosition(data); refresh(); }}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {alertTarget && (
        <AlertModal
          symbol={alertTarget.symbol}
          currency={alertTarget.currency}
          livePrice={alertTarget.price != null ? { price: alertTarget.price } : null}
          fallbackPrice={alertTarget.price}
          onClose={() => setAlertTarget(null)}
          onSave={async alert => {
            const symbol = alertTarget.symbol;
            setAlertTarget(null);
            try {
              // Read-modify-write against fresh server state — don't rely on the
              // local snapshot, which may be stale (mount-time load failed, or
              // another tab edited the list) and would otherwise wipe the server
              // watchlist with just this one item (backend is full-replace).
              const current = await apiLoadWatchlist();
              const base = Array.isArray(current) ? current : [];
              const merged = addAlertToItems(base, symbol, alert);
              await apiSaveWatchlist(merged);
              setWatchItems(merged);
              showToast(t('pf_alert_saved').replace('{symbol}', symbol), { type: 'success' });
            } catch {
              showToast(t('pf_alert_save_err'), { type: 'error' });
            }
          }}
        />
      )}
    </>
  );

  if (!portfolio.length) {
    return (
      <div className="space-y-4">
        <IkeLimitCard />
        <EmptyState
          icon={Briefcase}
          title={t('pf_empty_title')}
          description={t('add_first_stock_hint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={Plus} onClick={() => setShowAdd(true)}>{t('pf_add_first')}</Button>
              <Button icon={Upload} onClick={() => setShowImport(true)}>{t('pf_import_file')}</Button>
            </div>
          }
          className="py-12"
        />
        <OtherAssetsSection />
        <BondsSection />
        {modals}
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden">
      <IkeLimitCard />
      {splitAlerts.map(alert => (
        <Callout
          key={alert.key}
          tone="warn"
          icon={TriangleAlert}
          title={alert.symbol}
          action={<Button size="sm" onClick={() => dismissAlert(alert.key)}>{t('understood')}</Button>}
        >
          {t('split_alert_msg').replace('{ratio}', alert.ratio).replace('{date}', alert.date).replace('{qty}', alert.qty)}
        </Callout>
      ))}

      <PortfolioOverview
        activePortfolioId={activePortfolioId}
        snapshots={snapshots}
        displayCurrency={displayCurrency}
        fxRates={fxRates}
        fxStale={fxStale}
        totalValuePLN={totalValuePLN}
        staleTotal={staleTotal}
        metricsLoading={metricsLoading}
        anyPriceLoaded={anyPriceLoaded}
        partialPrices={partialPrices}
        dailyChangePLN={dailyChangePLN}
        totalCostPLN={totalCostPLN}
        positionsCount={portfolio.length}
        positions={enriched}
        positionsValuePLN={positionsValuePLN}
        ytdChartData={ytdChartData}
        unrealizedData={unrealizedData}
        portToDisp={portToDisp}
        portCurrLabel={portCurrLabel}
        portFx={portFx}
        onOpen={setSelectedItem}
      />

      <OtherAssetsSection />
      <BondsSection />

      <PositionsTable
        positions={enriched}
        positionsValuePLN={positionsValuePLN}
        notes={notes}
        onSaveNote={handleSaveNote}
        alertsPerSymbol={alertsPerSymbol}
        metricsLoading={metricsLoading}
        fxRates={fxRates}
        divBySymbol={divBySymbol}
        displayCurrency={displayCurrency}
        portToDisp={portToDisp}
        portCurrLabel={portCurrLabel}
        onOpen={setSelectedItem}
        onRenameTicker={handleTickerRename}
        onAction={handleAction}
        onExport={handleExport}
        onImport={() => setShowImport(true)}
        onAdd={kind => (kind === 'crypto' ? setShowAddCrypto(true) : setShowAdd(true))}
        alertDisabled={watchlistMigrationPending}
      />

      {modals}
    </div>
  );
}
