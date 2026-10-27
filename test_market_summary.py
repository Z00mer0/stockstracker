"""Podsumowanie sesji (market_summary.py): szerokość rynku, obrót, liderzy,
kalendarz świąt GPW/NYSE, okno pusha i treść powiadomienia."""
import datetime
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import market_summary as ms                     # noqa: E402
import server                                   # noqa: E402

UTC = datetime.timezone.utc
D = datetime.date


def ts(y, m, d, h, mi=0):
    return datetime.datetime(y, m, d, h, mi, tzinfo=UTC).timestamp()


def q(price, chg, vol, name='', t=None):
    return {'price': price, 'changePct': chg, 'volume': vol, 'name': name, 'marketTime': t or ts(2026, 10, 26, 15, 5)}


QUOTES = {
    'BDF.WA': q(6.5, 28.71, 100000, 'BUMECHDEF'),
    'PKO.WA': q(111.5, 1.79, 2_000_000, 'PKOBP'),
    'ALE.WA': q(59.0, 0.96, 3_000_000, 'ALLEGRO'),
    'PKN.WA': q(154.86, -0.95, 1_000_000, 'PKNORLEN'),
    'HRS.WA': q(1.765, -14.32, 50000, 'HERKULES'),
    'XYZ.WA': q(10.0, 0.0, 1000),
    'OLD.WA': q(5.0, -50.0, 10, t=ts(2026, 10, 20, 15)),     # zawieszona — stary kurs, pomijana
    'NOP.WA': None,
}
NOW = datetime.datetime(2026, 10, 26, 16, 20, tzinfo=UTC)   # 17:20 w Warszawie


def test_szerokosc_obrot_i_liderzy():
    s = ms.summarize('gpw', QUOTES, [], universe_size=8, now=NOW)
    assert s['date'] == '2026-10-26' and s['closed'] is True
    assert s['breadth'] == {'up': 3, 'down': 2, 'flat': 1, 'total': 6}
    assert s['universe'] == {'label': 'WIG20 + mWIG40 + sWIG80', 'size': 8, 'priced': 6}
    assert s['asOf'] == int(NOW.timestamp())
    assert [g['symbol'] for g in s['gainers']] == ['BDF', 'PKO', 'ALE']
    assert [g['symbol'] for g in s['losers']] == ['HRS', 'PKN']          # bez spółek na plusie
    assert [a['symbol'] for a in s['active']] == ['PKO', 'ALE', 'PKN']   # wg obrotu, nie wolumenu
    assert s['gainers'][0]['name'] == 'BUMECHDEF'
    expected = sum(v['price'] * v['volume'] for k, v in QUOTES.items() if v and k != 'OLD.WA')
    assert abs(s['turnover'] - expected) < 1e-6


def test_sesja_w_trakcie_nie_jest_zamknieta():
    s = ms.summarize('gpw', QUOTES, [], 8, now=datetime.datetime(2026, 10, 26, 14, 0, tzinfo=UTC))
    assert s['closed'] is False
    assert ms.summarize('gpw', {'A': None}, [], 1, now=NOW) is None


def test_swieta():
    assert D(2026, 4, 3) in ms.holidays(2026, 'GPW') and D(2026, 6, 4) in ms.holidays(2026, 'GPW')
    assert D(2026, 11, 26) in ms.holidays(2026, 'NYSE') and D(2026, 7, 3) in ms.holidays(2026, 'NYSE')
    assert ms.is_trading_day(D(2021, 12, 31), 'NYSE')            # Nowy Rok 2022 w sobotę
    assert not ms.is_trading_day(D(2026, 12, 24), 'GPW')
    assert ms.is_trading_day(D(2026, 11, 11), 'NYSE') and not ms.is_trading_day(D(2026, 11, 11), 'GPW')


def test_okno_pusha():
    assert server._market_push_due('gpw', NOW) == 'mkt:gpw:2026-10-26'
    assert server._market_push_due('gpw', datetime.datetime(2026, 10, 26, 15, 0, tzinfo=UTC)) is None   # 16:00
    assert server._market_push_due('gpw', datetime.datetime(2026, 12, 24, 16, 20, tzinfo=UTC)) is None  # Wigilia
    # USA: 16:15 ET = 21:15 UTC (czas zimowy w USA od 1.11)
    assert server._market_push_due('us', datetime.datetime(2026, 11, 2, 21, 15, tzinfo=UTC)) == 'mkt:us:2026-11-02'
    assert server._market_push_due('us', datetime.datetime(2026, 11, 26, 21, 15, tzinfo=UTC)) is None   # Thanksgiving


def test_tekst_powiadomienia():
    idx = [{'name': 'WIG20', 'value': 4198.02, 'changePct': 0.74, 'spark': []}]
    s = ms.summarize('gpw', QUOTES, idx, 8, now=NOW)
    title, body = ms.push_text(s, 'pl')
    assert title == '📊 Podsumowanie sesji GPW · 26.10'
    assert body == 'WIG20 4 198,02 (+0,74%) · ↑3 ↓2 · Lider: BDF +28,71% · Najsłabszy: HRS −14,32%'
    title, body = ms.push_text(s, 'en')
    assert title == '📊 GPW session summary · Oct 26' and body.startswith('WIG20 4,198.02 (+0.74%)')


def test_indeks_z_wykresu():
    chart = {'chart': {'result': [{'meta': {'regularMarketPrice': 110.0, 'chartPreviousClose': 100.0},
                                   'indicators': {'quote': [{'close': [100, None, 105] + [106] * 100}]}}]}}
    i = ms.index_from_chart('WIG', chart)
    assert abs(i['changePct'] - 10) < 1e-9 and len(i['spark']) <= 41 and i['spark'][0] == 100 and i['spark'][-1] == 106
    assert ms.index_from_chart('WIG', None)['value'] is None


def test_lista_spolek():
    u = ms.load_universe()
    assert len(u['gpw']) > 100 and all(s.endswith('.WA') for s in u['gpw'])
    assert len(u['us']) > 400 and len(set(u['us'])) == len(u['us'])


if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn()
            print('OK', name)
