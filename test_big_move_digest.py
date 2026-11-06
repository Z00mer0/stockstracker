"""Kilka dużych ruchów naraz = jeden push zbiorczy zamiast osobnego na spółkę.

Zgłoszenie: 20 powiadomień „🚀 X +5% dziś” jedno pod drugim. Teraz:
  1. jedna spółka — dotychczasowy push z tekstem i linkiem do watchlisty,
  2. kilka — tytuł z liczbą rosnących/spadających, w treści największe ruchy
     (od największego |%|) i „i N więcej”, a link /moves niesie pełną listę,
  3. link da się odczytać z powrotem (symbole z kropką, minus przy spadku).
"""
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

fails = []

def check(cond, msg):
    if not cond:
        fails.append(msg)

D = '2026-11-06'

t, b, u = server._big_move_push([('TMDX', 19.65)], 'funny', 'pl', D)
check(t.startswith('🚀 TMDX +19.65%'), f'pojedynczy: tytuł {t!r}')
check(u == '/watchlist', f'pojedynczy: url {u!r}')

moves = [('XTB.WA', 5.18), ('TMDX', 19.65), ('SPCX', 6.08), ('SNDK', 10.5),
         ('SKHY', 5.73), ('S2B.WA', 5.01), ('AMD', -7.2)]
t, b, u = server._big_move_push(moves, 'funny', 'pl', D)
check(t == '🚀 Duże ruchy dziś: 6 ↑, 1 ↓', f'zbiorczy: tytuł {t!r}')
check(b == 'TMDX +19.6% · SNDK +10.5% · AMD -7.2% · SPCX +6.1% · i 3 więcej', f'zbiorczy: treść {b!r}')
q = urllib.parse.parse_qs(urllib.parse.urlparse(u).query)
check(urllib.parse.urlparse(u).path == '/moves', f'zbiorczy: ścieżka {u!r}')
check(q.get('d') == [D], f'zbiorczy: data {q!r}')
pairs = [p.rsplit(':', 1) for p in q['m'][0].split(',')]
check([s for s, _ in pairs] == ['TMDX', 'SNDK', 'AMD', 'SPCX', 'SKHY', 'XTB.WA', 'S2B.WA'], f'zbiorczy: kolejność {pairs!r}')
check(dict(pairs)['AMD'] == '-7.20', f'zbiorczy: spadek {pairs!r}')

t, b, u = server._big_move_push([('AMD', -7.2), ('INTC', -8.8)], 'professional', 'en', D)
check(t == '📉 Big moves today: 2 ↓', f'en spadki: tytuł {t!r}')
check(b == 'INTC -8.8% · AMD -7.2%', f'en spadki: treść {b!r}')

if fails:
    print('FAIL:'); [print(' -', f) for f in fails]; sys.exit(1)
print('OK test_big_move_digest')
