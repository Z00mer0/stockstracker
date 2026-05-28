# Multi-Portfolio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-portfolio support — each user can create named portfolios with independent holdings/transactions/history; dashboard aggregates all or shows single portfolio.

**Architecture:** Backend gains new DB tables (`portfolio_list`, `portfolio_holdings`, `portfolio_transactions`, `portfolio_snapshots`, `portfolio_cash`) alongside the existing `portfolios` blob table (kept for lazy migration). Two new backend storage modes (PostgreSQL + local file). Frontend gains `portfolios`/`activePortfolioId` state in AppContext; sidebar shows portfolio switcher; all save operations target the active portfolio.

**Tech Stack:** Python stdlib HTTP server, psycopg2, React 18, axios (via `api` helper)

---

## File Map

**Modified:**
- `server.py` — tasks 1–5 (DB schema, functions, routes)
- `frontend-react/src/context/AppContext.jsx` — task 6
- `frontend-react/src/components/layout/Sidebar.jsx` — task 7

**Created:**
- `frontend-react/src/components/NewPortfolioModal.jsx` — task 8

---

## Task 1: Backend — DB tables + storage functions

**Files:**
- Modify: `server.py` — `_init_db()`, new functions after `save_data`

- [ ] **Step 1: Extend `_init_db()` to create new tables (PostgreSQL branch)**

In `server.py`, find the `_init_db()` function inside the `if DATABASE_URL:` block. Add these table creations after the existing `CREATE TABLE IF NOT EXISTS portfolios` call:

```python
    def _init_db():
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    username      TEXT PRIMARY KEY,
                    display_name  TEXT NOT NULL,
                    password_hash TEXT NOT NULL
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolios (
                    username TEXT PRIMARY KEY,
                    data     TEXT NOT NULL DEFAULT '{}'
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_list (
                    id         TEXT PRIMARY KEY,
                    user_id    TEXT NOT NULL,
                    name       TEXT NOT NULL,
                    currency   TEXT NOT NULL DEFAULT 'PLN',
                    created_at TIMESTAMP DEFAULT NOW()
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_holdings (
                    id           TEXT PRIMARY KEY,
                    portfolio_id TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    symbol       TEXT NOT NULL,
                    qty          NUMERIC NOT NULL,
                    avg_price    NUMERIC NOT NULL,
                    currency     TEXT NOT NULL DEFAULT 'PLN',
                    UNIQUE(portfolio_id, symbol)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_transactions (
                    id                 TEXT PRIMARY KEY,
                    portfolio_id       TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    type               TEXT NOT NULL,
                    symbol             TEXT,
                    qty                NUMERIC,
                    price              NUMERIC,
                    currency           TEXT,
                    date               DATE,
                    note               TEXT,
                    broker_position_id TEXT,
                    extra_json         TEXT DEFAULT '{}'
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    portfolio_id TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    date         DATE NOT NULL,
                    total        NUMERIC,
                    invested     NUMERIC,
                    PRIMARY KEY (portfolio_id, date)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_cash (
                    portfolio_id TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    currency     TEXT NOT NULL,
                    amount       NUMERIC NOT NULL DEFAULT 0,
                    PRIMARY KEY (portfolio_id, currency)
                )""")
```

- [ ] **Step 2: Add PostgreSQL portfolio functions after `save_data`**

After the `save_data` function definition in the `if DATABASE_URL:` block, add:

