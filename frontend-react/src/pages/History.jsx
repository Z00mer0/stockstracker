import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import HistoryChart from '../components/HistoryChart';
import Spinner from '../components/shared/Spinner';

function fmt(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function History() {
  const { snapshots, loading } = useApp();

  const sorted = useMemo(
    () => [...snapshots].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots]
  );


  const latest  = sorted[sorted.length - 1];
  const first   = sorted[0];
  const gainPLN = latest && first ? (latest.total ?? 0) - (first.total ?? 0) : 0;

  if (loading && !snapshots.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!snapshots.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">📈</div>
        <p className="text-slate-400 font-semibold">Brak historii</p>
        <p className="text-sm mt-1">Historia pojawi się po pierwszym odświeżeniu portfela</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Podsumowanie */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Aktualna wartość</p>
          <p className="text-xl font-bold">{fmt(latest?.total)} zł</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Zainwestowano</p>
          <p className="text-xl font-bold">{fmt(latest?.invested)} zł</p>
        </div>
        <div className={`rounded-xl border px-5 py-4 ${gainPLN >= 0 ? 'border-emerald-800/60 bg-emerald-950/30' : 'border-rose-800/60 bg-rose-950/30'}`}>
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Zmiana od początku</p>
          <p className={`text-xl font-bold ${gainPLN >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {gainPLN >= 0 ? '+' : ''}{fmt(gainPLN)} zł
          </p>
        </div>
      </div>

      {/* Wykres historii portfela */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-5">
        <p className="text-sm font-semibold text-slate-300 mb-4">Historia wartości portfela</p>
        <HistoryChart data={sorted} />
      </div>

      {/* Tabela ostatnich snapshots */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Ostatnie 30 snapshots</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Data</th>
              <th className="text-right px-5 py-2.5">Wartość</th>
              <th className="text-right px-5 py-2.5">Zainwestowano</th>
              <th className="text-right px-5 py-2.5">P&L</th>
            </tr>
          </thead>
          <tbody>
            {[...sorted].reverse().slice(0, 30).map((s, i) => {
              const pl  = (s.total ?? 0) - (s.invested ?? 0);
              const pct = s.invested > 0 ? (pl / s.invested) * 100 : 0;
              return (
                <tr key={s.date + i} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-2.5 text-slate-400">{s.date}</td>
                  <td className="px-5 py-2.5 text-right font-semibold">{fmt(s.total)} zł</td>
                  <td className="px-5 py-2.5 text-right text-slate-400">{fmt(s.invested)} zł</td>
                  <td className={`px-5 py-2.5 text-right font-medium ${pl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {pl >= 0 ? '+' : ''}{fmt(pl)} zł
                    <span className="text-xs ml-1 opacity-70">({pct >= 0 ? '+' : ''}{fmt(pct, 1)}%)</span>
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
