import React, { useState, useRef } from 'react';

function genId() { return Math.random().toString(36).slice(2, 10); }

function normalizeSymbol(sym) {
  return String(sym).replace(/\.PL$/i, '.WA').replace(/\.US$/i, '');
}

// ── Shared row-grouping helper ────────────────────────────────────────────────

// Groups flat list of {text, x, y} items into rows by Y proximity
function groupIntoRows(items) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  let curY = -9999;
  let curRow = [];
  for (const it of sorted) {
    if (Math.abs(it.y - curY) <= 6) {
      curRow.push(it);
    } else {
      if (curRow.length) rows.push(curRow);
      curRow = [it];
      curY = it.y;
    }
  }
  if (curRow.length) rows.push(curRow);
  return rows;
}

// ── Shared metadata + position extractor ─────────────────────────────────────

// Known currency codes — prevents matching "Sal" from "Saldo" or other Polish words
const KNOWN_CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK'];

function parseRowsToResult(allRows) {
  const fullText = allRows.map(r => r.map(i => i.text).join(' ')).join('\n');

  // Currency: search for a known 3-letter code near "Waluta rachunku"
  // Use whitelist to avoid matching "Sal" from "Saldo", "Akt" etc.
  let currency = 'USD';
  const currHeaderIdx = fullText.search(/Waluta\s+rachunku/i);
  if (currHeaderIdx >= 0) {
    const nearby = fullText.slice(currHeaderIdx, currHeaderIdx + 200);
    for (const code of KNOWN_CURRENCIES) {
      if (new RegExp(`\\b${code}\\b`).test(nearby)) { currency = code; break; }
    }
  }

  let statementDate = null;
  const dateMatch = fullText.match(/Stan na koniec dnia\s+(\d{2})\.(\d{2})\.(\d{4})/i);
  if (dateMatch) {
    statementDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
  } else {
    const periodMatch = fullText.match(/do\s+(\d{2})\.(\d{2})\.(\d{4})/i);
    if (periodMatch) statementDate = `${periodMatch[3]}-${periodMatch[2]}-${periodMatch[1]}`;
  }
  if (!statementDate) statementDate = new Date().toISOString().slice(0, 10);

  const symRegex = /^[A-Z]{2,6}\.[A-Z]{2,3}$/;

  // Extract a number from the START of a string.
  // Must start with a digit — rejects ISINs ("US00724F1012"), symbols ("ADBE.US"), words.
  // Allows trailing non-numeric content, e.g. "699.73 USD" → 699.73
  function toNum(str) {
    const m = str.trim().match(/^(\d{1,12}(?:[.,]\d+)?)/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Accumulate by symbol so that OMI (whole shares) + Prawa ułamkowe (fractional)
  // for the same stock are merged into one position with correct total qty & value.
  const posMap = {}; // symbol → { qty, value }

  for (const row of allRows) {
    const texts = row.map(i => i.text);
    const symIdx = texts.findIndex(t => symRegex.test(t));
    if (symIdx < 0) continue;

    const symbol = normalizeSymbol(texts[symIdx]);

    const numItems = row
      .map(i => ({ ...i, num: toNum(i.text) }))
      .filter(i => i.num !== null && i.num > 0);

    if (numItems.length < 2) continue;

    // Data columns in XTB PDF are right-aligned: rightmost X = Wolumen, second = Wartość rynkowa
    const byX = [...numItems].sort((a, b) => b.x - a.x);
    const wolumen = byX[0].num;
    const wartosc = byX[1].num;

    if (!wolumen || !wartosc || wolumen <= 0 || wartosc <= 0 || wolumen >= wartosc) continue;

    if (posMap[symbol]) {
      posMap[symbol].qty += wolumen;
      posMap[symbol].value += wartosc;
    } else {
      posMap[symbol] = { qty: wolumen, value: wartosc };
    }
  }

  const positions = Object.entries(posMap).map(([symbol, p]) => {
    const price = +(p.value / p.qty).toFixed(6);
    return isFinite(price) && price > 0 ? { symbol, qty: p.qty, price, value: p.value, currency } : null;
  }).filter(Boolean);

  return { positions, statementDate, currency };
}

// ── PDF parser ────────────────────────────────────────────────────────────────

async function parsePdf(buffer) {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const allItems = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const pageH = vp.height;
    // Offset Y by page index so pages don't overlap
    const yOffset = (p - 1) * pageH;

    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      allItems.push({
        text: item.str.trim(),
        x: Math.round(item.transform[4]),
        y: Math.round(yOffset + pageH - item.transform[5]),
      });
    }
  }

  return parseRowsToResult(groupIntoRows(allItems));
}

// ── Image OCR parser ──────────────────────────────────────────────────────────