```python
    def list_portfolios(username):
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, name, currency FROM portfolio_list WHERE user_id=%s ORDER BY created_at", (username,))
            return [dict(r) for r in cur.fetchall()]

    def create_portfolio(username, portfolio_id, name, currency):
        with _conn() as c, c.cursor() as cur:
            cur.execute(
                "INSERT INTO portfolio_list (id, user_id, name, currency) VALUES (%s, %s, %s, %s)",
                (portfolio_id, username, name, currency)
            )

    def update_portfolio(portfolio_id, username, name, currency):
        with _conn() as c, c.cursor() as cur:
            cur.execute(
                "UPDATE portfolio_list SET name=%s, currency=%s WHERE id=%s AND user_id=%s",
                (name, currency, portfolio_id, username)
            )

    def delete_portfolio(portfolio_id, username):
        with _conn() as c, c.cursor() as cur:
            cur.execute("DELETE FROM portfolio_list WHERE id=%s AND user_id=%s", (portfolio_id, username))

    def load_portfolio_data(portfolio_id):
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, symbol, qty, avg_price, currency FROM portfolio_holdings WHERE portfolio_id=%s", (portfolio_id,))
            holdings = [{'id': r['id'], 'symbol': r['symbol'], 'qty': float(r['qty']),
                         'avgPrice': float(r['avg_price']), 'currency': r['currency'], 'name': ''} for r in cur.fetchall()]
            cur.execute("""SELECT id, type, symbol, qty, price, currency, date::text, note, broker_position_id, extra_json
                           FROM portfolio_transactions WHERE portfolio_id=%s ORDER BY date""", (portfolio_id,))
            transactions = []
            for r in cur.fetchall():
                tx = {'id': r['id'], 'type': r['type'], 'symbol': r['symbol'],
                      'qty': float(r['qty']) if r['qty'] is not None else None,
                      'price': float(r['price']) if r['price'] is not None else None,
                      'currency': r['currency'], 'date': r['date'], 'note': r['note'],
                      'brokerPositionId': r['broker_position_id']}
                try:
                    extra = json.loads(r['extra_json'] or '{}')
                    tx.update(extra)
                except Exception:
                    pass
                transactions.append(tx)
            cur.execute("SELECT date::text, total, invested FROM portfolio_snapshots WHERE portfolio_id=%s ORDER BY date", (portfolio_id,))
            snaps_rows = cur.fetchall()
            snapshots = {r['date']: float(r['total']) for r in snaps_rows if r['total'] is not None}
            snapshots_inv = {r['date']: float(r['invested']) for r in snaps_rows if r['invested'] is not None}
            cur.execute("SELECT currency, amount FROM portfolio_cash WHERE portfolio_id=%s", (portfolio_id,))
            cash = {r['currency']: float(r['amount']) for r in cur.fetchall()}
        return {'portfolio': {'holdings': holdings}, 'transactions': transactions,
                'snapshots': snapshots, 'snapshotsInvested': snapshots_inv, 'cash': cash}

    def save_portfolio_data(portfolio_id, data):
        holdings = data.get('portfolio', {}).get('holdings', [])
        transactions = data.get('transactions', [])
        snapshots = data.get('snapshots', {})
        snapshots_inv = data.get('snapshotsInvested', {})
        cash = data.get('cash', {})
        import_snapshots = data.get('importSnapshots', {})
        with _conn() as c, c.cursor() as cur:
            cur.execute("DELETE FROM portfolio_holdings WHERE portfolio_id=%s", (portfolio_id,))
            for h in holdings:
                hid = h.get('id') or secrets.token_hex(8)
                cur.execute("""INSERT INTO portfolio_holdings (id, portfolio_id, symbol, qty, avg_price, currency)
                               VALUES (%s, %s, %s, %s, %s, %s)
                               ON CONFLICT (portfolio_id, symbol) DO UPDATE
                               SET qty=EXCLUDED.qty, avg_price=EXCLUDED.avg_price, currency=EXCLUDED.currency""",
                            (hid, portfolio_id, h['symbol'], h.get('qty', 0), h.get('avgPrice', 0), h.get('currency', 'PLN')))
            cur.execute("DELETE FROM portfolio_transactions WHERE portfolio_id=%s", (portfolio_id,))
            for tx in transactions:
                extra = {k: v for k, v in tx.items()
                         if k not in ('id','type','symbol','qty','price','currency','date','note','brokerPositionId')}
                cur.execute("""INSERT INTO portfolio_transactions
                               (id, portfolio_id, type, symbol, qty, price, currency, date, note, broker_position_id, extra_json)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                               ON CONFLICT (id) DO UPDATE SET
                               type=EXCLUDED.type, symbol=EXCLUDED.symbol, qty=EXCLUDED.qty, price=EXCLUDED.price,
                               currency=EXCLUDED.currency, date=EXCLUDED.date, note=EXCLUDED.note,
                               broker_position_id=EXCLUDED.broker_position_id, extra_json=EXCLUDED.extra_json""",
                            (tx['id'], portfolio_id, tx.get('type'), tx.get('symbol'), tx.get('qty'),
                             tx.get('price'), tx.get('currency'), tx.get('date'), tx.get('note'),
                             tx.get('brokerPositionId'), json.dumps(extra)))
            cur.execute("DELETE FROM portfolio_snapshots WHERE portfolio_id=%s", (portfolio_id,))
            for date, total in snapshots.items():
                inv = snapshots_inv.get(date)
                cur.execute("INSERT INTO portfolio_snapshots (portfolio_id, date, total, invested) VALUES (%s,%s,%s,%s)",
                            (portfolio_id, date, total, inv))
            cur.execute("DELETE FROM portfolio_cash WHERE portfolio_id=%s", (portfolio_id,))
            for cur_code, amount in cash.items():
                cur.execute("INSERT INTO portfolio_cash (portfolio_id, currency, amount) VALUES (%s,%s,%s)",
                            (portfolio_id, cur_code, amount))
            if import_snapshots:
                cur.execute("UPDATE portfolio_list SET name=name WHERE id=%s", (portfolio_id,))
```

