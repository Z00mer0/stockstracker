"""Karta w aplikacji i push systemowy musza mowic to samo o tym samym ruchu.

Blad, ktory to wywolal: teksty duzego ruchu byly wpisane osobno po obu
stronach — klient mial 8 wariantow na kubelek, server.py trzy wlasne. Ten
sam skok kursu dawal wiec inne zdanie w dzwonku i w powiadomieniu systemowym,
a pieciu tekstow z klienta push nie widzial nigdy.

Teraz oba zrodla czytaja frontend-react/src/translations/bigMoveTexts.json i
licza ten sam FNV-1a z tego samego seeda. Ten test pilnuje obu polowek:

  1. plik ma komplet wariantow (kazdy ton x jezyk x kierunek, bez pustych),
     a pl i en maja ich tyle samo — indeks jest wspolny dla obu jezykow,
  2. _fnv1a zgadza sie z hashStr() z notificationText.js na tych samych
     wektorach; blizniaczy test po stronie JS uzywa tej samej listy, wiec
     rozjazd ktorejkolwiek implementacji wywala jedna ze stron,
  3. _big_move_text faktycznie wybiera wariant o policzonym indeksie,
  4. nieznany ton albo jezyk daje tekst, nie wyjatek w srodku wysylki pushy.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

TONES = ('professional', 'funny')
LANGS = ('pl', 'en')
DIRECTIONS = ('up', 'down')

# Te same pary seed -> hash sa zapisane w notificationText.test.js.
FNV_VECTORS = {
    'AMD|funny|pl|down|2026-08-01': 2267734212,
    'NVDA|professional|en|up|2026-08-01': 3356723192,
    'TSLA|funny|en|down|2026-01-15': 4079090469,
    'PKN.WA|professional|pl|up|2026-12-31': 4026176043,
}

fails = []


def check(name, ok, detail=''):
    print(('  OK   ' if ok else '  BLAD ') + name + (f'  [{detail}]' if detail and not ok else ''))
    if not ok:
        fails.append(name)


print('bigMoveTexts.json — plik i komplet wariantow')
path = Path(server._BIG_MOVE_TEXTS_PATH)
check('plik lezy tam, gdzie server.py go szuka', path.is_file(), server._BIG_MOVE_TEXTS_PATH)
texts = server._big_move_texts()
check('json sie parsuje i nie jest pusty', bool(texts))

counts = {}
for tone in TONES:
    for lang in LANGS:
        for direction in DIRECTIONS:
            variants = (texts.get(tone) or {}).get(lang, {}).get(direction) or []
            counts[(tone, lang, direction)] = len(variants)
            check(f'{tone}/{lang}/{direction}: sa warianty', bool(variants))
            check(f'{tone}/{lang}/{direction}: zaden nie jest pusty',
                  all(v and v.strip() for v in variants))

for tone in TONES:
    for direction in DIRECTIONS:
        pl_n, en_n = counts[(tone, 'pl', direction)], counts[(tone, 'en', direction)]
        check(f'{tone}/{direction}: pl i en maja tyle samo wariantow',
              pl_n == en_n, f'pl={pl_n} en={en_n}')

print()
print('FNV-1a — zgodnosc z hashStr() z notificationText.js')
for seed, expected in FNV_VECTORS.items():
    got = server._fnv1a(seed)
    check(f'{seed} -> {expected}', got == expected, f'dostalem {got}')

print()
print('wybor wariantu')
sym, tone, lang, day = 'AMD', 'funny', 'pl', '2026-08-01'
variants = server._big_move_variants(tone, lang, 'down')
idx = server._fnv1a(f'{sym}|{tone}|{lang}|down|{day}') % len(variants)
check('_big_move_text bierze wariant o policzonym indeksie',
      server._big_move_text(sym, -7.87, tone, lang, day) == variants[idx])
check('ten sam ticker i dzien daja ten sam tekst dwa razy',
      server._big_move_text(sym, -7.87, tone, lang, day)
      == server._big_move_text(sym, -7.87, tone, lang, day))

print()
print('degradacja')
check('nieznany ton i jezyk (spadek) daja tekst, nie wyjatek',
      bool(server._big_move_text('AMD', -7.0, 'nieistniejacy', 'de', '2026-08-01')))
check('nieznany ton i jezyk (wzrost) daja tekst, nie wyjatek',
      bool(server._big_move_text('AMD', 7.0, 'nieistniejacy', 'de', '2026-08-01')))

print()
if fails:
    print(f'BLEDY: {len(fails)}')
    for f in fails:
        print('  -', f)
    sys.exit(1)
print('WSZYSTKO OK')
