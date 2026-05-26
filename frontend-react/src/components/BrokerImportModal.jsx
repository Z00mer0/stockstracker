import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSep(line) {
  let commas = 0, semis = 0, inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    if (!inQ) { if (ch === ',') commas++; if (ch === ';') semis++; }
  }
  return semis > commas ? ';' : ',';
}

function splitRow(line, sep) {
  const cells = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === sep && !inQ) { cells.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseDate(val) {
  if (!val) return null;
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const str = String(val);
  return str.slice(0, 10).replace(/\//g, '-');
}

function genId() { return Math.random().toString(36).slice(2, 10); }

// ── Core parser ───────────────────────────────────────────────────────────────

function parseBrokerRows(rows) {
  if (rows.length < 5) return { type: 'unknown', transactions: [], error: 'Za mało wierszy.' };

  const fileTypeLine = String(rows[1]?.[0] ?? '').toLowerCase();
  const isClosedPositions = fileTypeLine.includes('closed');
  const isCashOperations  = fileTypeLine.includes('cash');

  const headers = (rows[4] ?? []).map(h => String(h ?? '').toLowerCase().trim());

  function col(row, name) {
    const idx = headers.indexOf(name.toLowerCase());
    return idx >= 0 ? String(row[idx] ?? '').trim() : '';
  }
  function colRaw(row, name) {
    const idx = headers.indexOf(name.toLowerCase());
    return idx >= 0 ? row[idx] : undefined;
  }

  const transactions = [];
  const errors = [];

  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => c != null && c !== '')) continue;

    if (isClosedPositions) {
      const ticker     = col(row, 'ticker') || col(row, 'instrument');
      const type       = col(row, 'type').toUpperCase();
      const qty        = parseFloat(col(row, 'volume'));
      const openPrice  = parseFloat(col(row, 'open price'));
      const closePrice = parseFloat(col(row, 'close price'));
      const openDate   = parseDate(colRaw(row, 'open time (utc)'));
      const closeDate  = parseDate(colRaw(row, 'close time (utc)'));
      const pl         = parseFloat(col(row, 'profit/loss')) || 0;
      const positionId = col(row, 'position id');

      if (!ticker || isNaN(qty) || isNaN(openPrice)) { errors.push(`Wiersz ${i + 1}: brak danych`); continue; }

      const currency = /\.(WA|PL)$/i.test(ticker) ? 'PLN' : 'USD';

      transactions.push({ id: genId(), type: type === 'SELL' ? 'SELL' : 'BUY', symbol: ticker.toUpperCase(), qty, price: openPrice, currency, date: openDate || closeDate || new Date().toISOString().slice(0, 10), note: 'Import brokera', brokerPositionId: positionId, fromClosedPosition: true });

      if (!isNaN(closePrice) && closeDate) {
        transactions.push({ id: genId(), type: type === 'SELL' ? 'BUY' : 'SELL', symbol: ticker.toUpperCase(), qty, price: closePrice, currency, date: closeDate, note: `Import brokera | P&L: ${pl >= 0 ? '+' : ''}${pl.toFixed(2)} ${currency}`, brokerPositionId: positionId + '_close', fromClosedPosition: true });
      }

    } else if (isCashOperations) {
      const dateStr    = col(row, 'date');
      const opType     = col(row, 'type').toLowerCase();
      const amount     = parseFloat(col(row, 'amount'));
      const details    = col(row, 'details');
      const positionId = col(row, 'position id');

      if (!dateStr || isNaN(amount)) continue;

      let txType = null;
      if (opType.includes('dividend'))                                   txType = 'DIV';
      else if (opType.includes('buy')  || opType.includes('stock buy'))  txType = 'BUY';
      else if (opType.includes('sell') || opType.includes('stock sell')) txType = 'SELL';
      else if (opType.includes('deposit') || opType.includes('withdrawal')) txType = 'CASH';
      else continue;

      const symbolMatch = details.match(/\b([A-Z0-9]{1,6}(\.[A-Z]{2})?)\b/);
      const symbol = symbolMatch?.[1] || 'UNKNOWN';

      transactions.push({ id: genId(), type: txType, symbol, qty: txType === 'CASH' ? null : 1, price: Math.abs(amount), currency: 'PLN', date: parseDate(dateStr) || new Date().toISOString().slice(0, 10), note: details || opType, brokerPositionId: positionId || undefined });
    }
  }

  return { type: isClosedPositions ? 'closed_positions' : isCashOperations ? 'cash_operations' : 'unknown', transactions, errors };
}

function parseBrokerCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return { type: 'unknown', transactions: [], error: 'Za mało wierszy.' };
  const sep = detectSep(lines[4]);
  const rows = lines.map(l => splitRow(l, sep));
  return parseBrokerRows(rows);
}