- [ ] **Step 3: Add local-file equivalents in the `else:` branch**

In the `else:` block (local file mode), after `save_data`, add:

```python
    def _read_pfile(username):
        f = BASE / f'multiportfolio_{username}.json'
        if f.exists():
            return json.loads(f.read_text(encoding='utf-8'))
        return {'portfolio_list': [], 'portfolio_data': {}}

    def _write_pfile(username, pdata):
        f = BASE / f'multiportfolio_{username}.json'
        f.write_text(json.dumps(pdata, ensure_ascii=False), encoding='utf-8')

    def list_portfolios(username):
        return _read_pfile(username)['portfolio_list']

    def create_portfolio(username, portfolio_id, name, currency):
        pdata = _read_pfile(username)
        pdata['portfolio_list'].append({'id': portfolio_id, 'name': name, 'currency': currency})
        pdata['portfolio_data'][portfolio_id] = {'portfolio': {'holdings': []}, 'transactions': [], 'snapshots': {}, 'snapshotsInvested': {}, 'cash': {}}
        _write_pfile(username, pdata)

    def update_portfolio(portfolio_id, username, name, currency):
        pdata = _read_pfile(username)
        for p in pdata['portfolio_list']:
            if p['id'] == portfolio_id:
                p['name'] = name
                p['currency'] = currency
        _write_pfile(username, pdata)

    def delete_portfolio(portfolio_id, username):
        pdata = _read_pfile(username)
        pdata['portfolio_list'] = [p for p in pdata['portfolio_list'] if p['id'] != portfolio_id]
        pdata['portfolio_data'].pop(portfolio_id, None)
        _write_pfile(username, pdata)

    def load_portfolio_data(portfolio_id):
        # portfolio_id is "username/id" — split by first '/'
        username, pid = portfolio_id.split('/', 1)
        pdata = _read_pfile(username)
        return pdata['portfolio_data'].get(pid, {'portfolio': {'holdings': []}, 'transactions': [], 'snapshots': {}, 'snapshotsInvested': {}, 'cash': {}})

    def save_portfolio_data(portfolio_id, data):
        username, pid = portfolio_id.split('/', 1)
        pdata = _read_pfile(username)
        pdata['portfolio_data'][pid] = data
        _write_pfile(username, pdata)
```

**Note:** In local file mode, `portfolio_id` is `"{username}/{uuid}"` so we can look up the file. In PostgreSQL mode it is just the UUID.

- [ ] **Step 4: Commit**

```bash
git add server.py
git commit -m "feat(backend): add multi-portfolio DB tables and storage functions"
```

---

## Task 2: Backend — Lazy migration + aggregate

**Files:**
- Modify: `server.py` — add two functions after the storage functions from Task 1

- [ ] **Step 1: Add `migrate_user_to_portfolios(username)` after the storage functions**

Add this function (works for both PostgreSQL and local file mode) at module level after all storage functions:

