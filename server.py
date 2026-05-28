#!/usr/bin/env python3
"""
StocksTracker server — serwuje pliki statyczne, obsługuje auth i per-user dane portfela.
Lokalnie: przechowuje dane w plikach JSON.
W chmurze: przechowuje dane w PostgreSQL (zmienna DATABASE_URL).
"""
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

BASE       = Path(__file__).parent
REACT_DIST = BASE / 'frontend-react' / 'dist'

# ── RATE LIMITER ───────────────────────────────────────────────────────────────
_RL_WINDOW  = 15 * 60   # seconds
_RL_MAX     = 10        # attempts per window
_rl_store   = {}        # { ip: [timestamp, ...] }
_rl_lock    = __import__('threading').Lock()

def _rate_limited(ip: str) -> bool:
    """Return True if ip has exceeded the limit; prune old timestamps as a side-effect."""
    now = time.time()
    with _rl_lock:
        ts = _rl_store.get(ip, [])
        ts = [t for t in ts if now - t < _RL_WINDOW]
        if len(ts) >= _RL_MAX:
            _rl_store[ip] = ts
            return True
        ts.append(now)
        _rl_store[ip] = ts
        return False

# ── INPUT VALIDATION ──────────────────────────────────────────────────────────
_MAX_BODY_AUTH   =   4 * 1024   #   4 KB  — login / register / change-password
_MAX_BODY_DATA   = 512 * 1024   # 512 KB  — portfolio JSON
_MAX_SYMBOLS     = 30
_USERNAME_RE     = re.compile(r'^[a-z0-9_\-]{1,64}$')

# ── CORS ───────────────────────────────────────────────────────────────────────
_ALLOWED_ORIGINS = {'https://stockstracker.onrender.com'}
_extra_origin = os.environ.get('CORS_EXTRA_ORIGIN', '').strip()
if _extra_origin:
    _ALLOWED_ORIGINS.add(_extra_origin)

def _str(val, max_len: int, field: str) -> str:
    """Assert val is a string, strip whitespace, enforce max_len."""
    if not isinstance(val, str):
        raise ValueError(f'{field}: must be a string')
    v = val.strip()
    if len(v) > max_len:
        raise ValueError(f'{field}: too long (max {max_len} chars)')
    return v

# ── CALENDAR CACHE ─────────────────────────────────────────────────────────────
_CAL_CACHE = {}   # { 'thisweek': {'data': [...], 'ts': float}, 'nextweek': {...} }
_CAL_TTL   = 4 * 3600  # 4 hours

# ── POLISH BENCHMARK CACHE ─────────────────────────────────────────────────────
_BENCH_PL_CACHE = {}   # { 'WIG20': {'data': [...], 'ts': float}, ... }
_BENCH_PL_TTL   = 6 * 3600   # 6 hours

_BANKIER_SYMBOLS = {
    'WIG20': 'WIG20',
}

def _fetch_bench_pl(index_name):
    import datetime
    upper = index_name.upper()
    if upper not in _BANKIER_SYMBOLS:
        return None
    entry = _BENCH_PL_CACHE.get(upper)
    if entry and time.time() - entry['ts'] < _BENCH_PL_TTL:
        return entry['data']
    sym = _BANKIER_SYMBOLS[upper]
    url = f'https://www.bankier.pl/new-charts/get-data?symbol={sym}&intraday=false&type=area&max_data_count=2000'
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': f'https://www.bankier.pl/inwestowanie/profile/quote.html?symbol={sym}',
            'Accept': 'application/json, */*',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='replace'))
        raw_points = data.get('main', [])
        if not raw_points:
            return None
        points = []
        for ts_ms, price in raw_points:
            try:
                date_str = datetime.datetime.utcfromtimestamp(ts_ms / 1000).strftime('%Y-%m-%d')
                if price and float(price) > 0:
                    points.append({'date': date_str, 'price': float(price)})
            except Exception:
                continue
        if not points:
            return None
        _BENCH_PL_CACHE[upper] = {'data': points, 'ts': time.time()}
        print(f'[bench-pl] {upper}: fetched {len(points)} points from bankier.pl')
        return points
    except Exception as e:
        print(f'[bench-pl] {upper} ERROR: {e}')
        stale = _BENCH_PL_CACHE.get(upper, {}).get('data')
        return stale if stale is not None else None

