import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import Spinner from '../components/shared/Spinner';

const TYPE_CONFIG = {
  BUY:  { label: 'Kupno',     color: 'bg-emerald-900/40 text-emerald-400' },
  SELL: { label: 'Sprzedaż',  color: 'bg-rose-900/40    text-rose-400'    },
  DIV:  { label: 'Dywidenda', color: 'bg-yellow-900/40  text-yellow-400'  },
  CASH: { label: 'Gotówka',   color: 'bg-sky-900/40     text-sky-400'     },
};

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Transactions() {
  const { transactions, loading } = useApp();
  const [filter, setFilter]       = useState('ALL');

  const sorted = useMemo(() => {
    const base = filter === 'ALL'
      ? transactions
      : transactions.filter(t => t.type === filter);
    return [...base].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filter]);

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!transactions.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">📋</div>
        <p className="text-slate-400 font-semibold">Brak transakcji</p>
      </div>
    );
  }

  const FILTERS = ['ALL', 'BUY', 'SELL', 'DIV', 'CASH'];

  return (
    <div className="space-y-4">
      {/* Filtry */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
            }`}
          >
            {f === 'ALL' ? 'Wszystkie' : (TYPE_CONFIG[f]?.label ?? f)}
            {f !== 'ALL' && (
              <span className="ml-1 opacity-60">
                ({transactions.filter(t => t.type === f).length})
              </span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500 self-center">{sorted.length} wyników</span>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Data</th>
              <th className="text-left px-5 py-2.5">Typ</th>
              <th className="text-left px-5 py-2.5">Symbol</th>
              <th className="text-right px-5 py-2.5">Ilość</th>
              <th className="text-right px-5 py-2.5">Cena</th>
              <th className="text-right px-5 py-2.5">Wartość</th>
              <th className="text-left px-5 py-2.5">Notatka</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => {
              const cfg   = TYPE_CONFIG[tx.type] ?? { label: tx.type, color: 'bg-slate-700 text-slate-300' };
              const total = (tx.qty ?? 1) * (tx.price ?? 0);
              const cur   = CUR_SYMBOLS[tx.currency] ?? tx.currency ?? '';
              return (
                <tr key={tx.id ?? tx.date + tx.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 text-slate-400">{tx.date}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                  </td>
                  <td className="px-5 py-3 font-bold text-slate-100">
                    {tx.symbol ?? '—'}
                    {tx.name && tx.name !== tx.symbol && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">{tx.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300">{tx.qty != null ? fmt(tx.qty, tx.qty % 1 === 0 ? 0 : 4) : '—'}</td>
                  <td className="px-5 py-3 text-right text-slate-400">{tx.price != null ? `${fmt(tx.price)} ${cur}` : '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold">{fmt(total)} {cur}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{tx.note || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
