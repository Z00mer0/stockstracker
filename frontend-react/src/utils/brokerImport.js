// Import danych brokera (XTB): arkusze Closed Positions i Cash Operations
// (CSV lub XLSX) oraz podgląd zmian w portfelu. Wydzielone z
// BrokerImportModal, żeby dało się je przetestować.
import { readSheets, excelSerialToISO } from './spreadsheet.js';

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
    const iso = excelSerialToISO(val);
    if (iso) return iso;
  }
  const str = String(val).trim();
  // col() stringifies numeric Excel serial dates — detect and parse them
  const serial = parseFloat(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000 && str === String(serial)) {
    const iso = excelSerialToISO(serial);
    if (iso) return iso;
  }
  // XTB exports DD/MM/YYYY or DD-MM-YYYY — reorder to ISO YYYY-MM-DD
  // (albo z kropkami, DD.MM.YYYY — wcześniej zapisywane dosłownie, a data
  // spoza ISO psuła sortowanie i filtry po dacie).
  const dmyMatch = str.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return str.slice(0, 10).replace(/\//g, '-');
}

export function normalizeSymbol(sym) {
  return String(sym).replace(/\.PL$/i, '.WA').replace(/\.US$/i, '');
}

// Waluta po sufiksie symbolu XTB. Wcześniej arkusz Closed Positions znał
// tylko PLN i USD (VOW3.DE szło jako USD), a Cash Operations już rozróżniał
// EUR i GBP — ta sama spółka lądowała w dwóch walutach zależnie od arkusza.
export function brokerCurrency(sym) {
  const s = normalizeSymbol(String(sym).toUpperCase());
  if (/\.(WA|PL)$/i.test(s)) return 'PLN';
  if (/\.UK$/i.test(s)) return 'GBP';
  if (/\.(DE|FR|NL|IT|ES|BE|AT|FI|SE|DK|NO)$/i.test(s)) return 'EUR';
  return 'USD';
}

function genId() { return Math.random().toString(36).slice(2, 10); }

// ── Core parser ───────────────────────────────────────────────────────────────

