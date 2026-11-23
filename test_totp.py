"""Logowanie dwuetapowe: kody TOTP zgodne z RFC 6238 i jednorazowe.

Wektory testowe z RFC 6238 (dodatek B, SHA1, sekret „12345678901234567890"),
skrócone do 6 cyfr, jak w aplikacjach typu Google Authenticator.
"""
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server                                    # noqa: E402

RFC_SECRET = base64.b32encode(b'12345678901234567890').decode()


def reset():
    server._TOTP_LAST.clear()


def test_wektory_rfc6238():
    for t, expected in ((59, '287082'), (1111111109, '081804'), (1111111111, '050471'),
                        (1234567890, '005924'), (2000000000, '279037')):
        assert server.totp_code(RFC_SECRET, t // 30) == expected, t


def test_akceptuje_sasiedni_krok_i_odrzuca_dalszy():
    reset()
    now = 1234567890
    prev = server.totp_code(RFC_SECRET, now // 30 - 1)
    assert server.totp_verify('a', RFC_SECRET, prev, now=now)
    reset()
    old = server.totp_code(RFC_SECRET, now // 30 - 2)
    assert not server.totp_verify('a', RFC_SECRET, old, now=now)


def test_ten_sam_kod_tylko_raz():
    reset()
    now = 1234567890
    code = server.totp_code(RFC_SECRET, now // 30)
    assert server.totp_verify('a', RFC_SECRET, code, now=now)
    assert not server.totp_verify('a', RFC_SECRET, code, now=now)
    # inny użytkownik ma osobny licznik
    assert server.totp_verify('b', RFC_SECRET, code, now=now)


def test_odrzuca_smieci():
    reset()
    for bad in ('', None, '12345', '1234567', 'abcdef', '005 92x'):
        assert not server.totp_verify('a', RFC_SECRET, bad, now=1234567890)
    assert not server.totp_verify('a', None, '005924', now=1234567890)
    # spacje w środku kodu (tak go pokazują aplikacje) są dozwolone
    assert server.totp_verify('a', RFC_SECRET, '005 924', now=1234567890)


def test_nowy_sekret_dziala_z_wlasnym_kodem():
    reset()
    s = server.new_totp_secret()
    assert len(s) == 32 and s.isalnum()
    assert server.totp_verify('c', s, server.totp_code(s, 1000), now=1000 * 30)


def test_kod_odzyskiwania_zamiast_kodu_z_telefonu():
    reset()
    saved = {}
    orig = server.save_recovery_codes
    server.save_recovery_codes = lambda u, h: saved.__setitem__(u, h)
    try:
        codes = ['ABCD-EFGH', 'JKLM-NPQR']
        entry = {'totp_secret': RFC_SECRET, 'recovery_codes': [server.recovery_code_hash(c) for c in codes]}
        assert server.second_factor_ok('d', entry, 'abcd-efgh')
        assert saved['d'] == [server.recovery_code_hash('JKLM-NPQR')]   # zużyty kod znika
        assert not server.second_factor_ok('d', entry, 'ZZZZ-ZZZZ')
        assert not server.second_factor_ok('d', entry, '')
    finally:
        server.save_recovery_codes = orig


if __name__ == '__main__':
    for name, fn in list(globals().items()):
        if name.startswith('test_'):
            fn()
            print('ok', name)
    print('WSZYSTKO OK')