_CAL_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         'https://www.forexfactory.com/',
    'Origin':          'https://www.forexfactory.com',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
}

def _fetch_calendar(week):
    entry = _CAL_CACHE.get(week)
    if entry and time.time() - entry['ts'] < _CAL_TTL:
        return entry['data']
    url = f'https://nfs.faireconomy.media/ff_calendar_{week}.json'
    try:
        req = urllib.request.Request(url, headers=_CAL_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            # handle gzip
            if resp.info().get('Content-Encoding') == 'gzip':
                import gzip
                raw = gzip.decompress(raw)
            data = json.loads(raw)
        print(f'[calendar] {week}: fetched {len(data)} events')
        _CAL_CACHE[week] = {'data': data, 'ts': time.time()}
        return data
    except Exception as e:
        print(f'[calendar] {week} ERROR: {e}')
        stale = _CAL_CACHE.get(week, {}).get('data')
        return stale if stale is not None else []

# Load .env file if present (for local dev — set DATABASE_URL there to share Neon.tech with Render)
_env = BASE / '.env'
if _env.exists():
    for _line in _env.read_text(encoding='utf-8').splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip())

SESSIONS     = {}
PORT         = int(os.environ.get('PORT', 8765))
DATABASE_URL = os.environ.get('DATABASE_URL')


# ── STORAGE ────────────────────────────────────────────────────────────────────

if DATABASE_URL:
    import psycopg2
    import psycopg2.extras

    def _conn():
        url = DATABASE_URL
        if url.startswith('postgres://'):
            url = 'postgresql://' + url[11:]
        return psycopg2.connect(url)

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

    def load_users():
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT username, display_name, password_hash FROM users")
            return {r['username']: {'display_name': r['display_name'],
                                     'password_hash': r['password_hash']}
                    for r in cur.fetchall()}

    def save_user(username, display_name, password_hash):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO users (username, display_name, password_hash) VALUES (%s, %s, %s)
                ON CONFLICT (username) DO UPDATE
                  SET display_name  = EXCLUDED.display_name,
                      password_hash = EXCLUDED.password_hash
            """, (username, display_name, password_hash))

    def load_data(username):
        with _conn() as c, c.cursor() as cur:
            cur.execute("SELECT data FROM portfolios WHERE username = %s", (username,))
            row = cur.fetchone()
        return row[0].encode() if row else b'{}'

    def save_data(username, raw):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO portfolios (username, data) VALUES (%s, %s)
                ON CONFLICT (username) DO UPDATE SET data = EXCLUDED.data
            """, (username, raw.decode('utf-8')))

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

    _init_db()

