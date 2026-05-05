#!/usr/bin/env python3
"""
StocksTracker server — serwuje pliki statyczne, obsługuje auth i per-user dane portfela.
Lokalnie: przechowuje dane w plikach JSON.
W chmurze: przechowuje dane w PostgreSQL (zmienna DATABASE_URL).
"""
import json
import hashlib
import secrets
import socket
import os
import urllib.parse
import urllib.request
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASE = Path(__file__).parent

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

        if path == '/api/users':
            users = load_users()
            self.send_json(200, [
                {'username': u, 'display_name': v['display_name']}
                for u, v in users.items()
            ])

        elif path == '/api/data':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            body = load_data(username)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-store, no-cache')
            self.end_headers()
            self.wfile.write(body)

        elif path == '/api/proxy':
            qs     = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            target = qs.get('url', '')
            allowed = (
                'https://query1.finance.yahoo.com/',
                'https://query2.finance.yahoo.com/',
                'https://finance.yahoo.com/',
                'https://stooq.com/',
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

        elif path in ('/', '/index.html', '/myfund.html'):
            content = (BASE / 'myfund.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = self.path.split('?')[0]

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
