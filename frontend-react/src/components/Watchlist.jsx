import React from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import Spinner from './shared/Spinner';
import { useLanguage } from '../context/LanguageContext';

const CUR_SYMBOLS = { PLN: 'zł', USD: '$', EUR: '€', GBP: '£' };

function fmt(n, decimals = 2, locale = 'pl-PL') {
  if (n == null) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default function Watchlist({ onUnauthorized }) {
  const { locale } = useLanguage();
  const fmtL = (n, d) => fmt(n, d, locale);
  const { portfolio, loading, error } = usePortfolioData();

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  if (error) {
    if (error === 'unauthorized') { onUnauthorized?.(); return null; }
    return <p className="text-center py-12 text-red-400">{error}</p>;
  }

  if (!portfolio.length) {
    return (
      <div className="text-center py-16 text-slate-500">
        <div className="text-5xl mb-4">📈</div>
        <p className="text-lg font-semibold text-slate-300">Brak pozycji w portfelu</p>
        <p className="text-sm mt-1">Dodaj spółki w głównym portalu StocksTracker</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
        <h2 className="font-bold text-lg">📈 Portfel</h2>
        <span className="text-sm text-slate-400">{portfolio.length} pozycji</span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 text-xs uppercase tracking-wide bg-slate-900">
            <th className="text-left px-5 py-3">Symbol</th>
            <th className="text-right px-5 py-3">Ilość</th>
            <th className="text-right px-5 py-3">Śr. cena</th>
            <th className="text-left px-5 py-3">Waluta</th>
          </tr>
        </thead>
        <tbody>
          {portfolio.map((pos, i) => (
            <tr key={pos.symbol ?? i} className="border-t border-slate-700 hover:bg-slate-700/40 transition-colors">
              <td className="px-5 py-3 font-bold">
                {pos.symbol}
                {pos.name && pos.name !== pos.symbol && (
                  <span className="ml-2 text-xs text-slate-400 font-normal">{pos.name}</span>
                )}
              </td>
              <td className="px-5 py-3 text-right">{fmtL(pos.qty, pos.qty % 1 === 0 ? 0 : 4)}</td>
              <td className="px-5 py-3 text-right text-slate-300">{fmtL(pos.avgPrice)}</td>
              <td className="px-5 py-3 text-slate-400">
                {CUR_SYMBOLS[pos.currency] ?? pos.currency ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
