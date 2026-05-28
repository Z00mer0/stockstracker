# Multi-Portfolio Design Spec
**Date:** 2026-05-28  
**Status:** Approved

## Summary

Add multi-portfolio support to StocksTracker. Each user can have multiple named portfolios with independent holdings, transactions, cash, and history. The dashboard can show a single portfolio or aggregate all. Designed to scale to many users (multi-tenant).

## Requirements

- Multiple portfolios per user, each with name and base currency
- Dashboard aggregates all portfolios OR shows a single selected portfolio
- Dashboard display currency = active portfolio's base currency (PLN when viewing "Wszystkie")
- All pages (Portfolio, Transakcje, Historia, Dywidendy) work in the context of the active portfolio
- Watchlist is per-user (shared across portfolios)
- Adding a transaction always targets the active portfolio (no extra dropdown)
- Existing user data auto-migrates to "Portfel domyślny" on first login after deploy
- Portfolio switcher lives in the left sidebar above the navigation

## Section 1: Data Model (PostgreSQL)

New tables replace the current `user_data` JSON blob:

```sql
CREATE TABLE portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- references users.username
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  avg_price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  UNIQUE(portfolio_id, symbol)
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- BUY, SELL, DIV, CASH
  symbol TEXT,
  qty NUMERIC,
  price NUMERIC,
  currency TEXT,
  date DATE NOT NULL,
  note TEXT,
  broker_position_id TEXT
);

CREATE TABLE snapshots (
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total NUMERIC,
  invested NUMERIC,
  PRIMARY KEY (portfolio_id, date)
);

CREATE TABLE cash_balances (
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  PRIMARY KEY (portfolio_id, currency)
);
```

Watchlist remains in the existing `user_data` blob (per-user, not per-portfolio).

## Section 2: API Endpoints

```
GET  /api/portfolios                  → [{id, name, currency}]
POST /api/portfolios                  → {name, currency} → {id, name, currency}
PUT  /api/portfolios/:id              → {name?, currency?} → updated portfolio
DEL  /api/portfolios/:id              → 204 (cascades to all child tables)

GET  /api/portfolios/:id/data         → {holdings, cash, transactions, snapshots}
POST /api/portfolios/:id/data         → save portfolio data (same shape)

GET  /api/portfolios/aggregate/data   → aggregated holdings/cash/snapshots across all portfolios
```

Response shape of `/api/portfolios/:id/data` is identical to the current `/api/data` response so AppContext changes are minimal:
```json
{
  "portfolio": { "holdings": [...] },
  "transactions": [...],
  "snapshots": { "2025-01-01": 35000 },
  "snapshotsInvested": { "2025-01-01": 33000 },
  "cash": { "PLN": 858.52 }
}
```

The aggregate endpoint returns the same shape with values summed/merged across portfolios (converted to PLN via FX).

Legacy `/api/data` (GET/POST) remains during migration transition — redirects to the default portfolio.

Unchanged endpoints: `/api/bench-pl`, `/api/proxy`, `/api/fx`, `/api/finnhub`, `/api/calendar`, `/api/login`, `/api/register`, etc.

## Section 3: Frontend

### AppContext changes

Two new state fields:
- `portfolios: []` — loaded once at login from `GET /api/portfolios`
- `activePortfolioId: string | 'all'` — persisted in localStorage (`myfund_active_portfolio`)

`fetchData()` calls:
- `activePortfolioId === 'all'` → `/api/portfolios/aggregate/data`
- otherwise → `/api/portfolios/:activePortfolioId/data`

All write functions (`saveHoldings`, `saveTransactions`, `addPosition`, `sellPosition`, etc.) target `/api/portfolios/:activePortfolioId/data`.

New portfolio CRUD functions: `createPortfolio(name, currency)`, `updatePortfolio(id, changes)`, `deletePortfolio(id)`.

### Sidebar

New "PORTFELE" section above existing navigation:

```
PORTFELE
  ✦ Wszystkie        (activePortfolioId === 'all')
    XTB · PLN
    IBKR · USD
  + Nowy portfel
```

Clicking any item sets `activePortfolioId` and triggers `fetchData()`. Active item highlighted with accent color.

### Dashboard

- Display currency = `activePortfolio.currency` (PLN when `activePortfolioId === 'all'`)
- All KPI cards convert values through existing FX rates (same as current)
- No structural changes to card layout

### Per-portfolio pages

Portfolio, Transakcje, Historia, Dywidendy — display data from `rawData` (already filtered by activePortfolioId via AppContext). No page-level changes needed beyond removing any hardcoded "all data" assumptions.

When `activePortfolioId === 'all'`:
- Portfolio page → shows aggregate holdings
- Transakcje → shows all transactions (merged, tagged with portfolio name)
- Historia → shows aggregate snapshots
- Dywidendy → shows all dividends

### New Portfolio Modal

Simple form: Name (text input) + Base currency (dropdown: PLN, USD, EUR, GBP). On save → `POST /api/portfolios` → refetch portfolio list → set active to new portfolio.

## Migration Strategy

**Lazy migration on first request** (no downtime, no manual steps):

On `GET /api/portfolios`:
1. Check if user has rows in `portfolios` table
2. If yes → return them normally
3. If no → check for old `user_data` blob
4. If blob exists → create "Portfel domyślny" with currency PLN, insert holdings/transactions/snapshots/cash from blob into new tables, return `[{id, name: "Portfel domyślny", currency: "PLN"}]`
5. If no blob either → return `[]` (new user)

Old `user_data` row is kept for 30 days as rollback safety, then can be cleaned up.

## Out of Scope

- Sharing portfolios between users
- Portfolio-level permissions
- Cross-portfolio performance comparison charts
- Portfolio reordering / drag-and-drop
