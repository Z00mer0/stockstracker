# Wskaźniki Extended — Design Spec
_Date: 2026-05-31_

## Summary

Extend the Wskaźniki tab in StockDetailModal with four new feature groups:
1. **Fair Value + Upside %** — analyst target upside and simple 5Y DCF fair value per share
2. **Executive Summary (AI)** — richer AI prompt replacing the existing short summary
3. **EPS Revisions + Revenue Forecast** — analyst estimate trends (30d) and next-year revenue forecast
4. **Dividend Growth Streak** — consecutive years of dividend growth

All changes are additive to existing `KeyStatsTab.jsx` and the `/api/financials/keystats` backend endpoint. No new tables required.

---

## Backend — `/api/financials/keystats`

### New fields in response

| Field | Source | Notes |
|---|---|---|
| `epsRevisionsUp30d` | Yahoo Finance `earningsTrend` | Upward EPS revisions last 30 days (annual period) |
| `epsRevisionsDown30d` | Yahoo Finance `earningsTrend` | Downward EPS revisions last 30 days (annual period) |
| `forwardRevenueEstimate` | Yahoo Finance `earningsTrend` | Next-year revenue avg estimate |
| `dividendGrowthStreak` | Finnhub `dividend2` | Consecutive years of growing annual dividends |
| `dcfFairValue` | Computed in server.py | DCF estimated fair value per share (same currency as price) |

### EPS Revisions + Revenue Forecast

Add `earningsTrend` to the existing YF quoteSummary call in step 3:

```
modules: 'defaultKeyStatistics,calendarEvents,financialData,earningsTrend'
```

From `earningsTrend.trend`, find the entry with `period == '0y'` (current fiscal year). Extract:
- `epsRevisions.upLast30days.raw` → `epsRevisionsUp30d`
- `epsRevisions.downLast30days.raw` → `epsRevisionsDown30d`
- `revenueEstimate.avg.raw` → `forwardRevenueEstimate`

If the `0y` period is not available, fall back to `+1y`. Use `setdefault()` to avoid overwriting existing values. Entire block wrapped in try/except — failure is non-fatal.

### Dividend Growth Streak

In the Finnhub block (step 1), after existing metric fetch, add a second Finnhub call:

```
GET https://finnhub.io/api/v1/stock/dividend2?symbol={symbol}&token={token}
```

Response contains a `data` list with objects having `year` and `amount` fields. Algorithm:
1. Group by year, sum amounts per year
2. Sort years descending
3. Count consecutive years where `amount[year] > amount[year-1]`
4. Set `dividendGrowthStreak` if streak ≥ 1, else `0`

Non-fatal. Returns `null` for stocks with no dividend history (e.g. most .WA stocks).

### DCF Fair Value

Computed in the keystats handler after step 2 (DB financials) using already-available fields:
- `ttmFcf`, `revenueGrowthYoY`, `sharesOutstanding`, `totalDebt`, `cashAndEquivalents`

Formula — simple 5-year explicit DCF:

```python
def _dcf_fair_value(fcf_ttm, growth_rate, shares, total_debt, cash,
                    discount_rate=0.10, terminal_growth=0.03, years=5):
    if fcf_ttm is None or fcf_ttm <= 0 or not shares:
        return None
    g = min(max(growth_rate or 0, 0.0), 0.20)   # cap 0–20%
    net_debt = (total_debt or 0) - (cash or 0)

    pv = 0
    fcf = fcf_ttm
    for i in range(1, years + 1):
        fcf *= (1 + g)
        pv += fcf / (1 + discount_rate) ** i

    # Terminal value (Gordon Growth Model)
    tv = fcf * (1 + terminal_growth) / (discount_rate - terminal_growth)
    pv += tv / (1 + discount_rate) ** years

    equity_value = pv - net_debt
    if equity_value <= 0:
        return None
    return equity_value / shares
```

Called after step 2 with `out.get(...)` fields. Result stored as `out['dcfFairValue']`. No DB caching — computation is fast.

---

## Backend — `/api/financials/summary`

