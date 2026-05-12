import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import Spinner from '../components/shared/Spinner';
import useCalendarData from '../hooks/useCalendarData';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Dividends() {
  const { transactions, loading, fxRates, portfolio } = useApp();
  const symbols = useMemo(() => [...new Set(portfolio.map(p => p.symbol))], [portfolio]);
  const { events: calEvents, loading: calLoading } = useCalendarData(symbols);

  const upcomingDivs = useMemo(() =>
    calEvents
      .filter(e => e.type === 'DIV')
      .sort((a, b) => a.date.localeCompare(b.date)),
    [calEvents]
  );

  const dividends = useMemo(() =>
    [...transactions.filter(t => t.type === 'DIV')]
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const totalPLN = useMemo(() =>
    dividends.reduce((sum, d) =>
      sum + (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1), 0),
    [dividends, fxRates]
  );

  // Dywidendy per spółka
  const bySymbol = useMemo(() => {
    const map = {};
    dividends.forEach(d => {
      const key = d.symbol ?? 'INNE';
      if (!map[key]) map[key] = { symbol: key, name: d.name, totalPLN: 0, count: 0 };
      map[key].totalPLN += (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
      map[key].count++;
    });
    return Object.values(map).sort((a, b) => b.totalPLN - a.totalPLN);
  }, [dividends, fxRates]);

  if (loading && !transactions.length) {
    return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  }

  if (!dividends.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-3">💰</div>
        <p className="text-slate-400 font-semibold">Brak dywidend</p>
        <p className="text-sm mt-1">Dodaj wypłaty dywidend w głównym portalu StocksTracker</p>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Nadchodzące dywidendy */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Nadchodzące dywidendy</h2>
          {calLoading && <Spinner size="sm" />}
        </div>
        {calLoading && upcomingDivs.length === 0 ? (
          <div className="flex justify-center py-8"><Spinner size="md" /></div>
        ) : upcomingDivs.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            {symbols.length === 0
              ? 'Dodaj spółki do portfela, by zobaczyć nadchodzące dywidendy'
              : 'Brak prognozowanych dywidend w ciągu najbliższych 120 dni'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                  <th className="text-left px-5 py-2.5">Spółka</th>
                  <th className="text-left px-5 py-2.5">Data ex-dywidendy</th>
                  <th className="text-right px-5 py-2.5">Kwota/akcję</th>
                  <th className="text-right px-5 py-2.5">Dni do daty</th>
                </tr>
              </thead>
              <tbody>
                {upcomingDivs.map((ev, i) => {
                  const daysAway = Math.round((new Date(ev.date) - new Date(today)) / 86400000);
                  return (
                    <tr key={i} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-100">
                        💰 {ev.symbol}
                      </td>
                      <td className="px-5 py-3 text-slate-300">
                        {ev.date}
                        {ev.projected && <span className="ml-2 text-xs text-slate-500">~prognoza</span>}
                      </td>
                      <td className="px-5 py-3 text-right text-yellow-400 font-semibold">
                        {ev.amount != null ? `$${Number(ev.amount).toFixed(4)}` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {daysAway <= 0
                          ? <span className="text-rose-400 font-semibold">dziś / minęła</span>
                          : <span className="text-slate-400">{daysAway} dni</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-yellow-800/50 bg-yellow-950/30 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łącznie dywidendy</p>
          <p className="text-2xl font-bold text-yellow-400">{fmt(totalPLN)} zł</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Liczba wypłat</p>
          <p className="text-2xl font-bold">{dividends.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Spółki dywidendowe</p>
          <p className="text-2xl font-bold">{bySymbol.length}</p>
        </div>
      </div>

      {/* Per spółka */}
      {bySymbol.length > 1 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">Dywidendy per spółka</h2>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Spółka</th>
                <th className="text-right px-5 py-2.5">Liczba</th>
                <th className="text-right px-5 py-2.5">Łącznie PLN</th>
              </tr>
            </thead>
            <tbody>
              {bySymbol.map(row => (
                <tr key={row.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-2.5 font-bold text-slate-100">
                    {row.symbol}
                    {row.name && row.name !== row.symbol && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">{row.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right text-slate-400">{row.count}×</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-yellow-400">{fmt(row.totalPLN)} zł</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Historia */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Historia wypłat</h2>
          <span className="text-xs text-slate-500">{dividends.length} wpisów</span>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
              <th className="text-left px-5 py-2.5">Data</th>
              <th className="text-left px-5 py-2.5">Spółka</th>
              <th className="text-right px-5 py-2.5">Kwota/akcja</th>
              <th className="text-right px-5 py-2.5">Ilość</th>
              <th className="text-right px-5 py-2.5">≈ PLN</th>
              <th className="text-left px-5 py-2.5">Notatka</th>
            </tr>
          </thead>
          <tbody>
            {dividends.map(d => {
              const approxPLN = (d.price || 0) * (d.qty || 1) * (fxRates[d.currency] ?? 1);
              return (
                <tr key={d.id ?? d.date + d.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 text-slate-400">{d.date}</td>
                  <td className="px-5 py-3 font-bold text-slate-100">
                    {d.symbol}
                    {d.name && d.name !== d.symbol && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">{d.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-yellow-400 font-semibold">
                    {fmt(d.price)} {CUR_SYMBOLS[d.currency] ?? d.currency}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">{d.qty ?? '—'}</td>
                  <td className="px-5 py-3 text-right font-semibold text-slate-200">{fmt(approxPLN)} zł</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{d.note || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
