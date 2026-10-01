"""Kursy walut przy awarii NBP.

Wcześniej _nbp_rates() przy błędzie zwracało samo {'PLN': 1.0}, a wołający
brali brakującą walutę jako 1.0 — dzienny snapshot schedulera zapisywał
wtedy pozycje w USD/EUR po kursie 1 (portfel zaniżony kilkukrotnie
w Historii), a publiczny link pokazywał zaniżone udziały spółek zagranicznych.
Teraz: ostatnie kursy z tego procesu, po restarcie — najnowsze z bazy.
"""
import sys
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

fails = []


def check(name, cond):
    print(('OK   ' if cond else 'BLAD ') + name)
    if not cond:
        fails.append(name)


def nbp_down(*a, **k):
    raise urllib.error.URLError('403 Forbidden')


class FakeCursor:
    def __init__(self, rows): self.rows, self.sql = rows, None
    def execute(self, sql, *a): self.sql = sql
    def fetchall(self): return self.rows
    def __enter__(self): return self
    def __exit__(self, *a): return False


class FakeConn:
    def __init__(self, rows): self.cur = FakeCursor(rows)
    def cursor(self): return self.cur
    def __enter__(self): return self
    def __exit__(self, *a): return False


server.urllib.request.urlopen = nbp_down

# 1. Brak czegokolwiek (bez bazy, świeży proces) — jak dawniej, samo PLN.
server._nbp_last_good.clear()
server.DATABASE_URL = ''
check('bez danych: samo PLN', server._nbp_rates() == {'PLN': 1.0})

# 2. Po restarcie: najnowsze kursy z fx_rates_history.
conn = FakeConn([('USD', 3.95), ('EUR', 4.27)])
server.DATABASE_URL = 'postgres://fake'
server._conn = lambda: conn
check('z bazy: USD i EUR', server._nbp_rates() == {'PLN': 1.0, 'USD': 3.95, 'EUR': 4.27})
check('z bazy: tylko dodatnie, najnowsze per waluta',
      'rate > 0' in conn.cur.sql and 'DISTINCT ON (currency)' in conn.cur.sql and 'date DESC' in conn.cur.sql)

# 3. Błąd bazy nie wywraca wołającego.
def broken_conn(): raise RuntimeError('db down')
server._conn = broken_conn
check('błąd bazy: samo PLN, bez wyjątku', server._nbp_rates() == {'PLN': 1.0})

# 4. W działającym procesie: ostatnie udane pobranie ma pierwszeństwo.
server._nbp_last_good.update({'PLN': 1.0, 'USD': 4.01, 'GBP': 5.10})
check('ostatnie pobrane w procesie', server._nbp_rates() == {'PLN': 1.0, 'USD': 4.01, 'GBP': 5.10})

print()
if fails:
    print(f'BLEDY: {len(fails)}')
    sys.exit(1)
print('WSZYSTKO OK')