```python
def migrate_user_to_portfolios(username):
    """If user has old blob data but no portfolios, create a default portfolio and migrate."""
    existing = list_portfolios(username)
    if existing:
        return existing  # already migrated
    # load old blob
    try:
        raw = load_data(username)
        old = json.loads(raw)
    except Exception:
        old = {}
    if not old:
        return []
    # create default portfolio
    pid = secrets.token_hex(12)
    if DATABASE_URL:
        portfolio_id = pid
    else:
        portfolio_id = f'{username}/{pid}'
    create_portfolio(username, pid if DATABASE_URL else portfolio_id, 'Portfel domyślny', 'PLN')
    save_portfolio_data(portfolio_id if not DATABASE_URL else pid, old)
    print(f'[migration] {username}: migrated old blob to "Portfel domyślny" (id={pid})')
    return list_portfolios(username)
```

- [ ] **Step 2: Add `load_aggregate_data(username)` after migration function**

```python
def load_aggregate_data(username):
    """Merge all portfolios into a single data blob (all values kept in original currency — frontend converts)."""
    portfolios = list_portfolios(username)
    merged_holdings = []
    merged_txs = []
    merged_snaps = {}
    merged_snaps_inv = {}
    merged_cash = {}
    symbol_set = {}

    for p in portfolios:
        pid = p['id'] if DATABASE_URL else f'{username}/{p["id"]}'
        data = load_portfolio_data(pid)
        for h in data.get('portfolio', {}).get('holdings', []):
            key = h['symbol']
            if key in symbol_set:
                idx = symbol_set[key]
                old = merged_holdings[idx]
                total_qty = old['qty'] + h['qty']
                if total_qty > 0:
                    merged_holdings[idx] = {
                        **old,
                        'qty': total_qty,
                        'avgPrice': (old['qty'] * old['avgPrice'] + h['qty'] * h['avgPrice']) / total_qty,
                    }
            else:
                symbol_set[key] = len(merged_holdings)
                merged_holdings.append({**h, '_portfolioId': p['id'], '_portfolioName': p['name']})
        for tx in data.get('transactions', []):
            merged_txs.append({**tx, '_portfolioId': p['id'], '_portfolioName': p['name']})
        for date, val in data.get('snapshots', {}).items():
            merged_snaps[date] = merged_snaps.get(date, 0) + val
        for date, val in data.get('snapshotsInvested', {}).items():
            merged_snaps_inv[date] = merged_snaps_inv.get(date, 0) + val
        for cur, amt in data.get('cash', {}).items():
            merged_cash[cur] = merged_cash.get(cur, 0) + amt

    merged_txs.sort(key=lambda t: t.get('date', ''))
    return {
        'portfolio': {'holdings': merged_holdings},
        'transactions': merged_txs,
        'snapshots': merged_snaps,
        'snapshotsInvested': merged_snaps_inv,
        'cash': merged_cash,
    }
```

- [ ] **Step 3: Commit**

```bash
git add server.py
git commit -m "feat(backend): add lazy migration and aggregate data functions"
```

---

## Task 3: Backend — GET routes

**Files:**
- Modify: `server.py` — `do_GET` method

- [ ] **Step 1: Add portfolio routes to `do_GET`**

In `do_GET`, find the block:
```python
        elif path == '/api/data':
```

**Before** that block, add:

```python
        elif path == '/api/portfolios':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            portfolios = migrate_user_to_portfolios(username)
            self.send_json(200, portfolios)

        elif path.startswith('/api/portfolios/') and path.endswith('/data'):
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            # path is /api/portfolios/<id>/data
            pid = path[len('/api/portfolios/'):-len('/data')]
            if not pid or '/' in pid.replace('all', ''):
                self.send_json(400, {'error': 'invalid portfolio id'}); return
            if pid == 'all':
                data = load_aggregate_data(username)
            else:
                # Verify portfolio belongs to user
                portfolios = list_portfolios(username)
                if not any(p['id'] == pid for p in portfolios):
                    self.send_json(403, {'error': 'forbidden'}); return
                real_pid = pid if DATABASE_URL else f'{username}/{pid}'
                data = load_portfolio_data(real_pid)
            self.send_json(200, data)
```

- [ ] **Step 2: Add DELETE and GET-single-portfolio route**

In `do_GET`, after the `/api/portfolios` block, note that DELETE will be in `do_POST` below. Nothing else needed in GET.

- [ ] **Step 3: Commit**

