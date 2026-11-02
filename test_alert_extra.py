"""Nowe powiadomienia: wyniki kwartalne jutro i koncentracja portfela."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402


def test_wyniki_tylko_posiadane_spolki_z_usa():
    events = [{'symbol': 'AAPL', 'hour': 'amc'}, {'symbol': 'PKO', 'hour': 'bmo'}, {'symbol': 'MSFT', 'hour': ''}]
    held = ['AAPL', 'PKO.WA', 'NVDA']
    # PKO z kalendarza USA to nie PKO.WA z GPW
    assert server._earnings_for_held(events, held) == [{'symbol': 'AAPL', 'hour': 'amc'}]
    assert server._earnings_for_held(events, []) == []


def test_koncentracja():
    values = {'NVDA': 6000.0, 'PKO.WA': 2000.0, 'CDR.WA': 1000.0}
    # gotówka 1000 → razem 10 000; NVDA 60%, PKO 20%
    assert server._concentrated(values, 1000.0, 25) == [('NVDA', 60.0)]
    assert server._concentrated(values, 1000.0, 20) == [('NVDA', 60.0), ('PKO.WA', 20.0)]
    # jedna pozycja w portfelu to zawsze 100% — bez alarmu
    assert server._concentrated({'NVDA': 5000.0}, 0.0, 25) == []
    assert server._concentrated({}, 0.0, 25) == []


if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn()
            print('OK', name)
