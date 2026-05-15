// frontend-react/src/pages/Settings.jsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getMdApiKey, setMdApiKey } from '../services/MarketDataService';

function ApiKeySection() {
  const [key,   setKey]   = useState(getMdApiKey);
  const [saved, setSaved] = useState(false);

  function save() {
    setMdApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const isSet = !!getMdApiKey();

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">Klucze API</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Wymagane do pobierania łańcucha opcji w Scenario Lab
        </p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-2">
            MarketData.app
            {isSet
              ? <span className="text-emerald-400 normal-case font-normal">✓ ustawiony</span>
              : <span className="text-amber-400 normal-case font-normal">nie ustawiony</span>
            }
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="Wklej klucz API…"
              className="flex-1 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-slate-100 text-sm outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={save}
              className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors min-w-[80px] ${
                saved
                  ? 'bg-emerald-700 text-emerald-100'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {saved ? '✓ Zapisano' : 'Zapisz'}
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Klucz przechowywany tylko lokalnie (localStorage). Zdobądź darmowy klucz na{' '}
            <span className="text-slate-400">marketdata.app</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { displayName, logout, refresh, fxRates } = useApp();
  const apiUrl = import.meta.env.VITE_API_URL ?? '(proxy lokalny)';

  return (
    <div className="space-y-5 max-w-xl">
      {/* Konto */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Konto</h2>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">Zalogowany jako</span>
            <span className="text-sm font-semibold text-slate-200">{displayName || '—'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400">API URL</span>
            <span className="text-xs text-slate-500 font-mono truncate max-w-xs">{apiUrl}</span>
          </div>
          <div className="pt-2 border-t border-slate-700 flex flex-col sm:flex-row gap-3">
            <button
              onClick={refresh}
              className="text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors font-medium min-h-[44px]"
            >
              Odśwież dane
            </button>
            <button
              onClick={logout}
              className="text-sm px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors text-slate-300 min-h-[44px]"
            >
              Wyloguj
            </button>
          </div>
        </div>
      </div>

      {/* Klucze API */}
      <ApiKeySection />

      {/* Kursy walut */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Kursy walut</h2>
          <p className="text-xs text-slate-500 mt-0.5">Aktualizowane co 30 min (frankfurter.app)</p>
        </div>
        <div className="px-5 py-4 space-y-2">
          {['USD', 'EUR', 'GBP'].map(cur => (
            <div key={cur} className="flex justify-between items-center py-1">
              <span className="text-sm font-medium text-slate-300">{cur} / PLN</span>
              <span className="text-sm text-slate-400 font-mono">
                {fxRates[cur] != null ? fxRates[cur].toFixed(4) : '—'} zł
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* O aplikacji */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-4">
        <p className="text-xs text-slate-600">
          StocksTracker React — migracja z Vanilla JS.
          Dane przechowywane na Render (PostgreSQL).
        </p>
      </div>
    </div>
  );
}