```bash
git add server.py
git commit -m "feat(backend): add GET /api/portfolios and /api/portfolios/:id/data routes"
```

---

## Task 4: Backend — POST/PUT/DELETE routes

**Files:**
- Modify: `server.py` — `do_POST` method

- [ ] **Step 1: Add portfolio POST/PUT/DELETE routes to `do_POST`**

In `do_POST`, find the block:
```python
        elif path == '/api/data':
```

**Before** that block, add:

```python
        elif path == '/api/portfolios':
            # POST /api/portfolios — create new portfolio
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body = self.read_json(max_size=1024)
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json(400, {'error': str(e)}); return
            name = str(body.get('name', '')).strip()[:64]
            currency = str(body.get('currency', 'PLN')).upper()[:4]
            if not name:
                self.send_json(400, {'error': 'name required'}); return
            if currency not in ('PLN', 'USD', 'EUR', 'GBP'):
                self.send_json(400, {'error': 'unsupported currency'}); return
            pid = secrets.token_hex(12)
            create_portfolio(username, pid, name, currency)
            self.send_json(201, {'id': pid, 'name': name, 'currency': currency})

        elif path.startswith('/api/portfolios/') and path.endswith('/data'):
            # POST /api/portfolios/:id/data — save portfolio data
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):-len('/data')]
            if not pid or pid == 'all':
                self.send_json(400, {'error': 'invalid portfolio id'}); return
            portfolios = list_portfolios(username)
            if not any(p['id'] == pid for p in portfolios):
                self.send_json(403, {'error': 'forbidden'}); return
            try:
                length = int(self.headers.get('Content-Length', 0))
                if length > _MAX_BODY_DATA:
                    self.send_json(413, {'error': 'too large'}); return
                raw = self.rfile.read(max(0, length))
                data = json.loads(raw)
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json(400, {'error': str(e)}); return
            real_pid = pid if DATABASE_URL else f'{username}/{pid}'
            save_portfolio_data(real_pid, data)
            self.send_json(200, {'ok': True})

        elif path.startswith('/api/portfolios/') and not path.endswith('/data'):
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):]
            # PUT — update name/currency (method override via body._method)
            # DELETE — delete portfolio
            try:
                body = self.read_json(max_size=1024)
            except (ValueError, json.JSONDecodeError):
                body = {}
            method = body.get('_method', 'PUT').upper()
            portfolios = list_portfolios(username)
            if not any(p['id'] == pid for p in portfolios):
                self.send_json(403, {'error': 'forbidden'}); return
            if method == 'DELETE':
                if len(portfolios) <= 1:
                    self.send_json(400, {'error': 'Nie można usunąć ostatniego portfela'}); return
                delete_portfolio(pid, username)
                self.send_json(200, {'ok': True})
            else:
                name = str(body.get('name', '')).strip()[:64]
                currency = str(body.get('currency', 'PLN')).upper()[:4]
                if not name:
                    self.send_json(400, {'error': 'name required'}); return
                if currency not in ('PLN', 'USD', 'EUR', 'GBP'):
                    self.send_json(400, {'error': 'unsupported currency'}); return
                update_portfolio(pid, username, name, currency)
                self.send_json(200, {'id': pid, 'name': name, 'currency': currency})
```

- [ ] **Step 2: Verify do_OPTIONS allows new paths**

The current `do_OPTIONS` handles all paths with a wildcard CORS header — no change needed.

- [ ] **Step 3: Commit**

```bash
git add server.py
git commit -m "feat(backend): add POST/PUT/DELETE /api/portfolios routes"
```

---

## Task 5: Frontend — AppContext multi-portfolio state

**Files:**
- Modify: `frontend-react/src/context/AppContext.jsx`

- [ ] **Step 1: Add portfolio state and constants at the top of `AppProvider`**

Inside `AppProvider`, after the existing `useState` declarations, add:

```js
const ACTIVE_PORTFOLIO_KEY = 'myfund_active_portfolio';

const [portfolios, setPortfolios]             = useState([]);
const [activePortfolioId, setActivePortfolioId] = useState(
  () => localStorage.getItem(ACTIVE_PORTFOLIO_KEY) || 'all'
);
```

- [ ] **Step 2: Replace `fetchData` to load portfolios list first**

