"""Uzupelnianie kursow historycznych NBP: poza sciezka zadania, zakresowo i z pamiecia pudel.

Blad, ktory to wywolal: _backfill_snapshot_fx bylo wolane z load_portfolio_data,
wiec kazde wejscie na strone probowalo uzupelnic fx_json. Dla daty, ktorej NBP
nie zna, zapis nigdy nie nastepowal (warunek wymagal choc jednego kursu > 0),
wiec przy nastepnym odczycie leciala dokladnie ta sama seria zapytan do NBP.
Zmierzone na produkcji: ~2 s narzutu na kazde zaladowanie strony, bez konca,
mnozone przez liczbe takich dat i portfeli.

Pilnowane sa cztery rzeczy:
  1. odczyt danych portfela nie dotyka NBP,
  2. braki pobieramy zakresem — jedno zapytanie na walute, nie osiem na date,
  3. jednoznaczne "NBP nie ma kursu na ten dzien" zapamietujemy,
  4. przejsciowej awarii sieci juz nie — inaczej zamrozilibysmy blad na stale.
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


# ── zaslepka NBP (endpoint zakresowy) ────────────────────────────────────────
nbp_calls = []
MODE = ['ok']           # 'ok' | '404' | 'timeout'
RATE = 4.1234


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
    if MODE[0] == '404':
        raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)
    # .../rates/A/USD/2026-07-16/2026-07-26/?format=json
    parts = url.split('?')[0].rstrip('/').split('/')
    start = datetime.date.fromisoformat(parts[-2])
    end = datetime.date.fromisoformat(parts[-1])
    # Tak samo jak prawdziwe NBP: zakres siegajacy w przyszlosc to 400
    # "Bledny zakres dat" i NIC nie wraca — nawet czesc z przeszlosci.
    if end > datetime.date.today():
        raise urllib.error.HTTPError(url, 400, 'Bad Request', {}, None)
    if (end - start).days > 366:
        raise urllib.error.HTTPError(url, 400, 'Bad Request', {}, None)
    rates = []
    d = start
    while d <= end:
        if d.weekday() < 5:                 # NBP publikuje tylko w dni robocze
            rates.append({'effectiveDate': d.isoformat(), 'mid': RATE})
        d += datetime.timedelta(days=1)
    if not rates:
        raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)
    return _Resp(json.dumps({'rates': rates}).encode())


server.urllib.request.urlopen = fake_urlopen


def reset(mode='ok'):
    nbp_calls.clear()
    MODE[0] = mode
    FX_HIST.clear()
    SNAPSHOTS.clear()
    PORTFOLIOS.clear()


# Daty liczone wzgledem dzisiaj — test nie moze sie zestarzec.
TODAY = datetime.date.today()
LAST_MON = TODAY - datetime.timedelta(days=TODAY.weekday() + 7)   # poniedzialek
WEEK = [(LAST_MON + datetime.timedelta(days=i)).isoformat() for i in range(5)]
SAT, SUN = (LAST_MON + datetime.timedelta(days=5)), (LAST_MON + datetime.timedelta(days=6))
FUTURE = (TODAY + datetime.timedelta(days=200)).isoformat()
ANCIENT = '1999-01-04'          # przed 2002 — NBP naprawde nie ma tych danych

# ── 1. _nbp_fetch_range: zakres oddaje dni notowan ──────────────────────────
reset('ok')
published, ok = server._nbp_fetch_range('USD', LAST_MON, SUN)
check('zakres zwraca kursy dni roboczych', len(published) == 5, sorted(published))
check('zakres to jedno zapytanie', len(nbp_calls) == 1, len(nbp_calls))
check('udany zakres nie zglasza awarii', ok is True, ok)
check('weekend nie ma wpisu', SAT.isoformat() not in published, sorted(published))

# ── 2. 404 na oknie to brak notowan, nie awaria ─────────────────────────────
reset('404')
published, ok = server._nbp_fetch_range('USD', LAST_MON, SUN)
check('404 daje pusta mape', published == {}, published)
check('404 nie jest awaria — wolno zapamietac pudlo', ok is True, ok)

# ── 3. timeout to awaria ────────────────────────────────────────────────────
reset('timeout')
published, ok = server._nbp_fetch_range('USD', LAST_MON, SUN)
check('timeout zglasza awarie', ok is False, ok)

# ── 4. _rate_at_or_before: niedziela cofa sie do piatku ─────────────────────
pub = {WEEK[4]: RATE}
check('niedziela bierze kurs z piatku',
      server._rate_at_or_before(pub, SUN.isoformat()) == RATE,
      server._rate_at_or_before(pub, SUN.isoformat()))
far = (SUN + datetime.timedelta(days=20)).isoformat()
check('poza oknem osmiu dni brak kursu',
      server._rate_at_or_before(pub, far) is None,
      server._rate_at_or_before(pub, far))

# ── 5. jedno zapytanie na walute zamiast osmiu na date ──────────────────────
reset('ok')
out = server._nbp_historical_rates(WEEK)
check('kursy doszly dla wszystkich dat',
      all(out[d].get('USD') == RATE for d in WEEK), out)
check('pyta raz na walute, nie raz na date (3 waluty = 3 zapytania)',
      len(nbp_calls) == 3, f'{len(nbp_calls)} zapytan na {len(WEEK)} dat')

# ── 6. data z przyszlosci: zadnego zapytania, zadnego pudla w cache ─────────
# NBP na zakres siegajacy w przyszlosc oddaje 400 i nie zwraca nic. Takiej daty
# nie pytamy i nie zapamietujemy — gdy stanie sie przeszloscia, dobierze kurs.
reset('ok')
out = server._nbp_historical_rates([FUTURE])
check('data z przyszlosci nie generuje zapytania do NBP',
      len(nbp_calls) == 0, f'{len(nbp_calls)} zapytan')
check('data z przyszlosci nie dostaje kursu', out[FUTURE] == {'PLN': 1.0}, out[FUTURE])
check('data z przyszlosci nie ladu je w cache jako pudlo',
      not any(k[1] == FUTURE for k in FX_HIST), sorted(FX_HIST))

# ── 7. jedna data z przyszlosci nie zabiera kursow reszcie ─────────────────
# Regresja: przy jednym zapytaniu na min..max NBP oddawal 400 na caly zakres,
# wiec poprawne daty zostawaly bez kursu i ladowaly w cache jako pudla.
reset('ok')
out = server._nbp_historical_rates(WEEK + [FUTURE])
check('daty z przeszlosci dostaja kursy mimo przyszlej daty obok',
      all(out[d].get('USD') == RATE for d in WEEK),
      {d: out[d] for d in WEEK})
check('zadna poprawna data nie zostala zapisana jako pudlo',
      all(v > 0 for v in FX_HIST.values()), sorted(FX_HIST.items())[:5])

# ── 8. pudlo zapamietane: drugie przejscie nie rusza NBP ────────────────────
reset('404')
server._nbp_historical_rates([ANCIENT])
first_round = len(nbp_calls)
nbp_calls.clear()
server._nbp_historical_rates([ANCIENT])
check('pierwsze przejscie faktycznie pyta NBP', first_round > 0, first_round)
check('drugie przejscie nie wysyla ani jednego zapytania do NBP',
      len(nbp_calls) == 0, len(nbp_calls))

# ── 9. zapamietane pudlo nie wycieka jako kurs zerowy ───────────────────────
out = server._nbp_historical_rates([ANCIENT])
fx = out.get(ANCIENT, {})
check('pudlo nie trafia do wyniku jako kurs 0',
      all(v > 0 for v in fx.values()), fx)

# ── 10. przejsciowa awaria NIE jest zapamietywana ───────────────────────────
reset('timeout')
server._nbp_historical_rates([ANCIENT])
nbp_calls.clear()
server._nbp_historical_rates([ANCIENT])
check('po timeoucie druga proba znow pyta NBP', len(nbp_calls) > 0, len(nbp_calls))

# ── 11. odczyt danych portfela nie dotyka NBP ───────────────────────────────
reset('404')
PORTFOLIOS.append('pid1')
SNAPSHOTS[('pid1', ANCIENT)] = None           # snapshot bez fx_json
data = server.load_portfolio_data('pid1')
check('load_portfolio_data nie wysyla zapytan do NBP',
      len(nbp_calls) == 0, f'{len(nbp_calls)} zapytan')
check('odczyt nadal zwraca snapshoty', ANCIENT in data['snapshots'], data['snapshots'])

# ── 12. uzupelnianie w tle nadal dziala ─────────────────────────────────────
reset('ok')
PORTFOLIOS.append('pid1')
SNAPSHOTS[('pid1', SUN.isoformat())] = None   # niedziela — kurs z piatku
server._backfill_all_snapshot_fx()
saved = SNAPSHOTS[('pid1', SUN.isoformat())]
check('przebieg w tle uzupelnia fx_json', bool(saved), saved)
check('uzupelniony kurs to kurs z ostatniego dnia notowan',
      bool(saved) and json.loads(saved).get('USD') == RATE, saved)

print()
print('BLEDY: ' + ', '.join(fails) if fails else 'WSZYSTKO OK')
sys.exit(1 if fails else 0)
