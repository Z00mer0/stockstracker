# Wskaźniki Extended Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Fair Value (DCF), EPS Revisions, Revenue Forecast, Dividend Growth Streak, and enhanced AI Executive Summary to the Wskaźniki tab in StockDetailModal.

**Architecture:** All new data is appended to the existing `/api/financials/keystats` endpoint as best-effort fields (non-fatal if unavailable). DCF is computed server-side using TTM financials already collected in step 2. The `/api/financials/summary` prompt is extended with analyst data fetched from Yahoo Finance. Frontend receives all new fields in the existing `raw` state object — no new state, no new API calls from the frontend.

**Tech Stack:** Python stdlib HTTP (server.py), React 18 + Vite (KeyStatsTab.jsx), Yahoo Finance quoteSummary (earningsTrend module), Finnhub dividend2 API, Anthropic Claude Haiku.

---

## Files

| File | Change |
|---|---|
| `server.py` | Add `_dcf_fair_value()` helper; extend keystats endpoint (Finnhub div2, YF earningsTrend, DCF wire-in); extend summary endpoint prompt |
| `frontend-react/src/components/KeyStatsTab.jsx` | Add EPS revisions + forward revenue rows, dividend streak row, new "Wycena Fundamentalna" section |

---

### Task 1: Add `_dcf_fair_value` helper to server.py

**Files:**
- Modify: `server.py` (before line 243, `def _normalize_financials`)

- [ ] **Step 1: Insert DCF helper function**

In `server.py`, find the line:
```python
def _normalize_financials(result, period):
```

Insert the following block immediately before it (two blank lines before):

```python
def _dcf_fair_value(fcf_ttm, growth_rate, shares,
                    total_debt=None, cash=None,
                    discount_rate=0.10, terminal_growth=0.03, years=5):
    if not fcf_ttm or fcf_ttm <= 0 or not shares or shares <= 0:
        return None
    g = min(max(growth_rate or 0.0, 0.0), 0.20)
    net_debt = (total_debt or 0) - (cash or 0)
    pv, fcf = 0.0, float(fcf_ttm)
    for i in range(1, years + 1):
        fcf *= (1 + g)
        pv += fcf / (1 + discount_rate) ** i
    tv = fcf * (1 + terminal_growth) / (discount_rate - terminal_growth)
    pv += tv / (1 + discount_rate) ** years
    equity = pv - net_debt
    return equity / shares if equity > 0 else None
```

- [ ] **Step 2: Verify syntax**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 -c "import py_compile; py_compile.compile('server.py', doraise=True)" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Quick sanity check of the function**

```bash
python3 -c "
import sys; sys.path.insert(0, '/Users/adamgorski/Desktop/ClaudeCode')
from server import _dcf_fair_value
# 1B FCF, 10% growth, 100M shares, no debt → should be ~17
result = _dcf_fair_value(1e9, 0.10, 1e8, 0, 0)
assert result is not None and 10 < result < 30, f'unexpected: {result}'
# Negative FCF → None
assert _dcf_fair_value(-1e9, 0.10, 1e8) is None
print(f'DCF sanity OK: {result:.2f}')
"
```

Expected: `DCF sanity OK: 17.xx` (exact value ~17-20)

- [ ] **Step 4: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git add server.py && git commit -m "feat(keystats): add _dcf_fair_value helper (5Y DCF, 10% discount, terminal 3%)"
```

---

### Task 2: Add Dividend Growth Streak (Finnhub dividend2)

**Files:**
- Modify: `server.py` (~line 1030, inside the `if fh_token:` block)

- [ ] **Step 1: Add dividend2 call after the existing Finnhub metrics try/except**

In `server.py`, find this exact line (end of the existing Finnhub try/except):
```python
                    print(f'[keystats/finnhub] {symbol}: {e}')
