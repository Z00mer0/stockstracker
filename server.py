#!/usr/bin/env python3
"""
StocksTracker server — serwuje pliki statyczne, obsługuje auth i per-user dane portfela.
Lokalnie: przechowuje dane w plikach JSON.
W chmurze: przechowuje dane w PostgreSQL (zmienna DATABASE_URL).
"""
import json
import hashlib
import mimetypes
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

# ── CALENDAR CACHE ─────────────────────────────────────────────────────────────
_CAL_CACHE = {}   # { 'thisweek': {'data': [...], 'ts': float}, 'nextweek': {...} }
_CAL_TTL   = 4 * 3600  # 4 hours

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


def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def get_username(handler):
    return SESSIONS.get(handler.headers.get('X-Auth-Token', ''))


# ── HTTP HANDLER ───────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def _serve_static(self, filepath):
        """Serwuje plik statyczny z React dist."""
        content  = filepath.read_bytes()
        mime, _  = mimetypes.guess_type(str(filepath))
        in_assets = 'assets' in filepath.parts
        self.send_response(200)
        self.send_header('Content-Type', mime or 'application/octet-stream')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', '*')
        # Assets mają hash w nazwie → można cachować długo
        self.send_header('Cache-Control',
                         'public, max-age=31536000, immutable' if in_assets else 'no-store, no-cache')
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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache')
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(length))

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
                self.send_json(503, {'error': 'db_error', 'detail': str(e)}); return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache')
            self.end_headers()
            self.wfile.write(body)

        elif path.startswith('/api/finnhub/'):
            token = os.environ.get('FINNHUB_TOKEN', '')
            if not token:
                self.send_json(503, {'error': 'FINNHUB_TOKEN not configured'}); return
            sub = path[len('/api/finnhub'):]          # e.g. /v1/quote
            qs  = self.path.split('?', 1)[1] if '?' in self.path else ''
            sep = '&' if qs else ''
            url = f'https://finnhub.io/api{sub}?{qs}{sep}token={token}'
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_json(502, {'error': str(e)})

        elif path == '/api/alphavantage':
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_json(502, {'error': str(e)})

        elif path == '/api/proxy':
            qs     = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            target = qs.get('url', '')
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_json(502, {'error': str(e)})

        elif path.startswith('/api/dividends/upcoming'):
            qs      = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            symbols = [s.strip() for s in qs.get('symbols', '').split(',') if s.strip()]
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

        # ── React SPA pod /app/* ──────────────────────────────────────────────
        elif path in ('/app', '/app/'):
            self._serve_react()

        elif path.startswith('/app/'):
            rel = path[5:].lstrip('/')     # np. 'assets/index-abc.js'
            fp  = REACT_DIST / rel
            if fp.exists() and fp.is_file():
                self._serve_static(fp)
            else:
                self._serve_react()        # SPA fallback dla React Router

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
                body     = self.read_json()
                username = body.get('username', '').strip().lower()
                password = str(body.get('password', ''))
                users    = load_users()
                if username in users and users[username]['password_hash'] == hash_password(password):
                    token = secrets.token_hex(24)
                    SESSIONS[token] = username
                    self.send_json(200, {'ok': True, 'token': token,
                                         'display_name': users[username]['display_name']})
                else:
                    self.send_json(401, {'ok': False, 'error': 'Błędny login lub hasło'})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': str(e)})

        elif path == '/api/register':
            try:
                body         = self.read_json()
                username     = body.get('username', '').strip().lower()
                display_name = body.get('display_name', '').strip()
                password     = str(body.get('password', ''))
                if not username or len(password) < 6:
                    self.send_json(400, {'ok': False,
                                         'error': 'Wymagana nazwa użytkownika i hasło (min. 6 znaków)'}); return
                users = load_users()
                if username in users:
                    self.send_json(409, {'ok': False, 'error': 'Nazwa użytkownika już zajęta'}); return
                save_user(username, display_name or username, hash_password(password))
                token = secrets.token_hex(24)
                SESSIONS[token] = username
                self.send_json(200, {'ok': True, 'token': token,
                                      'display_name': display_name or username})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': str(e)})

        elif path == '/api/logout':
            SESSIONS.pop(self.headers.get('X-Auth-Token', ''), None)
            self.send_json(200, {'ok': True})

        elif path == '/api/change-password':
            username = get_username(self)
            if not username:
                self.send_json(401, {'ok': False, 'error': 'unauthorized'}); return
            try:
                body         = self.read_json()
                current_pw   = str(body.get('current_password', ''))
                new_pw       = str(body.get('new_password', ''))
                if len(new_pw) < 6:
                    self.send_json(400, {'ok': False, 'error': 'Nowe hasło musi mieć co najmniej 6 znaków'}); return
                users = load_users()
                if users.get(username, {}).get('password_hash') != hash_password(current_pw):
                    self.send_json(401, {'ok': False, 'error': 'Aktualne hasło jest nieprawidłowe'}); return
                save_user(username, users[username]['display_name'], hash_password(new_pw))
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': str(e)})

        elif path == '/api/data':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                length = int(self.headers.get('Content-Length', 0))
                raw    = self.rfile.read(length)
                json.loads(raw)
                save_data(username, raw)
                self.send_json(200, {'ok': True})
            except json.JSONDecodeError:
                self.send_json(400, {'ok': False, 'error': 'invalid JSON'})

        else:
            self.send_response(405); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token')
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