else:
    USERS_FILE = BASE / 'users.json'

    def load_users():
        if USERS_FILE.exists():
            return json.loads(USERS_FILE.read_text(encoding='utf-8'))
        return {}

    def save_user(username, display_name, password_hash):
        users = load_users()
        users[username] = {'display_name': display_name, 'password_hash': password_hash}
        USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding='utf-8')

    def load_data(username):
        f = BASE / f'portfolio_{username}.json'
        if not f.exists():
            old = BASE / 'portfolio_data.json'
            return old.read_bytes() if old.exists() else b'{}'
        return f.read_bytes()

    def save_data(username, raw):
        (BASE / f'portfolio_{username}.json').write_bytes(raw)

    def _read_pfile(username):
        f = BASE / f'multiportfolio_{username}.json'
        if f.exists():
            return json.loads(f.read_text(encoding='utf-8'))
        return {'portfolio_list': []}

    def _write_pfile(username, pdata):
        f = BASE / f'multiportfolio_{username}.json'
        f.write_text(json.dumps(pdata, ensure_ascii=False), encoding='utf-8')

    def list_portfolios(username):
        return _read_pfile(username)['portfolio_list']

    def create_portfolio(username, portfolio_id, name, currency):
        pdata = _read_pfile(username)
        pdata['portfolio_list'].append({'id': portfolio_id, 'name': name, 'currency': currency})
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
        _write_pfile(username, pdata)
        f = BASE / f'pdata_{portfolio_id}.json'
        if f.exists():
            f.unlink()

    def load_portfolio_data(portfolio_id):
        f = BASE / f'pdata_{portfolio_id}.json'
        if f.exists():
            return json.loads(f.read_text(encoding='utf-8'))
        return {'portfolio': {'holdings': []}, 'transactions': [], 'snapshots': {}, 'snapshotsInvested': {}, 'cash': {}}

    def save_portfolio_data(portfolio_id, data):
        f = BASE / f'pdata_{portfolio_id}.json'
        f.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')


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
    create_portfolio(username, pid, 'Portfel domyślny', 'PLN')
    save_portfolio_data(pid, old)
    print(f'[migration] {username}: migrated old blob to "Portfel domyślny" (id={pid})')
    return list_portfolios(username)


def load_aggregate_data(username):
    """Merge all portfolios into a single data blob for dashboard 'Wszystkie' view."""
    portfolios = list_portfolios(username)
    merged_holdings = []
    merged_txs = []
    merged_snaps = {}
    merged_snaps_inv = {}
    merged_cash = {}
    symbol_set = {}

    for p in portfolios:
        pid = p['id']
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


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password: str, stored_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except Exception:
        return False


def get_username(handler):
    token = handler.headers.get('X-Auth-Token', '')
    if not isinstance(token, str) or len(token) > 100:
        return None
    return SESSIONS.get(token)