```

Immediately after that line (still inside `if fh_token:`), add:

```python
            try:
                div_url = (f'https://finnhub.io/api/v1/stock/dividend2?symbol='
                           f'{urllib.parse.quote(symbol)}&token={fh_token}')
                req = urllib.request.Request(div_url, headers={'User-Agent': _YF_UA})
                with urllib.request.urlopen(req, timeout=10) as r:
                    div_data = json.loads(r.read()).get('data', [])
                annual_div: dict = {}
                for d in div_data:
                    yr = d.get('year')
                    if yr:
                        annual_div[yr] = annual_div.get(yr, 0) + (d.get('amount') or 0)
                years_desc = sorted(annual_div.keys(), reverse=True)
                streak = 0
                for i in range(len(years_desc) - 1):
                    if annual_div[years_desc[i]] > annual_div[years_desc[i + 1]]:
                        streak += 1
                    else:
                        break
                out['dividendGrowthStreak'] = streak
            except Exception as e:
                print(f'[keystats/finnhub/div2] {symbol}: {e}')
```

- [ ] **Step 2: Verify syntax**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 -c "import py_compile; py_compile.compile('server.py', doraise=True)" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server.py && git commit -m "feat(keystats): add dividend growth streak from Finnhub dividend2"
```

---

### Task 3: Wire DCF into keystats response

**Files:**
- Modify: `server.py` (~line 1081, between step 2 DB block and step 3 YF block)

- [ ] **Step 1: Add DCF computation after the DB block**

In `server.py`, find this exact line (end of DB try/except):
```python
                print(f'[keystats/db] {symbol}: {e}')
```

Immediately after it (before the `# 3. Best-effort Yahoo Finance` comment), add:

```python
            # DCF fair value computed from step-2 data
            out['dcfFairValue'] = _dcf_fair_value(
                fcf_ttm=out.get('ttmFcf'),
                growth_rate=out.get('revenueGrowthYoY'),
                shares=out.get('sharesOutstanding'),
                total_debt=out.get('totalDebt'),
                cash=out.get('cashAndEquivalents'),
            )
```

- [ ] **Step 2: Verify syntax**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 -c "import py_compile; py_compile.compile('server.py', doraise=True)" && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add server.py && git commit -m "feat(keystats): compute DCF fair value per share and include in response"
```

---

### Task 4: Add EPS Revisions + Revenue Forecast (Yahoo Finance earningsTrend)

**Files:**
- Modify: `server.py` (~line 1085, keystats step 3 YF block)

- [ ] **Step 1: Extend YF modules string to include earningsTrend**

In `server.py`, find:
```python
                result = _yf_quotesummary(symbol,
                    'defaultKeyStatistics,calendarEvents,financialData')
```

Replace with:
```python
                result = _yf_quotesummary(symbol,
                    'defaultKeyStatistics,calendarEvents,financialData,earningsTrend')
```

- [ ] **Step 2: Extract EPS revisions and forward revenue from earningsTrend**

In the same `if result:` block, find the `for ed in eds:` loop's closing `break` line. After that loop (before the `except Exception as e:` of step 3), add:

```python
                    et = result.get('earningsTrend', {})
                    trend = et.get('trend', [])
                    annual = next(
                        (t for t in trend if t.get('period') in ('0y', '+1y')), None
                    )
                    if annual:
                        er = annual.get('epsRevisions', {})
                        def _rv(d, k):
                            v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                        out.setdefault('epsRevisionsUp30d',      _rv(er, 'upLast30days'))
                        out.setdefault('epsRevisionsDown30d',    _rv(er, 'downLast30days'))
                        re_ = annual.get('revenueEstimate', {})
                        out.setdefault('forwardRevenueEstimate', _rv(re_, 'avg'))
```

- [ ] **Step 3: Verify syntax**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 -c "import py_compile; py_compile.compile('server.py', doraise=True)" && echo "OK"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add server.py && git commit -m "feat(keystats): add EPS revisions 30d and forward revenue estimate from earningsTrend"
```

---

### Task 5: Extend summary endpoint — richer AI prompt

**Files:**
- Modify: `server.py` (summary endpoint, ~lines 1183–1215)

- [ ] **Step 1: Add YF fetch for analyst + estimates data after the DB block in summary endpoint**

In the summary endpoint, find:
```python
            lines = [f'Analiza finansowa spółki {symbol} (dane TTM/ostatni kwartał):']
```

Immediately before it, insert:

