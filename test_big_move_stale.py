"""Push o dużym ruchu nie może przychodzić w weekend z piątkową zmianą.

Notowanie w sobotę i niedzielę dalej niesie „zmianę dziś" z ostatniej sesji,
więc push „XTB.WA −5,37% dziś" przychodził w weekend. _quote_is_current
sprawdza, czy ostatnia transakcja była dzisiaj w strefie giełdy.
"""
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

UTC = datetime.timezone.utc


def ts(y, m, d, h, mi, tz):
    return int(datetime.datetime(y, m, d, h, mi, tzinfo=server.ZoneInfo(tz)).timestamp())


FRI_GPW = {'marketTime': ts(2026, 10, 2, 17, 0, 'Europe/Warsaw'), 'tz': 'Europe/Warsaw'}
FRI_US = {'marketTime': ts(2026, 10, 2, 16, 0, 'America/New_York'), 'tz': 'America/New_York'}
SUN_BTC = {'marketTime': ts(2026, 10, 4, 19, 40, 'UTC'), 'tz': 'UTC'}
SAT_1700 = datetime.datetime(2026, 10, 3, 15, 0, tzinfo=UTC)    # 17:00 w Warszawie
SUN_1945 = datetime.datetime(2026, 10, 4, 17, 45, tzinfo=UTC)   # z zrzutu ekranu
FRI_1700 = datetime.datetime(2026, 10, 2, 15, 0, tzinfo=UTC)


def test_weekend_z_czasem_transakcji():
    assert server._quote_is_current('XTB.WA', FRI_GPW, FRI_1700)
    assert not server._quote_is_current('XTB.WA', FRI_GPW, SAT_1700)
    assert not server._quote_is_current('SPCX', FRI_US, SUN_1945)
    assert server._quote_is_current('BTC-USD', SUN_BTC, SUN_1945)


def test_poniedzialek_przed_otwarciem_usa():
    # Pon 16:00 w Warszawie = 10:00 w Nowym Jorku: sesja trwa, ale ostatnia
    # transakcja z piątku oznacza notowanie sprzed otwarcia — też nie „dziś".
    mon_1600 = datetime.datetime(2026, 10, 5, 14, 0, tzinfo=UTC)
    assert not server._quote_is_current('SPCX', FRI_US, mon_1600)
    mon_us = {'marketTime': ts(2026, 10, 5, 9, 45, 'America/New_York'), 'tz': 'America/New_York'}
    assert server._quote_is_current('SPCX', mon_us, mon_1600)


def test_bez_czasu_transakcji_zapas_na_weekend():
    q = {'price': 10, 'changePct': -6}
    assert server._quote_is_current('XTB.WA', q, FRI_1700)
    assert not server._quote_is_current('XTB.WA', q, SUN_1945)
    assert server._quote_is_current('ETH-USD', q, SUN_1945)


def test_czas_z_paczki_notowan():
    q = server._quote_from_entry({'quote': {'regularMarketPrice': 50, 'regularMarketChangePercent': -5.37,
                                            'regularMarketTime': FRI_GPW['marketTime'],
                                            'exchangeTimezoneName': 'Europe/Warsaw'}})
    assert q['marketTime'] == FRI_GPW['marketTime'] and q['tz'] == 'Europe/Warsaw'
    assert not server._quote_is_current('XTB.WA', q, SAT_1700)


if __name__ == '__main__':
    test_weekend_z_czasem_transakcji()
    test_poniedzialek_przed_otwarciem_usa()
    test_bez_czasu_transakcji_zapas_na_weekend()
    test_czas_z_paczki_notowan()
    print('WSZYSTKO OK')
