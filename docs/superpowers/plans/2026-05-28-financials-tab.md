# Financials Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Finanse" tab to `StockDetailModal` showing income statement, balance sheet, cash flow, and valuation metrics sourced from Yahoo Finance (auto) or user-uploaded screenshots parsed by Claude Vision.

**Architecture:** Backend (`server.py`) gains a `financials` PostgreSQL table, a Yahoo Finance fetch+normalize helper, `GET /api/financials` (cache-first then Yahoo), and `POST /api/financials/upload` (Claude Vision parse). Frontend gets a new `FinancialsTab.jsx` component and tab navigation added to `StockDetailModal.jsx`.

**Tech Stack:** Python stdlib `urllib.request`, `psycopg2`, `anthropic` SDK (Claude Vision), React 18, CSS custom properties (existing design tokens).

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `server.py` | Add `datetime` import, `financials` table in `_init_db()`, `_raw()` + `_quarter_label()` + `_normalize_financials()` + `_fetch_yahoo_financials()` helpers, `GET /api/financials` route, `POST /api/financials/upload` route |
| Modify | `requirements.txt` | Add `anthropic` |
| Create | `frontend-react/src/components/FinancialsTab.jsx` | Full financials tab: period toggle, 4 accordions, upload panel, error states |
| Modify | `frontend-react/src/components/StockDetailModal.jsx` | Add tab state + tab bar, wrap chart in "Wykres" tab, wrap buy form in "Pozycja" tab, lazily render `<FinancialsTab>` |

---

## Task 1: Add `financials` PostgreSQL table

**Files:**
- Modify: `server.py` (two edits: top-level import, `_init_db()`)

- [ ] **Step 1: Add `import datetime` at the top of server.py**

Current top-level imports end at line 19. Add `import datetime` after line 18:

```python
import datetime
```

Find this block (lines 7–19):
```python
import json
import hashlib
import bcrypt
import mimetypes
import re
import secrets
import socket
import os
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
```
Replace with:
```python
import json
import hashlib
import bcrypt
import datetime
import mimetypes
import re
import secrets
import socket
import os
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
```

- [ ] **Step 2: Add `financials` table to `_init_db()`**

In `server.py`, find the end of `_init_db()` (the last `cur.execute` block ends at the `portfolio_cash` table around line 233). Add after it:

```python
            cur.execute("""
                CREATE TABLE IF NOT EXISTS financials (
                    symbol     TEXT NOT NULL,
                    period     TEXT NOT NULL,
                    data_json  TEXT NOT NULL,
                    source     TEXT NOT NULL,
                    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (symbol, period)
                )""")
```

- [ ] **Step 3: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode
git add server.py
git commit -m "feat(financials): add financials table to _init_db and import datetime"
```
Expected: commit succeeds.

---

## Task 2: Add Yahoo Finance fetch + normalization helpers

**Files:**
- Modify: `server.py` (add helper functions near other `_fetch_*` helpers)

- [ ] **Step 1: Find the right location**

In `server.py`, find the `_fetch_bench_pl` function or similar `_fetch_*` helpers (around line 85–140). Add the new helpers after them, before the `_env` load block (line ~148).

- [ ] **Step 2: Add helpers**

Add the following block right before the line `# Load .env file if present`:

```python
def _raw(obj, key):
    """Extract raw numeric value from a Yahoo Finance field dict like {'raw': 1.18e9, 'fmt': '1.18B'}."""
    v = obj.get(key) if isinstance(obj, dict) else None
    if isinstance(v, dict):
        return v.get('raw')
    return None


def _quarter_label(ts):
    """Convert Unix timestamp to 'Q1 2025' label."""
    dt = datetime.datetime.utcfromtimestamp(ts)
    q  = (dt.month - 1) // 3 + 1
    return f'Q{q} {dt.year}'


def _normalize_financials(result, period):
    """Normalise raw Yahoo Finance quoteSummary result into the app's financials schema."""
    suffix      = 'Quarterly' if period == 'quarterly' else ''
    income_list = result.get(f'incomeStatementHistory{suffix}', {}).get('incomeStatementHistory', [])
    bs_list     = result.get(f'balanceSheetHistory{suffix}',    {}).get('balanceSheetStatements', [])
    cf_list     = result.get(f'cashflowStatementHistory{suffix}', {}).get('cashflowStatements', [])
    key_stats   = result.get('defaultKeyStatistics', {})
    summary     = result.get('summaryDetail', {})
    currency    = summary.get('currency', 'USD') if isinstance(summary.get('currency'), str) else 'USD'

    # Index balance sheet and cash flow by period end timestamp for O(1) join
    bs_by_ts = {_raw(r, 'endDate'): r for r in bs_list if _raw(r, 'endDate')}
    cf_by_ts = {_raw(r, 'endDate'): r for r in cf_list if _raw(r, 'endDate')}

    periods = []
    for i, row in enumerate(income_list):
        ts = _raw(row, 'endDate')
        if not ts:
            continue

        rev = _raw(row, 'totalRevenue')
        # YoY: Yahoo returns newest-first; index i+4 is the same quarter one year ago
        rev_yoy = None
        if i + 4 < len(income_list) and rev is not None:
            prev_rev = _raw(income_list[i + 4], 'totalRevenue')
            if prev_rev:
                rev_yoy = (rev - prev_rev) / abs(prev_rev)

        gp           = _raw(row, 'grossProfit')
        gross_margin = (gp / rev) if gp is not None and rev else None
        op_income    = _raw(row, 'operatingIncome')
        ebitda       = _raw(row, 'ebitda')
        ebitda_margin = (ebitda / rev) if ebitda is not None and rev else None
        net_income   = _raw(row, 'netIncome')
        op_cost      = _raw(row, 'totalOperatingExpenses')

        bs         = bs_by_ts.get(ts, {})
        total_assets = _raw(bs, 'totalAssets')
        total_liab   = _raw(bs, 'totalLiab')
        equity       = _raw(bs, 'totalStockholderEquity')
        cash         = _raw(bs, 'cash') or 0
        long_debt    = _raw(bs, 'longTermDebt') or 0
        short_debt   = _raw(bs, 'shortLongTermDebt') or 0
        total_debt   = long_debt + short_debt
        net_debt     = total_debt - cash

        cf    = cf_by_ts.get(ts, {})
        cfo   = _raw(cf, 'totalCashFromOperatingActivities')
        capex = _raw(cf, 'capitalExpenditures')
        fcf   = (cfo + capex) if cfo is not None and capex is not None else None
        repurchase = _raw(cf, 'repurchaseOfStock')

        periods.append({
            'label':            _quarter_label(ts),
            'date':             datetime.datetime.utcfromtimestamp(ts).strftime('%Y-%m-%d'),
            'revenue':          rev,
            'revenueGrowthYoY': rev_yoy,
            'grossProfit':      gp,
            'grossMargin':      gross_margin,
            'operatingCost':    op_cost,
            'operatingIncome':  op_income,
            'ebitda':           ebitda,
            'ebitdaMargin':     ebitda_margin,
            'netIncome':        net_income,
            'netDebt':          net_debt,
            'totalAssets':      total_assets,
            'totalLiabilities': total_liab,
            'equity':           equity,
            'cashAndEquivalents': cash if cash else None,
            'totalDebt':        total_debt,
            'operatingCashFlow': cfo,
            'capex':            capex,
            'fcf':              fcf,
            'shareRepurchases': repurchase,
        })

    # TTM FCF = sum of latest 4 quarterly FCFs (for P/FCF valuation)
    ttm_fcf = None
    if period == 'quarterly':
        q_fcfs = [p['fcf'] for p in periods[:4] if p['fcf'] is not None]
        if len(q_fcfs) >= 3:
            ttm_fcf = sum(q_fcfs)

    market_cap = _raw(summary, 'marketCap')
    ev         = _raw(key_stats, 'enterpriseValue')
    pfcf       = (market_cap / ttm_fcf) if market_cap and ttm_fcf and ttm_fcf > 0 else None

    valuation = {
        'peRatio':           _raw(key_stats, 'trailingPE'),
        'forwardPE':         _raw(key_stats, 'forwardPE'),
        'evEbitda':          _raw(key_stats, 'enterpriseToEbitda'),
        'ps':                _raw(summary,   'priceToSalesTrailing12Months'),
        'marketCap':         market_cap,
        'sharesOutstanding': _raw(key_stats, 'sharesOutstanding'),
        'ev':                ev,
        'pfcf':              pfcf,
        'netDebtLatest':     periods[0]['netDebt'] if periods else None,
    }

    return {
        'periods':   periods,
        'valuation': valuation,
        'currency':  currency,
        'period':    period,
    }


def _fetch_yahoo_financials(symbol, period):
    """Fetch and normalise financial data from Yahoo Finance quoteSummary."""
    modules = (
        f'incomeStatementHistory{"Quarterly" if period == "quarterly" else ""},'
        f'incomeStatementHistory{"" if period == "quarterly" else ""},'
        f'balanceSheetHistory{"Quarterly" if period == "quarterly" else ""},'
        f'balanceSheetHistory{"" if period == "quarterly" else ""},'
        f'cashflowStatementHistory{"Quarterly" if period == "quarterly" else ""},'
        f'cashflowStatementHistory{"" if period == "quarterly" else ""},'
        'defaultKeyStatistics,summaryDetail'
    )
    url = (
        f'https://query1.finance.yahoo.com/v10/finance/quoteSummary/'
        f'{urllib.parse.quote(symbol)}?modules={urllib.parse.quote(modules)}'
    )
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    result_list = data.get('quoteSummary', {}).get('result') or []
    if not result_list:
        return None
    return _normalize_financials(result_list[0], period)
```

