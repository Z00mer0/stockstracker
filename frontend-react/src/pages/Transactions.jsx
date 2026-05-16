import React, { useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { usePrivacy } from '../context/PrivacyContext';
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

function AddTransactionModal({ onSave, onClose }) {
  const [form, setForm] = useState({
    type: 'BUY',
    symbol: '',
    qty: '',
    price: '',
    currency: 'PLN',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function handleSave() {
    if (!form.symbol.trim()) { setError('Podaj symbol'); return; }
    const qty   = form.type === 'CASH' ? null : parseFloat(form.qty);
    const price = parseFloat(form.price);
    if (form.type !== 'CASH' && (isNaN(qty) || qty <= 0)) { setError('Podaj ilość'); return; }
    if (isNaN(price) || price < 0) { setError('Podaj cenę'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: Math.random().toString(36).slice(2, 10),
        type: form.type,
        symbol: form.symbol.trim().toUpperCase(),
        qty: form.type === 'CASH' ? null : qty,
        price,
        currency: form.currency,
        date: form.date,
        note: form.note.trim(),
      });
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  const showQty = form.type !== 'CASH';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-100 mb-4">Dodaj transakcję</h2>

        {/* Typ */}
        <div className="flex gap-1 mb-4">
          {['BUY','SELL','DIV','CASH'].map(t => (
            <button key={t} onClick={() => set('type', t)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                form.type === t
                  ? t === 'BUY'  ? 'bg-emerald-600 text-white'
                  : t === 'SELL' ? 'bg-rose-600 text-white'
                  : t === 'DIV'  ? 'bg-yellow-600 text-white'
                  : 'bg-sky-600 text-white'
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}>
              {t === 'BUY' ? 'Kupno' : t === 'SELL' ? 'Sprzedaż' : t === 'DIV' ? 'Dywidenda' : 'Gotówka'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {/* Symbol */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Symbol</label>
            <input type="text" placeholder="np. AAPL, CDR.WA"
              value={form.symbol} onChange={e => set('symbol', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 uppercase"
            />
          </div>

          {/* Qty + Price */}
          <div className={`grid gap-3 ${showQty ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {showQty && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Ilość</label>
                <input type="number" min="0" step="any" placeholder="0"
                  value={form.qty} onChange={e => set('qty', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">
                {form.type === 'CASH' ? 'Kwota' : 'Cena'}
              </label>
              <input type="number" min="0" step="any" placeholder="0.00"
                value={form.price} onChange={e => set('price', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Currency + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Waluta</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500">
                {['PLN','USD','EUR','GBP'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Data</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Notatka (opcjonalna)</label>
            <input type="text" placeholder=""
              value={form.note} onChange={e => set('note', e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 mt-3">{error}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {saving ? 'Zapisywanie…' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Transactions() {
  const { transactions, loading, saveTransactions } = useApp();
  const { isPrivate } = usePrivacy();
  const [filter, setFilter]       = useState('ALL');
  const [showAdd, setShowAdd]     = useState(false);

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
        <button onClick={() => setShowAdd(true)}
          className="mt-4 text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors">
          + Dodaj pierwszą transakcję
        </button>
        {showAdd && (
          <AddTransactionModal
            onSave={async (tx) => { await saveTransactions([...transactions, tx]); }}
            onClose={() => setShowAdd(false)}
          />
        )}
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
            className={`text-xs px-3 py-2 min-h-[36px] rounded-lg font-medium transition-colors ${
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
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-500">{sorted.length} wyników</span>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            + Dodaj
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
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
                  <td className={`px-5 py-3 text-right text-slate-400${isPrivate ? ' privacy-blur' : ''}`}>{tx.price != null ? `${fmt(tx.price)} ${cur}` : '—'}</td>
                  <td className={`px-5 py-3 text-right font-semibold${isPrivate ? ' privacy-blur' : ''}`}>{fmt(total)} {cur}</td>
                  <td className="px-5 py-3 text-slate-500 text-xs">{tx.note || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      {showAdd && (
        <AddTransactionModal
          onSave={async (tx) => { await saveTransactions([...transactions, tx]); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
