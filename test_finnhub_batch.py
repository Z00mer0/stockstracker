"""Sprawdza /api/finnhub-batch bez ruszania Finnhuba.

Interesuje nas jedno: czy przy 41 pozycjach kursy dochodzą w komplecie i czy
nie przekraczamy 60 zapytan na minute. Finnhub jest zaslepiony i liczy wywolania.
"""
import io
import json
import sys
import threading
import time
import urllib.request

sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent))
import server                                    # noqa: E402

fails = []


def check(name, cond, detail=''):
    print(('PASS  ' if cond else 'FAIL  ') + name + ('  -- ' + str(detail) if detail else ''))
    if not cond:
        fails.append(name)


# ── zaslepka Finnhuba ────────────────────────────────────────────────────────
calls = {'quote': 0, 'metric': 0}
calls_lock = threading.Lock()
LIMIT = [60]          # ile zapytan przepuszczamy zanim zaczniemy oddawac 429


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_urlopen(req, timeout=None):
    url = req.full_url if hasattr(req, 'full_url') else str(req)
    kind = 'metric' if '/stock/metric' in url else 'quote'
    with calls_lock:
        calls[kind] += 1
        total = calls['quote'] + calls['metric']
    if total > LIMIT[0]:
        raise urllib.error.HTTPError(url, 429, 'Too Many Requests', {}, None)
    sym = url.split('symbol=')[1].split('&')[0]
    body = ({'c': 100.0, 'dp': 1.5} if kind == 'quote'
            else {'metric': {'peBasicExclExtraTTM': 22.0, 'pbAnnual': 3.1, 'sym': sym}})
    return _Resp(json.dumps(body).encode())


server.urllib.request.urlopen = fake_urlopen
server.os.environ['FINNHUB_TOKEN'] = 'test-token'
server.get_username = lambda handler: 'tester'


# ── minimalny handler, zeby wywolac do_GET bez gniazda ──────────────────────
class FakeHandler(server.Handler):
    def __init__(self, path):
        self.path = path
        self.client_address = ('127.0.0.1', 1234)
        self.headers = {}
        self.status = None
        self.payload = None

    def send_json(self, status, data, cookies=()):
        self.status = status
        self.payload = data


def call_batch(symbols):
    h = FakeHandler('/api/finnhub-batch?symbols=' + ','.join(symbols))
    server.Handler.do_GET(h)
    return h.status, h.payload


SYMS = [f'S{i:02d}' for i in range(41)]


def reset(limit=60):
    calls['quote'] = calls['metric'] = 0
    LIMIT[0] = limit
    server._FH_METRIC_CACHE.clear()
    server._fh_calls[:] = []


# ── 1. zimny start: 41 pozycji jedna paczka (FH_CHUNK = 60) ─────────────────
reset()
s1, p1 = call_batch(SYMS)
s2, p2 = 200, {}
merged = {**(p1 or {}), **(p2 or {})}

check('paczka odpowiada 200', s1 == 200, f'{s1}')
check('kursy przyszly dla wszystkich 41 pozycji',
      all(merged[s]['quote'] is not None for s in SYMS),
      sum(1 for s in SYMS if merged[s]['quote'] is None) or 'komplet')
check('nie przekroczylismy 60 zapytan na minute',
      calls['quote'] + calls['metric'] <= 60,
      f"quote={calls['quote']}, metric={calls['metric']}, razem={calls['quote'] + calls['metric']}")
check('kazda pozycja odpytana o kurs dokladnie raz', calls['quote'] == 41, calls['quote'])

warm_after_cold = sum(1 for s in SYMS if merged[s]['metric'] is not None)
print(f'      (wskazniki w pierwszej rundzie: {warm_after_cold}/41 — reszta dojdzie potem)')

# ── 2. drugie wejscie: wskazniki z cache'u, kursy swieze ────────────────────
calls['quote'] = calls['metric'] = 0
server._fh_calls[:] = []          # nowe okno minuty
s3, p3 = call_batch(SYMS)
check('drugie wejscie pyta o wskazniki tylko dla brakujacych',
      calls['metric'] <= 41 - warm_after_cold, f'metric={calls["metric"]}')
check('drugie wejscie oddaje komplet kursow',
      all(p3[s]['quote'] is not None for s in SYMS),
      sum(1 for s in SYMS if p3[s]['quote'] is None) or 'komplet')
check('drugie wejscie tez miesci sie w limicie',
      calls['quote'] + calls['metric'] <= 60,
      f'razem={calls["quote"] + calls["metric"]}')

# ── 3. Finnhub zaczyna oddawac 429 — kursy maja pierwszenstwo ───────────────
reset(limit=41)                   # starczy dokladnie na kursy, na nic wiecej
s4, p4 = call_batch(SYMS)
check('przy ostrym limicie kursy nadal dochodza w calosci',
      all(p4[s]['quote'] is not None for s in SYMS),
      sum(1 for s in SYMS if p4[s]['quote'] is None) or 'komplet')
check('brak wskaznikow nie wywraca odpowiedzi', s4 == 200, f'{s4}')

# ── 4. licznik okna minuty ──────────────────────────────────────────────────
server._fh_calls[:] = []
server._fh_note(50)
check('_fh_reserve oddaje tylko to, co zostalo w limicie',
      server._fh_reserve(20) == 5, server._fh_reserve.__name__)
server._fh_calls[:] = []
check('_fh_reserve nie schodzi ponizej zera przy przepelnieniu',
      (server._fh_note(80), server._fh_reserve(10))[1] == 0)
server._fh_calls[:] = [time.time() - 61] * 55
check('wpisy starsze niz minuta wypadaja z okna', server._fh_reserve(10) == 10)

print()
print('BLEDY: ' + ', '.join(fails) if fails else 'WSZYSTKO OK')
sys.exit(1 if fails else 0)
