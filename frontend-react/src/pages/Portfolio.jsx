import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';
import Spinner from '../components/shared/Spinner';

const FX = { PLN: 1, USD: 3.95, EUR: 4.25, GBP: 5.0 };

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const CUR_FLAG = { PLN: '🇵🇱', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧' };

export default function Portfolio() {
  const { portfolio, loading } = useApp();
  const { openChart } = useChart();
  const [sortBy, setSortBy]   = useState('cost');

  const sorted = useMemo(() => {
    return [...portfolio].sort((a, b) => {
      const costA = a.qty * a.avgPrice * (FX[a.currency] ?? 1);
      const costB = b.qty * b.avgPrice * (FX[b.currency] ?? 1);
      if (sortBy === 'cost')   return costB - costA;
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sortBy === 'qty')    return b.qty - a.qty;
      return 0;
    });
  }, [portfolio, sortBy]);

  const totalCostPLN = portfolio.reduce(
    (sum, p) => sum + p.qty * p.avgPrice * (FX[p.currency] ?? 1), 0
  );

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
      {/* Podsumowanie */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łączny koszt portfela</p>
          <p className="text-2xl font-bold text-slate-100">{fmt(totalCostPLN)} zł</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-slate-400">{portfolio.length} pozycji</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700 flex gap-2">
          {[['cost', 'Wg kosztu'], ['symbol', 'A–Z'], ['qty', 'Wg ilości']].map(([key, label]) => (
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
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Symbol</th>
              <th className="text-right px-5 py-2.5">Ilość</th>
              <th className="text-right px-5 py-2.5">Śr. cena</th>
              <th className="text-right px-5 py-2.5">Koszt (PLN)</th>
              <th className="text-right px-5 py-2.5">Udział %</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((pos, i) => {
              const costPLN = pos.qty * pos.avgPrice * (FX[pos.currency] ?? 1);
              const share   = totalCostPLN > 0 ? (costPLN / totalCostPLN) * 100 : 0;
              return (
                <tr key={pos.id ?? pos.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td
                    className="px-5 py-3 cursor-pointer"
                    onClick={() => openChart(pos.symbol)}
                    title={`Otwórz wykres ${pos.symbol}`}
                  >
                    <div className="font-bold text-indigo-400 hover:text-indigo-300 transition-colors">{pos.symbol}</div>
                    {pos.name && pos.name !== pos.symbol && (
                      <div className="text-xs text-slate-500">{pos.name}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300">
                    {fmt(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {fmt(pos.avgPrice)} <span className="text-xs">{CUR_FLAG[pos.currency] ?? pos.currency}</span>
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-200">{fmt(costPLN)} zł</td>
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
  );
}
