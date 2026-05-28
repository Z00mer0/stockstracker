# Financials Tab — Design Spec
_Date: 2026-05-28_

## Summary

Add a "Finanse" tab to `StockDetailModal` showing income statement, balance sheet, cash flow, and valuation metrics. Data comes from Yahoo Finance (auto) or user-uploaded screenshots parsed by Claude Vision (manual fallback for Polish stocks or richer data).

---

## UI

### Location
New third tab in `StockDetailModal`: Wykres | Pozycja | **Finanse**

### Controls row
- Period toggle: **Kwartalne** / Roczne (pill switcher, same style as chart period buttons)
- Source badge: "Yahoo Finance · Q2 2025" (text-faint)
- "📎 Importuj screen" button (panel-2 bg, border, text-dim)

### Accordions (4 sections)

**1. Rachunek Zysków i Strat** — default open, unit: mln USD
| Wiersz | Sub-row |
|--------|---------|
| Przychody | Wzrost r/r (up/down color) |
| Zysk brutto | Marża brutto % |
| Koszty operacyjne | — |
| Zysk operacyjny | — |
| EBITDA | Marża EBITDA % |
| Zysk netto | — |
| Dług netto | note: ujemny = cash netto |

Columns: last 4 quarters (or 4 years for annual). Newest column bold.

**2. Bilans** — default collapsed
Rows: Aktywa ogółem, Zobowiązania ogółem, Kapitał własny, Gotówka i ekwiwalenty, Dług całkowity

**3. Przepływy pieniężne** — default collapsed
Rows: CFO (z działalności oper.), CAPEX, FCF (= CFO − CAPEX), Skup akcji własnych

**4. Wycena** — default open, grid 2×3 cards
Cards: P/E (+ forward P/E), EV/EBITDA (+ EV label), P/S (+ TTM revenue), P/FCF (+ TTM FCF), EqV / Market Cap (+ shares count), EV (= EqV + dług netto)

Valuation cards use current price from existing portfolio/watchlist price data. EV = EqV + net debt.

---

## Data

### Source 1 — Yahoo Finance (auto)
New Vercel serverless `api/financials.js`:
```
GET /api/financials?symbol=PLTR&period=quarterly
```
Calls Yahoo Finance v10/finance/quoteSummary with modules:
- `incomeStatementHistoryQuarterly` / `incomeStatementHistory`
- `balanceSheetHistoryQuarterly` / `balanceSheetHistory`
- `cashflowStatementHistoryQuarterly` / `cashflowStatementHistory`
- `defaultKeyStatistics` (P/E, EV, shares)
- `summaryDetail` (market cap, P/S)

Returns normalised JSON: `{ quarterly: [...], annual: [...], valuation: {...} }`

Cache: `Cache-Control: s-maxage=86400` (1 day on Vercel CDN; user re-opens tab at most daily)

### Source 2 — Screenshot import (manual)
Backend endpoint `POST /api/financials/upload`:
1. Accept multipart image (or base64 JSON body)
2. Call Anthropic Claude Vision API with prompt: parse financial table → structured JSON matching same schema
3. Store result in SQLite `financials` table with `source='screenshot'`, TTL 90 days
4. Return parsed JSON to frontend

### Storage — SQLite (backend)
```sql
CREATE TABLE financials (
  id         INTEGER PRIMARY KEY,
  symbol     TEXT NOT NULL,
  period     TEXT NOT NULL,  -- 'quarterly' | 'annual'
  data_json  TEXT NOT NULL,
  source     TEXT NOT NULL,  -- 'yahoo' | 'screenshot'
  fetched_at TEXT NOT NULL   -- ISO8601
);
CREATE UNIQUE INDEX financials_sym_period ON financials(symbol, period);
```

TTL: 90 days. Frontend checks `fetched_at`; if stale → re-fetch from Yahoo or prompt user to re-upload screenshot.

### Data priority
1. Backend cache (if < 90 days old) → use it
2. No cache → call `api/financials.js` (Yahoo)
3. Yahoo returns empty / symbol not found → show "Brak danych — importuj screenshot" prompt
4. User uploads screenshot → parse → store → display

---

## Components

### New: `FinancialsTab.jsx`
Props: `{ symbol, currentPrice }`
(shares outstanding comes from Yahoo `defaultKeyStatistics`, not portfolio)

State:
- `period` — `'quarterly' | 'annual'`
- `data` — `{ quarterly, annual, valuation } | null`
- `loading`, `error`
- `uploadOpen` — bool (show/hide upload panel)
- `openSections` — Set of open accordion keys

Endpoint convention (matching rest of app):
- Vercel serverless: `GET /api/financials?symbol=…` — Yahoo Finance proxy, CDN-cached 1 day
- Render backend: `GET  $BACKEND_URL/api/financials?symbol=…` — SQLite cache read
- Render backend: `POST $BACKEND_URL/api/financials/upload` — screenshot parse + store

Logic:
1. On mount: `GET $BACKEND_URL/api/financials?symbol=…` (backend cache check)
2. If 404: `GET /api/financials?symbol=…` (Yahoo via Vercel), store result in backend via `POST …/upload` with `source='yahoo'`
3. If Yahoo empty → set `error='no_data'` → show upload hint prominently
4. Upload flow: file input or paste (clipboard API) → `POST $BACKEND_URL/api/financials/upload` → update `data`

### Modified: `StockDetailModal.jsx`
- Add `'finanse'` to tabs array
- Render `<FinancialsTab symbol={item.symbol} currentPrice={price} />` when active tab === 'finanse'
- Lazy: only mount when tab is first opened (avoid fetch on modal open)

---

## Backend changes

### `backend/routes/financials.py` (new)
- `GET /api/financials` — read from SQLite by symbol+period, return JSON or 404
- `POST /api/financials/upload` — accepts `{ symbol, period, image_b64 }` or multipart; calls Claude Vision API (requires `ANTHROPIC_API_KEY` env var on Render); writes parsed JSON to SQLite; returns data

### `backend/db.py`
- Add `init_financials_table()` called on app start

### `backend/server.py`
- Register `financials_bp`

---

## Error states
- Loading: spinner (same as rest of app)
- Yahoo miss: blue info box "Brak danych z Yahoo Finance — wrzuć screenshot z InvestingPro lub innego źródła"
- Upload error: red inline error below upload button
- Parse failure: "Nie udało się odczytać tabeli — spróbuj z wyraźniejszym screenshotem"

---

## Out of scope
- Automatic screenshot scheduled re-fetch
- Comparing multiple companies side-by-side
- Analyst estimates / consensus
- Charts/sparklines for historical metrics (possible future addition)
