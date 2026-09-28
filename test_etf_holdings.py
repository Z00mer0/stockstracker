"""ETF look-through: skład ETF-u z quoteSummary (topHoldings, quoteType)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

SPY = {
    'quoteType': {'quoteType': 'ETF', 'longName': 'SPDR S&P 500 ETF Trust'},
    'topHoldings': {'holdings': [
        {'symbol': 'AAPL', 'holdingName': 'Apple Inc', 'holdingPercent': {'raw': 0.071, 'fmt': '7.10%'}},
        {'symbol': 'MSFT', 'holdingName': 'Microsoft Corp', 'holdingPercent': {'raw': 0.065}},
        {'symbol': None, 'holdingName': 'Cash', 'holdingPercent': {'raw': 0.001}},
        {'symbol': 'ZERO', 'holdingName': 'Zero', 'holdingPercent': {'raw': 0}},
    ], 'sectorWeightings': [
        {'technology': {'raw': 0.31, 'fmt': '31%'}}, {'realestate': {'raw': 0.02}},
        {'nowy_sektor': {'raw': 0.01}}, {'energy': {'raw': 0}},
    ]},
}


def test_etf():
    r = server._parse_etf_holdings(SPY)
    assert r['name'] == 'SPDR S&P 500 ETF Trust'
    assert r['holdings'] == [
        {'symbol': 'AAPL', 'name': 'Apple Inc', 'weight': 0.071},
        {'symbol': 'MSFT', 'name': 'Microsoft Corp', 'weight': 0.065},
        {'symbol': None, 'name': 'Cash', 'weight': 0.001},
    ]
    assert r['sectors'] == {'Technology': 0.31, 'Real Estate': 0.02, 'Inne': 0.01}


def test_nie_etf():
    assert server._parse_etf_holdings({'quoteType': {'quoteType': 'EQUITY'}, 'topHoldings': SPY['topHoldings']}) is None
    assert server._parse_etf_holdings({'quoteType': {'quoteType': 'ETF'}, 'topHoldings': {'holdings': []}}) is None
    # sam rozkład sektorów (bez listy składników) też się liczy
    assert server._parse_etf_holdings({'quoteType': {'quoteType': 'ETF'}, 'topHoldings': {'sectorWeightings': [{'energy': {'raw': 1.0}}]}})['sectors'] == {'Energy': 1.0}
    assert server._parse_etf_holdings(None) is None


if __name__ == '__main__':
    test_etf()
    test_nie_etf()
    print('WSZYSTKO OK')
