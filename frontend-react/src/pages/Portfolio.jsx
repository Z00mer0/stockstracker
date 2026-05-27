// frontend-react/src/pages/Portfolio.jsx
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import CsvImportModal from '../components/CsvImportModal';
import AddStockModal from '../components/AddStockModal';
import SellStockModal from '../components/SellStockModal';
import EditPositionModal from '../components/EditPositionModal';
import AddDividendModal from '../components/AddDividendModal';
import { useChart } from '../context/ChartContext';
import Spinner from '../components/shared/Spinner';
import ColumnPicker from '../components/shared/ColumnPicker';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import useDividendEvents from '../hooks/useDividendEvents';
import {
  COLUMN_DEFS, loadColumnConfig, saveColumnConfig,
} from '../utils/portfolioColumns';
import TickerLogo from '../components/shared/TickerLogo';
import Chip from '../components/shared/Chip';
import Card from '../components/shared/Card';

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
        <span style={{ color: 'var(--text)' }}>
          {fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}
        </span>
      );
    case 'avgPrice':
      return (
        <span style={{ color: 'var(--text-dim)' }}>
          {fmt(pos.avgPrice)} <span className="text-xs">{flag}</span>
        </span>
      );
    case 'price':
      return pos.price != null ? (
        <span style={{ color: 'var(--text)' }}>
          {fmt(pos.price)} <span className="text-xs">{flag}</span>
        </span>
      ) : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'dailyChg':
      if (pos.dailyChg == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      return <Chip value={pos.dailyChg} />;
    case 'costPLN':
      return <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(pos.costPLN)} zł</span>;
    case 'valuePLN':
      return pos.valuePLN != null
        ? <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(pos.valuePLN)} zł</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'plPLN': {
      if (pos.plPLN == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.plPLN >= 0;
      return (
        <span style={{ color: up ? 'var(--up)' : 'var(--down)', fontWeight: 600 }}>
          {up ? '+' : ''}{fmt(pos.plPLN)} zł
        </span>
      );
    }
    case 'period':
      return <span style={{ color: 'var(--text-dim)' }}>{fmtPeriod(pos.periodDays)}</span>;
    case 'moic':
      return pos.moic != null
        ? <span style={{ color: 'var(--text)' }}>{fmt(pos.moic, 2)}x</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'irr': {
      if (pos.irr == null) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
      const up = pos.irr >= 0;
      return (
        <span style={{ color: up ? 'var(--up)' : 'var(--down)' }}>
          {up ? '+' : ''}{fmt(pos.irr, 1)}%
        </span>
      );
    }
    case 'pe':
      return pos.pe != null
        ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pe, 1)}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'peFwd':
      return pos.peFwd != null
        ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.peFwd, 1)}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    case 'pb':
      return pos.pb != null
        ? <span style={{ color: 'var(--text-dim)' }}>{fmt(pos.pb, 2)}</span>
        : <span style={{ color: 'var(--text-faint)' }}>—</span>;
    default:
      return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  }
}

