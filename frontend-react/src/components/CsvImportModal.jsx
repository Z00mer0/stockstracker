import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

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

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const str = String(val);
  // "28/05/2026 11:03:24" or "2026-05-28 11:03:24"
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str.slice(0, 10).replace(/\//g, '-');
}

function parseXtbExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const results = [];

  for (const sheetName of workbook.SheetNames) {
    // Only process "OPEN POSITION" sheets
    if (!sheetName.toUpperCase().includes('OPEN POSITION')) continue;

    const sheet = workbook.Sheets[sheetName];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Find header row: the row containing "Symbol" and "Volume"
    let headerIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(c => String(c ?? '').toLowerCase().trim());
      if (row.includes('symbol') && row.includes('volume')) { headerIdx = i; break; }
    }
    if (headerIdx < 0) continue;

    const headers = rows[headerIdx].map(c => String(c ?? '').toLowerCase().trim());
    const col = (row, name) => {
      const idx = headers.indexOf(name.toLowerCase());
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };
    const colRaw = (row, name) => {
      const idx = headers.indexOf(name.toLowerCase());
      return idx >= 0 ? row[idx] : undefined;
    };

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some(c => c != null && c !== '')) continue;

      const symbol    = col(row, 'symbol');
      const volume    = parseFloat(col(row, 'volume'));
      const openPrice = parseFloat(col(row, 'open price'));
      const openTime  = parseDate(colRaw(row, 'open time'));
      const type      = col(row, 'type').toUpperCase();

      if (!symbol || isNaN(volume) || isNaN(openPrice) || volume <= 0) continue;
      if (type && type !== 'BUY') continue; // skip shorts / non-stock rows

      const currency = /\.(WA|PL)$/i.test(symbol) ? 'PLN' : 'USD';
      const normalizedSymbol = symbol.toUpperCase().replace(/\.PL$/i, '.WA');

      results.push({
        id: Math.random().toString(36).slice(2, 10),
        symbol: normalizedSymbol,
        qty: volume,
        avgPrice: openPrice,
        currency,
        date: openTime || new Date().toISOString().slice(0, 10),
        name: '',
      });
    }
  }

  return results;
}

function mergeBySymbol(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.symbol)) {
      map.set(r.symbol, { ...r });
    } else {
      const e = map.get(r.symbol);
      const totalQty = e.qty + r.qty;
      const avgPrice = (e.qty * e.avgPrice + r.qty * r.avgPrice) / totalQty;
      const ts1 = new Date(e.date).getTime();
      const ts2 = new Date(r.date).getTime();
      const avgDate = new Date((e.qty * ts1 + r.qty * ts2) / totalQty).toISOString().slice(0, 10);
      map.set(r.symbol, { ...e, qty: totalQty, avgPrice, date: avgDate });
    }
  }
  return Array.from(map.values());
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
  const [text, setText]       = useState('');
  const [mode, setMode]       = useState('replace');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [fileName, setFileName] = useState('');
  const [filePreview, setFilePreview] = useState(null); // parsed from file
  const fileInputRef = useRef(null);

  function handleFile(file) {
    setError(''); setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    const isExcel = ext === 'xls' || ext === 'xlsx';
    if (!isExcel) { setError('Plik musi być w formacie XLS lub XLSX (eksport XTB).'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      const parsed = parseXtbExcel(new Uint8Array(e.target.result));
      if (!parsed.length) setError('Nie znaleziono pozycji w pliku. Upewnij się że plik zawiera zakładkę "OPEN POSITION…".');
      setFilePreview(parsed);
    };
    reader.readAsArrayBuffer(file);
  }

  function handleDrop(e) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }

  // Active preview: file takes priority over textarea
  const preview = mergeBySymbol(filePreview ?? (text.trim() ? parseCsv(text) : []));

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
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Import pozycji</h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
          Wrzuć plik XLS/XLSX z XTB <em style={{ color: 'var(--text-dim)' }}>(Open Position)</em> lub wklej CSV poniżej.
        </p>

        {/* File drop zone */}
        <div
          style={{
            border: `2px dashed ${fileName ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10, padding: '14px 16px', textAlign: 'center',
            cursor: 'pointer', marginBottom: 14, transition: 'border-color 0.15s',
          }}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = fileName ? 'var(--accent)' : 'var(--border)'}
        >
          <input
            ref={fileInputRef} type="file" accept=".xls,.xlsx"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
          />
          {fileName ? (
            <p style={{ fontSize: 12, color: 'var(--accent)', margin: 0, fontWeight: 600 }}>📄 {fileName}</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 2px' }}>
                Przeciągnij plik lub <span style={{ color: 'var(--accent)' }}>kliknij aby wybrać</span>
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>XLS, XLSX — eksport XTB Open Position</p>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>lub wklej CSV</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* CSV example */}
        <pre style={{
          background: 'var(--panel-2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          fontSize: 11, color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'pre', overflowX: 'auto',
        }}>{CSV_EXAMPLE}</pre>

        <textarea
          style={{
            width: '100%', height: 96,
            background: 'var(--panel-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px',
            fontSize: 12, color: 'var(--text)',
            fontFamily: 'JetBrains Mono, monospace',
            outline: 'none', resize: 'none', boxSizing: 'border-box', marginBottom: 12,
            opacity: filePreview ? 0.4 : 1,
          }}
          placeholder="Wklej dane CSV tutaj…"
          value={text}
          disabled={!!filePreview}
          onChange={e => { setText(e.target.value); setError(''); }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />

        {filePreview && (
          <button
            style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 12, padding: 0 }}
            onClick={() => { setFilePreview(null); setFileName(''); setError(''); }}
          >
            × Usuń plik i wróć do CSV
          </button>
        )}

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8, marginBottom: 16 }}>
          {[['replace', 'Zastąp portfel'], ['merge', 'Dodaj / aktualizuj']].map(([k, lbl]) => (
            <button
              key={k} type="button" onClick={() => setMode(k)}
              style={{
                flex: 1, padding: '5px 0', fontSize: 12, fontWeight: 600,
                border: 'none', borderRadius: 6, cursor: 'pointer',
                background: mode === k ? 'var(--bg-2)' : 'transparent',
                color: mode === k ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: mode === k ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                transition: 'background 0.15s',
              }}
            >{lbl}</button>
          ))}
        </div>

        {/* Preview table */}
        {preview.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>Podgląd ({preview.length} pozycji):</p>
            <div style={{ background: 'var(--panel-2)', borderRadius: 8, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    {['Symbol', 'Ilość', 'Cena', 'Waluta', 'Data'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Symbol' ? 'left' : 'right', padding: '6px 10px', fontWeight: 500, position: 'sticky', top: 0, background: 'var(--panel-2)' }}>{h}</th>
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