// accountCurrency — waluta rachunku (portfela docelowego) dla wpłat i wypłat,
// które nie mają symbolu. Wcześniej trafiały zawsze do USD, więc 5000 zł
// wpłaty na rachunek złotówkowy liczyło się jak 5000 $.
export function parseBrokerRows(rows, accountCurrency) {
  if (rows.length < 5) return { type: 'unknown', transactions: [], error: 'bi_too_few_rows' };

  const fileTypeLine = String(rows[1]?.[0] ?? '').toLowerCase();
  const isClosedPositions = fileTypeLine.includes('closed');
  const isCashOperations  = fileTypeLine.includes('cash');

  // Nagłówek szukamy po treści (kolumna „type" i „amount" albo „volume"),
  // a nie tylko w piątym wierszu: CSV traci puste wiersze przy wczytaniu,
  // więc nagłówek potrafi się przesunąć i cały plik wyglądał na pusty.
  const lower = row => (row ?? []).map(h => String(h ?? '').toLowerCase().trim());
  let headerIdx = rows.findIndex((row, i) => i >= 2 && i <= 10 && lower(row).includes('type')
    && (lower(row).includes('amount') || lower(row).includes('volume')));
  if (headerIdx < 0) headerIdx = 4;
  const headers = lower(rows[headerIdx]);

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

  for (let i = headerIdx + 1; i < rows.length; i++) {
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

      if (!ticker || isNaN(qty) || isNaN(openPrice)) { errors.push(i + 1); continue; }

      const currency = brokerCurrency(ticker);

      const normalizedTicker = normalizeSymbol(ticker.toUpperCase());
      transactions.push({ id: genId(), type: type === 'SELL' ? 'SELL' : 'BUY', symbol: normalizedTicker, qty, price: openPrice, currency, date: openDate || closeDate || new Date().toISOString().slice(0, 10), note: 'Import brokera', brokerPositionId: positionId, fromClosedPosition: true });

      if (!isNaN(closePrice) && closeDate) {
        transactions.push({ id: genId(), type: type === 'SELL' ? 'BUY' : 'SELL', symbol: normalizedTicker, qty, price: closePrice, currency, date: closeDate, note: `Import brokera | P&L: ${pl >= 0 ? '+' : ''}${pl.toFixed(2)} ${currency}`, brokerPositionId: positionId + '_close', fromClosedPosition: true });
      }

    } else if (isCashOperations) {
      // Support both column name variants from different broker exports
      const timeStr    = col(row, 'time') || col(row, 'date');
      const opType     = col(row, 'type').toLowerCase();
      const amount     = parseFloat(col(row, 'amount'));
      const comment    = col(row, 'comment') || col(row, 'details');
      // Część eksportów ma kolumnę „Symbol" — wcześniej czytane były tylko
      // „Ticker" i „Instrument", więc symbol zgadywano z komentarza.
      const ticker     = col(row, 'ticker') || col(row, 'symbol');
      const instrument = col(row, 'instrument');
      const positionId = col(row, 'id') || col(row, 'position id');

      if (!timeStr || isNaN(amount)) continue;

      let txType;
      if (opType.includes('dividend'))                                     txType = 'DIV';
      else if (opType.includes('buy')  || opType.includes('stock purchase')) txType = 'BUY';
      else if (opType.includes('sell') || opType.includes('stock sale'))     txType = 'SELL';
      else if (opType.includes('deposit') || opType.includes('withdrawal'))  txType = 'CASH';
      else continue;

      // Symbol: prefer Ticker column, fall back to Instrument, then parse from comment
      let symbol = ticker || instrument || '';
      if (!symbol) {
        // Słowa z komentarza „OPEN BUY 3 @ …" to nie tickery.
        const m = [...comment.matchAll(/\b([A-Z0-9]{1,6}(\.[A-Z]{2})?)\b/g)]
          .find(x => !/^(OPEN|CLOSE|BUY|SELL|\d+)$/.test(x[1]));
        symbol = m?.[1] || 'UNKNOWN';
      }

      // Extract qty and price from comment: "OPEN BUY 3 @ 102.20" or "OPEN SELL 5 @ 99.50"
      let qty = null;
      let price = Math.abs(amount);
      // "CLOSE BUY 2/6 @ 30.220" — the /6 denominator is optional
      const commentMatch = comment.match(/(?:BUY|SELL)\s+([\d.]+)(?:\/[\d.]+)?\s*@\s*([\d.]+)/i);
      if (commentMatch) {
        qty   = parseFloat(commentMatch[1]);
        price = parseFloat(commentMatch[2]);
      }

      const normalizedCashSym = normalizeSymbol(symbol.toUpperCase());
      const cashCurrency = txType === 'CASH' && !ticker && !instrument && accountCurrency
        ? accountCurrency
        : brokerCurrency(normalizedCashSym);

      // Semantyka pól per typ:
      // - CASH: qty=null, price = kwota ze znakiem (wpłata +, wypłata −); cash-flow z tx.price
      // - DIV : qty=null, price = |amount| (zawsze uznanie na rachunek)
      // - BUY/SELL: qty i price z komentarza "BUY x @ y"; cash-flow z qty·price
      //   (Cash Ops JEST źródłem prawdy o cash — tylko gdy nie ma commentMatch,
      //   zabezpieczamy się skipCashAdjust, żeby nie liczyć śmieciowej pary).
      const isCashType = txType === 'CASH';
      const isDivType  = txType === 'DIV';
      const hasQtyPrice = qty != null && !isNaN(qty) && qty > 0;
      transactions.push({
        id: genId(),
        type: txType,
        symbol: normalizedCashSym,
        qty: isCashType || isDivType ? null : (hasQtyPrice ? qty : Math.abs(amount)),
        price: isCashType ? amount : (isDivType ? Math.abs(amount) : price),
        currency: cashCurrency,
        date: parseDate(timeStr) || new Date().toISOString().slice(0, 10),
        note: comment || opType,
        brokerPositionId: positionId || undefined,
        // Dla BUY/SELL bez rozpoznanego "x @ y" nie ruszamy cash (byłby śmieć).
        // CASH/DIV mają własne branchy w importBrokerTransactions — flaga tam
        // ignorowana.
        ...((!isCashType && !isDivType && !hasQtyPrice) ? { skipCashAdjust: true } : {}),
      });
    }
  }

  return { type: isClosedPositions ? 'closed_positions' : isCashOperations ? 'cash_operations' : 'unknown', transactions, errors };
}