```python
            # Best-effort: fetch analyst targets + forward estimates for richer prompt
            try:
                yf_res = _yf_quotesummary(symbol, 'financialData,earningsTrend')
                if yf_res:
                    def _gv2(d, k):
                        v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                    fd2 = yf_res.get('financialData', {})
                    m['targetPrice'] = _gv2(fd2, 'targetMeanPrice')
                    m['recKey']      = fd2.get('recommendationKey')
                    trend2 = yf_res.get('earningsTrend', {}).get('trend', [])
                    ann2   = next((t for t in trend2 if t.get('period') in ('0y', '+1y')), None)
                    if ann2:
                        def _rv3(d, k):
                            v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                        er2 = ann2.get('epsRevisions', {})
                        m['epsUp']      = _rv3(er2, 'upLast30days')
                        m['epsDown']    = _rv3(er2, 'downLast30days')
                        m['fwdRevenue'] = _rv3(ann2.get('revenueEstimate', {}), 'avg')
            except Exception:
                pass
```

- [ ] **Step 2: Replace lines[] construction and prompt string**

Find this entire block (lines 1183–1204):
```python
            lines = [f'Analiza finansowa spółki {symbol} (dane TTM/ostatni kwartał):']
            if m.get('revenue'):    lines.append(f'- Przychody TTM: {_b(m["revenue"])}')
            if m.get('netIncome'):  lines.append(f'- Zysk netto TTM: {_b(m["netIncome"])}')
            if m.get('revenue') and m.get('netIncome'):
                lines.append(f'- Marża netto: {m["netIncome"]/m["revenue"]*100:.1f}%')
            if m.get('ebitda') and m.get('revenue'):
                lines.append(f'- Marża EBITDA: {m["ebitda"]/m["revenue"]*100:.1f}%')
            if m.get('fcf'):        lines.append(f'- FCF TTM: {_b(m["fcf"])}')
            if m.get('revGrowth') is not None:
                lines.append(f'- Wzrost przychodów r/r: {m["revGrowth"]*100:.1f}%')
            if m.get('equity') and m.get('shares'):
                lines.append(f'- Wartość księgowa/akcję: {m["equity"]/m["shares"]:.2f}')
            if m.get('totalDebt') and m.get('cash'):
                lines.append(f'- Dług netto: {_b(m["totalDebt"] - m["cash"])}')

            if len(lines) == 1:
                self.send_json(422, {'error': 'no financial data — load financials first'}); return

            prompt = '\n'.join(lines) + (
                '\n\nNapisz po polsku krótkie (3-4 zdania) obiektywne podsumowanie kondycji finansowej tej spółki. '
                'Skup się na rentowności, wzroście i przepływach pieniężnych. Nie używaj nagłówków ani wypunktowań.'
            )
```

Replace with:

```python
            _rec_pl = {
                'strong_buy': 'Silne kupno', 'buy': 'Kupno', 'hold': 'Trzymaj',
                'underperform': 'Sprzedaj', 'sell': 'Silna sprzedaż',
            }
            lines = [f'Analiza finansowa spółki {symbol} (dane TTM/ostatni kwartał):']
            if m.get('revenue'):    lines.append(f'- Przychody TTM: {_b(m["revenue"])}')
            if m.get('netIncome'):  lines.append(f'- Zysk netto TTM: {_b(m["netIncome"])}')
            if m.get('revenue') and m.get('netIncome'):
                lines.append(f'- Marża netto: {m["netIncome"]/m["revenue"]*100:.1f}%')
            if m.get('ebitda') and m.get('revenue'):
                lines.append(f'- Marża EBITDA: {m["ebitda"]/m["revenue"]*100:.1f}%')
            if m.get('fcf'):        lines.append(f'- FCF TTM: {_b(m["fcf"])}')
            if m.get('revGrowth') is not None:
                lines.append(f'- Wzrost przychodów r/r: {m["revGrowth"]*100:.1f}%')
            if m.get('equity') and m.get('shares'):
                lines.append(f'- Wartość księgowa/akcję: {m["equity"]/m["shares"]:.2f}')
            if m.get('totalDebt') and m.get('cash'):
                lines.append(f'- Dług netto: {_b(m["totalDebt"] - m["cash"])}')
            if m.get('targetPrice'):
                lines.append(f'- Cel analityków (śr.): {m["targetPrice"]:.2f}')
            if m.get('recKey'):
                lines.append(f'- Rekomendacja: {_rec_pl.get(m["recKey"].lower(), m["recKey"])}')
            if m.get('fwdRevenue'):
                lines.append(f'- Prognoza przychodów nast. rok: {_b(m["fwdRevenue"])}')
            if m.get('epsUp') is not None or m.get('epsDown') is not None:
                lines.append(f'- Rewizje EPS 30d: ↑{m.get("epsUp") or 0} ↓{m.get("epsDown") or 0}')
            dcf_val = _dcf_fair_value(
                fcf_ttm=m.get('fcf'), growth_rate=m.get('revGrowth'),
                shares=m.get('shares'), total_debt=m.get('totalDebt'), cash=m.get('cash'),
            )
            if dcf_val:
                lines.append(f'- Wycena DCF (szacowana): {dcf_val:.2f}')

            if len(lines) == 1:
                self.send_json(422, {'error': 'no financial data — load financials first'}); return

            prompt = '\n'.join(lines) + (
                '\n\nNapisz po polsku podsumowanie (5-6 zdań) w stylu raportu analitycznego. '
                'Opisz: (1) czym jest spółka i jej pozycję rynkową, (2) kluczowe wyniki i trendy finansowe, '
                '(3) perspektywy wzrostu i wycenę w odniesieniu do rynku, (4) główne ryzyka lub szanse. '
                'Nie używaj nagłówków ani wypunktowań. Bądź konkretny i obiektywny.'
            )
```

