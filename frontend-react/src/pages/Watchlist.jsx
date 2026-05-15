import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useChart } from '../context/ChartContext';

const WATCH_KEY = 'myfund_watchlist';

function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCH_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveWatchlist(items) {
  localStorage.setItem(WATCH_KEY, JSON.stringify(items));
}

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function AlertModal({ item, onClose, onSave }) {
  const [type, setType] = useState('above');
  const [price, setPrice] = useState('');

  function handleAdd() {
    if (!price || isNaN(parseFloat(price))) return;
    const target = parseFloat(price);
    const triggered =
      (type === 'above' && (item.addedPrice ?? 0) >= target) ||
      (type === 'below' && (item.addedPrice ?? 0) <= target);
    onSave({ id: genId(), type, targetPrice: target, triggered });
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-100 mb-1">Dodaj alert — {item.symbol}</h2>
        {item.addedPrice != null && (
          <p className="text-xs text-slate-500 mb-4">Cena przy dodaniu: {item.addedPrice.toFixed(2)} {item.currency}</p>
        )}

        <div className="flex gap-2 mb-4">
          {['above', 'below'].map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                type === t
                  ? t === 'above' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {t === 'above' ? '↑ Powyżej' : '↓ Poniżej'}
            </button>
          ))}
        </div>

        <input
          type="number"
          placeholder="Cena docelowa"
          value={price}
          onChange={e => setPrice(e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 mb-5"
          autoFocus
        />

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors">
            Anuluj
          </button>
          <button onClick={handleAdd}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 transition-colors">
            Dodaj
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Watchlist() {
  const { portfolio } = useApp();
  const { openChart } = useChart();
  const [watchItems, setWatchItems] = useState([]);
  const [alertTarget, setAlertTarget] = useState(null);

  useEffect(() => {
    setWatchItems(loadWatchlist());
  }, []);

  function addAlert(itemId, alert) {
    setWatchItems(prev => {
      const updated = prev.map(w =>
        w.id === itemId ? { ...w, alerts: [...(w.alerts ?? []), alert] } : w
      );
      saveWatchlist(updated);
      return updated;
    });
    setAlertTarget(null);
  }

  function removeAlert(itemId, alertId) {
    setWatchItems(prev => {
      const updated = prev.map(w =>
        w.id === itemId
          ? { ...w, alerts: (w.alerts ?? []).filter(a => a.id !== alertId) }
          : w
      );
      saveWatchlist(updated);
      return updated;
    });
  }

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
          <div className="overflow-x-auto">
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
                    <td
                      className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
                      onClick={() => openChart(w.symbol)}
                      title={`Otwórz wykres ${w.symbol}`}
                    >
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
                      <div className="flex items-center justify-end flex-wrap gap-1">
                        {(w.alerts ?? []).map(a => (
                          <button
                            key={a.id}
                            onClick={() => removeAlert(w.id, a.id)}
                            title="Kliknij aby usunąć"
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold transition-opacity hover:opacity-60 ${
                              a.triggered
                                ? 'bg-yellow-900/40 text-yellow-400 line-through'
                                : a.type === 'above'
                                ? 'bg-emerald-900/40 text-emerald-400'
                                : 'bg-rose-900/40 text-rose-400'
                            }`}
                          >
                            {a.type === 'above' ? '↑' : '↓'} {a.targetPrice?.toFixed(2)}
                          </button>
                        ))}
                        <button
                          onClick={() => setAlertTarget(w)}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60 transition-colors"
                        >
                          + Alert
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alertTarget && (
        <AlertModal
          item={alertTarget}
          onClose={() => setAlertTarget(null)}
          onSave={(alert) => addAlert(alertTarget.id, alert)}
        />
      )}

      {/* Pozycje portfela jako lista do obserwacji */}
      {portfolio.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300">💼 Posiadane spółki</h2>
            <p className="text-xs text-slate-500 mt-0.5">Twoje aktualne pozycje z portfela</p>
          </div>
          <div className="overflow-x-auto">
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
                    <td
                      className="px-5 py-3 font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer transition-colors"
                      onClick={() => openChart(pos.symbol)}
                      title={`Otwórz wykres ${pos.symbol}`}
                    >
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
        </div>
      )}
    </div>
  );
}