Replace the existing `fetchData` function with:

```js
const fetchData = useCallback(async () => {
  if (!token) return;
  if (writeInProgressRef.current) return;
  setLoading(true);
  setError(null);
  try {
    const [portfoliosRes, dataRes] = await Promise.all([
      api.get('/api/portfolios'),
      api.get(activePortfolioId === 'all'
        ? '/api/portfolios/all/data'
        : `/api/portfolios/${activePortfolioId}/data`),
    ]);
    setPortfolios(portfoliosRes.data);
    setRawData(dataRes.data);
  } catch (err) {
    if (err.response?.status === 401) {
      logout();
    } else {
      setError(err.response?.data?.error ?? err.message);
    }
  } finally {
    setLoading(false);
  }
}, [token, activePortfolioId]);
```

- [ ] **Step 3: Add `switchPortfolio` function**

After `fetchData`, add:

```js
function switchPortfolio(id) {
  localStorage.setItem(ACTIVE_PORTFOLIO_KEY, id);
  setActivePortfolioId(id);
}
```

Because `fetchData` depends on `activePortfolioId`, changing it via `switchPortfolio` will trigger a `useEffect` re-fetch automatically (the existing `useEffect([token])` won't catch it — add a second effect):

```js
useEffect(() => {
  if (token) fetchData();
}, [activePortfolioId, token]);
```

Replace the existing `useEffect(() => { if (token) fetchData(); }, [token]);` with the above (it now covers both triggers).

- [ ] **Step 4: Add `createPortfolio`, `updatePortfolio`, `deletePortfolio` functions**

After `switchPortfolio`:

```js
async function createPortfolio(name, currency) {
  const res = await api.post('/api/portfolios', { name, currency });
  const newP = res.data;
  setPortfolios(prev => [...prev, newP]);
  switchPortfolio(newP.id);
}

async function updatePortfolio(id, name, currency) {
  const res = await api.post(`/api/portfolios/${id}`, { name, currency, _method: 'PUT' });
  setPortfolios(prev => prev.map(p => p.id === id ? res.data : p));
}

async function deletePortfolio(id) {
  await api.post(`/api/portfolios/${id}`, { _method: 'DELETE' });
  setPortfolios(prev => {
    const next = prev.filter(p => p.id !== id);
    if (activePortfolioId === id) switchPortfolio(next[0]?.id || 'all');
    return next;
  });
}
```

- [ ] **Step 5: Update all save functions to target active portfolio**

Add this helper constant inside `AppProvider`, right before the save functions:

```js
const dataUrl = activePortfolioId === 'all'
  ? '/api/portfolios/all/data'
  : `/api/portfolios/${activePortfolioId}/data`;
```

Then replace every `await api.post('/api/data', ...)` with `await api.post(dataUrl, ...)` in these functions: `saveCash`, `saveHoldings`, `saveTransactions`, `editPosition`, `removePosition`, `sellPosition`, `addPosition`, `importBrokerTransactions`, `clearBrokerImport`, `deleteSnapshot`, `setSnapshot`, `saveSnapshot`.

That is 12 occurrences — do a global find-and-replace of `'/api/data'` → `dataUrl` within AppContext.jsx (only inside the POST calls, not the GET in `fetchData`).

- [ ] **Step 6: Compute `activePortfolio` and expose in context value**

Before the `value` object, add:

```js
const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || null;
const displayCurrency = activePortfolio?.currency || 'PLN';
```

Add to the `value` object:

```js
portfolios,
activePortfolioId,
activePortfolio,
displayCurrency,
switchPortfolio,
createPortfolio,
updatePortfolio,
deletePortfolio,
```

- [ ] **Step 7: Build and verify no TypeErrors**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend-react/src/context/AppContext.jsx
git commit -m "feat(frontend): add multi-portfolio state to AppContext"
```

---

## Task 6: Frontend — Sidebar portfolio switcher

**Files:**
- Modify: `frontend-react/src/components/layout/Sidebar.jsx`

- [ ] **Step 1: Import `useApp` additions at top of Sidebar.jsx**

The existing import is:
```js
const { displayName, logout } = useApp();
```

Replace with:
```js
const { displayName, logout, portfolios, activePortfolioId, switchPortfolio, activePortfolio } = useApp();
```

- [ ] **Step 2: Add `PortfolioItem` helper component inside Sidebar.jsx before `Sidebar`**

```jsx
function PortfolioItem({ id, name, currency, isActive, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '7px 10px', borderRadius: 7,
        background: isActive ? 'var(--panel)' : 'transparent',
        boxShadow: isActive ? 'inset 3px 0 0 var(--accent)' : 'none',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: isActive ? 'var(--text)' : 'var(--text-dim)',
        fontSize: 13, fontWeight: 500,
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      <span style={{ opacity: 0.6, fontSize: 10 }}>◆</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', flexShrink: 0 }}>{currency}</span>
    </button>
  );
}
```

- [ ] **Step 3: Add portfolio section in sidebar nav, before "Główne" label**

In the `sidebarContent`, inside `<nav>`, before the existing `Główne` label div, add:

```jsx
{/* Portfolio switcher */}
<div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-faint)', padding: '8px 10px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
  <span>Portfele</span>
  <button
    onClick={onNewPortfolio}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
    title="Nowy portfel"
  >+</button>