# ── HTTP HANDLER ───────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def _cors_origin(self):
        origin = self.headers.get('Origin', '')
        return origin if origin in _ALLOWED_ORIGINS else 'https://stockstracker.onrender.com'

    def _serve_static(self, filepath):
        """Serwuje plik statyczny z React dist."""
        content  = filepath.read_bytes()
        mime, _  = mimetypes.guess_type(str(filepath))
        in_assets = 'assets' in filepath.parts
        self.send_response(200)
        self.send_header('Content-Type', mime or 'application/octet-stream')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        # Assets mają hash w nazwie → można cachować długo
        self.send_header('Cache-Control',
                         'public, max-age=31536000, immutable' if in_assets else 'no-store, no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.end_headers()
        self.wfile.write(content)

    def _serve_react(self):
        """Serwuje React SPA (index.html)."""
        if not REACT_DIST.exists():
            self.send_json(503, {'error': 'React app not built — run: cd frontend-react && npm run build'})
            return
        self._serve_static(REACT_DIST / 'index.html')

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Cache-Control', 'no-store, no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.end_headers()
        self.wfile.write(body)

    def read_json(self, max_size: int = 8 * 1024):
        length = int(self.headers.get('Content-Length', 0))
        if length > max_size:
            raise ValueError('Request body too large')
        body = json.loads(self.rfile.read(max(0, length)))
        if not isinstance(body, dict):
            raise ValueError('Expected JSON object')
        return body

    def do_GET(self):
        path = self.path.split('?')[0]

        if path == '/api/calendar':
            qs   = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            week = qs.get('week', 'thisweek')
            if week not in ('thisweek', 'nextweek'):
                self.send_json(400, {'error': 'invalid week'}); return
            self.send_json(200, _fetch_calendar(week))

        elif path == '/api/users':
            users = load_users()
            self.send_json(200, [
                {'username': u, 'display_name': v['display_name']}
                for u, v in users.items()
            ])

        elif path == '/api/data':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body = load_data(username)
            except Exception as e:
                print(f'[db] load_data error for {username}: {e}')
                self.send_json(503, {'error': 'db_error'}); return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', self._cors_origin())
            self.send_header('Cache-Control', 'no-store, no-cache')
            self.end_headers()
            self.wfile.write(body)

        elif path.startswith('/api/finnhub/'):
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            token = os.environ.get('FINNHUB_TOKEN', '')
            if not token:
                self.send_json(503, {'error': 'FINNHUB_TOKEN not configured'}); return
            sub = path[len('/api/finnhub'):]          # e.g. /v1/quote
            if not re.fullmatch(r'[/a-zA-Z0-9_\-\.]+', sub) or '..' in sub:
                self.send_json(400, {'error': 'invalid path'}); return
            qs  = self.path.split('?', 1)[1] if '?' in self.path else ''
            if len(qs) > 500:
                self.send_json(400, {'error': 'query too long'}); return
            sep = '&' if qs else ''
            url = f'https://finnhub.io/api{sub}?{qs}{sep}token={token}'
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f'[proxy] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/alphavantage':
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            key = os.environ.get('ALPHAVANTAGE_KEY', '')
            if not key:
                self.send_json(503, {'error': 'ALPHAVANTAGE_KEY not configured'}); return
            qs  = self.path.split('?', 1)[1] if '?' in self.path else ''
            url = f'https://www.alphavantage.co/query?{qs}&apikey={key}'
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f'[proxy] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/proxy':
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            qs     = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            target = qs.get('url', '')
            if not target or len(target) > 2000:
                self.send_json(400, {'error': 'invalid url'}); return
            allowed = (
                'https://query1.finance.yahoo.com/',
                'https://query2.finance.yahoo.com/',
                'https://finance.yahoo.com/',
                'https://stooq.com/',
                'https://nfs.faireconomy.media/',
                'https://api.frankfurter.app/',
            )
            if not any(target.startswith(a) for a in allowed):
                self.send_json(403, {'error': 'forbidden'}); return
            try:
                req = urllib.request.Request(target, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f'[proxy] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/bench-pl':
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            qs  = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            sym = qs.get('s', '').upper()
            if sym not in ('WIG20', 'MWIG40', 'SWIG80'):
                self.send_json(400, {'error': 'invalid symbol'}); return
            data = _fetch_bench_pl(sym)
            if data is None:
                self.send_json(502, {'error': 'upstream request failed'})
            else:
                self.send_json(200, data)

        elif path.startswith('/api/dividends/upcoming'):
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            qs      = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            _sym_re = re.compile(r'^[A-Z0-9]{1,10}$')
            symbols = [s.strip().upper() for s in qs.get('symbols', '').split(',') if s.strip()]
            symbols = [s for s in symbols if _sym_re.match(s)][:_MAX_SYMBOLS]
            token   = os.environ.get('FINNHUB_TOKEN', '')
            today   = __import__('datetime').datetime.now().strftime('%Y-%m-%d')
            results = []

            for symbol in symbols:
                # Tylko US stocks (bez przyrostka giełdowego)
                if '.' in symbol:
                    continue
                try:
                    url = f'https://finnhub.io/api/v1/stock/dividend2?symbol={symbol}&token={token}'
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=6) as resp:
                        data = json.loads(resp.read())
                    upcoming = [d for d in data.get('data', []) if (d.get('payDate') or '') >= today]
                    if upcoming:
                        nxt = upcoming[0]
                        results.append({
                            'symbol':   symbol,
                            'exDate':   nxt.get('exDate'),
                            'payDate':  nxt.get('payDate'),
                            'amount':   nxt.get('amount'),
                            'currency': 'USD',
                            'isManual': False,
                        })
                except Exception as e:
                    print(f'[dividends] {symbol}: {e}')

            self.send_json(200, results)

        elif path in ('/', '/index.html', '/myfund.html'):
            content = (BASE / 'myfund.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        elif path == '/recover':
            html = '''<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recover Portfolio Data</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:32px;max-width:520px;width:100%}
h1{font-size:1.25rem;font-weight:700;margin-bottom:8px;color:#f8fafc}
p{color:#94a3b8;font-size:.9rem;margin-bottom:20px;line-height:1.5}
input{width:100%;padding:10px 14px;background:#0f172a;border:1px solid #475569;border-radius:8px;color:#f1f5f9;font-size:.9rem;margin-bottom:12px}
input:focus{outline:2px solid #6366f1;border-color:transparent}
button{width:100%;padding:11px;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;transition:opacity .15s}
.btn-primary{background:#6366f1;color:#fff}
.btn-primary:hover{opacity:.85}
.btn-success{background:#059669;color:#fff;margin-top:8px}
.btn-success:hover{opacity:.85}
.msg{padding:12px 16px;border-radius:8px;margin-top:16px;font-size:.875rem;line-height:1.5}
.msg-ok{background:#052e16;border:1px solid #166534;color:#4ade80}
.msg-err{background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171}
.msg-info{background:#0c1a2e;border:1px solid #1d4ed8;color:#93c5fd}
pre{font-size:.75rem;margin-top:8px;overflow:auto;max-height:200px;padding:8px;background:#0f172a;border-radius:6px;color:#94a3b8}
</style></head><body>
<div class="card">
<h1>&#128190; Odzysk danych portfela</h1>
<p>Ta strona odczyta dane portfela z Twojej przeglądarki i przywróci je do bazy danych.<br>
Zaloguj się, a następnie kliknij <strong>Przywróć dane</strong>.</p>
<div id="loginForm">
  <input id="uname" type="text" placeholder="Nazwa użytkownika" autocomplete="username">
  <input id="upass" type="password" placeholder="Hasło" autocomplete="current-password">
  <button class="btn-primary" onclick="doLogin()">Zaloguj się i sprawdź dane</button>
</div>
<div id="recoverSection" style="display:none">
  <div id="foundMsg"></div>
  <button class="btn-success" id="recoverBtn" style="display:none" onclick="doRecover()">&#128190; Przywróć dane do chmury</button>
</div>
<div id="msg"></div>
</div>
<script>
let _token = null;
let _oldData = null;

function showMsg(text, type='info') {
  document.getElementById('msg').innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}

function readOldData() {
  const portfolio = JSON.parse(localStorage.getItem('myfund_v3_portfolio') || 'null');
  const transactions = JSON.parse(localStorage.getItem('myfund_v3_transactions') || 'null');
  const snapshots = JSON.parse(localStorage.getItem('myfund_v3_snapshots') || 'null');
  const cash = JSON.parse(localStorage.getItem('myfund_v4_cash') || 'null');
  return { portfolio, transactions, snapshots, cash };
}

async function doLogin() {
  const u = document.getElementById('uname').value.trim();
  const p = document.getElementById('upass').value;
  if (!u || !p) { showMsg('Podaj login i hasło.', 'err'); return; }
  showMsg('Logowanie...', 'info');
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const d = await r.json();
    if (!d.ok) { showMsg('Błąd logowania: ' + d.error, 'err'); return; }
    _token = d.token;
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('recoverSection').style.display = 'block';
    checkOldData();
  } catch(e) { showMsg('Błąd: ' + e.message, 'err'); }
}

function checkOldData() {
  const old = readOldData();
  const holdings = old.portfolio?.holdings || [];
  const transactions = old.transactions || [];
  const snapKeys = Object.keys(old.snapshots || {}).length;
  const div = document.getElementById('foundMsg');
  if (holdings.length === 0 && transactions.length === 0 && snapKeys === 0) {
    div.innerHTML = '<div class="msg msg-err">Brak danych portfela w tej przeglądarce.<br>Dane mogły zostać usunięte lub używasz innej przeglądarki/urządzenia niż wcześniej.</div>';
    return;
  }
  div.innerHTML = `<div class="msg msg-info">Znaleziono dane:<ul style="margin-top:8px;padding-left:18px">
    <li>${holdings.length} pozycji w portfelu</li>
    <li>${transactions.length} transakcji</li>
    <li>${snapKeys} snapshotów historii</li>
    </ul></div>`;
  _oldData = old;
  document.getElementById('recoverBtn').style.display = 'block';
}

async function doRecover() {
  if (!_oldData || !_token) return;
  showMsg('Przywracanie danych...', 'info');
  try {
    const current = await fetch('/api/data', {
      headers: { 'X-Auth-Token': _token }
    }).then(r => r.json());
    const merged = {
      ...current,
      portfolio: _oldData.portfolio || current.portfolio,
      transactions: _oldData.transactions || current.transactions,
      snapshots: { ...(current.snapshots || {}), ...(_oldData.snapshots || {}) },
      cash: _oldData.cash || current.cash,
    };
    const r = await fetch('/api/data', {
      method: 'POST',
      headers: { 'X-Auth-Token': _token, 'Content-Type': 'application/json' },
      body: JSON.stringify(merged)
    });
    if (r.ok) {
      showMsg('&#10003; Dane przywrócone! <a href="https://stockstracker-mu.vercel.app" style="color:#818cf8">Przejdź do aplikacji</a>', 'ok');
      document.getElementById('recoverBtn').style.display = 'none';
    } else {
      showMsg('Błąd zapisu: HTTP ' + r.status, 'err');
    }
  } catch(e) { showMsg('Błąd: ' + e.message, 'err'); }
}
</script></body></html>'''.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(html)

        elif path in ('/app', '/app/') or path.startswith('/app/'):
            # React app has moved to Vercel — redirect permanently
            self.send_response(301)
            self.send_header('Location', 'https://stockstracker-ai.vercel.app')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()

        elif path.startswith('/assets/') or path in ('/favicon.ico', '/favicon.png'):
            # Static assets built by Vite — serve from frontend-react/dist
            rel = path.lstrip('/')
            filepath = (REACT_DIST / rel).resolve()
            try:
                filepath.relative_to(REACT_DIST.resolve())
            except ValueError:
                self.send_response(403); self.end_headers(); return
            if filepath.exists() and filepath.is_file():
                self._serve_static(filepath)
            else:
                self.send_response(404); self.end_headers()

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = self.path.split('?')[0]

        if path in ('/api/login', '/api/register'):
            ip = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()
            if _rate_limited(ip):
                self.send_json(429, {'ok': False, 'error': 'Za dużo prób. Spróbuj ponownie za 15 minut.'}); return

        if path == '/api/login':
            try:
                body     = self.read_json(_MAX_BODY_AUTH)
                username = _str(body.get('username', ''), 64, 'username').lower()
                password = _str(body.get('password', ''), 1024, 'password')
                if not _USERNAME_RE.match(username):
                    self.send_json(400, {'ok': False, 'error': 'Nieprawidłowa nazwa użytkownika'}); return
                users = load_users()
                authenticated = False
                if username in users:
                    stored = users[username]['password_hash']
                    if check_password(password, stored):
                        authenticated = True
                    elif hashlib.sha256(password.encode()).hexdigest() == stored:
                        # Migrate legacy SHA-256 hash to bcrypt on first login
                        save_user(username, users[username]['display_name'], hash_password(password))
                        authenticated = True
                if authenticated:
                    token = secrets.token_hex(24)
                    SESSIONS[token] = username
                    self.send_json(200, {'ok': True, 'token': token,
                                         'display_name': users[username]['display_name']})
                else:
                    self.send_json(401, {'ok': False, 'error': 'Błędny login lub hasło'})
            except ValueError as e:
                self.send_json(400, {'ok': False, 'error': str(e)})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': 'Bad request'})

        elif path == '/api/register':
            try:
                body         = self.read_json(_MAX_BODY_AUTH)
                username     = _str(body.get('username', ''), 64, 'username').lower()
                display_name = _str(body.get('display_name', ''), 64, 'display_name')
                password     = _str(body.get('password', ''), 1024, 'password')
                if not _USERNAME_RE.match(username):
                    self.send_json(400, {'ok': False,
                                         'error': 'Nazwa użytkownika: 1–64 znaków, tylko litery/cyfry/-/_'}); return
                if len(password) < 6:
                    self.send_json(400, {'ok': False, 'error': 'Hasło musi mieć co najmniej 6 znaków'}); return
                users = load_users()
                if username in users:
                    self.send_json(409, {'ok': False, 'error': 'Nazwa użytkownika już zajęta'}); return
                save_user(username, display_name or username, hash_password(password))
                token = secrets.token_hex(24)
                SESSIONS[token] = username
                self.send_json(200, {'ok': True, 'token': token,
                                      'display_name': display_name or username})
            except ValueError as e:
                self.send_json(400, {'ok': False, 'error': str(e)})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': 'Bad request'})

        elif path == '/api/logout':
            SESSIONS.pop(self.headers.get('X-Auth-Token', ''), None)
            self.send_json(200, {'ok': True})

        elif path == '/api/change-password':
            username = get_username(self)
            if not username:
                self.send_json(401, {'ok': False, 'error': 'unauthorized'}); return
            try:
                body       = self.read_json(_MAX_BODY_AUTH)
                current_pw = _str(body.get('current_password', ''), 1024, 'current_password')
                new_pw     = _str(body.get('new_password', ''),     1024, 'new_password')
                if len(new_pw) < 6:
                    self.send_json(400, {'ok': False, 'error': 'Nowe hasło musi mieć co najmniej 6 znaków'}); return
                users = load_users()
                if not check_password(current_pw, users.get(username, {}).get('password_hash', '')):
                    self.send_json(401, {'ok': False, 'error': 'Aktualne hasło jest nieprawidłowe'}); return
                save_user(username, users[username]['display_name'], hash_password(new_pw))
                self.send_json(200, {'ok': True})
            except ValueError as e:
                self.send_json(400, {'ok': False, 'error': str(e)})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': 'Bad request'})

        elif path == '/api/data':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                length = int(self.headers.get('Content-Length', 0))
                if length > _MAX_BODY_DATA:
                    self.send_json(413, {'ok': False, 'error': 'Dane zbyt duże (max 512 KB)'}); return
                raw    = self.rfile.read(max(0, length))
                parsed = json.loads(raw)
                if not isinstance(parsed, dict):
                    self.send_json(400, {'ok': False, 'error': 'Oczekiwano obiektu JSON'}); return
                save_data(username, raw)
                self.send_json(200, {'ok': True})
            except json.JSONDecodeError:
                self.send_json(400, {'ok': False, 'error': 'Nieprawidłowy JSON'})

        else:
            self.send_response(405); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


# ── START ──────────────────────────────────────────────────────────────────────

def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80)); return s.getsockname()[0]
    except Exception:
        return 'localhost'
    finally:
        s.close()


if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    ip = local_ip()
    print('StocksTracker server działa:')
    print(f'  Komputer : http://localhost:{PORT}/myfund.html')
    print(f'  Telefon  : http://{ip}:{PORT}/myfund.html')
    if DATABASE_URL:
        print('  Baza     : Neon PostgreSQL ✓')
    else:
        print('  Baza     : pliki lokalne (brak .env / DATABASE_URL)')
    print('Ctrl+C aby zatrzymać.')
    server.serve_forever()
