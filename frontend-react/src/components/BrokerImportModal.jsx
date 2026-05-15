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
  // Excel serial date number
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const str = String(val);
  return str.slice(0, 10).replace(/\//g, '-');
}

function genId() { return Math.random().toString(36).slice(2, 10); }

// ── Core parser (works on array-of-arrays rows) ───────────────────────────────

function parseBrokerRows(rows) {
  if (rows.length < 5) return { type: 'unknown', transactions: [], error: 'Za mało wierszy.' };

  // Row index 1 → file type label
  const fileTypeLine = String(rows[1]?.[0] ?? '').toLowerCase();
  const isClosedPositions = fileTypeLine.includes('closed');
  const isCashOperations  = fileTypeLine.includes('cash');

  // Row index 4 → headers
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

      if (!ticker || isNaN(qty) || isNaN(openPrice)) {
        errors.push(`Wiersz ${i + 1}: brak danych`);
        continue;
      }

      const currency = /\.(WA|PL)$/i.test(ticker) ? 'PLN' : 'USD';

      transactions.push({
        id: genId(),
        type: type === 'SELL' ? 'SELL' : 'BUY',
        symbol: ticker.toUpperCase(),
        qty,
        price: openPrice,
        currency,
        date: openDate || closeDate || new Date().toISOString().slice(0, 10),
        note: 'Import brokera',
        brokerPositionId: positionId,
      });

      if (!isNaN(closePrice) && closeDate) {
        transactions.push({
          id: genId(),
          type: type === 'SELL' ? 'BUY' : 'SELL',
          symbol: ticker.toUpperCase(),
          qty,
          price: closePrice,
          currency,
          date: closeDate,
          note: `Import brokera | P&L: ${pl >= 0 ? '+' : ''}${pl.toFixed(2)} ${currency}`,
          brokerPositionId: positionId + '_close',
        });
      }

    } else if (isCashOperations) {
      const dateStr    = col(row, 'date');
      const opType     = col(row, 'type').toLowerCase();
      const amount     = parseFloat(col(row, 'amount'));
      const details    = col(row, 'details');
      const positionId = col(row, 'position id');

      if (!dateStr || isNaN(amount)) continue;

      let txType = null;
      if (opType.includes('dividend'))                               txType = 'DIV';
      else if (opType.includes('buy')  || opType.includes('stock buy'))  txType = 'BUY';
      else if (opType.includes('sell') || opType.includes('stock sell')) txType = 'SELL';
      else if (opType.includes('deposit') || opType.includes('withdrawal')) txType = 'CASH';
      else continue;

      const symbolMatch = details.match(/\b([A-Z0-9]{1,6}(\.[A-Z]{2})?)\b/);
      const symbol = symbolMatch?.[1] || 'UNKNOWN';

      transactions.push({
        id: genId(),
        type: txType,
        symbol,
        qty: txType === 'CASH' ? null : 1,
        price: Math.abs(amount),
        currency: 'PLN',
        date: parseDate(dateStr) || new Date().toISOString().slice(0, 10),
        note: details || opType,
        brokerPositionId: positionId || undefined,
      });
    }
  }

  return {
    type: isClosedPositions ? 'closed_positions' : isCashOperations ? 'cash_operations' : 'unknown',
    transactions,
    errors,
  };
}