</div>
<PortfolioItem
  id="all"
  name="Wszystkie"
  currency=""
  isActive={activePortfolioId === 'all'}
  onClick={id => { switchPortfolio(id); if (isMobile) onClose?.(); }}
/>
{portfolios.map(p => (
  <PortfolioItem
    key={p.id}
    id={p.id}
    name={p.name}
    currency={p.currency}
    isActive={activePortfolioId === p.id}
    onClick={id => { switchPortfolio(id); if (isMobile) onClose?.(); }}
  />
))}
<div style={{ height: 8 }} />
```

- [ ] **Step 4: Update Sidebar props signature to accept `onNewPortfolio`**

Change:
```js
export default function Sidebar({ isMobile, isOpen, onClose }) {
```
to:
```js
export default function Sidebar({ isMobile, isOpen, onClose, onNewPortfolio }) {
```

- [ ] **Step 5: Update `Layout.jsx` to pass `onNewPortfolio` and wire up modal state**

In `frontend-react/src/components/layout/Layout.jsx`, add:
```js
const [showNewPortfolio, setShowNewPortfolio] = useState(false);
```
and pass `onNewPortfolio={() => setShowNewPortfolio(true)}` to `<Sidebar>`. The modal will be added in Task 7.

- [ ] **Step 6: Build check**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend-react/src/components/layout/Sidebar.jsx frontend-react/src/components/layout/Layout.jsx
git commit -m "feat(frontend): add portfolio switcher to sidebar"
```

---

## Task 7: Frontend — NewPortfolioModal

**Files:**
- Create: `frontend-react/src/components/NewPortfolioModal.jsx`
- Modify: `frontend-react/src/components/layout/Layout.jsx`

- [ ] **Step 1: Create `NewPortfolioModal.jsx`**

```jsx
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

const overlay = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.72)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
};

const card = {
  background: 'var(--bg-2)', border: '1px solid var(--border)',
  borderRadius: 12, padding: 24,
  width: '100%', maxWidth: 380,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
};

const CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP'];

export default function NewPortfolioModal({ onClose }) {
  const { createPortfolio } = useApp();
  const [name, setName]         = useState('');
  const [currency, setCurrency] = useState('PLN');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  async function handleSave() {
    if (!name.trim()) { setError('Podaj nazwę portfela.'); return; }
    setSaving(true); setError('');
    try {
      await createPortfolio(name.trim(), currency);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Błąd zapisu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Nowy portfel
        </h2>

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Nazwa
        </label>
        <input
          autoFocus
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 14,
            background: 'var(--panel-2)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 13, color: 'var(--text)', outline: 'none',
            boxSizing: 'border-box',
          }}
          placeholder="np. XTB GPW, IBKR USA"
          value={name}
          onChange={e => { setName(e.target.value); setError(''); }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
        />

        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Waluta bazowa
        </label>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              style={{
                flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 600,
                border: `1px solid ${currency === c ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 7, cursor: 'pointer',
                background: currency === c ? 'var(--accent)' : 'var(--panel-2)',
                color: currency === c ? '#051a10' : 'var(--text-dim)',
                transition: 'all 0.1s',
              }}
            >{c}</button>
          ))}
        </div>

        {error && <p style={{ fontSize: 12, color: 'var(--down)', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onClose}>Anuluj</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
            {saving ? 'Tworzenie…' : 'Utwórz portfel'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire modal into `Layout.jsx`**

In `Layout.jsx`, add import at top:
```js
import NewPortfolioModal from '../NewPortfolioModal.jsx';
```

Find where `showNewPortfolio` state was added in Task 6, and render the modal conditionally in the JSX (at the bottom of the Layout return, before closing fragment):
```jsx
{showNewPortfolio && <NewPortfolioModal onClose={() => setShowNewPortfolio(false)} />}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/components/NewPortfolioModal.jsx frontend-react/src/components/layout/Layout.jsx
git commit -m "feat(frontend): add NewPortfolioModal"
```

---

## Task 8: Frontend — Dashboard currency + Transactions portfolio label

**Files:**
- Modify: `frontend-react/src/pages/Dashboard.jsx`
- Modify: `frontend-react/src/pages/Transactions.jsx`

- [ ] **Step 1: Pass `displayCurrency` to Dashboard KPI cards**

In `Dashboard.jsx`, find the `useApp()` destructure and add `displayCurrency`:

```js
const { portfolio, cash, snapshots, fxRates, invested, displayCurrency } = useApp();
```

Then add a currency label helper near the top of the component:

```js
const currLabel = displayCurrency === 'PLN' ? 'zł' : displayCurrency;
```

Replace all hardcoded `'zł'` occurrences in Dashboard.jsx with `{currLabel}` (in JSX) or `currLabel` (in JS). Also add a `fxMultiplier` for non-PLN portfolios:

```js
const fxMultiplier = displayCurrency === 'PLN' ? 1 : (1 / (fxRates[displayCurrency] ?? 1));
```

Where portfolio values are computed for display (total value, P&L), multiply by `fxMultiplier` so USD portfolio shows in USD. The `fxRates` object has `{ PLN: 1, USD: 3.62, EUR: 4.24, GBP: 4.91 }` — dividing by `fxRates[displayCurrency]` converts PLN → target currency.

- [ ] **Step 2: Show portfolio name in Transactions list when viewing "all"**

In `Transactions.jsx`, destructure `activePortfolioId` from `useApp()`. When `activePortfolioId === 'all'`, show a small badge next to each transaction showing `tx._portfolioName` if present:

```jsx
{activePortfolioId === 'all' && tx._portfolioName && (
  <span style={{ fontSize: 10, color: 'var(--text-faint)', padding: '1px 5px', background: 'var(--panel-2)', borderRadius: 4, marginLeft: 4 }}>
    {tx._portfolioName}
  </span>
)}
```

Find the transaction row render and add this badge next to the symbol/ticker display.

- [ ] **Step 3: Build check**

```bash
cd /Users/adamgorski/Desktop/ClaudeCode/frontend-react && npm run build 2>&1 | tail -10
```

Expected: `✓ built in` with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend-react/src/pages/Dashboard.jsx frontend-react/src/pages/Transactions.jsx
git commit -m "feat(frontend): dashboard currency from active portfolio, portfolio label in transactions"
```

---

## Task 9: Push and verify

- [ ] **Step 1: Push all commits**

```bash
git push origin main
```

- [ ] **Step 2: Wait for Vercel deploy (~2 min), then open https://myfund-app.vercel.app/**

- [ ] **Step 3: Verify migration works**

Log in. Sidebar should show:
```
PORTFELE
  ✦ Wszystkie
    Portfel domyślny  PLN
+ (button)
```

- [ ] **Step 4: Verify create portfolio**

Click `+` in sidebar → NewPortfolioModal appears → type "IBKR USA", select USD → "Utwórz portfel" → sidebar updates, active switches to new portfolio, dashboard shows $0 USD.

- [ ] **Step 5: Verify switching**

Click "Portfel domyślny" → dashboard shows PLN values. Click "Wszystkie" → dashboard shows aggregated PLN values.

- [ ] **Step 6: Verify Render backend migration**

Check Render logs for: `[migration] <username>: migrated old blob to "Portfel domyślny"` on first request.
