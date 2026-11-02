// Import danych brokera (XTB): arkusze Closed Positions i Cash Operations
// (CSV lub XLSX) oraz podgląd zmian w portfelu. Wydzielone z
// BrokerImportModal, żeby dało się je przetestować.
//
// Kwoty w Cash Operations (kolumna Amount) są w walucie RACHUNKU, a cena
// w komentarzu („OPEN BUY 2 @ 180.00") w walucie instrumentu. Na rachunku
// złotówkowym zakup akcji z USA zdejmuje złotówki, dywidenda z USA wpływa
// w złotówkach, a podatek u źródła to osobny wiersz „Withholding tax".
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

// Godzina z „12.04.2024 13:01:45" (albo z daty Excela) — do sortowania.
function timeOf(val) {
  if (typeof val === 'number') return String(Math.round((val % 1) * 86400)).padStart(5, '0');
  const m = String(val ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3] ?? '00'}` : '';
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

// Typ wiersza Cash Operations → rodzaj operacji. Nazwy z eksportu xStation:
// starsze „Stock purchase / Stock sale", nowsze „Stocks/ETF purchase / sale",
// „Dividend" (dawniej „DIVIDENT"), „Withholding tax", „Free funds interests"
// (+ „… tax"), „SEC fee", „Swap", „Commission", „Profit/Loss (FX/CFD)",
// „Deposit", „Withdrawal", „Transfer". Null — nierozpoznany, pomijany.
export function cashKind(opType, amount = 0) {
  const t = String(opType).toLowerCase();
  if (t.includes('withholding')) return 'wht';
  if (t.includes('interest')) return t.includes('tax') ? 'tax' : 'interest';
  if (t.includes('dividend') || t.includes('divident') || t.includes('spin off')) return amount < 0 ? 'fee' : 'DIV';
  if (t.includes('purchase') || t.includes('buy')) return 'BUY';
  if (t.includes('sale') || t.includes('sell')) return 'SELL';
  if (t.includes('deposit') || t.includes('withdrawal') || t.includes('transfer')) return 'deposit';
  if (t.includes('fee') || t.includes('commission') || t.includes('swap') || t.includes('stamp') || t.includes('tax')) return 'fee';
  if (t.includes('profit/loss')) return 'cfd';
  return null;
}

// ── Core parser ───────────────────────────────────────────────────────────────

// accountCurrency — waluta rachunku (portfela docelowego) dla wpłat i wypłat,
// które nie mają symbolu. Wcześniej trafiały zawsze do USD, więc 5000 zł
// wpłaty na rachunek złotówkowy liczyło się jak 5000 $.
export function parseBrokerRows(rows, accountCurrency) {
  // Nagłówek szukamy po treści (kolumna „type" i „amount" albo „volume"):
  // eksport XLSX ma nad tabelą dane rachunku, CSV z xStation zaczyna się
  // od razu od nagłówka, a CSV traci puste wiersze przy wczytaniu.
  const lower = row => (row ?? []).map(h => String(h ?? '').toLowerCase().trim());
  const headerIdx = rows.findIndex((row, i) => i < 30 && lower(row).includes('type')
    && (lower(row).includes('amount') || lower(row).includes('volume')));
  if (headerIdx < 0 || rows.length < headerIdx + 2) return { type: 'unknown', transactions: [], errors: [], error: 'bi_too_few_rows' };
  const headers = lower(rows[headerIdx]);

  // Rodzaj arkusza po kolumnach, a napis nad tabelą („Closed positions",
  // „CASH OPERATION HISTORY") tylko pomocniczo — CSV często go nie ma.
  const above = rows.slice(0, headerIdx).flat().map(c => String(c ?? '').toLowerCase()).join(' ');
  const isCashOperations  = headers.includes('amount') && (headers.includes('comment') || above.includes('cash'));
  const isClosedPositions = !isCashOperations && (headers.includes('close price') || above.includes('closed'));

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
  const seen = new Set();
  const wht = [];
  const skipped = new Map();   // nierozpoznane typy operacji → liczba wierszy

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => c != null && c !== '')) continue;

    if (isClosedPositions) {
      const ticker     = col(row, 'ticker') || col(row, 'instrument') || col(row, 'symbol');
      const type       = col(row, 'type').toUpperCase();
      const qty        = parseFloat(col(row, 'volume'));
      const openPrice  = parseFloat(col(row, 'open price'));
      const closePrice = parseFloat(col(row, 'close price'));
      const openDate   = parseDate(colRaw(row, 'open time (utc)') ?? colRaw(row, 'open time'));
      const closeDate  = parseDate(colRaw(row, 'close time (utc)') ?? colRaw(row, 'close time'));
      const pl         = parseFloat(col(row, 'profit/loss') || col(row, 'gross p/l')) || 0;
      const positionId = col(row, 'position id') || col(row, 'position');

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
      // Ten sam wiersz (ID + typ + kwota) bywa w eksporcie dwa razy.
      const rowKey = `${positionId}|${opType}|${amount}`;
      if (positionId && seen.has(rowKey)) continue;
      seen.add(rowKey);

      const kind = cashKind(opType, amount);
      if (!kind) { skipped.set(opType, (skipped.get(opType) ?? 0) + 1); continue; }
      const date = parseDate(timeStr) || new Date().toISOString().slice(0, 10);
      const at = `${date} ${timeOf(timeStr)}`;

      // Podatek u źródła — dopinany do swojej dywidendy po pętli.
      if (kind === 'wht') { wht.push({ id: Number(positionId), symbol: ticker || instrument, time: timeStr, amount, date, comment }); continue; }

      // Odsetki, opłaty, podatek od odsetek, wynik CFD, przelew: tylko gotówka
      // rachunku. `kind` odróżnia je od wpłat (np. limit IKE liczy same wpłaty).
      if (kind !== 'BUY' && kind !== 'SELL' && kind !== 'DIV') {
        transactions.push({
          _at: at, id: genId(), type: 'CASH', symbol: '', qty: null, price: amount,
          currency: accountCurrency || brokerCurrency(ticker || instrument || ''),
          date, note: comment || opType, brokerPositionId: positionId || undefined,
          ...(kind !== 'deposit' ? { kind } : {}),
        });
        continue;
      }
      const txType = kind;

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
      const isDivType  = txType === 'DIV';
      const hasQtyPrice = qty != null && !isNaN(qty) && qty > 0;
      // Waluta rachunku dla kwot z kolumny Amount; bez niej — po sufiksie.
      const cashCurrency = accountCurrency || brokerCurrency(normalizedCashSym);

      // Semantyka pól per typ:
      // - DIV : qty=null, price = kwota brutto w walucie rachunku, tax = podatek u źródła
      // - BUY/SELL: qty i price z komentarza "BUY x @ y" (waluta instrumentu);
      //   gotówka zmienia się o cashAmount (Amount, waluta rachunku).
      //   Bez rozpoznanego "x @ y" — skipCashAdjust, żeby nie liczyć śmieciowej pary.
      transactions.push({
        _at: at,
        id: genId(),
        type: txType,
        symbol: normalizedCashSym,
        qty: isDivType ? null : (hasQtyPrice ? qty : Math.abs(amount)),
        price: isDivType ? Math.abs(amount) : price,
        currency: isDivType ? cashCurrency : brokerCurrency(normalizedCashSym),
        date,
        note: comment || opType,
        brokerPositionId: positionId || undefined,
        ...(isDivType ? { _time: timeStr, _id: Number(positionId) } : {}),
        ...(!isDivType && hasQtyPrice ? { cashAmount: amount, cashCurrency } : {}),
        ...((!isDivType && !hasQtyPrice) ? { skipCashAdjust: true } : {}),
      });
    }
  }

  // Podatek u źródła do dywidendy: XTB daje mu kolejne ID (dywidenda + 1),
  // awaryjnie — ten sam symbol i ta sama chwila. Bez pary zostaje jako
  // ruch gotówki, żeby saldo się zgadzało.
  for (const w of wht) {
    const divs = transactions.filter(t => t.type === 'DIV');
    const div = divs.find(d => d._id && d._id === w.id - 1 && d.symbol === normalizeSymbol(String(w.symbol).toUpperCase()))
      ?? divs.find(d => d._time === w.time && d.symbol === normalizeSymbol(String(w.symbol).toUpperCase()) && d.tax == null);
    if (div) div.tax = Math.max(0, +((div.tax ?? 0) - w.amount).toFixed(2));
    else transactions.push({ id: genId(), type: 'CASH', symbol: '', qty: null, price: w.amount, currency: accountCurrency || brokerCurrency(w.symbol), date: w.date, note: w.comment, kind: 'tax' });
  }
  // XTB wypisuje operacje od najnowszej, a zapis importu sortuje tylko po
  // dacie (stabilnie) — kupno i sprzedaż z jednego dnia szły w odwrotnej
  // kolejności i sprzedana pozycja zostawała w portfelu. Porządek
  // chronologiczny z godziną.
  if (isCashOperations) transactions.sort((a, b) => (a._at ?? '').localeCompare(b._at ?? ''));
  for (const t of transactions) { delete t._time; delete t._id; delete t._at; }

  return { type: isClosedPositions ? 'closed_positions' : isCashOperations ? 'cash_operations' : 'unknown', transactions, errors, skipped: [...skipped].map(([type, n]) => ({ type, n })) };
}

export function parseBrokerCsv(text, accountCurrency) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  // Separator z wiersza nagłówka — komentarze wpłat zawierają przecinki.
  const header = lines.slice(0, 30).find(l => /type/i.test(l) && /amount|volume/i.test(l));
  if (!header) return { type: 'unknown', transactions: [], error: 'bi_too_few_rows' };
  const sep = detectSep(header);
  const rows = lines.map(l => splitRow(l, sep));
  return parseBrokerRows(rows, accountCurrency);
}

export async function parseBrokerXlsx(file, accountCurrency) {
  const allResults = [];
  for (const { name: sheetName, rows } of await readSheets(file)) {
    if (rows.length < 2) continue;
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
      c[cur] = (c[cur] ?? 0) + Math.abs(Number(tx.price) || 0) - (Number(tx.tax) || 0);
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
        if (tx.cashAmount != null) c[tx.cashCurrency] = (c[tx.cashCurrency] ?? 0) + tx.cashAmount;
        else c[cur] = (c[cur] ?? 0) - tx.qty * tx.price;
      }
    } else if (tx.type === 'SELL') {
      if (idx >= 0) {
        const qty = h[idx].qty - tx.qty;
        if (qty <= 0) h.splice(idx, 1); else h[idx] = { ...h[idx], qty };
      }
      if (affectsCash(tx)) {
        if (tx.cashAmount != null) c[tx.cashCurrency] = (c[tx.cashCurrency] ?? 0) + tx.cashAmount;
        else c[cur] = (c[cur] ?? 0) + tx.qty * tx.price;
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