// ── Entry points (CSV text or Excel ArrayBuffer) ──────────────────────────────

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

  if (!allResults.length) {
    return [{ type: 'unknown', transactions: [], errors: [], error: 'Nie znaleziono arkuszy z danymi.' }];
  }
  return allResults;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BrokerImportModal({ existingTransactions, onSave, onClose }) {
  const [results, setResults] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef(null);

  function handleFiles(files) {
    setError('');
    setSaved(false);
    const fileArr = Array.from(files);

    const readers = fileArr.flatMap(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      const isExcel = ext === 'xls' || ext === 'xlsx';

      if (isExcel) {
        return [new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => {
            const sheetResults = parseBrokerXlsx(new Uint8Array(e.target.result));
            // Return one entry per sheet that had data
            resolve(sheetResults.map(r => ({ name: `${file.name} [${r.sheetName ?? ''}]`, ...r })));
          };
          reader.readAsArrayBuffer(file);
        }).then(arr => arr)];
      } else {
        return [new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => {
            const parsed = parseBrokerCsv(e.target.result);
            resolve([{ name: file.name, ...parsed }]);
          };
          reader.readAsText(file, 'utf-8');
        })];
      }
    });

    Promise.all(readers).then(groups => setResults(groups.flat()));
  }

  function handleDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  const allNewTxs = results.flatMap(r => r.transactions);
  const existingBrokerIds = new Set(existingTransactions.map(t => t.brokerPositionId).filter(Boolean));
  const existingKeys = new Set(existingTransactions.map(t => `${t.symbol}_${t.date}_${t.type}_${t.price}`));

  const deduped = allNewTxs.filter(tx => {
    if (tx.brokerPositionId && existingBrokerIds.has(tx.brokerPositionId)) return false;
    const key = `${tx.symbol}_${tx.date}_${tx.type}_${tx.price}`;
    if (existingKeys.has(key)) return false;
    return true;
  });

  const instruments = new Set(deduped.map(t => t.symbol));

  async function handleImport() {
    if (!deduped.length) return;
    setSaving(true);
    setError('');
    try {
      await onSave([...existingTransactions, ...deduped]);
      setSaved(true);
    } catch (e) {
      setError(e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = t =>
    t === 'closed_positions' ? 'Closed Positions' :
    t === 'cash_operations'  ? 'Cash Operations'  : '❓ Nieznany';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>

        <h2 className="text-base font-bold text-slate-100 mb-1">Import danych brokera</h2>
        <p className="text-xs text-slate-500 mb-4">
          Obsługuje <span className="text-slate-400">CSV</span>, <span className="text-slate-400">XLS</span> i <span className="text-slate-400">XLSX</span>:
          pliki <span className="text-slate-300">Closed Positions</span> i <span className="text-slate-300">Cash Operations</span>.
          Format wykrywany automatycznie.
        </p>

        {/* Dropzone */}
        <div
          className="border-2 border-dashed border-slate-600 hover:border-indigo-500 rounded-xl p-6 text-center cursor-pointer transition-colors mb-4"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          <p className="text-sm text-slate-400">
            Przeciągnij pliki lub <span className="text-indigo-400 underline">kliknij aby wybrać</span>
          </p>
          <p className="text-xs text-slate-600 mt-1">CSV, XLS, XLSX — można wybrać kilka naraz</p>
        </div>

        {/* Results per file/sheet */}
        {results.map((r, i) => (
          <div key={i} className="mb-3 bg-slate-900/50 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-slate-300 mb-1 truncate">📄 {r.name}</p>
            <p className="text-xs text-slate-400">
              Typ: <span className="text-slate-200">{typeLabel(r.type)}</span>
            </p>
            <p className="text-xs text-slate-400">
              Znalezione transakcje: <span className="text-slate-200">{r.transactions.length}</span>
            </p>
            {r.error && <p className="text-xs text-rose-400 mt-1">{r.error}</p>}
            {r.errors?.length > 0 && (
              <p className="text-xs text-amber-400 mt-1">{r.errors.length} wierszy z błędami (pominięte)</p>
            )}
          </div>
        ))}

        {/* Summary */}
        {results.length > 0 && (
          <div className={`rounded-lg px-4 py-3 mb-4 ${
            deduped.length > 0
              ? 'bg-emerald-950/40 border border-emerald-800/40'
              : 'bg-slate-900/40'
          }`}>
            {deduped.length > 0 ? (
              <p className="text-sm text-emerald-400 font-semibold">
                ✓ {deduped.length} nowych transakcji dla {instruments.size} instrumentów
              </p>
            ) : (
              <p className="text-sm text-slate-400">Wszystkie transakcje już istnieją (duplikaty pominięte).</p>
            )}
            {(allNewTxs.length - deduped.length) > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Pominięto {allNewTxs.length - deduped.length} duplikatów
              </p>
            )}
          </div>
        )}

        {saved  && <p className="text-sm text-emerald-400 mb-3">✓ Zaimportowano pomyślnie!</p>}
        {error  && <p className="text-xs text-rose-400 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors">
            {saved ? 'Zamknij' : 'Anuluj'}
          </button>
          {!saved && (
            <button
              onClick={handleImport}
              disabled={saving || deduped.length === 0}
              className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Importowanie…' : `Importuj (${deduped.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