- [ ] **Step 3: Increase max_tokens in the Anthropic call**

Find:
```python
                    max_tokens=350,
```

Replace with:
```python
                    max_tokens=600,
```

- [ ] **Step 4: Verify syntax**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && python3 -c "import py_compile; py_compile.compile('server.py', doraise=True)" && echo "OK"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add server.py && git commit -m "feat(summary): extend AI executive summary — analyst data, forward estimates, DCF, richer prompt"
```

---

### Task 6: Frontend — EPS Revisions + Forward Revenue rows

**Files:**
- Modify: `frontend-react/src/components/KeyStatsTab.jsx`

- [ ] **Step 1: Add EPS revisions and forward revenue rows to Wycena section**

In [KeyStatsTab.jsx](frontend-react/src/components/KeyStatsTab.jsx), find the last row of the Wycena section:
```jsx
          {liveEV           != null && <Row label="EV"           value={fmtLarge(liveEV)} />}
```

Immediately after it (before the closing `</Section>`), add:

```jsx
          {(raw?.epsRevisionsUp30d != null || raw?.epsRevisionsDown30d != null) && (
            <Row
              label="Rewizje EPS (30d)"
              value={`↑${raw.epsRevisionsUp30d ?? 0} ↓${raw.epsRevisionsDown30d ?? 0}`}
              color={
                (raw.epsRevisionsUp30d ?? 0) > (raw.epsRevisionsDown30d ?? 0) ? '#10b981' :
                (raw.epsRevisionsDown30d ?? 0) > (raw.epsRevisionsUp30d ?? 0) ? '#f43f5e' :
                undefined
              }
            />
          )}
          {raw?.forwardRevenueEstimate != null && (
            <Row label="Prognoza przychodów (nast. rok)" value={fmtLarge(raw.forwardRevenueEstimate)} />
          )}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -15
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/KeyStatsTab.jsx && git commit -m "feat(wskazniki): add EPS revisions 30d and forward revenue forecast to Wycena section"
```

---

### Task 7: Frontend — Dividend Growth Streak row

**Files:**
- Modify: `frontend-react/src/components/KeyStatsTab.jsx`

- [ ] **Step 1: Add dividend streak row inside the Dywidenda section**

In [KeyStatsTab.jsx](frontend-react/src/components/KeyStatsTab.jsx), find:
```jsx
          {raw.dividendRate != null && <Row label="DPS" value={fmt(raw.dividendRate)} />}
```

Immediately after it (before the closing `</Section>` of the Dywidenda section), add:

```jsx
          {raw?.dividendGrowthStreak != null && raw?.dividendRate != null && (
            <Row
              label="Wzrost dywidendy z rzędu"
              value={raw.dividendGrowthStreak > 0 ? `${raw.dividendGrowthStreak} lat` : '0 lat'}
              color={raw.dividendGrowthStreak >= 5 ? '#10b981' : raw.dividendGrowthStreak >= 1 ? '#f59e0b' : undefined}
            />
          )}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend-react/src/components/KeyStatsTab.jsx && git commit -m "feat(wskazniki): add dividend growth streak row to Dywidenda section"
