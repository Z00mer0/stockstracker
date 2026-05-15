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
      symbol: symbol.toUpperCase().trim(),
      qty,
      avgPrice,
      currency: (currency || 'USD').toUpperCase().trim(),
      date: date?.trim() || new Date().toISOString().slice(0, 10),
      name: '',
    });
  }
  return results;
}

export default function CsvImportModal({ existingHoldings, onSave, onClose }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('replace'); // 'replace' | 'merge'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const preview = text.trim() ? parseCsv(text) : [];

  async function handleImport() {
    if (!preview.length) { setError('Brak poprawnych danych do importu.'); return; }
    setSaving(true);
    setError('');
    try {
      let newHoldings;
      if (mode === 'replace') {
        newHoldings = preview;
      } else {
        // Merge: add new symbols, update existing by symbol
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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-bold text-slate-100 mb-1">Import CSV</h2>
        <p className="text-xs text-slate-500 mb-4">
          Format: Symbol, Ilość, Cena, Waluta, Data (pierwszy wiersz może być nagłówkiem)
        </p>

        <div className="bg-slate-900/60 rounded-lg px-3 py-2 mb-4 font-mono text-xs text-slate-500 whitespace-pre">
          {CSV_EXAMPLE}
        </div>

        <textarea
          className="w-full h-32 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono outline-none focus:border-indigo-500 resize-none mb-3"
          placeholder="Wklej dane CSV tutaj…"
          value={text}
          onChange={e => { setText(e.target.value); setError(''); }}
        />

        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          {[['replace', 'Zastąp portfel'], ['merge', 'Dodaj / aktualizuj']].map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mode === k ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-slate-400 mb-2">Podgląd ({preview.length} pozycji):</p>
            <div className="bg-slate-900/50 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 bg-slate-900/80">
                    <th className="text-left px-3 py-1.5">Symbol</th>
                    <th className="text-right px-3 py-1.5">Ilość</th>
                    <th className="text-right px-3 py-1.5">Cena</th>
                    <th className="text-right px-3 py-1.5">Waluta</th>
                    <th className="text-right px-3 py-1.5">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => (
                    <tr key={i} className="border-t border-slate-700/60">
                      <td className="px-3 py-1 font-bold text-indigo-400">{p.symbol}</td>
                      <td className="px-3 py-1 text-right text-slate-300">{p.qty}</td>
                      <td className="px-3 py-1 text-right text-slate-300">{p.avgPrice.toFixed(2)}</td>
                      <td className="px-3 py-1 text-right text-slate-400">{p.currency}</td>
                      <td className="px-3 py-1 text-right text-slate-500">{p.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors">
            Anuluj
          </button>
          <button onClick={handleImport} disabled={saving || !preview.length}
            className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors">
            {saving ? 'Importowanie…' : `Importuj ${preview.length > 0 ? `(${preview.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
