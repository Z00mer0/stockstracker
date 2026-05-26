import React, { useState, useEffect, useRef } from 'react';

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

function ToggleGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8 }}>
      {options.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          style={{
            flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 600,
            border: 'none', borderRadius: 6, cursor: 'pointer',
            background: value === k ? 'var(--bg-2)' : 'transparent',
            color: value === k ? 'var(--text)' : 'var(--text-dim)',
            boxShadow: value === k ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export default function AddStockModal({ existingPortfolio, onSave, onClose, initialSymbol = '' }) {
  const [symbol, setSymbol]    = useState(initialSymbol);
  const [mode, setMode]        = useState('qty');
  const [qty, setQty]          = useState('');
  const [price, setPrice]      = useState('');
  const [totalValue, setTotal] = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [date, setDate]        = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote]        = useState('');
  const [funding, setFunding]  = useState('topup');
  const [saving, setSaving]    = useState(false);
  const [error, setError]      = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSug, setShowSug]  = useState(false);
  const sugRef = useRef(null);

  useEffect(() => {
    if (symbol.length < 2) { setSuggestions([]); setShowSug(false); return; }
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(symbol)}`);
        if (!res.ok) return;
        const { results } = await res.json();
        setSuggestions(results ?? []);
        setShowSug((results ?? []).length > 0);
      } catch {}
    }, 300);
    return () => clearTimeout(id);
  }, [symbol]);

  useEffect(() => {
    function onDown(e) { if (sugRef.current && !sugRef.current.contains(e.target)) setShowSug(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pickSuggestion(s) {
    setSymbol(s.symbol);
    setShowSug(false);
    // Auto-set currency based on exchange
    if (s.exchange && (s.exchange.includes('Warsaw') || s.symbol.endsWith('.WA'))) setCurrency('PLN');
    else if (s.exchange && (s.exchange.includes('NYSE') || s.exchange.includes('NASDAQ') || s.exchange.includes('NasdaqGS') || s.exchange.includes('NasdaqCM'))) setCurrency('USD');
  }

  const resolvedQty   = mode === 'qty' ? parseFloat(qty) : parseFloat(totalValue) / parseFloat(price);
  const resolvedPrice = parseFloat(price);

  async function handleSave() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) { setError('Podaj symbol tickera'); return; }
    if (isNaN(resolvedQty) || resolvedQty <= 0) { setError('Podaj ilość / wartość'); return; }
    if (isNaN(resolvedPrice) || resolvedPrice <= 0) { setError('Podaj cenę zakupu'); return; }
    setSaving(true); setError('');
    try {
      await onSave({ symbol: sym, qty: resolvedQty, price: resolvedPrice, currency, date, note: note.trim(), funding });
      onClose();
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  const existing = existingPortfolio.find(h => h.symbol === symbol.trim().toUpperCase());

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 20px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Dodaj spółkę do portfela
        </h2>

        {/* Symbol */}
        <div style={{ marginBottom: 16, position: 'relative' }} ref={sugRef}>
          <label className="field-label">Symbol tickera *</label>
          <input
            className="field-input"
            placeholder="np. AAPL, PKN.WA, MSFT"
            value={symbol}
            onChange={e => { setSymbol(e.target.value); setShowSug(true); }}
            onFocus={() => suggestions.length > 0 && setShowSug(true)}
            autoFocus
            autoComplete="off"
          />
          {showSug && suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
              background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', marginTop: 2,
            }}>
              {suggestions.map(s => (
                <div
                  key={s.symbol}
                  onMouseDown={() => pickSuggestion(s)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--panel-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 72, fontFamily: 'JetBrains Mono, monospace' }}>{s.symbol}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  {s.exchange && <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{s.exchange}</span>}
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
            🇵🇱 GPW: dodaj <strong>.WA</strong> (np. PKN.WA) · 🇺🇸 US: bez sufiksu (np. AAPL)
          </p>
          {existing && (
            <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>
              Masz już {existing.qty} szt. po śr. {existing.avgPrice} {existing.currency} — zostanie uśrednione
            </p>
          )}
        </div>

        {/* Mode toggle */}
        <div style={{ marginBottom: 16 }}>
          <ToggleGroup
            options={[['qty', 'Ilość'], ['value', 'Wartość transakcji']]}
            value={mode}
            onChange={setMode}
          />
        </div>

        {/* Qty + Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">{mode === 'qty' ? 'Ilość akcji *' : 'Wartość transakcji *'}</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              placeholder={mode === 'qty' ? '10' : '1500'}
              value={mode === 'qty' ? qty : totalValue}
              onChange={e => mode === 'qty' ? setQty(e.target.value) : setTotal(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Cena zakupu *</label>
            <input
              type="number" min="0" step="any"
              className="field-input"
              placeholder="150.00"
              value={price}
              onChange={e => setPrice(e.target.value)}
            />
          </div>
        </div>

        {/* Currency + Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label className="field-label">Waluta</label>
            <select className="field-input" value={currency} onChange={e => setCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Data zakupu</label>
            <input type="date" className="field-input" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 16 }}>
          <label className="field-label">Notatka (opcjonalna)</label>
          <input
            className="field-input"
            placeholder="np. długoterminowo, dywidendowa…"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {/* Funding */}
        <div style={{ marginBottom: 20 }}>
          <label className="field-label">Źródło środków</label>
          <ToggleGroup
            options={[['topup', '💼 Dopłata'], ['cash', '💵 Odejmij od gotówki']]}
            value={funding}
            onChange={setFunding}
          />
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Anuluj</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Zapisuję…' : 'Dodaj do portfela'}
          </button>
        </div>
      </div>
    </div>
  );
}