- [ ] **Step 3: Commit**

```bash
git add server.py
git commit -m "feat(financials): add Yahoo Finance fetch and normalization helpers"
```
Expected: commit succeeds.

---

## Task 3: Add `GET /api/financials` route

**Files:**
- Modify: `server.py` — insert `elif path == '/api/financials':` block inside `do_GET`

- [ ] **Step 1: Add route in do_GET**

In `server.py` `do_GET`, find the `elif path == '/api/bench-pl':` block (around line 713). Add the new route immediately before it:

```python
        elif path == '/api/financials':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            qs     = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            symbol = qs.get('symbol', '').upper()
            period = qs.get('period', 'quarterly')
            if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                self.send_json(400, {'error': 'invalid symbol'}); return
            if period not in ('quarterly', 'annual'):
                self.send_json(400, {'error': 'invalid period'}); return
            # Cache check
            try:
                with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(
                        "SELECT data_json, source, fetched_at FROM financials WHERE symbol=%s AND period=%s",
                        (symbol, period)
                    )
                    row = cur.fetchone()
                if row:
                    age_days = (datetime.datetime.utcnow() - row['fetched_at'].replace(tzinfo=None)).days
                    if age_days < 90:
                        cached = json.loads(row['data_json'])
                        cached['source']    = row['source']
                        cached['fetchedAt'] = row['fetched_at'].isoformat()
                        self.send_json(200, cached); return
            except Exception as e:
                print(f'[financials] db read error: {e}')
            # Cache miss → Yahoo Finance
            try:
                data = _fetch_yahoo_financials(symbol, period)
            except Exception as e:
                print(f'[financials] yahoo fetch error for {symbol}: {e}')
                self.send_json(404, {'error': 'no_data'}); return
            if not data or not data.get('periods'):
                self.send_json(404, {'error': 'no_data'}); return
            try:
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO financials (symbol, period, data_json, source, fetched_at)
                        VALUES (%s, %s, %s, 'yahoo', NOW())
                        ON CONFLICT (symbol, period) DO UPDATE
                            SET data_json  = EXCLUDED.data_json,
                                source     = 'yahoo',
                                fetched_at = NOW()
                    """, (symbol, period, json.dumps(data)))
            except Exception as e:
                print(f'[financials] db write error: {e}')
            data['source']    = 'yahoo'
            data['fetchedAt'] = datetime.datetime.utcnow().isoformat()
            self.send_json(200, data)

```

- [ ] **Step 2: Commit**

```bash
git add server.py
git commit -m "feat(financials): add GET /api/financials route with 90-day PostgreSQL cache"
```
Expected: commit succeeds.

---

## Task 4: Add `POST /api/financials/upload` route + `anthropic` dependency

**Files:**
- Modify: `requirements.txt` — add `anthropic`
- Modify: `server.py` — insert `elif path == '/api/financials/upload':` block inside `do_POST`

- [ ] **Step 1: Add anthropic to requirements.txt**

Edit `requirements.txt`:
```
psycopg2-binary
bcrypt
anthropic
```

- [ ] **Step 2: Add POST route in do_POST**

In `server.py` `do_POST`, find the final `else:` branch (around line 1104):
```python
        else:
            self.send_response(405); self.end_headers()
```
Add the new route immediately before it:

```python
        elif path == '/api/financials/upload':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body      = self.read_json(max_size=5 * 1024 * 1024)
                symbol    = str(body.get('symbol', '')).upper()
                period    = str(body.get('period', 'quarterly'))
                image_b64 = str(body.get('image_b64', ''))
                if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                    self.send_json(400, {'error': 'invalid symbol'}); return
                if period not in ('quarterly', 'annual'):
                    self.send_json(400, {'error': 'invalid period'}); return
                if not image_b64:
                    self.send_json(400, {'error': 'missing image_b64'}); return
            except ValueError as e:
                self.send_json(400, {'error': str(e)}); return
            api_key = os.environ.get('ANTHROPIC_API_KEY', '')
            if not api_key:
                self.send_json(503, {'error': 'ANTHROPIC_API_KEY not configured'}); return
            try:
                import anthropic as _anthropic
                client = _anthropic.Anthropic(api_key=api_key)
                prompt = (
                    f'Parse the financial table in this screenshot for stock {symbol}. '
                    f'Extract {period} financial data. Return ONLY a JSON object with this exact schema '
                    f'(use null for missing values, raw numbers not millions):\n'
                    '{"periods":[{"label":"Q1 2025","date":"2025-03-31","revenue":1181000000,'
                    '"revenueGrowthYoY":0.63,"grossProfit":973000000,"grossMargin":0.824,'
                    '"operatingCost":null,"operatingIncome":420000000,"ebitda":500000000,'
                    '"ebitdaMargin":0.423,"netIncome":370000000,"netDebt":-5400000000,'
                    '"totalAssets":null,"totalLiabilities":null,"equity":null,'
                    '"cashAndEquivalents":5400000000,"totalDebt":0,'
                    '"operatingCashFlow":450000000,"capex":-80000000,"fcf":370000000,'
                    '"shareRepurchases":null}],'
                    '"valuation":{"peRatio":null,"forwardPE":null,"evEbitda":null,"ps":null,'
                    '"marketCap":null,"sharesOutstanding":null,"ev":null,"pfcf":null,"netDebtLatest":null},'
                    f'"currency":"USD","period":"{period}"'
                    '}'
                )
                msg = client.messages.create(
                    model='claude-opus-4-7',
                    max_tokens=4096,
                    messages=[{
                        'role': 'user',
                        'content': [
                            {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': image_b64}},
                            {'type': 'text', 'text': prompt},
                        ],
                    }],
                )
                text = msg.content[0].text.strip()
                if text.startswith('```'):
                    text = text.split('\n', 1)[1].rsplit('```', 1)[0].strip()
                data = json.loads(text)
            except json.JSONDecodeError:
                self.send_json(422, {'error': 'parse_failed'}); return
            except Exception as e:
                print(f'[financials/upload] vision error: {e}')
                self.send_json(502, {'error': str(e)}); return
            try:
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO financials (symbol, period, data_json, source, fetched_at)
                        VALUES (%s, %s, %s, 'screenshot', NOW())
                        ON CONFLICT (symbol, period) DO UPDATE
                            SET data_json  = EXCLUDED.data_json,
                                source     = 'screenshot',
                                fetched_at = NOW()
                    """, (symbol, period, json.dumps(data)))
            except Exception as e:
                print(f'[financials/upload] db write error: {e}')
            data['source']    = 'screenshot'
            data['fetchedAt'] = datetime.datetime.utcnow().isoformat()
            self.send_json(200, data)

```

- [ ] **Step 3: Commit**

```bash
git add server.py requirements.txt
git commit -m "feat(financials): add POST /api/financials/upload with Claude Vision parsing"
```
Expected: commit succeeds.

---

## Task 5: Create `FinancialsTab.jsx`

**Files:**
- Create: `frontend-react/src/components/FinancialsTab.jsx`

- [ ] **Step 1: Create the component file**

Create `frontend-react/src/components/FinancialsTab.jsx` with the full content below.

```jsx
import React, { useState, useEffect, useRef } from 'react';

const AUTH_KEY = 'myfund_auth_token';

function fmtM(val) {
  if (val == null) return '—';
  const m = val / 1e6;
  return m.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(val) {
  if (val == null) return '—';
  return (val * 100).toFixed(1) + '%';
}

function fmtX(val) {
  if (val == null) return '—';
  return val.toFixed(1) + 'x';
}

function fmtLarge(val) {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e12) return (val / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9)  return (val / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6)  return (val / 1e6).toFixed(0) + 'M';
  return val.toLocaleString('pl-PL');
}

function growthColor(v) {
  if (v == null) return 'var(--text-dim)';
  return v >= 0 ? 'var(--up)' : 'var(--down)';
}

const COL_W = '110px';
const NUM_COLS = 4;

function TableRow({ label, values, fmt = fmtM, bold = false }) {
  const cols = values.slice(0, NUM_COLS);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '4px 10px',
      fontSize: 12,
    }}>
      <span style={{ color: bold ? 'var(--text)' : 'var(--text)', fontWeight: bold ? 600 : 400 }}>{label}</span>
      {cols.map((v, i) => (
        <span key={i} style={{
          color: 'var(--text)',
          fontWeight: i === 0 ? 700 : 400,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        }}>{fmt(v)}</span>
      ))}
      {Array.from({ length: NUM_COLS - cols.length }).map((_, i) => <span key={`e${i}`} />)}
    </div>
  );
}

function SubRow({ label, values, fmt = fmtPct }) {
  const cols = values.slice(0, NUM_COLS);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '2px 10px 3px',
      fontSize: 10,
    }}>
      <span style={{ color: 'var(--text-faint)' }}>{label}</span>
      {cols.map((v, i) => (
        <span key={i} style={{
          color: fmt === fmtPct ? growthColor(v) : 'var(--text-dim)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {fmt === fmtPct && v != null && v >= 0 ? '+' : ''}{fmt(v)}
        </span>
      ))}
      {Array.from({ length: NUM_COLS - cols.length }).map((_, i) => <span key={`e${i}`} />)}
    </div>
  );
}

function ColumnHeaders({ periods }) {
  const cols = periods.slice(0, NUM_COLS);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `${COL_W} repeat(${NUM_COLS}, 1fr)`,
      gap: 2,
      padding: '5px 10px',
      fontSize: 10,
      color: 'var(--text-faint)',
      borderBottom: '1px solid var(--border)',
    }}>
      <span />
      {cols.map((p, i) => (
        <span key={i} style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--text-dim)' : 'var(--text-faint)' }}>
          {p.label}
        </span>
      ))}
      {Array.from({ length: NUM_COLS - cols.length }).map((_, i) => <span key={`e${i}`} />)}
    </div>
  );
}

function Accordion({ title, unit, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--panel)', borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '7px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          userSelect: 'none',
        }}
      >
        <span style={{ color: open ? 'var(--text)' : 'var(--text-dim)', fontWeight: 600, fontSize: 12 }}>
          {open ? '▾' : '▸'} {title}
        </span>
        {unit && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{unit}</span>}
      </div>
      {open && children}
    </div>
  );
}

function ValuationCard({ label, value, sub }) {
  return (
    <div style={{
      background: 'var(--panel)',
      borderRadius: 8,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export default function FinancialsTab({ symbol, currentPrice }) {
  const [period, setPeriod]       = useState('quarterly');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const token = localStorage.getItem(AUTH_KEY) || '';
    fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}&period=${period}`, {
      headers: { 'X-Auth-Token': token },
    })
      .then(r => {
        if (!r.ok) throw new Error(r.status === 404 ? 'no_data' : 'fetch_error');
        return r.json();
      })
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message === 'no_data' ? 'no_data' : 'fetch_error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [symbol, period]);

  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const token = localStorage.getItem(AUTH_KEY) || '';
      const resp = await fetch('/api/financials/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Auth-Token': token },
        body: JSON.stringify({ symbol, period, image_b64: base64 }),
      });
      if (resp.status === 422) throw new Error('parse_failed');
      if (!resp.ok) throw new Error('upload_error');
      const d = await resp.json();
      setData(d);
      setUploadOpen(false);
    } catch (e) {
      if (e.message === 'parse_failed') {
        setUploadError('Nie udało się odczytać tabeli — spróbuj z wyraźniejszym screenshotem');
      } else {
        setUploadError('Błąd przesyłania — spróbuj ponownie');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        handleUpload(item.getAsFile());
        break;
      }
    }
  }

  const periods = data?.periods ?? [];
  const val     = data?.valuation ?? {};
  const currency = data?.currency ?? '';
  const sourceLabel = data
    ? `${data.source === 'yahoo' ? 'Yahoo Finance' : 'Screenshot'} · ${periods[0]?.label ?? ''}`
    : '';

  if (loading) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Ładowanie danych finansowych…</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px 20px' }} onPaste={handlePaste}>
      {/* Controls row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8 }}>
          {[['quarterly', 'Kwartalne'], ['annual', 'Roczne']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                background: period === k ? 'var(--bg-2)' : 'transparent',
                color: period === k ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: period === k ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                transition: 'background 0.15s',
              }}
            >{l}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {sourceLabel && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{sourceLabel}</span>}
          <button
            onClick={() => setUploadOpen(o => !o)}
            style={{
              background: 'var(--panel-2)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 10,
              color: 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >📎 Importuj screen</button>
        </div>
      </div>

      {/* Upload panel */}
      {uploadOpen && (
        <div style={{
          background: 'rgba(29, 78, 216, 0.08)',
          border: '1px solid rgba(29, 78, 216, 0.3)',
          borderRadius: 8,
          padding: '10px 12px',
          marginBottom: 10,
          fontSize: 11,
        }}>
          <div style={{ color: 'var(--info)', fontWeight: 600, marginBottom: 4 }}>
            📎 Import ze screenshota
          </div>
          <div style={{ color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 8 }}>
            Wrzuć screen z InvestingPro / Bloomberg / innego źródła → Claude odczyta tabelę i uzupełni dane. Ważność: 90 dni.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{
                background: 'var(--info)',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                cursor: uploading ? 'wait' : 'pointer',
              }}
            >{uploading ? 'Wczytuję…' : 'Wrzuć plik'}</button>
            <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>lub wklej ze schowka (Ctrl+V)</span>
          </div>
          {uploadError && (
            <div style={{ color: 'var(--down)', fontSize: 11, marginTop: 6 }}>{uploadError}</div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={e => handleUpload(e.target.files?.[0])}
          />
        </div>
      )}

      {/* No data state */}
      {error === 'no_data' && !uploadOpen && (
        <div style={{
          background: 'rgba(124, 158, 255, 0.08)',
          border: '1px solid rgba(124, 158, 255, 0.2)',
          borderRadius: 8,
          padding: '12px 14px',
          marginBottom: 10,
          fontSize: 12,
          color: 'var(--info)',
        }}>
          Brak danych z Yahoo Finance — wrzuć screenshot z InvestingPro lub innego źródła
        </div>
      )}

      {error === 'fetch_error' && (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
          Błąd pobierania danych. Spróbuj ponownie później.
        </div>
      )}

      {/* Data tables */}
      {data && periods.length > 0 && (
        <>
          {/* RZiS */}
          <Accordion title="Rachunek Zysków i Strat" unit={`mln ${currency}`} defaultOpen={true}>
            <ColumnHeaders periods={periods} />
            <TableRow label="Przychody" values={periods.map(p => p.revenue)} />
            <SubRow label="Wzrost r/r" values={periods.map(p => p.revenueGrowthYoY)} fmt={fmtPct} />
            <TableRow label="Zysk brutto" values={periods.map(p => p.grossProfit)} />
            <SubRow label="Marża brutto" values={periods.map(p => p.grossMargin)} fmt={v => v != null ? (v * 100).toFixed(1) + '%' : '—'} />
            <TableRow label="Koszty oper." values={periods.map(p => p.operatingCost)} />
            <TableRow label="Zysk oper." values={periods.map(p => p.operatingIncome)} />
            <TableRow label="EBITDA" values={periods.map(p => p.ebitda)} />
            <SubRow label="Marża EBITDA" values={periods.map(p => p.ebitdaMargin)} fmt={v => v != null ? (v * 100).toFixed(1) + '%' : '—'} />
            <TableRow label="Zysk netto" values={periods.map(p => p.netIncome)} />
            <TableRow label="Dług netto" values={periods.map(p => p.netDebt)} />
          </Accordion>

          {/* Bilans */}
          <Accordion title="Bilans" unit={`mln ${currency}`} defaultOpen={false}>
            <ColumnHeaders periods={periods} />
            <TableRow label="Aktywa ogółem" values={periods.map(p => p.totalAssets)} />
            <TableRow label="Zobowiązania" values={periods.map(p => p.totalLiabilities)} />
            <TableRow label="Kapitał własny" values={periods.map(p => p.equity)} />
            <TableRow label="Gotówka" values={periods.map(p => p.cashAndEquivalents)} />
            <TableRow label="Dług całkowity" values={periods.map(p => p.totalDebt)} />
          </Accordion>

          {/* Przepływy */}
          <Accordion title="Przepływy pieniężne" unit={`mln ${currency}`} defaultOpen={false}>
            <ColumnHeaders periods={periods} />
            <TableRow label="CFO (oper.)" values={periods.map(p => p.operatingCashFlow)} />
            <TableRow label="CAPEX" values={periods.map(p => p.capex)} />
            <TableRow label="FCF" values={periods.map(p => p.fcf)} bold />
            <TableRow label="Skup akcji" values={periods.map(p => p.shareRepurchases)} />
          </Accordion>

          {/* Wycena */}
          <Accordion title="Wycena" defaultOpen={true}>
            <div style={{ padding: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <ValuationCard
                label="P/E (trailing)"
                value={fmtX(val.peRatio)}
                sub={val.forwardPE != null ? `Forward P/E: ${fmtX(val.forwardPE)}` : null}
              />
              <ValuationCard
                label="EV/EBITDA"
                value={fmtX(val.evEbitda)}
                sub={val.ev != null ? `EV: ${fmtLarge(val.ev)}` : null}
              />
              <ValuationCard
                label="P/S"
                value={fmtX(val.ps)}
                sub={val.marketCap != null ? `Market Cap: ${fmtLarge(val.marketCap)}` : null}
              />
              <ValuationCard
                label="P/FCF"
                value={fmtX(val.pfcf)}
                sub={val.marketCap && val.pfcf ? `TTM FCF: ${fmtLarge(val.marketCap / val.pfcf)}` : null}
              />
              <ValuationCard
                label="EqV (Market Cap)"
                value={val.marketCap != null ? fmtLarge(val.marketCap) : '—'}
                sub={val.sharesOutstanding != null ? `${fmtLarge(val.sharesOutstanding)} akcji` : null}
              />
              <ValuationCard
                label="EV"
                value={val.ev != null ? fmtLarge(val.ev) : '—'}
                sub={val.netDebtLatest != null
                  ? `Dług netto: ${val.netDebtLatest < 0 ? '-' : '+'}${fmtLarge(Math.abs(val.netDebtLatest))}`
                  : null}
              />
            </div>
          </Accordion>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode
git add frontend-react/src/components/FinancialsTab.jsx
git commit -m "feat(financials): add FinancialsTab component with accordions and upload panel"
```
Expected: commit succeeds.

---

## Task 6: Add tab navigation to `StockDetailModal.jsx`

**Files:**
- Modify: `frontend-react/src/components/StockDetailModal.jsx`

This is the most surgical task: the current modal has no tab navigation. We add:
1. Import `FinancialsTab`
2. Two new state variables: `activeTab` and `financialsMounted`
3. Tab bar UI element (after the stock header, before chart/divider)
4. Wrap chart+period buttons in `activeTab === 'wykres'` conditional
5. Wrap buy form `<div>` in `activeTab === 'pozycja'` conditional
6. Add `<FinancialsTab>` render when `financialsMounted`

- [ ] **Step 1: Add import at top of file**

In `StockDetailModal.jsx` line 1, add the import:

```jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import FinancialsTab from './FinancialsTab';
```

Replace:
```jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
```
With:
```jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import FinancialsTab from './FinancialsTab';
```

- [ ] **Step 2: Add tab state variables**

In the `StockDetailModal` function body (around line 88–91 after `const [saving, setSaving]` line), add two new state lines:

Find:
```jsx
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
```
Replace with:
```jsx
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('wykres');
  const [financialsMounted, setFinancialsMounted] = useState(false);
```

- [ ] **Step 3: Add tab switching handler**

After the `setActiveTab`/`setFinancialsMounted` state lines (still in the function body, before `return`), add:

```jsx
  function switchTab(tab) {
    setActiveTab(tab);
    if (tab === 'finanse') setFinancialsMounted(true);
  }
```

- [ ] **Step 4: Add tab bar UI after the stock header section**

In the JSX, find the divider line:
```jsx
        <div style={{ height: 1, background: 'var(--border)', margin: '16px 0 0' }} />
```
Replace it with the tab bar + divider:
```jsx
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, margin: '12px 20px 0', borderBottom: '1px solid var(--border)' }}>
          {[['wykres', 'Wykres'], ['pozycja', 'Pozycja'], ['finanse', 'Finanse']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => switchTab(k)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === k ? '2px solid var(--accent)' : '2px solid transparent',
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: activeTab === k ? 600 : 400,
                color: activeTab === k ? 'var(--text)' : 'var(--text-dim)',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >{l}</button>
          ))}
        </div>
```

- [ ] **Step 5: Wrap chart section in wykres tab condition**

Find the chart section that starts with:
```jsx
        {/* Chart */}
        <div style={{ padding: '8px 20px 0' }}>
```
and ends with:
```jsx
        </div>
```
(closing the chart div, before the old divider). Wrap the entire chart `<div>` block in:
```jsx
        {activeTab === 'wykres' && (
          /* Chart */
          <div style={{ padding: '8px 20px 0' }}>
            {/* ... existing chart content unchanged ... */}
          </div>
        )}
```

Specifically, replace:
```jsx
        {/* Chart */}
        <div style={{ padding: '8px 20px 0' }}>
          {chartLoading ? (
            <div style={{ height: CHART_H + CM.top + CM.bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wykresu…</span>
            </div>
          ) : chartData.length >= 2 ? (
            <>
              <MiniChart data={chartData} period={chartPeriod} />
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setChartPeriod(p.key)}
                    style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: chartPeriod === p.key ? 'var(--accent)' : 'var(--panel-2)',
                      color: chartPeriod === p.key ? '#fff' : 'var(--text-dim)',
                      fontWeight: chartPeriod === p.key ? 600 : 400,
                      transition: 'background 0.15s',
                    }}
                  >{p.key}</button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Brak danych wykresu</span>
            </div>
          )}
        </div>
```
With:
```jsx
        {/* Wykres tab */}
        {activeTab === 'wykres' && (
          <div style={{ padding: '8px 20px 0' }}>
            {chartLoading ? (
              <div style={{ height: CHART_H + CM.top + CM.bottom, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Ładowanie wykresu…</span>
              </div>
            ) : chartData.length >= 2 ? (
              <>
                <MiniChart data={chartData} period={chartPeriod} />
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {PERIODS.map(p => (
                    <button
                      key={p.key}
                      onClick={() => setChartPeriod(p.key)}
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: chartPeriod === p.key ? 'var(--accent)' : 'var(--panel-2)',
                        color: chartPeriod === p.key ? '#fff' : 'var(--text-dim)',
                        fontWeight: chartPeriod === p.key ? 600 : 400,
                        transition: 'background 0.15s',
                      }}
                    >{p.key}</button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Brak danych wykresu</span>
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 6: Wrap buy form in pozycja tab condition and add finanse tab render**

Find the buy form div opening:
```jsx
        {/* Buy form */}
        <div style={{ padding: '16px 20px 20px' }}>
```
Replace with:
```jsx
        {/* Pozycja tab */}
        {activeTab === 'pozycja' && (
        <div style={{ padding: '16px 20px 20px' }}>
```
And find the closing `</div>` of the buy form (the one just before `</div>` of the modal outer container):
```jsx
        </div>
      </div>
    </div>
  );
```
Replace with:
```jsx
        </div>
        )}

        {/* Finanse tab — lazy mount: only renders after first activation */}
        {financialsMounted && (
          <div style={{ display: activeTab === 'finanse' ? 'block' : 'none' }}>
            <FinancialsTab symbol={item.symbol} currentPrice={currentPrice} />
          </div>
        )}
      </div>
    </div>
  );
```

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/components/StockDetailModal.jsx
git commit -m "feat(financials): add Wykres/Pozycja/Finanse tab navigation to StockDetailModal"
```
Expected: commit succeeds.

---

## Task 7: Build, deploy and verify

**Files:** no code changes

- [ ] **Step 1: Build React app**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build
```
Expected: `✓ built in` message, no errors.

- [ ] **Step 2: Push to trigger Render redeploy**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode && git push
```
Then run Vercel deploy:
```bash
vercel --prod
```
Expected: both succeed.

- [ ] **Step 3: Smoke-test in browser**

Open `https://myfund.vercel.app`, open `StockDetailModal` for any US stock (e.g. PLTR), verify:
1. Three tabs appear: Wykres / Pozycja / Finanse
2. Wykres tab shows chart (existing behavior unchanged)
3. Pozycja tab shows the buy form (existing behavior unchanged)
4. Finanse tab loads income statement data from Yahoo Finance
5. Period toggle switches between Kwartalne / Roczne
6. "Importuj screen" button opens the upload panel
7. Ctrl+V on a screenshot image triggers the upload flow

- [ ] **Step 4: Verify Finanse tab for a symbol with no Yahoo data**

Open StockDetailModal for a Polish stock (e.g. `PKO.WA`). Finanse tab should show the blue info box: "Brak danych z Yahoo Finance — wrzuć screenshot…"

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Wykres | Pozycja | Finanse tabs — Task 6
- ✅ Period toggle Kwartalne/Roczne — Task 5
- ✅ Source badge — Task 5
- ✅ Importuj screen button + upload panel — Task 5
- ✅ RZiS accordion (default open): Przychody+YoY, Zysk brutto+marża, Koszty, Zysk oper, EBITDA+marża, Zysk netto, Dług netto — Task 5
- ✅ Bilans accordion (default collapsed) — Task 5
- ✅ Przepływy accordion (default collapsed) — Task 5
- ✅ Wycena accordion (default open): 2×3 cards — Task 5
- ✅ Yahoo Finance backend proxy — Task 3
- ✅ Claude Vision screenshot import — Task 4
- ✅ PostgreSQL cache with 90-day TTL — Tasks 1, 3
- ✅ Cache priority: DB → Yahoo → upload prompt — Task 3
- ✅ Error states: loading spinner, no_data blue box, upload error, parse_failed — Task 5
- ✅ Lazy mount (only fetch on first Finanse tab open) — Task 6

**Out of scope (per spec):** automatic screenshot re-fetch, multi-company comparison, analyst estimates, sparklines.
