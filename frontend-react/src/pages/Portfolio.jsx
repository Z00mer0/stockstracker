// frontend-react/src/pages/Portfolio.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import CsvImportModal from '../components/CsvImportModal';
import AddStockModal from '../components/AddStockModal';
import SellStockModal from '../components/SellStockModal';
import AddDividendModal from '../components/AddDividendModal';
import { useChart } from '../context/ChartContext';
import Spinner from '../components/shared/Spinner';
import ColumnPicker from '../components/shared/ColumnPicker';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import useDividendEvents from '../hooks/useDividendEvents';
import {
  COLUMN_DEFS, loadColumnConfig, saveColumnConfig,
} from '../utils/portfolioColumns';

const WATCH_KEY = 'myfund_watchlist';
function toggleWatchlist(symbol) {
  const list = JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
  const idx = list.indexOf(symbol);
  if (idx === -1) list.push(symbol); else list.splice(idx, 1);
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  return idx === -1;
}
function isWatched(symbol) {
  return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]').includes(symbol);
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const CUR_FLAG = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };
const COL_LABEL = Object.fromEntries(COLUMN_DEFS.map(c => [c.key, c.label]));

function renderCell(key, pos, fxRates) {
  const flag = CUR_FLAG[pos.currency] ?? pos.currency;
  switch (key) {
    case 'qty':
      return (
        <span className="text-slate-300">
          {fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}
        </span>
      );
    case 'avgPrice':
      return (
        <span className="text-slate-400">
          {fmt(pos.avgPrice)} <span className="text-xs">{flag}</span>
        </span>
      );
    case 'price':
      return pos.price != null ? (
        <span className="text-slate-300">
          {fmt(pos.price)} <span className="text-xs">{flag}</span>
        </span>
      ) : <span className="text-slate-600">—</span>;
    case 'dailyChg': {
      if (pos.dailyChg == null) return <span className="text-slate-600">—</span>;
      const up = pos.dailyChg >= 0;
      return (
        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
          {up ? '+' : ''}{fmt(pos.dailyChg, 2)}%
        </span>
      );
    }
    case 'costPLN':
      return <span className="text-slate-200 font-semibold">{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span className="text-slate-200 font-semibold">{fmt(pos.valuePLN)} zł</span>
        : <span className="text-slate-600">—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span className="text-slate-600">—</span>;
      const up = pos.plPLN >= 0;
      return (
        <span className={up ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
          {up ? '+' : ''}{fmt(pos.plPLN)} zł
        </span>
      );
    }
    case 'period':
      return <span className="text-slate-400">{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null
        ? <span className="text-slate-300">{fmt(pos.moic, 2)}x</span>
        : <span className="text-slate-600">—</span>;
    case 'irr': {
      if (pos.irr == null) return <span className="text-slate-600">—</span>;
      const up = pos.irr >= 0;
      return (
        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
          {up ? '+' : ''}{fmt(pos.irr, 1)}%
        </span>
      );
    }
    case 'pe':
      return pos.pe != null
        ? <span className="text-slate-400">{fmt(pos.pe, 1)}</span>
        : <span className="text-slate-600">—</span>;
    case 'peFwd':
      return pos.peFwd != null
        ? <span className="text-slate-400">{fmt(pos.peFwd, 1)}</span>
        : <span className="text-slate-600">—</span>;
    case 'pb':
      return pos.pb != null
        ? <span className="text-slate-400">{fmt(pos.pb, 2)}</span>
        : <span className="text-slate-600">—</span>;
    default:
      return <span className="text-slate-600">—</span>;
  }
}

export default function Portfolio() {
  const { portfolio, transactions, loading, fxRates, saveHoldings, addPosition, removePosition, sellPosition, refresh } = useApp();
  const [showImport, setShowImport]   = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [addSymbol, setAddSymbol]     = useState('');
  const [sellTarget, setSellTarget]   = useState(null);
  const [divTarget, setDivTarget]     = useState(null);
  const [menuSym, setMenuSym]         = useState(null);
  const [confirmDel, setConfirmDel]   = useState(null);
  const [toast, setToast]             = useState('');
  const menuRef = useRef(null);

  const { addDividend } = useDividendEvents(portfolio.map(p => p.symbol));

  useEffect(() => {
    if (!menuSym) return;
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuSym(null);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuSym]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  const { openChart } = useChart();
  const [sortBy, setSortBy] = useState('cost');
  const [cols, setCols] = useState(loadColumnConfig);

  const { enrichPosition, metricsLoading } = usePortfolioMetrics(portfolio, transactions, fxRates);

  function handleColChange(newCols) {
    setCols(newCols);
    saveColumnConfig(newCols);
  }

  const enriched = useMemo(
    () => portfolio.map(pos => enrichPosition(pos)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, fxRates, enrichPosition]
  );

  const totalCostPLN = enriched.reduce((sum, p) => sum + (p.costPLN ?? 0), 0);

  const sorted = useMemo(() => {
    return [...enriched].sort((a, b) => {
      if (sortBy === 'cost')   return (b.costPLN ?? 0) - (a.costPLN ?? 0);
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sortBy === 'qty')    return b.qty - a.qty;
      if (sortBy === 'pl')     return (b.plPLN ?? -Infinity) - (a.plPLN ?? -Infinity);
      return 0;
    });
  }, [enriched, sortBy]);

  if (loading && !portfolio.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!portfolio.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">💼</div>
        <p className="text-slate-400 font-semibold">Brak pozycji w portfelu</p>
        <p className="text-sm mt-1 mb-5">Dodaj pierwszą spółkę, aby zacząć śledzić portfel</p>
        <button
          onClick={() => setShowAdd(true)}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors"
        >
          + Dodaj spółkę
        </button>
        {showAdd && (
          <AddStockModal
            existingPortfolio={portfolio}
            onSave={async (data) => { await addPosition(data); refresh(); }}
            onClose={() => setShowAdd(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łączny koszt portfela</p>
          <p className="text-2xl font-bold text-slate-100">{fmt(totalCostPLN)} zł</p>
        </div>
        <div className="text-right text-sm text-slate-400">{portfolio.length} pozycji</div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-slate-700 flex items-center gap-2">
          {[
            ['cost',   'Wg kosztu'],
            ['symbol', 'A–Z'],
            ['qty',    'Wg ilości'],
            ['pl',     'Wg P&L'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                sortBy === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          {metricsLoading && <Spinner size="sm" />}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
          >
            ⬆ Import CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
          >
            + Dodaj spółkę
          </button>
          <ColumnPicker cols={cols} onChange={handleColChange} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5 sticky left-0 bg-slate-900/90">Symbol</th>
                {cols.map(key => (
                  <th key={key} className="text-right px-4 py-2.5 whitespace-nowrap">
                    {COL_LABEL[key] ?? key}
                  </th>
                ))}
                <th className="text-right px-5 py-2.5">Udział %</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(pos => {
                const share = totalCostPLN > 0 ? ((pos.costPLN ?? 0) / totalCostPLN) * 100 : 0;
                const menuOpen = menuSym === pos.symbol;
                return (
                  <tr
                    key={pos.id ?? pos.symbol}
                    className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors"
                  >
                    <td
                      className="px-5 py-3 cursor-pointer sticky left-0 bg-slate-800 hover:bg-slate-700/30"
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                    >
                      <div className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                        {pos.symbol}
                      </div>
                      {pos.name && pos.name !== pos.symbol && (
                        <div className="text-xs text-slate-500 truncate max-w-[120px]">{pos.name}</div>
                      )}
                    </td>
                    {cols.map(key => (
                      <td key={key} className="px-4 py-3 text-right whitespace-nowrap">
                        {renderCell(key, pos, fxRates)}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(share, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-10 text-right">{fmt(share, 1)}%</span>
                      </div>
                    </td>
                    {/* ⋯ action menu */}
                    <td className="px-3 py-3 relative" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setMenuSym(menuOpen ? null : pos.symbol)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors text-base"
                      >
                        ⋯
                      </button>
                      {menuOpen && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-9 z-30 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-44 py-1 text-sm"
                        >
                          {[
                            { icon: '+', label: 'Kup więcej', action: () => { setAddSymbol(pos.symbol); setShowAdd(true); setMenuSym(null); } },
                            { icon: '↘', label: 'Sprzedaj', action: () => { setSellTarget(pos); setMenuSym(null); } },
                            { icon: '💰', label: 'Dywidenda', action: () => { setDivTarget(pos.symbol); setMenuSym(null); } },
                            { icon: '👁', label: isWatched(pos.symbol) ? 'Usuń z obserwowanych' : 'Obserwuj', action: () => { const added = toggleWatchlist(pos.symbol); setToast(added ? `${pos.symbol} dodano do Watchlist` : `${pos.symbol} usunięto z Watchlist`); setMenuSym(null); } },
                            { icon: '📊', label: 'Fundamenty', action: () => { openChart(pos.symbol); setMenuSym(null); } },
                            null,
                            { icon: '✕', label: 'Usuń pozycję', action: () => { setConfirmDel(pos.symbol); setMenuSym(null); }, danger: true },
                          ].map((item, i) =>
                            item === null ? (
                              <div key={i} className="border-t border-slate-700/60 my-1" />
                            ) : (
                              <button
                                key={item.label}
                                onClick={item.action}
                                className={`w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-slate-800 transition-colors ${item.danger ? 'text-rose-400' : 'text-slate-300'}`}
                              >
                                <span className="w-4 text-center">{item.icon}</span>
                                {item.label}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {showImport && (
        <CsvImportModal
          existingHoldings={portfolio}
          onSave={async (holdings) => { await saveHoldings(holdings); refresh(); }}
          onClose={() => setShowImport(false)}
        />
      )}
      {showAdd && (
        <AddStockModal
          existingPortfolio={portfolio}
          initialSymbol={addSymbol}
          onSave={async (data) => { await addPosition(data); refresh(); }}
          onClose={() => { setShowAdd(false); setAddSymbol(''); }}
        />
      )}
      {sellTarget && (
        <SellStockModal
          holding={sellTarget}
          onSave={async (data) => { await sellPosition(data); refresh(); }}
          onClose={() => setSellTarget(null)}
        />
      )}
      {divTarget && (
        <AddDividendModal
          isOpen={!!divTarget}
          initialData={{ symbol: divTarget, exDate: '', payDate: '', amount: '' }}
          onSave={(data) => { addDividend(data); setDivTarget(null); setToast(`Dywidenda ${divTarget} zapisana`); }}
          onClose={() => setDivTarget(null)}
        />
      )}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
             onClick={() => setConfirmDel(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-xs shadow-2xl text-center"
               onClick={e => e.stopPropagation()}>
            <p className="text-slate-100 font-semibold mb-1">Usuń {confirmDel}?</p>
            <p className="text-xs text-slate-400 mb-5">Pozycja zostanie usunięta z portfela. Transakcji nie można cofnąć.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors">
                Anuluj
              </button>
              <button onClick={async () => { await removePosition(confirmDel); setConfirmDel(null); refresh(); }}
                className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 transition-colors">
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-700 text-slate-100 text-sm px-5 py-2.5 rounded-xl shadow-xl z-50 pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
