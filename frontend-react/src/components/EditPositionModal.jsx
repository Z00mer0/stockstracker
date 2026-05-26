import React, { useState } from 'react';

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 360,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

export default function EditPositionModal({ holding, onSave, onClose }) {
  const [qty, setQty]           = useState(String(holding?.qty ?? ''));
  const [avgPrice, setAvgPrice] = useState(String(holding?.avgPrice ?? ''));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    const q = parseFloat(qty);
    const p = parseFloat(avgPrice);
    if (isNaN(q) || q <= 0)  { setError('Podaj ilość (> 0)'); return; }
    if (isNaN(p) || p <= 0)  { setError('Podaj średnią cenę (> 0)'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: holding.symbol, qty: q, avgPrice: p });
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Edytuj {holding?.symbol}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Ręczna korekta ilości i średniej ceny zakupu.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label className="field-label">Ilość akcji *</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              value={qty}
              onChange={e => setQty(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Śr. cena ({holding?.currency ?? 'PLN'}) *</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              value={avgPrice}
              onChange={e => setAvgPrice(e.target.value)}
            />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Anuluj</button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Zapisuję…' : 'Zapisz'}
          </button>
        </div>
      </div>
    </div>
  );
}