export function parseBrokerCsv(text, accountCurrency) {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return { type: 'unknown', transactions: [], error: 'bi_too_few_rows' };
  const sep = detectSep(lines[4]);
  const rows = lines.map(l => splitRow(l, sep));
  return parseBrokerRows(rows, accountCurrency);
}

export async function parseBrokerXlsx(file, accountCurrency) {
  const allResults = [];
  for (const { name: sheetName, rows } of await readSheets(file)) {
    if (rows.length < 5) continue;
    const result = parseBrokerRows(rows, accountCurrency);
    if (result.type !== 'unknown' || result.transactions.length > 0) {
      allResults.push({ sheetName, ...result });
    }
  }
  if (!allResults.length) return [{ type: 'unknown', transactions: [], errors: [], error: 'bi_no_data_sheets' }];
  return allResults;
}

// ── Portfolio preview ─────────────────────────────────────────────────────────

export function computePortfolioPreview(txs, holdings, cash) {
  function baseSymbol(sym) {
    return String(sym).replace(/\.(WA|PL|US|UK|DE|FR|NL|IT|ES|SE|DK|NO|FI|BE|AT|CH)$/i, '').toUpperCase();
  }
  let h = holdings.map(x => ({ ...x }));
  let c = { ...cash };
  const sorted = [...txs].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const affectsCash = tx => !tx.fromClosedPosition && !tx.skipCashAdjust && !tx.fromSnapshot;
  for (const tx of sorted) {
    const cur = tx.currency || 'PLN';

    if (tx.type === 'CASH') {
      c[cur] = (c[cur] ?? 0) + (Number(tx.price) || 0);
      continue;
    }
    if (tx.type === 'DIV') {
      c[cur] = (c[cur] ?? 0) + Math.abs(Number(tx.price) || 0);
      continue;
    }
    if (!tx.qty || tx.qty <= 0) continue;

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
      if (affectsCash(tx)) {
        c[cur] = (c[cur] ?? 0) - tx.qty * tx.price;
      }
    } else if (tx.type === 'SELL') {
      if (idx >= 0) {
        const qty = h[idx].qty - tx.qty;
        if (qty <= 0) h.splice(idx, 1); else h[idx] = { ...h[idx], qty };
      }
      if (affectsCash(tx)) {
        c[cur] = (c[cur] ?? 0) + tx.qty * tx.price;
      }
    }
  }
  const oldMap = Object.fromEntries(holdings.map(x => [x.symbol, x]));
  const newMap = Object.fromEntries(h.map(x => [x.symbol, x]));
  const cashAdded = {};
  const cashRemoved = {};
  for (const [cur, val] of Object.entries(c)) {
    const diff = val - (cash[cur] ?? 0);
    if (diff > 0.01) cashAdded[cur] = diff;
    else if (diff < -0.01) cashRemoved[cur] = -diff;
  }
  return {
    added:    h.filter(x => !oldMap[x.symbol]),
    removed:  holdings.filter(x => !newMap[x.symbol]),
    modified: h.filter(x => oldMap[x.symbol] && Math.abs(x.qty - oldMap[x.symbol].qty) > 0.001)
               .map(x => ({ ...x, oldQty: oldMap[x.symbol].qty })),
    cashAdded,
    cashRemoved,
  };
}
