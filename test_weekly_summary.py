"""Podsumowanie tygodnia (push w weekend): wynik bez wpłat.

Wpłata w trakcie tygodnia podnosi wartość portfela, ale nie jest zyskiem —
odejmujemy zmianę kapitału własnego zapisanego w snapshotach.
"""
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

D = datetime.date


def test_wplata_nie_jest_zyskiem():
    snaps = {
        'a': [(D(2026, 9, 18), 10000.0, 9000.0), (D(2026, 9, 22), 10100.0, 9000.0),
              (D(2026, 9, 25), 11200.0, 10000.0)],   # +1000 wpłaty, +200 zysku
        'nowy': [(D(2026, 9, 24), 500.0, 500.0), (D(2026, 9, 25), 510.0, 500.0)],  # brak historii — pomijany
    }
    s = server._week_result(server._week_pairs(snaps))
    assert s['net'] is True
    assert abs(s['flows'] - 1000) < 1e-9
    assert abs(s['result'] - 200) < 1e-9
    assert abs(s['pct'] - 200 / 10500 * 100) < 1e-9   # Dietz: 10000 + 1000/2
    assert s['end'] == 11200.0


def test_start_to_ostatni_snapshot_sprzed_tygodnia():
    # Luka (np. weekend bez snapshotu): bierzemy ostatni ≤ koniec − 7 dni, nie pierwszy.
    snaps = {'a': [(D(2026, 9, 15), 1.0, None), (D(2026, 9, 18), 100.0, None), (D(2026, 9, 25), 110.0, None)]}
    s = server._week_result(server._week_pairs(snaps))
    assert s['net'] is False and s['result'] == 10.0 and s['pct'] == 10.0


def test_brak_danych():
    assert server._week_result(server._week_pairs({'a': [(D(2026, 9, 25), 1.0, 1.0)]})) is None


def test_zmiana_tygodniowa_kursu():
    pts = [(D(2026, 9, 17), 90.0), (D(2026, 9, 18), 100.0), (D(2026, 9, 22), 104.0), (D(2026, 9, 25), 105.0)]
    assert abs(server._change_over_days(pts) - 5.0) < 1e-9
    assert server._change_over_days(pts[-2:]) is None


def test_tekst():
    s = {'start': 10000.0, 'end': 11200.0, 'flows': 1000.0, 'result': 200.0, 'pct': 1.9047, 'net': True}
    title, body = server._weekly_summary_text(s, {'PKN.WA': 4.2, 'AAPL': -1.5, 'CDR.WA': 0.3}, 'pl')
    assert title == '📈 Tydzień: +200 zł (+1.90%)', title
    assert body == 'Portfel: 11 200 zł\nWpłaty: +1 000 zł\nNajlepsza: PKN.WA +4.2% · najsłabsza: AAPL -1.5%', body
    title, _ = server._weekly_summary_text({**s, 'net': False, 'result': -50.0}, {}, 'en')
    assert title.startswith('📉 Value change: -50 zł'), title


if __name__ == '__main__':
    test_wplata_nie_jest_zyskiem()
    test_start_to_ostatni_snapshot_sprzed_tygodnia()
    test_brak_danych()
    test_zmiana_tygodniowa_kursu()
    test_tekst()
    print('WSZYSTKO OK')
