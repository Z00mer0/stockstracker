"""Raport miesięczny w pushu: pary snapshotów miesiąca i tekst powiadomienia.

  1. start = ostatni snapshot sprzed miesiąca, koniec = ostatni z miesiąca;
     nowy portfel (bez dni sprzed) zaczyna się od pierwszego dnia z danymi,
     portfel bez danych w miesiącu jest pomijany,
  2. wynik bez wpłat (zmiana kapitału) i procent Dietza — wspólne
     z podsumowaniem tygodnia (_week_result),
  3. tekst: nazwa miesiąca, wynik, wartość, wpłaty i dywidendy, gdy są.
"""
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

D = datetime.date
fails = []
def check(cond, msg):
    if not cond:
        fails.append(msg)

snaps = {
    'a': [(D(2026, 9, 30), 10000.0, 9000.0), (D(2026, 10, 15), 12500.0, 11000.0), (D(2026, 10, 31), 12800.0, 11000.0)],
    'b': [(D(2026, 10, 10), 1000.0, 1000.0), (D(2026, 10, 30), 1100.0, 1000.0)],
    'c': [(D(2026, 9, 1), 500.0, 500.0)],
}
pairs = server._month_pairs(snaps, D(2026, 10, 1), D(2026, 10, 31))
check(len(pairs) == 2, f'pary: {pairs}')
s = server._week_result(pairs)
check(abs(s['result'] - 900) < 1e-9 and abs(s['flows'] - 2000) < 1e-9, f'wynik: {s}')

title, body = server._monthly_report_text(s, D(2026, 10, 1), 16.2, 'pl')
check(title.startswith('📅 Październik: +900 zł (+'), f'tytuł: {title!r}')
check('Portfel: 13 900 zł' in body and 'Wpłaty: +2 000 zł' in body and 'Dywidendy: 16 zł' in body, f'treść: {body!r}')
title, body = server._monthly_report_text({**s, 'net': False, 'flows': 0}, D(2026, 10, 1), 0, 'en')
check(title.startswith('📅 October: +900 zł') and 'Deposits' not in body and 'Dividends' not in body, f'en: {title!r} {body!r}')

if fails:
    print('FAIL:'); [print(' -', f) for f in fails]; sys.exit(1)
print('OK test_monthly_report')
