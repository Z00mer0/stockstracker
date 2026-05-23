import React, { useState } from 'react';

const CSV_EXAMPLE = `Symbol,Ilość,Cena,Waluta,Data
AAPL,10,185.50,USD,2024-01-15
CDR.WA,100,88.20,PLN,2024-03-01`;

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const firstField = lines[0].split(sep)[0].trim();
  const start = /^[a-zA-Z]/.test(firstField) && isNaN(parseFloat(lines[0].split(sep)[1])) ? 1 : 0;
  const results = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"(.+)"$/, '$1'));
    const [symbol, qtyStr, priceStr, currency, date] = cols;
    if (!symbol || !qtyStr || !priceStr) continue;
    const qty = parseFloat(qtyStr.replace(',', '.'));
    const avgPrice = parseFloat(priceStr.replace(',', '.'));
    if (isNaN(qty) || isNaN(avgPrice)) continue;
    results.push({
      id: Math.random().toString(36).slice(2, 10),
      symbol: symbol.toUpperCase().trim(), qty, avgPrice,
      currency: (currency || 'USD').toUpperCase().trim(),
      date: date?.trim() || new Date().toISOString().slice(0, 10),
      name: '',
    });
  }
  return results;
}

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 520,
  maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

export default function CsvImportModal({ existingHoldings, onSave, onClose }) {
  const [text, setText]   = useState('');
  const [mode, setMode]   = useState('replace');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const preview = text.trim() ? parseCsv(text) : [];

  async function handleImport() {
    if (!preview.length) { setError('Brak poprawnych danych do importu.'); return; }
    setSaving(true); setError('');
    try {
      let newHoldings;
      if (mode === 'replace') {
        newHoldings = preview;
      } else {
        const map = Object.fromEntries(existingHoldings.map(h => [h.symbol, h]));
        preview.forEach(p => { map[p.symbol] = p; });
        newHoldings = Object.values(map);
      }
      await onSave(newHoldings);
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
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Import CSV</h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
          Format: Symbol, Ilość, Cena, Waluta, Data (pierwszy wiersz może być nagłówkiem)
        </p>

        {/* Example */}
        <pre style={{
          background: 'var(--panel-2)', borderRadius: 8,
          padding: '8px 12px', marginBottom: 14,
          fontSize: 11, color: 'var(--text-faint)',
          fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'pre', overflowX: 'auto',
        }}>{CSV_EXAMPLE}</pre>

        <textarea
          style={{
            width: '100%', height: 112,
            background: 'var(--panel-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px',
            fontSize: 12, color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
            outline: 'none', resize: 'none',
            boxSizing: 'border-box', marginBottom: 12,
          }}
          placeholder="Wklej dane CSV tutaj…"
          value={text}
          onChange={e => { setText(e.target.value); setError(''); }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8, marginBottom: 16 }}>
          {[['replace', 'Zastąp portfel'], ['merge', 'Dodaj / aktualizuj']].map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 600,
                border: 'none', borderRadius: 6, cursor: 'pointer',
                background: mode === k ? 'var(--bg-2)' : 'transparent',
                color: mode === k ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: mode === k ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                transition: 'background 0.15s',
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Preview table */}
        {preview.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>Podgląd ({preview.length} pozycji):</p>
            <div style={{ background: 'var(--panel-2)', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    {['Symbol', 'Ilość', 'Cena', 'Waluta', 'Data'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Symbol' ? 'left' : 'right', padding: '6px 10px', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '5px 10px', fontWeight: 700, color: 'var(--accent)' }}>{p.symbol}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{p.qty}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{p.avgPrice.toFixed(2)}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-faint)' }}>{p.currency}</td>
                      <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-faint)' }}>{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Anuluj</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleImport} disabled={saving || !preview.length}>
            {saving ? 'Importowanie…' : `Importuj${preview.length > 0 ? ` (${preview.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
