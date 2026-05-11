import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const WATCH_KEY = 'myfund_watchlist';

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
  } catch {
    return [];
  }
}

export default function Watchlist() {
  const { portfolio } = useApp();
  const [watchItems, setWatchItems] = useState([]);

  useEffect(() => {
    setWatchItems(loadWatchlist());
  }, []);

  const hasWatch = watchItems.length > 0;

  return (
    <div className="space-y-5">
      {/* Watchlist z localStorage */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">👁 Obserwowane spółki</h2>
          {hasWatch && (
            <span className="text-xs text-slate-500">{watchItems.length} spółek</span>
          )}
        </div>

        {!hasWatch ? (
          <div className="px-5 py-8 text-center text-slate-500">
            <p className="text-slate-400">Watchlist jest pusta lub niedostępna</p>
            <p className="text-xs mt-1 text-slate-600">
              Watchlist jest przechowywana lokalnie — otwórz główny portal, aby ją uzupełnić
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Symbol</th>
                <th className="text-right px-5 py-2.5">Cena przy dodaniu</th>
                <th className="text-left px-5 py-2.5">Notatka</th>
                <th className="text-right px-5 py-2.5">Alerty</th>
              </tr>
            </thead>
            <tbody>
              {watchItems.map(w => (
                <tr key={w.id ?? w.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-100">
                    {w.symbol}
                    {w.name && w.name !== w.symbol && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">{w.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {w.addedPrice != null ? `${w.addedPrice.toFixed(2)} ${w.currency ?? ''}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{w.note || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    {w.alerts?.length ? (
                      w.alerts.map(a => (
                        <span
                          key={a.id}
                          className={`inline-block ml-1 px-2 py-0.5 rounded text-xs font-bold ${
                            a.triggered
                              ? 'bg-yellow-900/40 text-yellow-400 line-through'
                              : a.type === 'above'
                              ? 'bg-emerald-900/40 text-emerald-400'
                              : 'bg-rose-900/40 text-rose-400'
                          }`}
                        >
                          {a.type === 'above' ? '↑' : '↓'} {a.targetPrice?.toFixed(2)}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-600 text-xs">brak</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pozycje portfela jako lista do obserwacji */}
      {portfolio.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">💼 Posiadane spółki</h2>
            <p className="text-xs text-slate-500 mt-0.5">Twoje aktualne pozycje z portfela</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs uppercase tracking-wide bg-slate-900/50">
                <th className="text-left px-5 py-2.5">Symbol</th>
                <th className="text-right px-5 py-2.5">Ilość</th>
                <th className="text-right px-5 py-2.5">Śr. cena</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.map(pos => (
                <tr key={pos.id ?? pos.symbol} className="border-t border-slate-700/60 hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3 font-bold text-slate-100">
                    {pos.symbol}
                    {pos.name && pos.name !== pos.symbol && (
                      <span className="ml-2 text-xs text-slate-500 font-normal">{pos.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-300">
                    {pos.qty?.toLocaleString('pl-PL') ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-400">
                    {pos.avgPrice?.toFixed(2)} {pos.currency}
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
