"""Uzupelnianie kursow historycznych NBP: poza sciezka zadania i z pamiecia pudel.

Blad, ktory to wywolal: _backfill_snapshot_fx bylo wolane z load_portfolio_data,
wiec kazde wejscie na strone probowalo uzupelnic fx_json. Dla daty, ktorej NBP
nie zna, zapis nigdy nie nastepowal (warunek wymagal choc jednego kursu > 0),
wiec przy nastepnym odczycie leciala dokladnie ta sama seria zapytan do NBP —
3 waluty po 8 prob. Zmierzone na produkcji: ~2 s narzutu na kazde zaladowanie
strony, w nieskonczonosc, mnozone przez liczbe takich dat i portfeli.

Dwie rzeczy sa tu pilnowane:
  1. odczyt danych portfela nie dotyka NBP,
  2. jednoznaczne "NBP nie ma kursu na ten dzien" zapamietujemy, ale
     przejsciowej awarii sieci juz nie — inaczej zamrozilibysmy blad.
"""
import datetime
import io
import json
import sys
import types
import urllib.error
from pathlib import Path

# ── zaslepka psycopg2, zeby server.py wszedl w galaz DATABASE_URL ────────────
FX_HIST = {}        # (currency, 'YYYY-MM-DD') -> rate (0.0 = zapamietane pudlo)
SNAPSHOTS = {}      # (pid, 'YYYY-MM-DD') -> fx_json albo None
PORTFOLIOS = []     # [pid]


class _RealDictCursor:
    """Znacznik — psycopg2.extras.RealDictCursor jest tylko porownywany."""


class FakeCursor:
    def __init__(self, cursor_factory=None):
        self.dict_rows = cursor_factory is _RealDictCursor
        self.rows = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        p = params or ()
        self.rows = []

        if 'FROM fx_rates_history' in s:
            currency, dates = p[0], list(p[1])
            for d in dates:
                r = FX_HIST.get((currency, d))
                if r is not None:
                    self.rows.append((datetime.date.fromisoformat(d), r))

        elif 'FROM portfolio_snapshots' in s and 'fx_json IS NULL' in s:
            pid = p[0]
            self.rows = [(d,) for (q, d), fx in sorted(SNAPSHOTS.items())
                         if q == pid and not fx]

        elif 'SELECT date::text, total, invested, fx_json FROM portfolio_snapshots' in s:
            pid = p[0]
            self.rows = [{'date': d, 'total': 100.0, 'invested': 90.0, 'fx_json': fx}
                         for (q, d), fx in sorted(SNAPSHOTS.items()) if q == pid]

        elif 'SELECT id FROM portfolio_list' in s:
            self.rows = [(pid,) for pid in PORTFOLIOS]

        elif 'UPDATE portfolio_snapshots' in s and 'fx_json' in s:
            fx_json, pid, d = p
            SNAPSHOTS[(pid, d)] = fx_json

        elif 'INSERT INTO fx_rates_history' in s:
            currency, d, rate = p
            FX_HIST.setdefault((currency, d), rate)

    def executemany(self, sql, seq):
        for params in seq:
            self.execute(sql, params)

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConn:
    def cursor(self, cursor_factory=None):
        return FakeCursor(cursor_factory)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def commit(self):
        pass

    def close(self):
        pass


fake_psycopg2 = types.ModuleType('psycopg2')
fake_psycopg2.connect = lambda *a, **k: FakeConn()
fake_extras = types.ModuleType('psycopg2.extras')
fake_extras.RealDictCursor = _RealDictCursor
fake_psycopg2.extras = fake_extras
sys.modules['psycopg2'] = fake_psycopg2
sys.modules['psycopg2.extras'] = fake_extras

import os                                          # noqa: E402
os.environ['DATABASE_URL'] = 'postgresql://test/test'
sys.path.insert(0, str(Path(__file__).parent))
import server                                      # noqa: E402

fails = []


def check(name, cond, detail=''):
    print(('PASS  ' if cond else 'FAIL  ') + name + ('  -- ' + str(detail) if detail else ''))
    if not cond:
        fails.append(name)


# ── zaslepka NBP ─────────────────────────────────────────────────────────────
nbp_calls = []
MODE = ['404']          # '404' | 'timeout' | 'ok-third'


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_urlopen(req, timeout=None):
    url = req.full_url if hasattr(req, 'full_url') else str(req)
    if 'api.nbp.pl' not in url:
        raise urllib.error.URLError('poza zakresem testu')
    nbp_calls.append(url)
    if MODE[0] == 'timeout':
        raise TimeoutError('timed out')
    if MODE[0] == 'ok-third' and len([u for u in nbp_calls if u == url]) >= 1 \
            and url.count('-') and _is_third_offset(url):
        return _Resp(json.dumps({'rates': [{'mid': 4.1234}]}).encode())
    raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)