async function parseImage(file) {
  const { createWorker } = await import('tesseract.js');

  // v7 API: createWorker(langs) — training data fetched from CDN automatically
  const worker = await createWorker(['eng', 'pol']);
  const { data } = await worker.recognize(file);
  await worker.terminate();

  // Tesseract returns words with bbox {x0, y0, x1, y1}
  const items = (data.words ?? [])
    .filter(w => w.text.trim().length > 0)
    .map(w => ({
      text: w.text.trim(),
      x: w.bbox.x0,
      y: w.bbox.y0,
    }));

  return parseRowsToResult(groupIntoRows(items));
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};
const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 540,
  maxHeight: '90vh', overflowY: 'auto',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SnapshotImportModal({ onSave, onClose }) {
  const [result, setResult]     = useState(null);
  const [parsing, setParsing]   = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setError(''); setSaved(false); setResult(null); setOcrStatus('');
    const ext = file.name.split('.').pop().toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg'].includes(ext);
    const isPdf   = ext === 'pdf';
    if (!isPdf && !isImage) {
      setError('Obsługiwane formaty: PDF, PNG, JPG.');
      return;
    }
    setParsing(true);
    try {
      let parsed;
      if (isPdf) {
        const buffer = await file.arrayBuffer();
        parsed = await parsePdf(buffer);
      } else {
        setOcrStatus('Ładowanie OCR…');
        // Pass raw image URL — Tesseract can read Blob/File directly
        parsed = await parseImage(file);
        setOcrStatus('');
      }
      if (!parsed.positions.length) {
        setError('Nie znaleziono pozycji. Upewnij się, że to kwartalne zestawienie XTB.');
      } else {
        setResult(parsed);
      }
    } catch (e) {
      setError(`Błąd: ${e.message}`);
    } finally {
      setParsing(false);
      setOcrStatus('');
    }
  }

  const newTxs = result?.positions.map(pos => ({
    id: genId(),
    type: 'BUY',
    symbol: pos.symbol,
    qty: pos.qty,
    price: pos.price,
    currency: pos.currency,
    date: result.statementDate,
    note: `Snapshot ${result.statementDate}`,
    fromSnapshot: true,
  })) ?? [];

  async function handleImport() {
    if (!newTxs.length) return;
    setSaving(true); setError('');
    try {
      await onSave(newTxs);
      setSaved(true);
    } catch (e) {
      setError(e.message ?? 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Import zestawienia kwartalnego
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Obsługuje <strong style={{ color: 'var(--text-dim)' }}>PDF</strong>, <strong style={{ color: 'var(--text-dim)' }}>PNG</strong> i <strong style={{ color: 'var(--text-dim)' }}>JPG</strong> — kwartalne zestawienie aktywów XTB. Pozycje dodane jako BUY na datę zestawienia.
        </p>

        <div
          style={{
            border: '2px dashed var(--border)', borderRadius: 10,
            padding: '24px 16px', textAlign: 'center', cursor: parsing ? 'default' : 'pointer',
            marginBottom: 16, transition: 'border-color 0.15s',
            opacity: parsing ? 0.6 : 1,
          }}
          onClick={() => !parsing && inputRef.current?.click()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
          onDragOver={e => e.preventDefault()}
          onMouseEnter={e => { if (!parsing) e.currentTarget.style.borderColor = 'var(--accent)'; }}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <input ref={inputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 4px' }}>
            {parsing
              ? (ocrStatus || 'Parsowanie…')
              : <><span>Przeciągnij plik lub </span><span style={{ color: 'var(--accent)' }}>kliknij aby wybrać</span></>
            }
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>PDF, PNG, JPG — kwartalne zestawienie XTB</p>
        </div>

        {result && (
          <div style={{ background: 'var(--panel-2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', margin: '0 0 6px' }}>
              ✓ Znaleziono {result.positions.length} pozycji · {result.currency} · {result.statementDate}
            </p>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr>
                    {['Symbol', 'Wolumen', 'Cena', 'Wartość'].map(h => (
                      <th key={h} style={{ padding: '3px 6px', textAlign: h === 'Symbol' ? 'left' : 'right', color: 'var(--text-faint)', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.positions.map(pos => (
                    <tr key={pos.symbol}>
                      <td style={{ padding: '3px 6px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text)' }}>{pos.symbol}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{pos.qty % 1 === 0 ? pos.qty : pos.qty.toFixed(5)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{pos.price.toFixed(2)}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{pos.value.toFixed(2)} {pos.currency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {saved && <p style={{ fontSize: 13, color: 'var(--up)', marginBottom: 12 }}>✓ Zaimportowano {newTxs.length} pozycji!</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{saved ? 'Zamknij' : 'Anuluj'}</button>
          {!saved && result && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleImport}
              disabled={saving || newTxs.length === 0}>
              {saving ? 'Importowanie…' : `Importuj ${newTxs.length} pozycji`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
