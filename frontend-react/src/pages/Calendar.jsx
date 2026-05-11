import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Spinner from '../components/shared/Spinner';

const TODAY = new Date().toISOString().slice(0, 10);

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const TYPE_LABELS = {
  DIV:  { icon: '💰', label: 'Dywidenda',    color: 'text-yellow-400' },
  EARN: { icon: '📊', label: 'Wyniki',       color: 'text-indigo-400' },
  EXDIV:{ icon: '📅', label: 'Ex-dividend',  color: 'text-sky-400'    },
};

export default function Calendar() {
  const { transactions, loading } = useApp();

  const upcoming = useMemo(() => {
    const futureDiv = transactions
      .filter(t => t.type === 'DIV' && t.date >= TODAY)
      .map(t => ({ ...t, _type: 'DIV' }));
    return [...futureDiv].sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  const recent = useMemo(() => {
    const past = transactions
      .filter(t => t.type === 'DIV' && t.date < TODAY)
      .map(t => ({ ...t, _type: 'DIV' }));
    return [...past].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [transactions]);

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Nadchodzące */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Nadchodzące zdarzenia</h2>
        </div>

        {upcoming.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500">
            <p>Brak zaplanowanych zdarzeń</p>
            <p className="text-xs mt-1">Zdarzenia z datą ≥ dziś pojawią się tutaj automatycznie</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Data</th>
                <th className="text-left px-5 py-2.5">Typ</th>
                <th className="text-left px-5 py-2.5">Spółka</th>
                <th className="text-right px-5 py-2.5">Wartość</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map(ev => {
                const cfg = TYPE_LABELS[ev._type] ?? { icon: '📌', label: ev._type, color: 'text-slate-300' };
                return (
                  <tr key={ev.id ?? ev.date + ev.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3 text-slate-300 font-medium">{ev.date}</td>
                    <td className="px-5 py-3">
                      <span className={`text-sm ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                    </td>
                    <td className="px-5 py-3 font-bold text-slate-100">{ev.symbol}</td>
                    <td className="px-5 py-3 text-right text-yellow-400 font-semibold">
                      {ev.price != null ? `${fmt(ev.price)} ${ev.currency ?? ''}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Ostatnie */}
      {recent.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Ostatnie zdarzenia</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Data</th>
                <th className="text-left px-5 py-2.5">Spółka</th>
                <th className="text-right px-5 py-2.5">Wartość</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(ev => (
                <tr key={ev.id ?? ev.date + ev.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 text-slate-500">{ev.date}</td>
                  <td className="px-5 py-3 font-bold text-slate-300">{ev.symbol}</td>
                  <td className="px-5 py-3 text-right text-yellow-400/70">
                    {ev.price != null ? `${fmt(ev.price)} ${ev.currency ?? ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