```

---

### Task 8: Frontend — Wycena Fundamentalna section

**Files:**
- Modify: `frontend-react/src/components/KeyStatsTab.jsx`

- [ ] **Step 1: Add upside % computed values**

In [KeyStatsTab.jsx](frontend-react/src/components/KeyStatsTab.jsx), find the line:
```jsx
  const rec = raw?.recommendationKey ? REC_LABEL[raw.recommendationKey.toLowerCase()] : null;
```

Immediately after it, add:

```jsx
  const analystUpside = livePrice && raw?.targetMeanPrice
    ? ((raw.targetMeanPrice - livePrice) / livePrice) * 100 : null;
  const dcfUpside = livePrice && raw?.dcfFairValue
    ? ((raw.dcfFairValue - livePrice) / livePrice) * 100 : null;
  const hasFundamentalValuation = analystUpside != null || dcfUpside != null;
```

- [ ] **Step 2: Add the "Wycena Fundamentalna" section after the Analitycy section**

Find the closing block of the Analitycy section:
```jsx
      )}
```

that comes after `{raw.nextEarningsDate != null && <Row label="Nast. wyniki" value={fmtDate(raw.nextEarningsDate)} />}`. Immediately after it, add:

```jsx
      {hasFundamentalValuation && (
        <Section title="Wycena Fundamentalna">
          {analystUpside != null && (
            <Row
              label="Cel analityków (śr.)"
              value={`${fmt(raw.targetMeanPrice, { decimals: 2 })}  ${analystUpside >= 0 ? '+' : ''}${analystUpside.toFixed(1)}% ${analystUpside >= 0 ? '▲' : '▼'}`}
              color={analystUpside >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
          {dcfUpside != null && (
            <Row
              label="Wycena DCF"
              value={`${fmt(raw.dcfFairValue, { decimals: 2 })}  ${dcfUpside >= 0 ? '+' : ''}${dcfUpside.toFixed(1)}% ${dcfUpside >= 0 ? '▲' : '▼'}`}
              color={dcfUpside >= 0 ? '#10b981' : '#f43f5e'}
            />
          )}
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
            DCF: 5Y, dysk. 10%, wzrost hist., term. 3%
          </div>
        </Section>
      )}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/components/KeyStatsTab.jsx && git commit -m "feat(wskazniki): add Wycena Fundamentalna section with analyst target and DCF upside %"
```

---

### Task 9: Deploy and smoke test

**Files:** none

- [ ] **Step 1: Push to GitHub (triggers Render backend redeploy)**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git push origin main
```

- [ ] **Step 2: Deploy frontend to Vercel**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && vercel --prod
```

Expected: `myfund-app.vercel.app` updated.

- [ ] **Step 3: Smoke test backend keystats endpoint**

After Render finishes deploying (check https://dashboard.render.com), run:

```bash
# Replace TOKEN with a valid myfund auth token from localStorage (browser DevTools → Application → myfund_auth_token)
curl -s "https://stockstracker.onrender.com/api/financials/keystats?symbol=AAPL" \
  -H "X-Auth-Token: TOKEN" | python3 -m json.tool | grep -E "dcfFairValue|epsRevisions|forwardRevenue|dividendGrowth"
```

Expected: at least `dcfFairValue` key present (may be null if no DB financials for AAPL). `epsRevisionsUp30d` and `forwardRevenueEstimate` present if YF earningsTrend is available.

- [ ] **Step 4: UI smoke test**

Open https://myfund-app.vercel.app → click a stock that has financial data loaded → Wskaźniki tab. Verify:
- "Rewizje EPS (30d)" row visible in Wycena section (e.g. for AAPL)
- "Prognoza przychodów (nast. rok)" row visible
- "Wycena Fundamentalna" section visible with upside % in green/red
- "DCF" row shows a value (if stock has TTM FCF data in DB)
- For dividend stocks: "Wzrost dywidendy z rzędu" shows years count
- "Generuj podsumowanie" → produces 5-6 sentence executive-style text
