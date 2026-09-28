"""/api/splits: podziały akcji z odpowiedzi Yahoo v8/chart (events=split).

Front wołał /api/splits od dawna, a serwer go nie miał — wykrywanie splitów
nigdy nie działało. Test pilnuje parsowania formatu Yahoo.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

# Skrócony kształt odpowiedzi v8/chart dla NVDA (splity 4:1 w 2021 i 10:1 w 2024).
CHART = {'chart': {'result': [{
    'meta': {'symbol': 'NVDA'},
    'timestamp': [1717200000],
    'events': {'splits': {
        '1717999800': {'date': 1717999800, 'numerator': 10.0, 'denominator': 1.0, 'splitRatio': '10:1'},
        '1626787800': {'date': 1626787800, 'numerator': 4, 'denominator': 1, 'splitRatio': '4:1'},
        '1': {'date': 1, 'numerator': 0, 'denominator': 1},
    }},
}], 'error': None}}


def test_parsowanie():
    assert server._parse_splits(CHART) == [
        {'date': '2021-07-20', 'numerator': 4.0, 'denominator': 1.0, 'ratio': '4:1'},
        {'date': '2024-06-10', 'numerator': 10.0, 'denominator': 1.0, 'ratio': '10:1'},
    ]


def test_scalenie_i_brak_zdarzen():
    rev = {'chart': {'result': [{'events': {'splits': {'x': {'date': 1717999800, 'numerator': 1, 'denominator': 10}}}}]}}
    assert server._parse_splits(rev)[0]['ratio'] == '1:10'
    assert server._parse_splits({'chart': {'result': [{'meta': {}}]}}) == []
    assert server._parse_splits({'chart': {'result': None}}) == []


if __name__ == '__main__':
    test_parsowanie()
    test_scalenie_i_brak_zdarzen()
    print('WSZYSTKO OK')
