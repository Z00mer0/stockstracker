"""Podsumowanie sesji giełdowej (GPW i USA) — dane do karty i do pusha.

Szerokość rynku, obrót i najwięksi wygrani/przegrani liczone są na stałym
zestawie spółek z market_universe.json (GPW: WIG20 + mWIG40 + sWIG80, USA:
S&P 500), a nie na całym rynku — darmowe źródła nie dają listy wszystkich
notowań. Obrót = Σ cena × wolumen, czyli przybliżenie obrotu sesji.

Moduł nie robi sam zapytań: notowania i indeksy podaje server.py, tu jest
tylko liczenie, kalendarz sesji i tekst powiadomienia — da się to
przetestować bez sieci.
"""
import datetime
import json
from collections import Counter
from pathlib import Path
from zoneinfo import ZoneInfo

MARKETS = {
    'gpw': {
        'name': 'GPW', 'tz': 'Europe/Warsaw', 'currency': 'PLN', 'calendar': 'GPW',
        # Sesja kończy się ok. 17:05 (dogrywka); push od 17:10.
        'close': (17, 10), 'until': (20, 0),
        'indices': [('WIG', 'WIG.WA'), ('WIG20', 'WIG20.WA'), ('mWIG40', 'MWIG40.WA'), ('sWIG80', 'SWIG80.WA')],
        'headline': 'WIG20',
        'universe_label': 'WIG20 + mWIG40 + sWIG80',
    },
    'us': {
        'name': 'USA', 'tz': 'America/New_York', 'currency': 'USD', 'calendar': 'NYSE',
        # 16:10 w Nowym Jorku to 22:10 w Warszawie (poza tygodniami zmiany czasu).
        'close': (16, 10), 'until': (19, 0),
        'indices': [('S&P 500', '^GSPC'), ('Nasdaq', '^IXIC'), ('Dow Jones', '^DJI'), ('Russell 2000', '^RUT')],
        'headline': 'S&P 500',
        'universe_label': 'S&P 500',
    },
}

FLAT_EPS = 0.005   # |zmiana| < 0,005% — bez zmian


def load_universe(path=None):
    p = Path(path) if path else Path(__file__).parent / 'market_universe.json'
    data = json.loads(p.read_text())
    return {'gpw': data.get('gpw', []), 'us': data.get('us', [])}


# ── Kalendarz sesji (te same reguły co frontend-react/src/utils/marketCalendar.js)