function parseBrokerXlsx(buffer) {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const allResults = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows  = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 5) continue;
    const result = parseBrokerRows(rows);
    if (result.type !== 'unknown' || result.transactions.length > 0) {
      allResults.push({ sheetName, ...result });
    }
  }
  if (!allResults.length) return [{ type: 'unknown', transactions: [], errors: [], error: 'Nie znaleziono arkuszy z danymi.' }];
  return allResults;
}

// ── Portfolio preview ─────────────────────────────────────────────────────────

function computePortfolioPreview(txs, holdings, cash) {
  function baseSymbol(sym) {
    return String(sym).replace(/\.(WA|PL|US|UK|DE|FR|NL|IT|ES|SE|DK|NO|FI|BE|AT|CH)$/i, '').toUpperCase();
  }
  let h = holdings.map(x => ({ ...x }));
  let c = { ...cash };
  const sorted = [...txs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  for (const tx of sorted) {
    if (!tx.qty || tx.qty <= 0) continue;
    const cur = tx.currency || 'PLN';
    const base = baseSymbol(tx.symbol);
    const idx = h.findIndex(x => x.symbol === tx.symbol || baseSymbol(x.symbol) === base);
    if (tx.type === 'BUY') {
      if (idx >= 0 && !tx.fromClosedPosition) {
        const old = h[idx];
        const qty = old.qty + tx.qty;
        h[idx] = { ...old, qty, avgPrice: (old.qty * old.avgPrice + tx.qty * tx.price) / qty };
      } else if (idx < 0) {
        h.push({ symbol: tx.symbol, qty: tx.qty, avgPrice: tx.price, currency: cur });
      }
    } else if (tx.type === 'SELL') {
      if (idx >= 0) {
        const qty = h[idx].qty - tx.qty;
        if (qty <= 0) h.splice(idx, 1); else h[idx] = { ...h[idx], qty };
      }
      c[cur] = (c[cur] ?? 0) + tx.qty * tx.price;
    }
  }
  const oldMap = Object.fromEntries(holdings.map(x => [x.symbol, x]));
  const newMap = Object.fromEntries(h.map(x => [x.symbol, x]));
  const cashAdded = {};
  for (const [cur, val] of Object.entries(c)) {
    const diff = val - (cash[cur] ?? 0);
    if (diff > 0.01) cashAdded[cur] = diff;
  }
  return {
    added:    h.filter(x => !oldMap[x.symbol]),
    removed:  holdings.filter(x => !newMap[x.symbol]),
    modified: h.filter(x => oldMap[x.symbol] && Math.abs(x.qty - oldMap[x.symbol].qty) > 0.001)
               .map(x => ({ ...x, oldQty: oldMap[x.symbol].qty })),
    cashAdded,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

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

export default function BrokerImportModal({ existingTransactions, existingPortfolio = [], existingCash = {}, onSave, onClose }) {
  const [results, setResults] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef(null);

  function handleFiles(files) {
    setError(''); setSaved(false);
    const readers = Array.from(files).flatMap(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      const isExcel = ext === 'xls' || ext === 'xlsx';
      if (isExcel) {
        return [new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve(parseBrokerXlsx(new Uint8Array(e.target.result)).map(r => ({ name: `${file.name} [${r.sheetName ?? ''}]`, ...r })));
          reader.readAsArrayBuffer(file);
        })];
      } else {
        return [new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve([{ name: file.name, ...parseBrokerCsv(e.target.result) }]);
          reader.readAsText(file, 'utf-8');
        })];
      }
    });
    Promise.all(readers).then(groups => setResults(groups.flat()));
  }

  function handleDrop(e) { e.preventDefault(); handleFiles(e.dataTransfer.files); }

  const allNewTxs = results.flatMap(r => r.transactions);
  const preview = allNewTxs.length > 0 ? computePortfolioPreview(allNewTxs, existingPortfolio, existingCash) : null;
  const existingBrokerIds = new Set(existingTransactions.map(t => t.brokerPositionId).filter(Boolean));
  const existingKeys = new Set(existingTransactions.map(t => `${t.symbol}_${t.date}_${t.type}_${t.price}`));
  const deduped = allNewTxs.filter(tx => {
    if (tx.brokerPositionId && existingBrokerIds.has(tx.brokerPositionId)) return false;
    return !existingKeys.has(`${tx.symbol}_${tx.date}_${tx.type}_${tx.price}`);
  });
  const instruments = new Set(deduped.map(t => t.symbol));

  async function handleImport() {
    if (!deduped.length) return;
    setSaving(true); setError('');
    try {
      await onSave(deduped);
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = t =>
    t === 'closed_positions' ? 'Closed Positions' :
    t === 'cash_operations'  ? 'Cash Operations'  : 'Nieznany';

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Import danych brokera
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 20 }}>
          Obsługuje <strong style={{ color: 'var(--text-dim)' }}>CSV</strong>, <strong style={{ color: 'var(--text-dim)' }}>XLS</strong> i <strong style={{ color: 'var(--text-dim)' }}>XLSX</strong>: pliki Closed Positions i Cash Operations. Format wykrywany automatycznie.
        </p>

        {/* Dropzone */}
        <div
          style={{
            border: '2px dashed var(--border)', borderRadius: 10,
            padding: '24px 16px', textAlign: 'center', cursor: 'pointer',
            marginBottom: 16, transition: 'border-color 0.15s',
          }}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" multiple className="hidden" onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 4px' }}>
            Przeciągnij pliki lub <span style={{ color: 'var(--accent)' }}>kliknij aby wybrać</span>
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>CSV, XLS, XLSX — można wybrać kilka naraz</p>
        </div>

        {/* Results per file */}
        {results.map((r, i) => (
          <div key={i} style={{ marginBottom: 10, background: 'var(--panel-2)', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {r.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0' }}>Typ: <span style={{ color: 'var(--text-dim)' }}>{typeLabel(r.type)}</span></p>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '2px 0' }}>Znalezione transakcje: <span style={{ color: 'var(--text-dim)' }}>{r.transactions.length}</span></p>
            {r.error && <p style={{ fontSize: 11, color: 'var(--down)', marginTop: 4 }}>{r.error}</p>}
            {r.errors?.length > 0 && <p style={{ fontSize: 11, color: 'var(--warn)', marginTop: 4 }}>{r.errors.length} wierszy z błędami (pominięte)</p>}
          </div>
        ))}

        {/* Summary */}
        {results.length > 0 && (
          <div style={{
            borderRadius: 8, padding: '10px 14px', marginBottom: 16,
            background: deduped.length > 0 ? 'var(--up-soft)' : 'var(--panel-2)',
            border: `1px solid ${deduped.length > 0 ? 'var(--up)' : 'var(--border)'}`,
          }}>
            {deduped.length > 0 ? (
              <p style={{ fontSize: 13, color: 'var(--up)', fontWeight: 600, margin: 0 }}>
                ✓ {deduped.length} nowych transakcji dla {instruments.size} instrumentów
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Wszystkie transakcje już istnieją (duplikaty pominięte).</p>
            )}
            {(allNewTxs.length - deduped.length) > 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Pominięto {allNewTxs.length - deduped.length} duplikatów</p>
            )}
          </div>
        )}

        {/* Portfolio preview */}
        {preview && (() => {
          const { added, removed, modified, cashAdded } = preview;
          const hasChanges = added.length + removed.length + modified.length + Object.keys(cashAdded).length > 0;
          return (
            <div style={{ borderRadius: 8, padding: '10px 14px', marginBottom: 16, background: 'var(--panel-2)', border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: hasChanges ? 6 : 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Podgląd zmian w portfelu
              </p>
              {!hasChanges && (
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
                  Pozycje już zamknięte — transakcje trafią tylko do historii (brak zmian w portfelu i gotówce).
                </p>
              )}
              {added.map(x => (
                <p key={x.symbol} style={{ fontSize: 11, color: 'var(--up)', margin: '2px 0' }}>
                  + {x.symbol} {x.qty % 1 === 0 ? x.qty : x.qty.toFixed(4)} szt. po {x.avgPrice?.toFixed(2)} {x.currency}
                </p>
              ))}
              {modified.map(x => (
                <p key={x.symbol} style={{ fontSize: 11, color: 'var(--text-dim)', margin: '2px 0' }}>
                  ~ {x.symbol}: {x.oldQty?.toFixed(4)} → {x.qty?.toFixed(4)} szt.
                </p>
              ))}
              {removed.map(x => (
                <p key={x.symbol} style={{ fontSize: 11, color: 'var(--down)', margin: '2px 0' }}>
                  − {x.symbol} (pozycja zamknięta)
                </p>
              ))}
              {Object.entries(cashAdded).map(([cur, v]) => (
                <p key={cur} style={{ fontSize: 11, color: 'var(--up)', margin: '2px 0' }}>
                  💵 Gotówka +{v.toFixed(2)} {cur} (wpływy ze sprzedaży)
                </p>
              ))}
            </div>
          );
        })()}

        {saved && <p style={{ fontSize: 13, color: 'var(--up)', marginBottom: 12 }}>✓ Zaimportowano pomyślnie!</p>}
        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>{saved ? 'Zamknij' : 'Anuluj'}</button>
          {!saved && (
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleImport} disabled={saving || deduped.length === 0}>
              {saving ? 'Importowanie…' : `Importuj (${deduped.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
