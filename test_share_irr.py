"""IRR publicznego portfela (/s/:token): przepływy z transakcji.

Wcześniej liczone były tylko typy dokładnie „BUY"/„SELL"/„DIV" — dywidendy
z importu brokera („DIVIDEND", małe litery) wypadały, a dywidenda bez ilości
(qty=None) była pomijana, choć aplikacja liczy ją jako 1 × kwota.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

FX = {'PLN': 1.0, 'USD': 4.0}


def test_typy_i_waluty():
    txs = [
        {'type': 'BUY', 'qty': 10, 'price': 100, 'currency': 'PLN', 'date': '2025-01-02'},
        {'type': 'buy', 'qty': 1, 'price': 50, 'currency': 'USD', 'date': '2025-02-01'},
        {'type': 'SELL', 'qty': 2, 'price': 120, 'currency': 'PLN', 'date': '2025-06-01'},
        {'type': 'DIVIDEND', 'qty': 8, 'price': 3, 'currency': 'PLN', 'date': '2025-07-01'},
        {'type': 'div', 'qty': None, 'price': 5, 'currency': 'USD', 'date': '2025-08-01'},
        {'type': 'CASH', 'qty': 1, 'price': 1000, 'currency': 'PLN', 'date': '2025-01-01'},
        {'type': 'BUY', 'qty': 0, 'price': 10, 'currency': 'PLN', 'date': '2025-03-01'},
    ]
    assert server._share_cashflows(txs, FX) == [
        (-1000.0, '2025-01-02'),
        (-200.0, '2025-02-01'),
        (240.0, '2025-06-01'),
        (24.0, '2025-07-01'),
        (20.0, '2025-08-01'),
    ]


def test_xirr_dokladnie_10_procent():
    # 1000 zł na rok, na koniec 1100 zł (rok nieprzestępny: 365 dni) → 10%
    cfs = [(-1000.0, '2025-01-01'), (1100.0, '2026-01-01')]
    assert abs(server._xirr(cfs) - 0.10) < 1e-6


if __name__ == '__main__':
    test_typy_i_waluty()
    test_xirr_dokladnie_10_procent()
    print('WSZYSTKO OK')
