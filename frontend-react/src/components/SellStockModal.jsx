import React, { useState } from 'react';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];
const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';

export default function SellStockModal({ holding, onSave, onClose }) {
  const [qty, setQty]     = useState('');
  const [price, setPrice] = useState(holding?.avgPrice ?? '');
  const [currency, setCurrency] = useState(holding?.currency ?? 'PLN');
  const [date, setDate]   = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]  = useState('');

  async function handleSave() {
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (isNaN(q) || q <= 0) { setError('Podaj ilość'); return; }
    if (q > (holding?.qty ?? 0)) { setError(`Masz tylko ${holding.qty} szt.`); return; }
    if (isNaN(p) || p <= 0) { setError('Podaj cenę sprzedaży'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave({ symbol: holding.symbol, qty: q, price: p, currency, date, note: note.trim() });
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
           onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-100 mb-1">Sprzedaj {holding?.symbol}</h2>
        <p className="text-xs text-slate-500 mb-4">Masz {holding?.qty} szt. po śr. {holding?.avgPrice} {holding?.currency}</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Ilość akcji *</label>
            <input type="number" min="0" step="any" className={inputCls}
              placeholder={`max ${holding?.qty}`} value={qty} onChange={e => setQty(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Cena sprzedaży *</label>
            <input type="number" min="0" step="any" className={inputCls}
              value={price} onChange={e => setPrice(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Waluta</label>
            <select className={inputCls} value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Data sprzedaży</label>
            <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs text-slate-400 mb-1">Notatka (opcjonalna)</label>
          <input className={inputCls} placeholder="np. realizacja zysku..." value={note} onChange={e => setNote(e.target.value)} />
        </div>

        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors">
            Anuluj
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-500 transition-colors disabled:opacity-50">
            {saving ? 'Zapisuję…' : 'Sprzedaj'}
          </button>
        </div>
      </div>
    </div>
  );
}
