// frontend-react/src/pages/Settings.jsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { getMdApiKey, setMdApiKey } from '../services/MarketDataService';
import { US_TAX_KEY } from '../services/dividendService';
import BrokerImportModal from '../components/BrokerImportModal';

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

function DividendTaxSection() {
  const [usTax, setUsTax] = useState(() => localStorage.getItem(US_TAX_KEY) || '15');

  function save(val) {
    setUsTax(val);
    localStorage.setItem(US_TAX_KEY, val);
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-300">Podatek od dywidend</h2>
        <p className="text-xs text-slate-500 mt-0.5">Stawka stosowana w widoku netto na stronie Dywidendy</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-slate-400">GPW (.WA)</span>
          <span className="text-sm font-semibold text-slate-300">19% ryczałt (stała)</span>
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Akcje US (USD)</p>
          <div className="flex gap-2">
            {[
              { val: '15', label: '15%', desc: 'Umowa PL-US (standardowo)' },
              { val: '30', label: '30%', desc: 'Pełny withholding' },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => save(opt.val)}
                className={`flex-1 px-4 py-3 rounded-lg text-left border transition-colors ${
                  usTax === opt.val
                    ? 'border-indigo-500 bg-indigo-950/50 text-indigo-300'
                    : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                <div className="font-bold text-base mb-0.5">{opt.label}</div>
                <div className="text-xs opacity-70">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { displayName, logout, refresh, fxRates, transactions, saveTransactions } = useApp();
  const apiUrl = import.meta.env.VITE_API_URL ?? '(proxy lokalny)';
  const [showBrokerImport, setShowBrokerImport] = useState(false);

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

      {/* Podatek od dywidend */}
      <DividendTaxSection />

      {/* Import danych brokera */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-slate-300">Import danych brokera</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Importuj historię z pliku CSV eksportowanego z brokera (eToro, itp.)
          </p>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-slate-400 mb-3">
            Obsługiwane pliki: <span className="text-slate-300">Closed Positions</span> i <span className="text-slate-300">Cash Operations</span>.
            Format wykrywany automatycznie. Duplikaty są pomijane.
          </p>
          <button
            onClick={() => setShowBrokerImport(true)}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors text-white font-medium"
          >
            ⬆ Importuj CSV brokera
          </button>
        </div>
      </div>

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

      {showBrokerImport && (
        <BrokerImportModal
          existingTransactions={transactions}
          onSave={async (newTxs) => { await saveTransactions(newTxs); refresh(); }}
          onClose={() => setShowBrokerImport(false)}
        />
      )}
    </div>
  );
}
