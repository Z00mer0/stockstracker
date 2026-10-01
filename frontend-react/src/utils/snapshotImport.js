// Import kwartalnego zestawienia XTB (PDF albo zdjęcie przez OCR): pozycje
// z wolumenem i wartością rynkową na dzień zestawienia. Wydzielone
// z SnapshotImportModal, żeby dało się je przetestować.
import { normalizeSymbol } from './brokerImport.js';

// ── Shared row-grouping helper ────────────────────────────────────────────────

// Groups flat list of {text, x, y} items into rows by Y proximity
export function groupIntoRows(items) {
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

export function parseRowsToResult(allRows) {
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

  // Cyfry w tickerze też bywają (VOW3.DE) — wcześniej takie pozycje
  // znikały z importu po cichu.
  const symRegex = /^[A-Z][A-Z0-9]{1,5}\.[A-Z]{2,3}$/;

  // Liczba z POCZĄTKU tekstu (musi zaczynać się cyfrą — odrzuca ISIN-y
  // „US00724F1012", symbole i słowa; „699.73 USD" → 699.73).
  // Separator tysięcy: spacja („1 050,00") albo przecinek przy kropce
  // dziesiętnej („1,050.00"). Wcześniej „1 050,00" dawało 1, więc pozycja
  // o wartości od 1000 wypadała z importu (wolumen ≥ wartość).
  function toNum(str) {
    const m = str.trim().match(/^\d{1,3}(?:[ \u00a0]\d{3})+(?:[.,]\d+)?|^\d{1,3}(?:,\d{3})+\.\d+|^\d{1,12}(?:[.,]\d+)?/);
    if (!m) return null;
    let t = m[0].replace(/[ \u00a0]/g, '');
    t = t.includes('.') ? t.replace(/,/g, '') : t.replace(',', '.');
    const n = parseFloat(t);
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

export async function parsePdf(buffer) {
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

export async function parseImage(file) {
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
