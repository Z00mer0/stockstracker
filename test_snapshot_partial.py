"""Scheduler snapshotow: fallback do avgPrice zamiast cichego pominiecia portfela.

Wczesniej _run_daily_snapshots wymagal pelnego pokrycia cenami — mial zabezpiecza
przed zaniżonym snapshotem, gdy batch YF wraca z 25% pozycji (patrz 4000fb3).
Efekt uboczny, ktory nas wywrocil: JEDEN bledny ticker w portfelu 41-elementowym
(np. SMSN zamiast SMSN.IL) wylaczal snapshoty dla calego portfela na 20 dni,
bez zadnego sygnalu w UI.

Kompromis: <=20% brakujacych to lokalny problem, uzupelniamy cena kosztu
(avgPrice). Wiecej to awaria batcha — pomijamy jak dawniej.
"""
import datetime
import io
import json
import sys
import types
import urllib.error
from pathlib import Path

# ── zaslepka bazy — tak samo jak w test_fx_backfill.py, wyciete do minimum ──
HOLDINGS = {}        # pid -> [{'symbol','qty','avg_price','currency'}]
CASH = {}            # pid -> [{'currency','amount'}]
FX_HIST = {}
SNAPSHOTS_WRITTEN = {}   # (pid, date) -> {'total','invested','fx_json'}


class _RealDictCursor: pass


class FakeCursor:
    def __init__(self, cursor_factory=None):
        self.dict_rows = cursor_factory is _RealDictCursor
        self.rows = []

    def __enter__(self): return self
    def __exit__(self, *a): return False

    def execute(self, sql, params=None):
        s = ' '.join(sql.split())
        p = params or ()
        self.rows = []

        if 'SELECT id FROM portfolio_list' in s:
            self.rows = [{'id': pid} if self.dict_rows else (pid,)
                         for pid in HOLDINGS.keys()]

        elif 'FROM portfolio_holdings' in s and 'qty>0' in s:
            pid = p[0]
            self.rows = [dict(h) for h in HOLDINGS.get(pid, [])]

        elif 'FROM portfolio_cash' in s and 'portfolio_id=%s' in s:
            pid = p[0]
            self.rows = [dict(c) for c in CASH.get(pid, [])]

        elif 'INSERT INTO portfolio_snapshots' in s:
            pid, date, total, invested, fx_json = p
            SNAPSHOTS_WRITTEN[(pid, date)] = {
                'total': float(total), 'invested': float(invested), 'fx_json': fx_json
            }

        elif 'FROM fx_rates_history' in s:
            currency, dates = p[0], list(p[1])
            for d in dates:
                r = FX_HIST.get((currency, d))
                if r is not None:
                    self.rows.append((datetime.date.fromisoformat(d), r))

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
    def cursor(self, cursor_factory=None): return FakeCursor(cursor_factory)
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def commit(self): pass
    def close(self): pass


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


# ── zaslepki cen i kursow ────────────────────────────────────────────────────
PRICES = {}


def fake_fetch_all_prices(symbols):
    return {s: PRICES[s] for s in symbols if s in PRICES}


def fake_nbp_rates():
    return {'PLN': 1.0, 'USD': 3.80, 'EUR': 4.30, 'GBP': 5.10}


server._fetch_all_prices = fake_fetch_all_prices
server._nbp_rates = fake_nbp_rates
# _refresh_financials_background wystartowalby prawdziwy watek — nie chcemy.
server._refresh_financials_background = lambda *a, **k: None

fails = []


def check(name, cond, detail=''):
    print(('PASS  ' if cond else 'FAIL  ') + name + ('  -- ' + str(detail) if detail else ''))
    if not cond:
        fails.append(name)


def reset():
    HOLDINGS.clear()
    CASH.clear()
    FX_HIST.clear()
    SNAPSHOTS_WRITTEN.clear()
    PRICES.clear()


TODAY = datetime.date.today().isoformat()


# ── 1. Pojedynczy brakujacy ticker w portfelu 5-elementowym: snapshot zapisany
#      z avgPrice dla brakujacego. Regresja SMSN. ─────────────────────────────
reset()
HOLDINGS['pid1'] = [
    {'symbol': 'AAPL', 'qty': 10, 'avg_price': 150.0, 'currency': 'USD'},
    {'symbol': 'MSFT', 'qty': 5,  'avg_price': 300.0, 'currency': 'USD'},
    {'symbol': 'NVDA', 'qty': 8,  'avg_price': 400.0, 'currency': 'USD'},
    {'symbol': 'META', 'qty': 3,  'avg_price': 500.0, 'currency': 'USD'},
    {'symbol': 'SMSN', 'qty': 0.045, 'avg_price': 4534.0, 'currency': 'GBP'},
]
PRICES.update({'AAPL': 180.0, 'MSFT': 350.0, 'NVDA': 500.0, 'META': 550.0})
# SMSN celowo pominiete — nie ma go w PRICES

