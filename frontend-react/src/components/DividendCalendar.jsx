import React from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import Spinner from './shared/Spinner';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };
const FX = { PLN: 1, USD: 3.95, EUR: 4.25, GBP: 5.0 };

function fmtCur(amount, currency) {
  const sym = CUR_SYMBOLS[currency] ?? currency;
  return `${amount.toFixed(2)} ${sym}`;
}

export default function DividendCalendar({ onUnauthorized }) {
  const { transactions, loading, error } = usePortfolioData();

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  if (error) {
    if (error === 'unauthorized') { onUnauthorized?.(); return null; }
    return <p className="text-center py-12 text-red-400">{error}</p>;
  }

  const dividends = transactions
    .filter(t => t.type === 'DIV')
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!dividends.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-4">💰</div>
        <p className="text-lg font-semibold text-slate-300">Brak dywidend</p>
        <p className="text-sm mt-1">Dodaj wypłaty dywidend w głównym portalu StocksTracker</p>
      </div>
    );
  }

  const totalPLN = dividends.reduce((sum, d) => {
    const rate = FX[d.currency] ?? 1;
    return sum + (d.price || 0) * (d.qty || 1) * rate;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 uppercase tracking-wide mb-1">Łączne dywidendy (≈ PLN)</div>
          <div className="text-2xl font-bold text-yellow-400">{totalPLN.toFixed(2)} zł</div>
        </div>
        <div className="text-4xl">💰</div>
      </div>

      <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="font-bold text-lg">Historia dywidend</h2>
          <span className="text-sm text-slate-400">{dividends.length} wypłat</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wide bg-slate-900">
              <th className="text-left px-5 py-3">Data</th>
              <th className="text-left px-5 py-3">Spółka</th>
              <th className="text-right px-5 py-3">Kwota / akcja</th>
              <th className="text-right px-5 py-3">Ilość</th>
              <th className="text-left px-5 py-3">Notatka</th>
            </tr>
          </thead>
          <tbody>
            {dividends.map((d) => (
              <tr key={d.id ?? d.date + d.symbol} className="border-t border-slate-700 hover:bg-slate-700/40 transition-colors">
                <td className="px-5 py-3 text-slate-400">{d.date}</td>
                <td className="px-5 py-3 font-bold">
                  {d.symbol}
                  {d.name && d.name !== d.symbol && (
                    <span className="ml-2 text-xs text-slate-400 font-normal">{d.name}</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right text-yellow-400 font-semibold">
                  {fmtCur(d.price, d.currency)}
                </td>
                <td className="px-5 py-3 text-right text-slate-400">
                  {d.qty ?? '—'}
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs">{d.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