### Extended prompt

Pass additional data to the AI prompt when available:
- Analyst target price + upside %
- Recommendation key (translated to PL: buy/hold/sell)
- Forward revenue estimate
- EPS revisions (↑N ↓M)
- DCF fair value (if available)

New prompt template (5–6 sentences, no bullets, no headers, Polish):

```
Analiza finansowa spółki {symbol} (dane TTM/ostatni kwartał):
- Przychody TTM: {revenue}
- Zysk netto TTM: {netIncome}
- Marża netto: {netMargin}%
- Marża EBITDA: {ebitdaMargin}% (jeśli dostępna)
- FCF TTM: {fcf}
- Wzrost przychodów r/r: {revGrowth}%
- Wartość księgowa/akcję: {bookPerShare}
- Dług netto: {netDebt}
- Cel analityków (śr.): {targetPrice} ({upside}% potencjał)
- Rekomendacja: {recommendation}
- Prognoza przychodów nast. rok: {fwdRevenue} (jeśli dostępna)
- Rewizje EPS 30d: ↑{epsUp} ↓{epsDown} (jeśli dostępne)
- Wycena DCF: {dcf} (jeśli dostępna)

Napisz po polsku podsumowanie (5-6 zdań) w stylu raportu analitycznego:
opisz czym jest spółka i jej pozycję rynkową, kluczowe wyniki i trendy,
perspektywy wzrostu i wycenę vs. rynek, główne ryzyka lub szanse.
Nie używaj nagłówków ani wypunktowań. Bądź konkretny i obiektywny.
```

Max tokens increased from 350 → 600. Same 7-day cache, same endpoint.

To provide the additional data, the summary endpoint needs to fetch a subset of keystats data (targets, recommendation, EPS revisions). Simplest approach: re-use the existing YF quoteSummary call inline within the summary endpoint for `financialData,earningsTrend`.

---

## Frontend — `KeyStatsTab.jsx`

### New rows in existing sections

**Sekcja "Wycena"** — append after existing rows:
- EPS Revisions: `↑{epsRevisionsUp30d} ↓{epsRevisionsDown30d}` (30d) — shown only if either value > 0
- Prognoza przychodów (nast. rok): `fmtLarge(forwardRevenueEstimate)` — same color logic as TTM revenue

**Sekcja "Dywidenda"** — append:
- Wzrost dywidendy z rzędu: `{N} lat` — shown if `dividendGrowthStreak >= 1`; `0 lat` if streak is 0 and dividend exists

### New section: "Wycena Fundamentalna"

Inserted after "Analitycy" section. Shown if either `targetMeanPrice` or `dcfFairValue` is available.

```
WYCENA FUNDAMENTALNA
────────────────────────────────────────────
Cel analityków (śr.)    zł39.98   +29.8% ▲
Wycena DCF              zł43.50   +41.2% ▲
────────────────────────────────────────────
ⓘ DCF: 5Y, dysk. 10%, wzrost hist., term. 3%
```

Layout: two-column `Row` variant with label, value, and colored upside badge.

Upside % calculation: `(fairValue - livePrice) / livePrice * 100`
- Green (`#10b981`) when > 0
- Red (`#f43f5e`) when < 0

Disclaimer line: `fontSize: 10, color: var(--text-faint)` below the section.

DCF row shown only if `dcfFairValue != null`.  
Analyst target row shown only if `targetMeanPrice != null`.

### AI Summary section

No UI change — same button, same placement. Enhanced text output automatically when cached summary regenerates.

---

## Error Handling

All new data fetches (earningsTrend, dividend2) are non-fatal:
- Wrapped in try/except in server.py
- Missing fields return as `null` in JSON
- Frontend shows `—` for null values via existing `fmt()` helper
- DCF returns null (not shown) if FCF ≤ 0 or negative equity value

---

## Out of Scope

- No new DB tables
- No new API endpoints
- No changes to FinancialsTab.jsx, StockDetailModal.jsx, or other components
- No redesign of existing sections
- No caching of DCF value in DB
