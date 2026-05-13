import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';

const EMPTY = { symbol: '', exDate: '', payDate: '', amount: '', currency: 'PLN', note: '' };

export default function AddDividendModal({ isOpen, onClose, onSave, initialData = null }) {
  const { portfolio } = useApp();
  const [form, setForm] = useState(EMPTY);

  // Wypełnij formularz przy edycji
  useEffect(() => {
    if (isOpen) {
      setForm(initialData
        ? { symbol: initialData.symbol, exDate: initialData.exDate, payDate: initialData.payDate ?? '',
            amount: String(initialData.amount ?? ''), currency: initialData.currency ?? 'PLN', note: initialData.note ?? '' }
        : EMPTY
      );
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const symbols = [...new Set(portfolio.map(p => p.symbol))].sort();

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function handleSave() {
    if (!form.symbol || !form.exDate || !form.amount) return;
    onSave({
      symbol:   form.symbol,
      exDate:   form.exDate,
      payDate:  form.payDate || null,
      amount:   parseFloat(form.amount),
      currency: form.currency,
      note:     form.note.trim(),
    });
    onClose();
  }

  const labelCls = 'block text-xs text-slate-400 mb-1';
  const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-sm mx-4 shadow-2xl">
        {/* Nagłówek */}
        <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            {initialData ? 'Edytuj dywidendę' : '➕ Dodaj dywidendę'}
          </h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">×</button>
        </div>

        {/* Formularz */}
        <div className="px-5 py-4 space-y-3">
          {/* Spółka */}
          <div>
            <label className={labelCls}>Spółka</label>
            <select value={form.symbol} onChange={e => set('symbol', e.target.value)} className={inputCls}>
              <option value="">— wybierz —</option>
              {symbols.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Ex-date */}
          <div>
            <label className={labelCls}>Ex-date *</label>
            <input type="date" value={form.exDate} onChange={e => set('exDate', e.target.value)} className={inputCls} />
          </div>

          {/* Pay-date */}
          <div>
            <label className={labelCls}>Pay-date (opcjonalnie)</label>
            <input type="date" value={form.payDate} onChange={e => set('payDate', e.target.value)} className={inputCls} />
          </div>

          {/* Kwota + waluta */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className={labelCls}>Kwota / akcję *</label>
              <input
                type="number" min="0" step="0.01"
                value={form.amount} onChange={e => set('amount', e.target.value)}
                placeholder="0.00" className={inputCls}
              />
            </div>
            <div className="w-24">
              <label className={labelCls}>Waluta</label>
              <select value={form.currency} onChange={e => set('currency', e.target.value)} className={inputCls}>
                {['PLN', 'USD', 'EUR', 'GBP'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Notatka */}
          <div>
            <label className={labelCls}>Notatka (opcjonalnie)</label>
            <input
              type="text" value={form.note} onChange={e => set('note', e.target.value)}
              placeholder="np. wypłata za 2025" maxLength={120} className={inputCls}
            />
          </div>
        </div>

        {/* Akcje */}
        <div className="px-5 py-4 border-t border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
          >Anuluj</button>
          <button
            onClick={handleSave}
            disabled={!form.symbol || !form.exDate || !form.amount}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >Zapisz ✓</button>
        </div>
      </div>
    </div>
  );
}
