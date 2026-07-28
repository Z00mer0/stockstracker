"""Notowania dla petli po pozycjach ida paczkami, nie po jednym symbolu.

Blad, ktory to wywolal: _fetch_quote wysylalo jedno zadanie HTTP na symbol,
a bylo wolane wewnatrz petli po pozycjach (wycena portfela, alerty cenowe,
publiczny link do portfela). Przy kilku portfelach po kilkadziesiat pozycji
robila sie z tego seria setek zadan z jednego adresu IP Rendera — czyli
dokladnie ten ruch, ktory limiter po stronie Vercela ma ucinac.

/api/quotes obsluguje format=map do 60 symboli naraz i odpytuje Yahoo
rownolegle, wiec ta sama praca miesci sie w kilku zadaniach.

Pilnowane sa trzy rzeczy:
  1. 100 symboli to 2 zadania (ceil(100/60)), nie 100,
  2. symbole juz obecne w cache nie sa odpytywane ponownie,
  3. symbol, ktorego paczka nie rozwiazala, nie trafia do cache jako falszywy
     wynik — zostaje do pojedynczego _fetch_quote z zapasem przez Finnhuba.
"""
import io
import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

fails = []


def check(name, cond, detail=''):
    print(('PASS  ' if cond else 'FAIL  ') + name + ('  -- ' + str(detail) if detail else ''))
    if not cond:
        fails.append(name)


class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


calls = []          # lista list symboli, po jednej na zadanie
NOT_RESOLVABLE = {'GHOST'}


def fake_urlopen(req, timeout=None):
    url = req.full_url if hasattr(req, 'full_url') else str(req)
    raw = url.split('symbols=')[1].split('&')[0]
    syms = urllib.parse.unquote(raw).split(',')
    calls.append(syms)
    quotes = {}
    for s in syms:
        quotes[s] = None if s in NOT_RESOLVABLE else {
            'quote': {'regularMarketPrice': 100.0, 'regularMarketChangePercent': 1.5,
                      'fiftyTwoWeekHigh': 120.0, 'fiftyTwoWeekLow': 80.0}
        }
    return _Resp(json.dumps({'quotes': quotes}).encode())


server.urllib.request.urlopen = fake_urlopen
urllib.parse = server.urllib.parse

# ── 1. sto symboli w dwoch zadaniach ────────────────────────────────────────
calls.clear()
cache = {}
symbols = [f'SYM{i}' for i in range(100)]
server._prefill_quotes(symbols, cache)

check('100 symboli to 2 zadania, nie 100', len(calls) == 2, f'{len(calls)} zadan')
check('kazda paczka miesci sie w limicie 60',
      all(len(c) <= 60 for c in calls), [len(c) for c in calls])
check('wszystkie symbole trafily do cache', len(cache) == 100, len(cache))
check('cena rozpakowana poprawnie', cache['SYM0']['price'] == 100.0, cache.get('SYM0'))
check('zmiana dzienna rozpakowana', cache['SYM0']['changePct'] == 1.5, cache.get('SYM0'))

# ── 2. to, co juz jest w cache, nie idzie po raz drugi ──────────────────────
calls.clear()
server._prefill_quotes(symbols, cache)
check('komplet w cache to zero zadan', len(calls) == 0, f'{len(calls)} zadan')

calls.clear()
server._prefill_quotes(symbols + ['NOWY'], cache)
check('tylko brakujacy symbol idzie w zapytanie',
      len(calls) == 1 and calls[0] == ['NOWY'], calls)

# ── 3. nierozwiazany symbol nie ladzie w cache jako falszywy wynik ──────────
calls.clear()
cache2 = {}
server._prefill_quotes(['GHOST', 'REAL'], cache2)
check('nierozwiazany symbol zostaje poza cache', 'GHOST' not in cache2, cache2)
check('rozwiazany symbol obok niego wchodzi', 'REAL' in cache2, cache2)

# ── 4. duplikaty nie mnoza zapytan ──────────────────────────────────────────
calls.clear()
cache3 = {}
server._prefill_quotes(['A', 'A', 'B', 'B', 'A'], cache3)
check('duplikaty odfiltrowane przed zapytaniem',
      len(calls) == 1 and calls[0] == ['A', 'B'], calls)

# ── 5. awaria paczki nie wywraca wywolujacego ───────────────────────────────
def boom(req, timeout=None):
    raise OSError('siec padla')


server.urllib.request.urlopen = boom
calls.clear()
cache4 = {}
try:
    server._prefill_quotes(['X', 'Y'], cache4)
    ok = True
except Exception:
    ok = False
check('awaria sieci nie leci na zewnatrz', ok)
check('po awarii cache zostaje pusty — pobierze _fetch_quote', cache4 == {}, cache4)

print()
if fails:
    print(f'BLEDY: {len(fails)}')
    for f in fails:
        print('  -', f)
    sys.exit(1)
print('WSZYSTKO OK')
