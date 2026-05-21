import React, { useState } from 'react';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

function Input({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500';

export default function AddStockModal({ existingPortfolio, onSave, onClose }) {
  const [symbol, setSymbol]   = useState('');
  const [mode, setMode]       = useState('qty');   // 'qty' | 'value'
  const [qty, setQty]         = useState('');
  const [price, setPrice]     = useState('');
  const [totalValue, setTotal] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [date, setDate]       = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]       = useState('');
  const [funding, setFunding] = useState('topup'); // 'topup' | 'cash'
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const resolvedQty   = mode === 'qty' ? parseFloat(qty) : parseFloat(totalValue) / parseFloat(price);
  const resolvedPrice = parseFloat(price);

  async function handleSave() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('Podaj symbol tickera'); return; }
    if (isNaN(resolvedQty) || resolvedQty <= 0) { setError('Podaj ilość / wartość'); return; }
    if (isNaN(resolvedPrice) || resolvedPrice <= 0) { setError('Podaj cenę zakupu'); return; }

    setSaving(true);
    setError('');
    try {
      await onSave({
        symbol: sym,
        qty: resolvedQty,
        price: resolvedPrice,
        currency,
        date,
        note: note.trim(),
        funding,
      });
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  const existing = existingPortfolio.find(h => h.symbol === symbol.trim().toUpperCase());

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-base font-bold text-slate-100 mb-4">Dodaj spółkę do portfela</h2>

        {/* Symbol */}
        <div className="mb-4">
          <Input label="Symbol tickera *">
            <input
              className={inputCls}
              placeholder="np. AAPL, PKN.WA, MSFT"
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              autoFocus
            />
          </Input>
          <p className="text-xs text-slate-500 mt-1">
            🇵🇱 GPW: dodaj <strong>.WA</strong> (np. PKN.WA) · 🇺🇸 US: bez sufiksu (np. AAPL)
          </p>
          {existing && (
            <p className="text-xs text-amber-400 mt-1">
              Masz już {existing.qty} szt. po śr. {existing.avgPrice} {existing.currency} — zostanie uśrednione
            </p>
          )}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 mb-4">
          {[['qty', 'Ilość'], ['value', 'Wartość transakcji']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                mode === k ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Qty + Price */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {mode === 'qty' ? (
            <Input label="Ilość akcji *">
              <input
                type="number" min="0" step="any"
                className={inputCls}
                placeholder="10"
                value={qty}
                onChange={e => setQty(e.target.value)}
              />
            </Input>
          ) : (
            <Input label="Wartość transakcji *">
              <input
                type="number" min="0" step="any"
                className={inputCls}
                placeholder="1500"
                value={totalValue}
                onChange={e => setTotal(e.target.value)}
              />
            </Input>
          )}
          <Input label="Cena zakupu *">
            <input
              type="number" min="0" step="any"
              className={inputCls}
              placeholder="150.00"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </Input>
        </div>

        {/* Currency + Date */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Input label="Waluta">
            <select
              className={inputCls}
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            >
              {CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Input>
          <Input label="Data zakupu">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </Input>
        </div>

        {/* Note */}
        <div className="mb-4">
          <Input label="Notatka (opcjonalna)">
            <input
              className={inputCls}
              placeholder="np. długoterminowo, dywidendowa..."
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </Input>
        </div>

        {/* Funding source */}
        <div className="mb-5">
          <p className="text-xs text-slate-400 mb-1">Źródło środków</p>
          <div className="flex gap-2">
            {[['topup', '💼 Dopłata'], ['cash', '💵 Odejmij od gotówki']].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setFunding(k)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  funding === k ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50"
          >
            {saving ? 'Zapisuję…' : 'Dodaj do portfela'}
          </button>
        </div>
      </div>
    </div>
  );
}