server._run_daily_snapshots()
snap = SNAPSHOTS_WRITTEN.get(('pid1', TODAY))
check('snapshot zapisany mimo braku ceny dla 1/5 pozycji (ratio 20%)',
      snap is not None, snap)
if snap:
    # total = 10*180*3.80 + 5*350*3.80 + 8*500*3.80 + 3*550*3.80 + 0.045*4534*5.10
    expected = 10*180*3.80 + 5*350*3.80 + 8*500*3.80 + 3*550*3.80 + 0.045*4534.0*5.10
    check('total uzywa avgPrice dla brakujacego symbolu',
          abs(snap['total'] - expected) < 0.01,
          f'got={snap["total"]:.2f} expected={expected:.2f}')


# ── 2. Duza awaria batcha (4/5 bez ceny): portfel pomijany jak dawniej ─────
reset()
HOLDINGS['pid1'] = [
    {'symbol': 'AAPL', 'qty': 10, 'avg_price': 150.0, 'currency': 'USD'},
    {'symbol': 'MSFT', 'qty': 5,  'avg_price': 300.0, 'currency': 'USD'},
    {'symbol': 'NVDA', 'qty': 8,  'avg_price': 400.0, 'currency': 'USD'},
    {'symbol': 'META', 'qty': 3,  'avg_price': 500.0, 'currency': 'USD'},
    {'symbol': 'AMZN', 'qty': 2,  'avg_price': 100.0, 'currency': 'USD'},
]
PRICES.update({'AAPL': 180.0})   # tylko jedna cena

server._run_daily_snapshots()
check('awaria batcha (4/5 bez ceny) — portfel pominiety, brak wpisu lepszy niz zaniżony',
      ('pid1', TODAY) not in SNAPSHOTS_WRITTEN, SNAPSHOTS_WRITTEN)


# ── 3. Pelne pokrycie: snapshot bez fallbacku, tak samo jak dotad ──────────
reset()
HOLDINGS['pid1'] = [
    {'symbol': 'AAPL', 'qty': 10, 'avg_price': 150.0, 'currency': 'USD'},
    {'symbol': 'MSFT', 'qty': 5,  'avg_price': 300.0, 'currency': 'USD'},
]
PRICES.update({'AAPL': 180.0, 'MSFT': 350.0})

server._run_daily_snapshots()
snap = SNAPSHOTS_WRITTEN.get(('pid1', TODAY))
check('pelne pokrycie -> snapshot zapisany normalnie', snap is not None, snap)
if snap:
    expected = 10*180*3.80 + 5*350*3.80
    check('pelne pokrycie -> total z prawdziwych cen (bez fallbacku)',
          abs(snap['total'] - expected) < 0.01,
          f'got={snap["total"]:.2f} expected={expected:.2f}')


# ── 4. Granica tolerancji: dokladnie 20% brakujacych to jeszcze fallback ───
reset()
HOLDINGS['pid1'] = [
    {'symbol': 'AAPL', 'qty': 1, 'avg_price': 150.0, 'currency': 'USD'},
    {'symbol': 'MSFT', 'qty': 1, 'avg_price': 300.0, 'currency': 'USD'},
    {'symbol': 'NVDA', 'qty': 1, 'avg_price': 400.0, 'currency': 'USD'},
    {'symbol': 'META', 'qty': 1, 'avg_price': 500.0, 'currency': 'USD'},
    {'symbol': 'AMZN', 'qty': 1, 'avg_price': 100.0, 'currency': 'USD'},
]
PRICES.update({'AAPL': 180.0, 'MSFT': 350.0, 'NVDA': 500.0, 'META': 550.0})

server._run_daily_snapshots()
check('ratio dokladnie 20% -> snapshot zapisany',
      ('pid1', TODAY) in SNAPSHOTS_WRITTEN, SNAPSHOTS_WRITTEN)


print()
print('BLEDY: ' + ', '.join(fails) if fails else 'WSZYSTKO OK')
sys.exit(1 if fails else 0)
