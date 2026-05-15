// frontend-react/src/pages/Portfolio.jsx
import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import CsvImportModal from '../components/CsvImportModal';
import { useChart } from '../context/ChartContext';
import Spinner from '../components/shared/Spinner';
import ColumnPicker from '../components/shared/ColumnPicker';
import { usePortfolioMetrics, fmtPeriod } from '../hooks/usePortfolioMetrics';
import {
  COLUMN_DEFS, loadColumnConfig, saveColumnConfig,
} from '../utils/portfolioColumns';

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
  const { portfolio, transactions, loading, fxRates, saveHoldings, refresh } = useApp();
  const [showImport, setShowImport] = useState(false);
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
        <p className="text-sm mt-1">Dodaj spółki w głównym portalu StocksTracker</p>
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
              </tr>
            </thead>
            <tbody>
              {sorted.map(pos => {
                const share = totalCostPLN > 0 ? ((pos.costPLN ?? 0) / totalCostPLN) * 100 : 0;
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
    </div>
  );
}
