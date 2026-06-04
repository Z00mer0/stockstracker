import React, { useState } from 'react';

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 400,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

export default function SellStockModal({ holding, onSave, onClose }) {
  const [qty, setQty]           = useState('');
  const [price, setPrice]       = useState(holding?.avgPrice ?? '');
  const [currency, setCurrency] = useState(holding?.currency ?? 'PLN');
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (isNaN(q) || q <= 0) { setError('Podaj ilość'); return; }
    if (q > (holding?.qty ?? 0)) { setError(`Masz tylko ${holding.qty} szt.`); return; }
    if (isNaN(p) || p <= 0) { setError('Podaj cenę sprzedaży'); return; }
    setSaving(true); setError('');
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
    <div style={overlay}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Sprzedaj {holding?.symbol}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Masz {holding?.qty} szt. po śr. {holding?.avgPrice} {holding?.currency}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">Ilość akcji *</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              placeholder={`max ${holding?.qty}`}
              value={qty}
              onChange={e => setQty(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Cena sprzedaży *</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">Waluta</label>
            <select className="field-input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Data sprzedaży</label>
            <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="field-label">Notatka (opcjonalna)</label>
          <input
            className="field-input"
            placeholder="np. realizacja zysku…"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {(() => {
          const q = parseFloat(qty);
          const p = parseFloat(price);
          const avg = holding?.avgPrice;
          if (!isNaN(q) && q > 0 && !isNaN(p) && p > 0 && avg) {
            const pl = (p - avg) * q;
            const plPct = ((p - avg) / avg) * 100;
            const color = pl >= 0 ? 'var(--up)' : 'var(--down)';
            return (
              <div style={{ background: 'var(--bg-3)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
                <span style={{ color: 'var(--text-faint)' }}>Szacowany wynik: </span>
                <span style={{ color, fontWeight: 600 }}>
                  {pl >= 0 ? '+' : ''}{pl.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                  {' '}({plPct >= 0 ? '+' : ''}{plPct.toFixed(2)}%)
                </span>
              </div>
            );
          }
          return null;
        })()}

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Anuluj</button>
          <button
            className="btn"
            style={{ flex: 1, background: 'var(--down)', color: '#fff', fontWeight: 600 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Zapisuję…' : 'Sprzedaj'}
          </button>
        </div>
      </div>
    </div>
  );
}