export default function Portfolio() {
  const { portfolio, transactions, loading, fxRates, saveHoldings, addPosition, editPosition, removePosition, sellPosition, refresh } = useApp();
  const [showImport, setShowImport]   = useState(false);
  const [showAdd, setShowAdd]         = useState(false);
  const [addSymbol, setAddSymbol]     = useState('');
  const [sellTarget, setSellTarget]   = useState(null);
  const [divTarget, setDivTarget]     = useState(null);
  const [menuSym, setMenuSym]         = useState(null);
  const [editTarget, setEditTarget]   = useState(null);
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
      <div className="text-center py-16" style={{ color: 'var(--text-faint)' }}>
        <div className="text-5xl mb-3">💼</div>
        <p style={{ color: 'var(--text-dim)', fontWeight: 600 }}>Brak pozycji w portfelu</p>
        <p className="text-sm mt-1 mb-5">Dodaj pierwszą spółkę, aby zacząć śledzić portfel</p>
        <button
          onClick={() => setShowAdd(true)}
          className="btn btn-primary"
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
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px' }}>
        <div>
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-dim)' }}>Łączny koszt portfela</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{fmt(totalCostPLN)} zł</p>
        </div>
        <div className="text-sm" style={{ color: 'var(--text-dim)', textAlign: 'right' }}>{portfolio.length} pozycji</div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: 'visible' }}>
        {/* Toolbar */}
        <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {[
            ['cost',   'Wg kosztu'],
            ['symbol', 'A–Z'],
            ['qty',    'Wg ilości'],
            ['pl',     'Wg P&L'],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSortBy(key)}
              className={sortBy === key ? 'btn btn-primary' : 'btn'}
              style={{ fontSize: 12, padding: '4px 12px', flexShrink: 0 }}
            >
              {label}
            </button>
          ))}
          <div style={{ flex: '0 0 8px' }} />
          {metricsLoading && <Spinner size="sm" />}
          <button
            onClick={() => setShowImport(true)}
            className="btn"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            ⬆ Import CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-primary"
            style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
          >
            + Dodaj spółkę
          </button>
          <ColumnPicker cols={cols} onChange={handleColChange} />
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, background: 'var(--panel)' }}>Symbol</th>
                {cols.map(key => (
                  <th key={key} className="right">
                    {COL_LABEL[key] ?? key}
                  </th>
                ))}
                <th className="right">Udział %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map(pos => {
                const share = totalCostPLN > 0 ? ((pos.costPLN ?? 0) / totalCostPLN) * 100 : 0;
                const menuOpen = menuSym === pos.symbol;
                return (
                  <tr key={pos.id ?? pos.symbol}>
                    <td
                      style={{ cursor: 'pointer', position: 'sticky', left: 0, zIndex: 1, background: 'var(--panel)' }}
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <TickerLogo symbol={pos.symbol} />
                        <div>
                          <div className="mono" style={{ fontWeight: 700, fontSize: 13, color: 'var(--info)' }}>{pos.symbol}</div>
                          {pos.name && pos.name !== pos.symbol && (
                            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{pos.name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    {cols.map(key => (
                      <td key={key} className="right mono">
                        {renderCell(key, pos, fxRates)}
                      </td>
                    ))}
                    <td className="right mono">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                        <div style={{ width: 64, height: 6, background: 'var(--panel-2)', borderRadius: 9999, overflow: 'hidden' }}>
                          <div
                            style={{ height: '100%', background: 'var(--info)', borderRadius: 9999, width: `${Math.min(share, 100)}%` }}
                          />
                        </div>
                        <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', width: 40, textAlign: 'right' }}>{fmt(share, 1)}%</span>
                      </div>
                    </td>
                    {/* ⋯ action menu */}
                    <td style={{ padding: '12px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setMenuSym(menuOpen ? null : pos.symbol)}
                        style={{
                          width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 8, color: 'var(--text-faint)', background: 'transparent',
                          border: 'none', cursor: 'pointer', fontSize: 16, transition: 'color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--panel-2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'transparent'; }}
                      >
                        ⋯
                      </button>
                      {menuOpen && (
                        <div
                          ref={menuRef}
                          style={{
                            position: 'absolute', right: 0, top: 36, zIndex: 30,
                            background: 'var(--panel)', border: '1px solid var(--border)',
                            borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            width: 176, padding: '4px 0', fontSize: 14,
                          }}
                        >
                          {[
                            { icon: '+', label: 'Kup więcej', action: () => { setAddSymbol(pos.symbol); setShowAdd(true); setMenuSym(null); } },
                            { icon: '↘', label: 'Sprzedaj', action: () => { setSellTarget(pos); setMenuSym(null); } },
                            { icon: '✏', label: 'Edytuj pozycję', action: () => { setEditTarget(pos); setMenuSym(null); } },
                            { icon: '💰', label: 'Dywidenda', action: () => { setDivTarget(pos.symbol); setMenuSym(null); } },
                            { icon: '👁', label: isWatched(pos.symbol) ? 'Usuń z obserwowanych' : 'Obserwuj', action: () => { const added = toggleWatchlist(pos.symbol); setToast(added ? `${pos.symbol} dodano do Watchlist` : `${pos.symbol} usunięto z Watchlist`); setMenuSym(null); } },
                            { icon: '📊', label: 'Fundamenty', action: () => { openChart(pos.symbol); setMenuSym(null); } },
                            null,
                            { icon: '✕', label: 'Usuń pozycję', action: () => { setConfirmDel(pos.symbol); setMenuSym(null); }, danger: true },
                          ].map((item, i) =>
                            item === null ? (
                              <div key={i} style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                            ) : (
                              <button
                                key={item.label}
                                onClick={item.action}
                                style={{
                                  width: '100%', textAlign: 'left', padding: '8px 16px',
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  background: 'transparent', border: 'none', cursor: 'pointer',
                                  color: item.danger ? 'var(--down)' : 'var(--text)',
                                  transition: 'background 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = 'var(--panel-2)'; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                              >
                                <span style={{ width: 16, textAlign: 'center' }}>{item.icon}</span>
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
      {editTarget && (
        <EditPositionModal
          holding={editTarget}
          onSave={async (data) => { await editPosition(data); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
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
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setConfirmDel(null)}
        >
          <div
            style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', textAlign: 'center' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}>Usuń {confirmDel}?</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 20 }}>Pozycja zostanie usunięta z portfela. Transakcji nie można cofnąć.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setConfirmDel(null)}
                className="btn"
                style={{ flex: 1, padding: '8px 0' }}
              >
                Anuluj
              </button>
              <button
                onClick={async () => { await removePosition(confirmDel); setConfirmDel(null); refresh(); }}
                className="btn btn-danger"
                style={{ flex: 1, padding: '8px 0' }}
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--panel-2)', color: 'var(--text)', fontSize: 14,
          padding: '10px 20px', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          zIndex: 50, pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