def easter_sunday(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e, f = b // 4, b % 4, (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = (h + l - 7 * m + 114) // 31, (h + l - 7 * m + 114) % 31 + 1
    return datetime.date(y, month, day)


def _nth_weekday(y, month, wd, n):
    """n-ty dzień tygodnia (0 = poniedziałek) w miesiącu; n = -1 — ostatni."""
    if n > 0:
        first = datetime.date(y, month, 1)
        return first + datetime.timedelta(days=(wd - first.weekday()) % 7 + 7 * (n - 1))
    nxt = datetime.date(y + (month == 12), month % 12 + 1, 1)
    last = nxt - datetime.timedelta(days=1)
    return last - datetime.timedelta(days=(last.weekday() - wd) % 7)


def _observed(d):
    if d.weekday() == 5:
        return d - datetime.timedelta(days=1)
    if d.weekday() == 6:
        return d + datetime.timedelta(days=1)
    return d


def holidays(year, calendar):
    D, td = datetime.date, datetime.timedelta
    e = easter_sunday(year)
    if calendar == 'GPW':
        return {D(year, 1, 1), D(year, 1, 6), e - td(days=2), e + td(days=1), D(year, 5, 1), D(year, 5, 3),
                e + td(days=60), D(year, 8, 15), D(year, 11, 1), D(year, 11, 11),
                D(year, 12, 24), D(year, 12, 25), D(year, 12, 26), D(year, 12, 31)}
    ny = D(year, 1, 1)
    days = {
        _nth_weekday(year, 1, 0, 3), _nth_weekday(year, 2, 0, 3), e - td(days=2), _nth_weekday(year, 5, 0, -1),
        _observed(D(year, 7, 4)), _nth_weekday(year, 9, 0, 1), _nth_weekday(year, 11, 3, 4), _observed(D(year, 12, 25)),
    }
    if ny.weekday() != 5:          # Nowy Rok w sobotę nie przesuwa się na 31.12
        days.add(_observed(ny))
    if year >= 2022:
        days.add(_observed(D(year, 6, 19)))
    return days


def is_trading_day(d, calendar):
    return d.weekday() < 5 and d not in holidays(d.year, calendar)


# ── Liczenie

def _session_date(quotes, tz):
    days = Counter(datetime.datetime.fromtimestamp(int(q['marketTime']), tz).date()
                   for q in quotes.values() if q and q.get('marketTime'))
    return days.most_common(1)[0][0] if days else None


def _mover(sym, q):
    return {
        'symbol': sym[:-3] if sym.endswith('.WA') else sym,
        'name': q.get('name') or '',
        'price': q['price'],
        'changePct': q['changePct'],
        'turnover': q['price'] * q['volume'] if q.get('volume') else None,
    }


def summarize(market, quotes, indices, universe_size, now=None):
    """quotes: {symbol: {'price','changePct','volume','name','marketTime'}} (None = brak)
    indices: [{'name','value','changePct','spark'}]
    Zwraca dane karty albo None, gdy nie ma żadnych notowań."""
    cfg = MARKETS[market]
    tz = ZoneInfo(cfg['tz'])
    now = (now or datetime.datetime.now(datetime.timezone.utc)).astimezone(tz)
    session = _session_date(quotes, tz)
    if session is None:
        return None
    # Tylko notowania z tej sesji (spółka zawieszona niesie stary kurs).
    cur = {s: q for s, q in quotes.items()
           if q and q.get('changePct') is not None and q.get('marketTime')
           and datetime.datetime.fromtimestamp(int(q['marketTime']), tz).date() == session}
    up = sum(1 for q in cur.values() if q['changePct'] >= FLAT_EPS)
    down = sum(1 for q in cur.values() if q['changePct'] <= -FLAT_EPS)
    flat = len(cur) - up - down
    with_vol = {s: q for s, q in cur.items() if q.get('volume')}
    by_chg = sorted(cur.items(), key=lambda kv: kv[1]['changePct'], reverse=True)
    close_h, close_m = cfg['close']
    closed = session < now.date() or (now.hour, now.minute) >= (close_h, close_m)
    return {
        'market': market,
        'name': cfg['name'],
        'date': session.isoformat(),
        'closed': closed,
        'currency': cfg['currency'],
        'headline': cfg['headline'],
        'indices': indices,
        'breadth': {'up': up, 'down': down, 'flat': flat, 'total': len(cur)},
        'turnover': sum(q['price'] * q['volume'] for q in with_vol.values()),
        'volume': sum(q['volume'] for q in with_vol.values()),
        'gainers': [_mover(s, q) for s, q in by_chg[:3] if q['changePct'] > 0],
        'losers': [_mover(s, q) for s, q in reversed(by_chg[-3:]) if q['changePct'] < 0],
        'active': [_mover(s, q) for s, q in sorted(with_vol.items(), key=lambda kv: kv[1]['price'] * kv[1]['volume'], reverse=True)[:3]],
        'universe': {'label': cfg['universe_label'], 'size': universe_size, 'priced': len(cur)},
    }


def index_from_chart(name, chart):
    """Odpowiedź Yahoo chart (interval=5m, range=1d) → wpis indeksu z wykresem dnia."""
    try:
        res = chart['chart']['result'][0]
        meta = res['meta']
        price, prev = meta.get('regularMarketPrice'), meta.get('chartPreviousClose')
        closes = [c for c in (res.get('indicators', {}).get('quote', [{}])[0].get('close') or []) if c is not None]
    except (KeyError, IndexError, TypeError):
        return {'name': name, 'value': None, 'changePct': None, 'spark': []}
    # Do ~40 punktów na cały dzień, z ostatnim notowaniem na końcu.
    step = max(1, -(-len(closes) // 40))
    spark = closes[::step]
    if closes and (len(closes) - 1) % step:
        spark.append(closes[-1])
    return {
        'name': name,
        'value': price,
        'changePct': (price / prev - 1) * 100 if price and prev else None,
        'spark': spark,
    }


# ── Powiadomienie

def _num(v, d, lang):
    s = f'{v:,.{d}f}'
    return s.replace(',', ' ').replace('.', ',') if lang == 'pl' else s


def _pct(v, lang):
    return '—' if v is None else ('+' if v >= 0 else '−') + _num(abs(v), 2, lang) + '%'


def push_text(summary, lang='pl'):
    """(tytuł, treść) powiadomienia o zamknięciu sesji."""
    d = datetime.date.fromisoformat(summary['date'])
    date = d.strftime('%d.%m') if lang == 'pl' else d.strftime('%b %d').replace(' 0', ' ')
    head = next((i for i in summary['indices'] if i['name'] == summary['headline'] and i.get('value')), None)
    title = (f'📊 Podsumowanie sesji {summary["name"]} · {date}' if lang == 'pl'
             else f'📊 {summary["name"]} session summary · {date}')
    parts = []
    if head:
        parts.append(f'{head["name"]} {_num(head["value"], 2, lang)} ({_pct(head["changePct"], lang)})')
    b = summary['breadth']
    if b['total']:
        parts.append(f'↑{b["up"]} ↓{b["down"]}')
    if summary['gainers']:
        g = summary['gainers'][0]
        parts.append(('Lider: ' if lang == 'pl' else 'Top: ') + f'{g["symbol"]} {_pct(g["changePct"], lang)}')
    if summary['losers']:
        l = summary['losers'][0]
        parts.append(('Najsłabszy: ' if lang == 'pl' else 'Worst: ') + f'{l["symbol"]} {_pct(l["changePct"], lang)}')
    return title, ' · '.join(parts)
