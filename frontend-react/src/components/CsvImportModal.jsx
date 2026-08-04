import React, { useState, useRef, useEffect } from 'react';
import { readSheets, excelSerialToISO } from '../utils/spreadsheet.js';
import { useT } from '../context/LanguageContext';

// Przyklad formatu pokazywany uzytkownikowi. Naglowek idzie przez klucze
// kolumn, bo parseCsv czyta kolumny po POZYCJI, nie po nazwie (i pomija
// pierwszy wiersz heurystyka) — nazwy naglowka nie wplywaja na import,
// wiec moga byc w jezyku interfejsu.
const csvExample = t => `${t('col_symbol')},${t('col_qty')},${t('col_price')},${t('col_currency')},${t('col_date')}
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
    const iso = excelSerialToISO(val);
    if (iso) return iso;
  }
  const str = String(val);
  // "28/05/2026 11:03:24" or "2026-05-28 11:03:24"
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return str.slice(0, 10).replace(/\//g, '-');
}

async function parseXtbExcel(file) {
  const results = [];

  for (const { name: sheetName, rows } of await readSheets(file)) {
    // Only process "OPEN POSITION" sheets
    if (!sheetName.toUpperCase().includes('OPEN POSITION')) continue;

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
      const normalizedSymbol = symbol.toUpperCase().replace(/\.PL$/i, '.WA').replace(/\.US$/i, '');

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
  const t = useT();
  const [text, setText]         = useState('');
  const [mode, setMode]         = useState('replace');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [fileName, setFileName] = useState('');
  const [filePreview, setFilePreview] = useState(null);
  const [invalidSymbols, setInvalidSymbols] = useState(new Set());
  const [validating, setValidating] = useState(false);
  const fileInputRef = useRef(null);

  // Active preview: file takes priority over textarea (defined early so useEffect can use it)
  const rawRows = filePreview ?? (text.trim() ? parseCsv(text) : []);
  const preview = mergeBySymbol(rawRows);
  const symbolsKey = preview.map(p => p.symbol).sort().join(',');

  useEffect(() => {
    if (!preview.length) { setInvalidSymbols(new Set()); return; }
    setValidating(true);
    Promise.allSettled(
      preview.map(async ({ symbol }) => {
        try {
          const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
          if (res.status === 404) return symbol;
          if (!res.ok) return null;
          const json = await res.json();
          if (json.stooq) return null; // stooq fallback means price found
          const q = json?.quoteResponse?.result?.[0];
          return q?.regularMarketPrice ? null : symbol;
        } catch { return null; }
      })
    ).then(results => {
      const invalid = new Set(
        results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value)
      );
      setInvalidSymbols(invalid);
      setValidating(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  function handleFile(file) {
    setError(''); setFileName(file.name);
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'xls') {
      setError(t('ci_xls_unsupported')); return;
    }
    if (ext !== 'xlsx') { setError(t('ci_must_be_xlsx')); return; }
    parseXtbExcel(file)
      .then(parsed => {
        if (!parsed.length) setError(t('ci_no_positions'));
        setFilePreview(parsed);
      })
      .catch(err => setError(`Nie udało się odczytać pliku: ${err.message}`));
  }

  function handleDrop(e) { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }

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
      await onSave(newHoldings, rawRows);
      onClose();
    } catch (e) {
      setError(e.message || t('save_error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('ci_title')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>
          {t('ci_drop_xtb_pre')} <em style={{ color: 'var(--text-dim)' }}>(Open Position)</em> {t('ci_drop_xtb_post')}
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
            ref={fileInputRef} type="file" accept=".xlsx"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
          />
          {fileName ? (
            <p style={{ fontSize: 12, color: 'var(--accent)', margin: 0, fontWeight: 600 }}>📄 {fileName}</p>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 2px' }}>{t('ci_drag_file')}{' '}<span style={{ color: 'var(--accent)' }}>{t('imp_click_to_pick')}</span>
              </p>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>{t('ci_xlsx_hint')}</p>
            </>
          )}
        </div>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{t('ci_or_paste_csv_short')}</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {/* CSV example */}
        <pre style={{
          background: 'var(--panel-2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10,
          fontSize: 11, color: 'var(--text-faint)', fontFamily: 'JetBrains Mono, monospace',
          whiteSpace: 'pre', overflowX: 'auto',
        }}>{csvExample(t)}</pre>

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
          placeholder={t('ci_paste_csv')}
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
          >{t('ci_remove_file')}</button>
        )}

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8, marginBottom: 16 }}>
          {[['replace', t('ci_mode_replace')], ['merge', t('ci_mode_merge')]].map(([k, lbl]) => (
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
            <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 8 }}>
              Podgląd ({preview.length} pozycji){validating ? ' — sprawdzam symbole…' : invalidSymbols.size > 0 ? ` — ${invalidSymbols.size} ⚠ nieznany` : ''}:
            </p>
            <div style={{ background: 'var(--panel-2)', borderRadius: 8, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ color: 'var(--text-faint)' }}>
                    {[t('col_symbol'), t('col_qty'), t('col_price'), t('col_currency'), t('col_date')].map(h => (
                      <th key={h} style={{ textAlign: h === t('col_symbol') ? 'left' : 'right', padding: '6px 10px', fontWeight: 500, position: 'sticky', top: 0, background: 'var(--panel-2)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((p, i) => {
                    const bad = invalidSymbols.has(p.symbol);
                    return (
                      <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '5px 10px', fontWeight: 700, color: bad ? 'var(--down)' : 'var(--accent)', whiteSpace: 'nowrap' }}>
                          {p.symbol}
                          {bad && (
                            <span title={t('ci_no_quote')} style={{ marginLeft: 6, cursor: 'default' }}>⚠</span>
                          )}
                        </td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{p.qty}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>{p.avgPrice.toFixed(2)}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-faint)' }}>{p.currency}</td>
                        <td style={{ padding: '5px 10px', textAlign: 'right', color: 'var(--text-faint)' }}>{p.date}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{t('cancel_btn')}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleImport} disabled={saving || !preview.length}>
            {saving ? t('imp_importing') : `Importuj${preview.length > 0 ? ` (${preview.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
