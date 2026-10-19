"""Warunki alertów cenowych (_alert_hit) i średnia cena zakupu (_avg_costs).

Nowy rodzaj fromCost: zysk albo strata co najmniej X% od średniej ceny
zakupu pozycji. Pozostałe rodzaje — jak dotąd w pętli pushy.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

Q = {'price': 120.0, 'changePct': -3.2, 'high52': 119.0, 'low52': 80.0}


def test_cena_zmiana_52w():
    assert server._alert_hit({'kind': 'price', 'type': 'above', 'targetPrice': 110}, Q) is True
    assert server._alert_hit({'kind': 'price', 'type': 'below', 'targetPrice': 110}, Q) is False
    assert server._alert_hit({'type': 'above', 'targetPrice': 130}, Q) is False   # brak kind = price
    assert server._alert_hit({'kind': 'dailyChange', 'type': 'below', 'targetPercent': 3}, Q) is True
    assert server._alert_hit({'kind': 'dailyChange', 'type': 'above', 'targetPercent': 3}, Q) is False
    assert server._alert_hit({'kind': 'dailyChange', 'type': 'below', 'targetPercent': 3}, {'price': 1}) is None
    assert server._alert_hit({'kind': 'week52', 'type': 'above'}, Q) is True
    assert server._alert_hit({'kind': 'week52', 'type': 'below'}, Q) is False
    assert server._alert_hit({'kind': 'nieznany'}, Q) is None


def test_od_ceny_zakupu():
    up20 = {'kind': 'fromCost', 'type': 'above', 'targetPercent': 20}
    down10 = {'kind': 'fromCost', 'type': 'below', 'targetPercent': 10}
    assert server._alert_hit(up20, Q, avg_cost=100) is True      # +20%
    assert server._alert_hit(up20, Q, avg_cost=101) is False     # +18,8%
    assert server._alert_hit(down10, {'price': 89.0}, avg_cost=100) is True
    assert server._alert_hit(down10, {'price': 91.0}, avg_cost=100) is False
    assert server._alert_hit(up20, Q, avg_cost=None) is None     # pozycji już nie ma
    assert server._alert_hit({**up20, 'targetPercent': 0}, Q, avg_cost=100) is None


def test_srednia_z_kilku_portfeli():
    costs = server._avg_costs([('CDR.WA', 10, 100), ('CDR.WA', 30, 140), ('PKO.WA', 0, 50), ('X', 5, None)])
    assert abs(costs['CDR.WA'] - 130) < 1e-9
    assert 'PKO.WA' not in costs and 'X' not in costs


if __name__ == '__main__':
    test_cena_zmiana_52w()
    test_od_ceny_zakupu()
    test_srednia_z_kilku_portfeli()
    print('WSZYSTKO OK')