def _is_third_offset(url):
    """W trybie 'ok-third' NBP oddaje kurs dopiero dla daty o 2 dni wczesniejszej
    (typowy weekend) — sprawdzamy, czy w URL siedzi wlasnie ta data."""
    return THIRD_DATE[0] in url


THIRD_DATE = ['']
server.urllib.request.urlopen = fake_urlopen


def reset(mode='404'):
    nbp_calls.clear()
    MODE[0] = mode
    FX_HIST.clear()
    SNAPSHOTS.clear()
    PORTFOLIOS.clear()


# ── 1. _nbp_fetch_rate: trafienie po cofnieciu sie o weekend ─────────────────
reset('ok-third')
THIRD_DATE[0] = '2026-07-24'
rate, definitive = server._nbp_fetch_rate('USD', '2026-07-26')
check('kurs znaleziony po cofnieciu sie do piatku', rate == 4.1234, rate)
check('trafienie nie jest pudlem', definitive is False, definitive)

# ── 2. _nbp_fetch_rate: same 404 to jednoznaczne pudlo ──────────────────────
reset('404')
rate, definitive = server._nbp_fetch_rate('USD', '2027-03-15')
check('brak kursu przy samych 404', rate is None, rate)
check('same 404 uznajemy za pudlo jednoznaczne', definitive is True, definitive)
check('probowalismy osmiu kolejnych dni', len(nbp_calls) == 8, len(nbp_calls))

# ── 3. _nbp_fetch_rate: timeout to NIE jest jednoznaczne pudlo ──────────────
reset('timeout')
rate, definitive = server._nbp_fetch_rate('USD', '2027-03-15')
check('timeout nie daje kursu', rate is None, rate)
check('timeout nie jest pudlem jednoznacznym', definitive is False, definitive)

# ── 4. pudlo zapamietane: drugie przejscie nie rusza NBP ────────────────────
reset('404')
server._nbp_historical_rates(['2027-03-15'])
first_round = len(nbp_calls)
nbp_calls.clear()
server._nbp_historical_rates(['2027-03-15'])
check('pierwsze przejscie faktycznie pyta NBP', first_round > 0, first_round)
check('drugie przejscie nie wysyla ani jednego zapytania do NBP',
      len(nbp_calls) == 0, len(nbp_calls))

# ── 5. zapamietane pudlo nie wycieka jako kurs zerowy ───────────────────────
out = server._nbp_historical_rates(['2027-03-15'])
fx = out.get('2027-03-15', {})
check('pudlo nie trafia do wyniku jako kurs 0',
      all(v > 0 for v in fx.values()), fx)

# ── 6. przejsciowa awaria NIE jest zapamietywana ────────────────────────────
reset('timeout')
server._nbp_historical_rates(['2027-03-15'])
nbp_calls.clear()
server._nbp_historical_rates(['2027-03-15'])
check('po timeoucie druga proba znow pyta NBP', len(nbp_calls) > 0, len(nbp_calls))

# ── 7. odczyt danych portfela nie dotyka NBP ────────────────────────────────
reset('404')
PORTFOLIOS.append('pid1')
SNAPSHOTS[('pid1', '2027-03-15')] = None      # snapshot bez fx_json
data = server.load_portfolio_data('pid1')
check('load_portfolio_data nie wysyla zapytan do NBP',
      len(nbp_calls) == 0, f'{len(nbp_calls)} zapytan')
check('odczyt nadal zwraca snapshoty', '2027-03-15' in data['snapshots'], data['snapshots'])

# ── 8. uzupelnianie w tle nadal dziala ──────────────────────────────────────
reset('ok-third')
THIRD_DATE[0] = '2026-07-24'
PORTFOLIOS.append('pid1')
SNAPSHOTS[('pid1', '2026-07-26')] = None
server._backfill_all_snapshot_fx()
check('przebieg w tle uzupelnia fx_json', bool(SNAPSHOTS[('pid1', '2026-07-26')]),
      SNAPSHOTS[('pid1', '2026-07-26')])

print()
print('BLEDY: ' + ', '.join(fails) if fails else 'WSZYSTKO OK')
sys.exit(1 if fails else 0)
