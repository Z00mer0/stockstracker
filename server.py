#!/usr/bin/env python3
"""
StocksTracker server — serwuje pliki statyczne, obsługuje auth i per-user dane portfela.
Lokalnie: przechowuje dane w plikach JSON.
W chmurze: przechowuje dane w PostgreSQL (zmienna DATABASE_URL).
"""
import json
import hashlib
import bcrypt
import datetime
import mimetypes
import re
import secrets
import socket
import os
import time
import urllib.parse
import urllib.request
import urllib.error
import http.cookiejar
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASE       = Path(__file__).parent
REACT_DIST = BASE / 'frontend-react' / 'dist'

# ── RATE LIMITER ───────────────────────────────────────────────────────────────
_RL_WINDOW  = 15 * 60   # seconds
_RL_MAX     = 10        # attempts per window
_rl_store   = {}        # { ip: [timestamp, ...] }
_rl_lock    = __import__('threading').Lock()

def _rate_limited(ip: str) -> bool:
    """Return True if ip has exceeded the limit; prune old timestamps as a side-effect."""
    now = time.time()
    with _rl_lock:
        ts = _rl_store.get(ip, [])
        ts = [t for t in ts if now - t < _RL_WINDOW]
        if len(ts) >= _RL_MAX:
            _rl_store[ip] = ts
            return True
        ts.append(now)
        _rl_store[ip] = ts
        return False

# ── INPUT VALIDATION ──────────────────────────────────────────────────────────
_MAX_BODY_AUTH   =   4 * 1024   #   4 KB  — login / register / change-password
_MAX_BODY_DATA   = 512 * 1024   # 512 KB  — portfolio JSON
_MAX_SYMBOLS     = 30
_USERNAME_RE     = re.compile(r'^[a-z0-9_\-]{1,64}$')

# ── CORS ───────────────────────────────────────────────────────────────────────
_ALLOWED_ORIGINS = {'https://stockstracker.onrender.com'}
_extra_origin = os.environ.get('CORS_EXTRA_ORIGIN', '').strip()
if _extra_origin:
    _ALLOWED_ORIGINS.add(_extra_origin)

def _str(val, max_len: int, field: str) -> str:
    """Assert val is a string, strip whitespace, enforce max_len."""
    if not isinstance(val, str):
        raise ValueError(f'{field}: must be a string')
    v = val.strip()
    if len(v) > max_len:
        raise ValueError(f'{field}: too long (max {max_len} chars)')
    return v

# ── CALENDAR CACHE ─────────────────────────────────────────────────────────────
_CAL_CACHE = {}   # { 'thisweek': {'data': [...], 'ts': float}, 'nextweek': {...} }
_CAL_TTL   = 4 * 3600  # 4 hours

# ── YAHOO FINANCE SESSION (crumb-based auth) ───────────────────────────────────
_YF_SESSION     = {'crumb': None, 'opener': None, 'ts': 0}
_YF_SESSION_TTL = 3600  # 1 hour
_YF_UA          = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

def _yf_open(opener, url, extra_headers=None, timeout=15):
    headers = {'User-Agent': _YF_UA, 'Accept-Encoding': 'identity'}
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with opener.open(req, timeout=timeout) as r:
        return r.read()

def _get_yf_opener():
    """Return (opener, crumb). Refreshes session if stale."""
    now = time.time()
    if _YF_SESSION['crumb'] and now - _YF_SESSION['ts'] < _YF_SESSION_TTL:
        return _YF_SESSION['opener'], _YF_SESSION['crumb']
    jar    = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    # Try crumb directly first (works from some IPs without prior cookie seeding)
    crumb = None
    for crumb_url in (
        'https://query2.finance.yahoo.com/v1/test/getcrumb',
        'https://query1.finance.yahoo.com/v1/test/getcrumb',
    ):
        try:
            crumb = _yf_open(opener, crumb_url, {'Accept': 'text/plain, */*'}, timeout=10).decode().strip()
            if crumb and crumb != 'null':
                break
            crumb = None
        except Exception:
            pass
    if not crumb:
        # Seed cookies then retry
        for seed_url in ('https://finance.yahoo.com/', 'https://www.yahoo.com/'):
            try:
                _yf_open(opener, seed_url, {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                }, timeout=12)
                break
            except Exception:
                pass
        crumb = _yf_open(opener, 'https://query2.finance.yahoo.com/v1/test/getcrumb',
                         {'Accept': 'text/plain, */*', 'Referer': 'https://finance.yahoo.com/'}, timeout=10).decode().strip()
    _YF_SESSION.update({'crumb': crumb, 'opener': opener, 'ts': now})
    return opener, crumb

def _yf_quotesummary(symbol, modules):
    """Fetch Yahoo Finance quoteSummary with crumb auth. Returns result dict."""
    for attempt in range(2):
        opener, crumb = _get_yf_opener()
        url = (
            f'https://query1.finance.yahoo.com/v10/finance/quoteSummary/'
            f'{urllib.parse.quote(symbol)}?modules={urllib.parse.quote(modules)}'
            f'&crumb={urllib.parse.quote(crumb)}'
        )
        try:
            raw  = _yf_open(opener, url, {'Accept': 'application/json'}, timeout=20)
            data = json.loads(raw)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403) and attempt == 0:
                _YF_SESSION['crumb'] = None
                continue
            raise
        results = data.get('quoteSummary', {}).get('result') or []
        return results[0] if results else None

# ── WIG20 QUOTE CACHE (public, used on login screen) ──────────────────────────
_WIG20_QUOTE_CACHE = {}   # { 'wig20': {'data': {...}, 'ts': float} }
_WIG20_QUOTE_TTL   = 300  # 5 minutes

# ── CRYPTO PRICE CACHE ─────────────────────────────────────────────────────────
_CRYPTO_CACHE = {}   # { 'bitcoin,ethereum': {'data': {...}, 'ts': float} }
_CRYPTO_TTL   = 300  # 5 minutes

# ── POLISH BENCHMARK CACHE ─────────────────────────────────────────────────────
_BENCH_PL_CACHE = {}   # { 'WIG20': {'data': [...], 'ts': float}, ... }
_BENCH_PL_TTL   = 6 * 3600   # 6 hours

_BANKIER_SYMBOLS = {
    'WIG20': 'WIG20',
}

def _fetch_bench_pl(index_name):
    import datetime
    upper = index_name.upper()
    if upper not in _BANKIER_SYMBOLS:
        return None
    entry = _BENCH_PL_CACHE.get(upper)
    if entry and time.time() - entry['ts'] < _BENCH_PL_TTL:
        return entry['data']
    sym = _BANKIER_SYMBOLS[upper]
    url = f'https://www.bankier.pl/new-charts/get-data?symbol={sym}&intraday=false&type=area&max_data_count=2000'
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': f'https://www.bankier.pl/inwestowanie/profile/quote.html?symbol={sym}',
            'Accept': 'application/json, */*',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8', errors='replace'))
        raw_points = data.get('main', [])
        if not raw_points:
            return None
        points = []
        for ts_ms, price in raw_points:
            try:
                date_str = datetime.datetime.utcfromtimestamp(ts_ms / 1000).strftime('%Y-%m-%d')
                if price and float(price) > 0:
                    points.append({'date': date_str, 'price': float(price)})
            except Exception:
                continue
        if not points:
            return None
        _BENCH_PL_CACHE[upper] = {'data': points, 'ts': time.time()}
        print(f'[bench-pl] {upper}: fetched {len(points)} points from bankier.pl')
        return points
    except Exception as e:
        print(f'[bench-pl] {upper} ERROR: {e}')
        stale = _BENCH_PL_CACHE.get(upper, {}).get('data')
        return stale if stale is not None else None

_CAL_HEADERS = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer':         'https://www.forexfactory.com/',
    'Origin':          'https://www.forexfactory.com',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
}

def _fetch_calendar(week):
    entry = _CAL_CACHE.get(week)
    if entry and time.time() - entry['ts'] < _CAL_TTL:
        return entry['data']
    url = f'https://nfs.faireconomy.media/ff_calendar_{week}.json'
    try:
        req = urllib.request.Request(url, headers=_CAL_HEADERS)
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
            # handle gzip
            if resp.info().get('Content-Encoding') == 'gzip':
                import gzip
                raw = gzip.decompress(raw)
            data = json.loads(raw)
        print(f'[calendar] {week}: fetched {len(data)} events')
        _CAL_CACHE[week] = {'data': data, 'ts': time.time()}
        return data
    except Exception as e:
        print(f'[calendar] {week} ERROR: {e}')
        stale = _CAL_CACHE.get(week, {}).get('data')
        return stale if stale is not None else []

def _raw(obj, key):
    """Extract raw numeric value from a Yahoo Finance field dict like {'raw': 1.18e9, 'fmt': '1.18B'}."""
    v = obj.get(key) if isinstance(obj, dict) else None
    if isinstance(v, dict):
        return v.get('raw')
    if isinstance(v, (int, float)):
        return v
    return None


def _quarter_label(ts):
    """Convert Unix timestamp to 'Q1 2025' label."""
    dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    q  = (dt.month - 1) // 3 + 1
    return f'Q{q} {dt.year}'


def _annual_label(ts):
    """Convert Unix timestamp to fiscal year label like '2024'."""
    dt = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc)
    return str(dt.year)


def _dcf_fair_value(net_income_ttm, growth_rate, shares,
                    discount_rate=0.10, terminal_growth=0.03, years=5):
    if not net_income_ttm or net_income_ttm <= 0 or not shares or shares <= 0 or discount_rate <= terminal_growth:
        return None
    g = min(max(growth_rate or 0.0, 0.0), 0.20)
    pv, ni = 0.0, float(net_income_ttm)
    for i in range(1, years + 1):
        ni *= (1 + g)
        pv += ni / (1 + discount_rate) ** i
    tv = ni * (1 + terminal_growth) / (discount_rate - terminal_growth)
    pv += tv / (1 + discount_rate) ** years
    return pv / shares


def _normalize_financials(result, period):
    """Normalise raw Yahoo Finance quoteSummary result into the app's financials schema."""
    suffix      = 'Quarterly' if period == 'quarterly' else ''
    income_list = result.get(f'incomeStatementHistory{suffix}', {}).get('incomeStatementHistory', [])
    bs_list     = result.get(f'balanceSheetHistory{suffix}',    {}).get('balanceSheetStatements', [])
    cf_list     = result.get(f'cashflowStatementHistory{suffix}', {}).get('cashflowStatements', [])
    key_stats   = result.get('defaultKeyStatistics', {})
    summary     = result.get('summaryDetail', {})
    currency    = summary.get('currency', 'USD') if isinstance(summary.get('currency'), str) else 'USD'

    # Index balance sheet and cash flow by period end timestamp for O(1) join
    bs_by_ts = {_raw(r, 'endDate'): r for r in bs_list if _raw(r, 'endDate')}
    cf_by_ts = {_raw(r, 'endDate'): r for r in cf_list if _raw(r, 'endDate')}

    periods = []
    for i, row in enumerate(income_list):
        ts = _raw(row, 'endDate')
        if not ts:
            continue

        rev = _raw(row, 'totalRevenue')
        # YoY: Yahoo returns oldest-first; quarterly: i-4 is same quarter one year ago; annual: i-1
        rev_yoy = None
        yoy_step = 4 if period == 'quarterly' else 1
        if i >= yoy_step and rev is not None:
            prev_rev = _raw(income_list[i - yoy_step], 'totalRevenue')
            if prev_rev:
                rev_yoy = (rev - prev_rev) / abs(prev_rev)

        gp           = _raw(row, 'grossProfit')
        gross_margin = (gp / rev) if gp is not None and rev else None
        op_income    = _raw(row, 'operatingIncome')
        cf           = cf_by_ts.get(ts, {})
        depreciation  = _raw(cf, 'depreciation')
        ebitda        = (op_income + depreciation) if op_income is not None and depreciation is not None else None
        ebitda_margin = (ebitda / rev) if ebitda is not None and rev else None
        net_income   = _raw(row, 'netIncome')
        op_cost      = _raw(row, 'totalOperatingExpenses')

        bs = bs_by_ts.get(ts)
        if bs is not None:
            total_assets = _raw(bs, 'totalAssets')
            total_liab   = _raw(bs, 'totalLiab')
            equity       = _raw(bs, 'totalStockholderEquity')
            cash         = _raw(bs, 'cash') or 0
            long_debt    = _raw(bs, 'longTermDebt')
            short_debt   = _raw(bs, 'shortLongTermDebt')
            total_debt   = (long_debt or 0) + (short_debt or 0) if (long_debt is not None or short_debt is not None) else None
            net_debt     = (total_debt - cash) if total_debt is not None else None
        else:
            total_assets = total_liab = equity = total_debt = net_debt = None
            cash = 0

        cfo   = _raw(cf, 'totalCashFromOperatingActivities')
        capex = _raw(cf, 'capitalExpenditures')
        fcf   = (cfo - abs(capex)) if cfo is not None and capex is not None else None
        repurchase = _raw(cf, 'repurchaseOfStock')

        periods.append({
            'label':            _quarter_label(ts) if period == 'quarterly' else _annual_label(ts),
            'date':             datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime('%Y-%m-%d'),
            'revenue':          rev,
            'revenueGrowthYoY': rev_yoy,
            'grossProfit':      gp,
            'grossMargin':      gross_margin,
            'operatingCost':    op_cost,
            'operatingIncome':  op_income,
            'ebitda':           ebitda,
            'ebitdaMargin':     ebitda_margin,
            'netIncome':        net_income,
            'netDebt':          net_debt,
            'totalAssets':      total_assets,
            'totalLiabilities': total_liab,
            'equity':           equity,
            'cashAndEquivalents': cash if bs is not None else None,
            'totalDebt':        total_debt,
            'operatingCashFlow': cfo,
            'capex':            capex,
            'fcf':              fcf,
            'shareRepurchases': repurchase,
        })

    # TTM FCF = sum of latest 4 quarterly FCFs (for P/FCF valuation)
    ttm_fcf = None
    if period == 'quarterly':
        q_fcfs = [p['fcf'] for p in periods[:4] if p['fcf'] is not None]
        if len(q_fcfs) == 4:
            ttm_fcf = sum(q_fcfs)

    price_mod  = result.get('price', {})
    market_cap = _raw(summary, 'marketCap') or _raw(price_mod, 'marketCap')
    shares_out = (_raw(key_stats, 'sharesOutstanding') or _raw(price_mod, 'sharesOutstanding')
                  or _raw(key_stats, 'floatShares') or _raw(key_stats, 'impliedSharesOutstanding'))
    ev         = _raw(key_stats, 'enterpriseValue')
    pfcf       = (market_cap / ttm_fcf) if market_cap and ttm_fcf and ttm_fcf > 0 else None

    valuation = {
        'peRatio':           _raw(key_stats, 'trailingPE'),
        'forwardPE':         _raw(key_stats, 'forwardPE'),
        'evEbitda':          _raw(key_stats, 'enterpriseToEbitda'),
        'ps':                _raw(summary,   'priceToSalesTrailing12Months'),
        'marketCap':         market_cap,
        'sharesOutstanding': shares_out,
        'ev':                ev,
        'pfcf':              pfcf,
        'netDebtLatest':     periods[0]['netDebt'] if periods else None,
    }

    return {
        'periods':   periods,
        'valuation': valuation,
        'currency':  currency,
        'period':    period,
    }


_BANKIER_MONTHS = {
    'Sty': ('01', '31'), 'Lut': ('02', '28'), 'Mar': ('03', '31'),
    'Kwi': ('04', '30'), 'Maj': ('05', '31'), 'Cze': ('06', '30'),
    'Lip': ('07', '31'), 'Sie': ('08', '31'), 'Wrz': ('09', '30'),
    'Paź': ('10', '31'), 'Lis': ('11', '30'), 'Gru': ('12', '31'),
}
_BANKIER_QUARTER = {'01': 'Q1', '02': 'Q1', '03': 'Q1',
                    '04': 'Q2', '05': 'Q2', '06': 'Q2',
                    '07': 'Q3', '08': 'Q3', '09': 'Q3',
                    '10': 'Q4', '11': 'Q4', '12': 'Q4'}


def _fetch_bankier_quarterly_financials(symbol):
    """Scrape quarterly financial data from Bankier.pl for GPW (.WA) stocks."""
    ticker = symbol.replace('.WA', '').replace('.', '').upper()
    url = f'https://www.bankier.pl/gielda/notowania/akcje/{ticker}/wyniki-finansowe'
    req = urllib.request.Request(url, headers={
        'User-Agent': _YF_UA, 'Accept-Language': 'pl-PL,pl;q=0.9',
    })
    with urllib.request.urlopen(req, timeout=12) as r:
        html = r.read().decode('utf-8', errors='replace')

    table_match = re.search(r'<table[^>]*m-quotes-data-table[^>]*>(.*?)</table>', html, re.DOTALL)
    if not table_match:
        return None

    header_row = re.search(r'<tr[^>]*>(.*?)</tr>', table_match.group(1), re.DOTALL)
    if not header_row:
        return None
    ths = re.findall(r'<th[^>]*>(.*?)</th>', header_row.group(1), re.DOTALL)
    headers = [re.sub(r'<[^>]+>', '', h).replace('\xa0', ' ').strip() for h in ths]

    # Build column index → (date_str, label) mapping
    col_meta = []
    for h in headers[1:]:  # skip first col (label col)
        m = re.match(r'([A-Za-zÀ-žŁ-łŚ-śŻ-žóÓ]+)\s+(\d{4})', h)
        if m:
            mon_pl, year = m.group(1)[:3], m.group(2)
            mon_info = _BANKIER_MONTHS.get(mon_pl) or _BANKIER_MONTHS.get(mon_pl[:2])
            if mon_info:
                mm, day = mon_info
                date_str = f'{year}-{mm}-{day}'
                q = _BANKIER_QUARTER[mm]
                col_meta.append((date_str, f"{q} '{year[2:]}"))
            else:
                col_meta.append(None)
        else:
            col_meta.append(None)

    # Parse all data rows into a dict keyed by row label
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_match.group(1), re.DOTALL)
    row_data = {}
    for row in rows[1:]:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if not cells:
            continue
        label = re.sub(r'<[^>]+>', '', cells[0]).replace('\xa0', ' ').strip()
        vals = []
        for c in cells[1:]:
            raw = re.sub(r'<[^>]+>', '', c).replace('\xa0', '').strip()
            num_str = re.split(r'r/r|~|zł', raw)[0].strip().replace(' ', '').replace(',', '.')
            try:
                vals.append(float(num_str) * 1000 if num_str and num_str != '----' else None)
            except ValueError:
                vals.append(None)
        if label and label not in row_data:
            row_data[label] = vals

    def _col(raw_label):
        for k, v in row_data.items():
            if raw_label.lower() in k.lower():
                return v
        return None

    rev_vals   = _col('przychody netto ze sprzeda')
    ebit_vals  = _col('zysk (strata) z dział. operacy')
    ebitda_vals = _col('ebitda')
    ni_vals    = _col('zysk (strata) nettoprezent') or _col('zysk (strata) netto')
    ta_vals    = _col('aktywa')
    cash_vals  = _col('środk') or _col('rodki pieni')  # środki pieniężne
    eq_vals    = _col('kapitał własny') or _col('kapita')
    ltd_vals   = _col('zobowiązania długoterminowe') or _col('zobowi')
    std_vals   = _col('zobowiązania krótkoterminowe')
    cfo_vals   = _col('przepływy z działalności operacyjne') or _col('przepływy z działalności operacyjne')
    capex_vals = _col('przepływy z działalności inwestycyj') or _col('przepływy z działalności inwestycyj')

    if not rev_vals:
        return None

    # Collect valid (non-None, non-zero) quarterly periods, newest-first
    n = min(len(col_meta), len(rev_vals))
    # Take last 12 columns max (most recent)
    start = max(0, n - 12)
    all_periods = []
    for i in range(start, n):
        meta = col_meta[i] if i < len(col_meta) else None
        if meta is None:
            continue
        date_str, label = meta
        rev = rev_vals[i] if rev_vals and i < len(rev_vals) else None
        if rev is None:
            continue
        ebit  = ebit_vals[i]  if ebit_vals  and i < len(ebit_vals)  else None
        ebitda= ebitda_vals[i] if ebitda_vals and i < len(ebitda_vals) else None
        ni    = ni_vals[i]    if ni_vals    and i < len(ni_vals)    else None
        ta    = ta_vals[i]    if ta_vals    and i < len(ta_vals)    else None
        cash  = cash_vals[i]  if cash_vals  and i < len(cash_vals)  else None
        eq    = eq_vals[i]    if eq_vals    and i < len(eq_vals)    else None
        ltd   = ltd_vals[i]   if ltd_vals   and i < len(ltd_vals)   else None
        std   = std_vals[i]   if std_vals   and i < len(std_vals)   else None
        cfo   = cfo_vals[i]   if cfo_vals   and i < len(cfo_vals)   else None
        cap   = capex_vals[i] if capex_vals and i < len(capex_vals) else None

        tl    = (ta - eq) if ta is not None and eq is not None else None
        td    = (ltd or 0) + (std or 0) if (ltd is not None or std is not None) else None
        nd    = (td - cash) if td is not None and cash is not None else None
        ebitda_margin = (ebitda / rev) if ebitda and rev else None
        fcf   = (cfo - abs(cap)) if cfo is not None and cap is not None else None

        all_periods.append({
            'label':             label,
            'date':              date_str,
            'revenue':           rev,
            'revenueGrowthYoY':  None,  # filled below
            'grossProfit':       None,
            'grossMargin':       None,
            'operatingCost':     None,
            'operatingIncome':   ebit,
            'ebitda':            ebitda,
            'ebitdaMargin':      ebitda_margin,
            'netIncome':         ni,
            'netDebt':           nd,
            'totalAssets':       ta,
            'totalLiabilities':  tl,
            'equity':            eq,
            'cashAndEquivalents': cash,
            'totalDebt':         td,
            'operatingCashFlow': cfo,
            'capex':             cap,
            'fcf':               fcf,
            'shareRepurchases':  None,
        })

    if not all_periods:
        return None

    # YoY growth: iterate oldest→newest, compare same quarter one year ago
    # all_periods is already ordered oldest→newest (we iterated i from start to n)
    for j in range(len(all_periods)):
        curr = all_periods[j]
        curr_rev = curr['revenue']
        curr_date = curr['date']  # YYYY-MM-DD
        # Find same quarter one year ago
        try:
            cy, cm = int(curr_date[:4]), curr_date[5:7]
            prev_date_prefix = f'{cy-1}-{cm}'
            prev_period = next((p for p in all_periods[:j] if p['date'].startswith(prev_date_prefix)), None)
            if prev_period and prev_period['revenue']:
                curr['revenueGrowthYoY'] = (curr_rev - prev_period['revenue']) / abs(prev_period['revenue'])
        except Exception:
            pass

    # Return newest-first
    all_periods.reverse()

    return {
        'periods':   all_periods,
        'valuation': {},
        'currency':  'PLN',
        'period':    'quarterly',
        'source':    'bankier',
    }


def _fetch_biznesradar_financials(symbol):
    """Scrape annual financial data from Biznesradar.pl for GPW (.WA) stocks.
    Used as fallback when Yahoo Finance quoteSummary is unavailable from Render's IP."""
    ticker = symbol.replace('.WA', '').replace('.', '').upper()

    def _scrape(report_path):
        url = f'https://www.biznesradar.pl/{report_path}/{ticker}'
        req = urllib.request.Request(url, headers={'User-Agent': _YF_UA, 'Accept-Language': 'pl-PL,pl;q=0.9'})
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='replace')
        table_match = re.search(
            r'<table[^>]*class="[^"]*report-table[^"]*"[^>]*>(.*?)</table>',
            html, re.DOTALL
        )
        if not table_match:
            return [], {}
        # Parse column years from <th> headers
        header_row = re.search(r'<tr[^>]*>(.*?)</tr>', table_match.group(1), re.DOTALL)
        years = []
        if header_row:
            for th in re.findall(r'<th[^>]*>(.*?)</th>', header_row.group(1), re.DOTALL):
                m = re.search(r'(\d{4})', re.sub(r'<[^>]+>', '', th))
                if m:
                    years.append(m.group(1))
        # Parse data rows — values in thousands PLN
        rows = re.findall(r'<tr[^>]*>(.*?)</tr>', table_match.group(1), re.DOTALL)
        data = {}
        for row in rows[1:]:
            cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
            if len(cells) < 2:
                continue
            label = re.sub(r'<[^>]+>', '', cells[0]).strip()
            if not label or label in data:
                continue
            vals = []
            for c in cells[1:]:
                raw = re.sub(r'<[^>]+>', '', c).strip()
                num = re.split(r'r/r|~', raw)[0].strip().replace(' ', '').replace('\xa0', '')
                try:
                    vals.append(float(num) if num and num not in ('-', '') else None)
                except ValueError:
                    vals.append(None)
            data[label] = vals
        return years, data

    try:
        years, income = _scrape('raporty-finansowe-rachunek-zyskow-i-strat')
        _,    balance = _scrape('raporty-finansowe-bilans')
        _,    cashflow = _scrape('raporty-finansowe-przeplywy-pieniezne')
    except Exception as e:
        print(f'[biznesradar] {ticker}: {e}')
        return None

    if not years or not income:
        return None

    n = len(years)

    def _col(src, *keys):
        for k in keys:
            if k in src:
                return [v * 1000 if v is not None else None for v in src[k][:n]]
        return [None] * n

    rev_list  = _col(income,   'Przychody ze sprzedaży')
    gp_list   = _col(income,   'Zysk ze sprzedaży')
    ebit_list = _col(income,   'Zysk operacyjny (EBIT)')
    ni_list   = _col(income,   'Zysk netto')
    ebitda_l  = _col(income,   'EBITDA')
    ta_list   = _col(balance,  'Aktywa razem')
    eq_list   = _col(balance,  'Kapitał własny akcjonariuszy jednostki dominującej', 'Kapitał własny')
    csh_list  = _col(balance,  'Środki pieniężne i inne aktywa pieniężne', 'Środki pieniężne')
    cfo_list  = _col(cashflow, 'Przepływy pieniężne z działalności operacyjne')
    cap_list  = _col(cashflow, 'CAPEX (niematerialne i rzeczowe)', 'CAPEX')
    fcf_list  = _col(cashflow, 'Free Cash Flow')

    # Build periods newest-first (Biznesradar is oldest-first, reverse it)
    indices = list(reversed(range(n)))
    periods = []
    for rank, i in enumerate(indices):
        rev = rev_list[i]
        if not rev:
            continue
        gp    = gp_list[i]
        ebit  = ebit_list[i]
        ni    = ni_list[i]
        ebitda = ebitda_l[i]
        ta    = ta_list[i]
        eq    = eq_list[i]
        csh   = csh_list[i]
        cfo   = cfo_list[i]
        cap   = cap_list[i]
        fcf   = fcf_list[i]
        if fcf is None and cfo is not None and cap is not None:
            fcf = cfo - abs(cap)

        gm   = (gp  / rev) if gp   is not None and rev else None
        om   = (ebit / rev) if ebit is not None and rev else None
        em   = (ebitda / rev) if ebitda is not None and rev else None
        tl   = (ta - eq) if ta is not None and eq is not None else None

        # YoY revenue growth (rank+1 = one year older)
        prev_i = indices[rank + 1] if rank + 1 < len(indices) else None
        rev_prev = rev_list[prev_i] if prev_i is not None else None
        rev_yoy = ((rev - rev_prev) / abs(rev_prev)) if rev_prev else None

        periods.append({
            'label':            f'FY{years[i]}',
            'date':             f'{years[i]}-12-31',
            'revenue':          rev,
            'revenueGrowthYoY': rev_yoy,
            'grossProfit':      gp,
            'grossMargin':      gm,
            'operatingCost':    None,
            'operatingIncome':  ebit,
            'ebitda':           ebitda,
            'ebitdaMargin':     em,
            'netIncome':        ni,
            'netDebt':          None,
            'totalAssets':      ta,
            'totalLiabilities': tl,
            'equity':           eq,
            'cashAndEquivalents': csh,
            'totalDebt':        None,
            'operatingCashFlow': cfo,
            'capex':            cap,
            'fcf':              fcf,
            'shareRepurchases': None,
        })

    if not periods:
        return None

    return {
        'periods':   periods,
        'valuation': {'netDebtLatest': None},
        'currency':  'PLN',
        'period':    'annual',
        'source':    'biznesradar',
    }


def _fetch_biznesradar_valuation(symbol):
    """Scrape market cap, shares outstanding, and EV from Biznesradar profile page for .WA stocks."""
    ticker = symbol.replace('.WA', '').replace('.', '').upper()
    url = f'https://www.biznesradar.pl/notowania/{ticker}'
    req = urllib.request.Request(url, headers={'User-Agent': _YF_UA, 'Accept-Language': 'pl-PL,pl;q=0.9'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='replace')
    except Exception:
        return {}

    def _parse_num(pattern):
        m = re.search(pattern, html, re.DOTALL)
        if not m:
            return None
        raw = re.sub(r'<[^>]+>', '', m.group(1)).strip().replace('\xa0', '').replace(' ', '')
        try:
            return float(raw)
        except ValueError:
            return None

    shares    = _parse_num(r'Liczba\s+akcji.*?<td[^>]*>.*?(\d[\d\s]+)</a>')
    mkt_cap   = _parse_num(r'Kapitalizacja:.*?<td[^>]*>([\d\s]+)</td>')
    ev_raw    = _parse_num(r'Enterprise\s+Value:.*?>([\d\s]+)</span>')
    return {k: v for k, v in {
        'sharesOutstanding': shares,
        'marketCap':         mkt_cap,
        'enterpriseValue':   ev_raw,
    }.items() if v is not None}


_SEC_TICKERS_CACHE = {'data': None, 'ts': 0}
_SEC_TICKERS_TTL   = 86400  # 1 day

def _sec_get_cik(symbol):
    """Return zero-padded CIK string for a US ticker, or None if not found."""
    now = time.time()
    if not _SEC_TICKERS_CACHE['data'] or now - _SEC_TICKERS_CACHE['ts'] > _SEC_TICKERS_TTL:
        req = urllib.request.Request(
            'https://www.sec.gov/files/company_tickers.json',
            headers={'User-Agent': 'StocksTracker gorski.a.r@gmail.com', 'Accept': 'application/json'})
        try:
            raw = urllib.request.urlopen(req, timeout=12).read()
            _SEC_TICKERS_CACHE['data'] = json.loads(raw)
            _SEC_TICKERS_CACHE['ts']   = now
        except Exception as e:
            print(f'[sec/tickers] {e}')
            return None
    entry = next((v for v in _SEC_TICKERS_CACHE['data'].values()
                  if v.get('ticker', '').upper() == symbol.upper()), None)
    return str(entry['cik_str']).zfill(10) if entry else None


def _fetch_sec_edgar_financials(symbol, period):
    """Fetch financial data from SEC EDGAR XBRL API for US-listed stocks.
    Works from any IP — no API key, no rate-limiting issues."""
    cik = _sec_get_cik(symbol)
    if not cik:
        return None
    try:
        req = urllib.request.Request(
            f'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json',
            headers={'User-Agent': 'StocksTracker gorski.a.r@gmail.com', 'Accept': 'application/json'})
        facts = json.loads(urllib.request.urlopen(req, timeout=20).read())
    except Exception as e:
        print(f'[sec/facts] {symbol}: {e}')
        return None

    usgaap = facts.get('facts', {}).get('us-gaap', {})

    is_quarterly = period == 'quarterly'

    def _by_date(concepts, unit='USD'):
        """Return {end_date: value} for the requested period type (FY or Q1-Q4).
        When multiple entries share the same end_date (e.g. single-quarter vs YTD cumulative),
        prefer the entry whose period length is closest to 91 days (one quarter)."""
        import datetime as _dt2
        out = {}  # date -> (val, filed, period_days)
        for k in concepts:
            for f in usgaap.get(k, {}).get('units', {}).get(unit, []):
                fp = f.get('fp', '')
                form = f.get('form', '')
                if is_quarterly:
                    ok = fp in ('Q1', 'Q2', 'Q3', 'Q4') and '10-Q' in form
                    ok = ok or (fp == 'Q4' and '10-K' in form)
                else:
                    ok = fp == 'FY' and '10-K' in form
                if not ok:
                    continue
                d = f.get('end', '')
                filed = f.get('filed', '')
                period_days = None
                if is_quarterly and f.get('start') and d:
                    try:
                        period_days = (_dt2.date.fromisoformat(d) - _dt2.date.fromisoformat(f['start'])).days
                    except Exception:
                        pass
                if d not in out:
                    out[d] = (f.get('val'), filed, period_days)
                else:
                    ex_val, ex_filed, ex_days = out[d]
                    if filed > ex_filed:
                        out[d] = (f.get('val'), filed, period_days)
                    elif filed == ex_filed and is_quarterly:
                        # Same filing — prefer the entry closer to a single quarter (91 days)
                        if period_days is not None and (ex_days is None or abs(period_days - 91) < abs(ex_days - 91)):
                            out[d] = (f.get('val'), filed, period_days)
        return {d: v[0] for d, v in out.items()}

    revenues  = _by_date(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet'])
    gp        = _by_date(['GrossProfit'])
    op_inc    = _by_date(['OperatingIncomeLoss'])
    net_inc   = _by_date(['NetIncomeLoss'])
    da        = _by_date(['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization'])
    assets    = _by_date(['Assets'])
    liabs     = _by_date(['Liabilities'])
    equity    = _by_date(['StockholdersEquity',
                           'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'])
    cash      = _by_date(['CashAndCashEquivalentsAtCarryingValue',
                           'CashCashEquivalentsAndShortTermInvestments'])
    lt_debt   = _by_date(['LongTermDebtNoncurrent', 'LongTermDebt'])
    st_debt   = _by_date(['DebtCurrent', 'ShortTermBorrowings'])
    op_cf     = _by_date(['NetCashProvidedByUsedInOperatingActivities'])
    capex_raw = _by_date(['PaymentsToAcquirePropertyPlantAndEquipment'])

    # Shares outstanding — combine all concepts, keep most recent entry per date
    # WeightedAverage concepts fill gaps left by CommonStockSharesOutstanding (e.g. multi-class stocks)
    shares_map = {}
    for _shares_concept in ('CommonStockSharesOutstanding',
                            'WeightedAverageNumberOfDilutedSharesOutstanding',
                            'WeightedAverageNumberOfSharesOutstandingBasic'):
        for f in usgaap.get(_shares_concept, {}).get('units', {}).get('shares', []):
            if f.get('val', 0) <= 0:
                continue
            d = f.get('end', '')
            filed = f.get('filed', '')
            if d not in shares_map or filed > shares_map[d][1]:
                shares_map[d] = (f.get('val'), filed)
    shares_by_date = {d: v[0] for d, v in shares_map.items()}

    all_dates = sorted(set(revenues) | set(net_inc), reverse=True)
    if not all_dates:
        return None

    periods_out = []
    prev_rev = None
    for date in all_dates[:8]:
        rev  = revenues.get(date)
        ni   = net_inc.get(date)
        oi   = op_inc.get(date)
        da_v = da.get(date)
        ebitda = (oi + da_v) if (oi is not None and da_v is not None) else None
        ocf  = op_cf.get(date)
        cpx  = capex_raw.get(date)
        fcf  = (ocf - abs(cpx)) if (ocf is not None and cpx is not None) else None
        ltd  = lt_debt.get(date) or 0
        std  = st_debt.get(date) or 0
        total_debt = (ltd + std) if (ltd or std) else None
        ca   = cash.get(date)
        net_debt = (total_debt - ca) if (total_debt is not None and ca is not None) else None

        if is_quarterly:
            try:
                import datetime as _dt
                m = int(date[5:7])
                q = (m - 1) // 3 + 1
                yr = date[:4]
                label = f'Q{q} \'{yr[-2:]}'
            except Exception:
                label = date
        else:
            label = f'FY{date[:4]}'

        p = {
            'date': date, 'label': label,
            'revenue': rev, 'grossProfit': gp.get(date),
            'operatingIncome': oi, 'ebitda': ebitda, 'netIncome': ni,
            'fcf': fcf, 'totalAssets': assets.get(date),
            'totalLiabilities': liabs.get(date), 'equity': equity.get(date),
            'cashAndEquivalents': ca, 'totalDebt': total_debt, 'netDebt': net_debt,
            'operatingCashFlow': ocf, 'capex': cpx,
        }
        if rev and gp.get(date):    p['grossMargin']  = gp[date] / rev
        if rev and ni:              p['netMargin']    = ni / rev
        if rev and ebitda:          p['ebitdaMargin'] = ebitda / rev
        periods_out.append(p)

    # YoY growth: compare same quarter one year ago (match by YYYY-MM prefix shifted by 1 year)
    for i in range(len(periods_out)):
        curr = periods_out[i]
        curr_rev = curr.get('revenue')
        curr_date = curr.get('date', '')
        if not curr_rev or len(curr_date) < 7:
            continue
        try:
            prev_year_prefix = f'{int(curr_date[:4]) - 1}-{curr_date[5:7]}'
            prev = next((p for p in periods_out[i + 1:] if p.get('date', '').startswith(prev_year_prefix)), None)
            if prev and prev.get('revenue'):
                curr['revenueGrowthYoY'] = (curr_rev - prev['revenue']) / abs(prev['revenue'])
        except Exception:
            pass

    # Most-recent shares outstanding
    latest_shares = None
    if shares_by_date:
        latest_shares = shares_by_date[max(shares_by_date)]

    return {
        'period': period,
        'currency': 'USD',
        'source': 'sec',
        'periods': periods_out,
        'valuation': {
            'sharesOutstanding': latest_shares,
            'peRatio': None, 'forwardPE': None, 'evEbitda': None,
            'ps': None, 'pfcf': None, 'marketCap': None, 'ev': None,
            'netDebtLatest': net_debt if periods_out else None,
        },
    }


def _fetch_yahoo_financials(symbol, period):
    """Fetch and normalise financial data from Yahoo Finance, with Biznesradar fallback for .WA."""
    suffix  = 'Quarterly' if period == 'quarterly' else ''
    modules = (
        f'incomeStatementHistory{suffix},'
        f'balanceSheetHistory{suffix},'
        f'cashflowStatementHistory{suffix},'
        'defaultKeyStatistics,summaryDetail,price'
    )
    data = None
    try:
        result = _yf_quotesummary(symbol, modules)
        if result:
            data = _normalize_financials(result, period)
            if not (data and data.get('periods')):
                data = None
    except Exception as e:
        print(f'[financials/yf] {symbol}/{period}: {e}')

    # Quarterly failed for .WA — try Bankier.pl quarterly before falling back to annual
    if data is None and period == 'quarterly' and symbol.endswith('.WA'):
        try:
            data = _fetch_bankier_quarterly_financials(symbol)
            if not (data and data.get('periods')):
                data = None
        except Exception as e:
            print(f'[financials/bankier] {symbol}: {e}')
            data = None

    # Quarterly failed — try YF annual as intermediate fallback
    if data is None and period == 'quarterly':
        try:
            result = _yf_quotesummary(symbol, (
                'incomeStatementHistory,balanceSheetHistory,'
                'cashflowStatementHistory,defaultKeyStatistics,summaryDetail'
            ))
            if result:
                d = _normalize_financials(result, 'annual')
                if d and d.get('periods'):
                    data = d
        except Exception:
            pass

    # YF unavailable — scrape Biznesradar for .WA stocks (annual data)
    if data is None and symbol.endswith('.WA'):
        try:
            data = _fetch_biznesradar_financials(symbol)
        except Exception as e:
            print(f'[financials/br] {symbol}: {e}')

    # YF unavailable or missing revenue — use SEC EDGAR XBRL for US-listed stocks (no IP blocking)
    has_revenue = data and any(p.get('revenue') for p in data.get('periods', []))
    if (data is None or not has_revenue) and not symbol.endswith('.WA') and '.' not in symbol:
        try:
            sec_data = _fetch_sec_edgar_financials(symbol, period)
            if sec_data and sec_data.get('periods'):
                if data is None:
                    data = sec_data
                else:
                    # Merge: fill missing revenue/ebitda/operatingIncome from SEC into Yahoo periods
                    sec_by_date = {p['date'][:7]: p for p in sec_data.get('periods', [])}
                    for p in data.get('periods', []):
                        sec_p = sec_by_date.get(p.get('date', '')[:7])
                        if sec_p:
                            for field in ('revenue', 'grossProfit', 'operatingIncome', 'ebitda',
                                          'ebitdaMargin', 'grossMargin', 'capex', 'revenueGrowthYoY'):
                                if p.get(field) is None and sec_p.get(field) is not None:
                                    p[field] = sec_p[field]
                    # Fill missing shares from SEC
                    val = data.get('valuation', {})
                    if not val.get('sharesOutstanding') and sec_data.get('valuation', {}).get('sharesOutstanding'):
                        val['sharesOutstanding'] = sec_data['valuation']['sharesOutstanding']
                        data['valuation'] = val
        except Exception as e:
            print(f'[financials/sec] {symbol}: {e}')

    # For .WA stocks, fill valuation gaps (marketCap, sharesOutstanding) from Biznesradar profile
    if data and symbol.endswith('.WA'):
        val = data.get('valuation', {})
        if not val.get('marketCap') or not val.get('sharesOutstanding'):
            try:
                br_val = _fetch_biznesradar_valuation(symbol)
                if br_val:
                    val.setdefault('marketCap',         br_val.get('marketCap'))
                    val.setdefault('sharesOutstanding', br_val.get('sharesOutstanding'))
                    val.setdefault('ev',                br_val.get('enterpriseValue'))
                    data['valuation'] = val
            except Exception as e:
                print(f'[financials/br_val] {symbol}: {e}')

    return data


def _refresh_financials_background(symbols=None):
    """Background: fetch & cache quarterly+annual financials for all portfolio symbols.
    Only refreshes entries missing or older than 14 days to avoid hammering Yahoo Finance."""
    if not DATABASE_URL:
        return
    try:
        if symbols is None:
            with _conn() as conn, conn.cursor() as cur:
                cur.execute("SELECT DISTINCT symbol FROM portfolio_holdings WHERE qty > 0")
                symbols = [r[0] for r in cur.fetchall()]
        if not symbols:
            return
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=14)
        to_refresh = []
        for sym in symbols:
            for period in ('quarterly', 'annual'):
                try:
                    with _conn() as conn, conn.cursor() as cur:
                        cur.execute(
                            "SELECT fetched_at FROM financials WHERE symbol=%s AND period=%s",
                            (sym, period)
                        )
                        row = cur.fetchone()
                    stale = (not row) or (
                        row[0] and row[0].replace(tzinfo=datetime.timezone.utc) < cutoff
                    )
                    if stale:
                        to_refresh.append((sym, period))
                except Exception:
                    to_refresh.append((sym, period))
        if not to_refresh:
            print(f'[financials/bg] All {len(symbols)} symbols up to date')
            return
        unique = list({s for s, _ in to_refresh})
        print(f'[financials/bg] Refreshing {len(to_refresh)} entries for: {unique}')
        import concurrent.futures as _cf
        def _fetch_one(sym_period):
            sym, period = sym_period
            try:
                data = _fetch_yahoo_financials(sym, period)
                if not data or not data.get('periods'):
                    print(f'[financials/bg] {sym}/{period}: no data from Yahoo Finance')
                    return
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO financials (symbol, period, data_json, source, fetched_at)
                           VALUES (%s, %s, %s, 'yahoo', NOW())
                           ON CONFLICT (symbol, period) DO UPDATE
                               SET data_json=EXCLUDED.data_json,
                                   source='yahoo',
                                   fetched_at=NOW()""",
                        (sym, period, json.dumps(data))
                    )
                print(f'[financials/bg] {sym}/{period}: {len(data["periods"])} periods stored')
            except Exception as e:
                print(f'[financials/bg] {sym}/{period}: {e}')
        with _cf.ThreadPoolExecutor(max_workers=3) as ex:
            list(ex.map(_fetch_one, to_refresh))
        print('[financials/bg] Done')
    except Exception as e:
        import traceback
        print(f'[financials/bg] Error: {e}\n{traceback.format_exc()}')


# Load .env file if present (for local dev — set DATABASE_URL there to share Neon.tech with Render)
_env = BASE / '.env'
if _env.exists():
    for _line in _env.read_text(encoding='utf-8').splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip())

SESSIONS     = {}
_ESPI_CACHE  = {}   # { cache_key: {'ts': float, 'data': dict} }
_NEWS_CACHE  = {}   # { cache_key: {'ts': float, 'data': dict} }
_logo_cache  = {}  # symbol → domain (in-memory, populated by /api/logos)
PORT         = int(os.environ.get('PORT', 8765))
DATABASE_URL = os.environ.get('DATABASE_URL')


# ── STORAGE ────────────────────────────────────────────────────────────────────

if DATABASE_URL:
    import psycopg2
    import psycopg2.extras

    def _conn():
        url = DATABASE_URL
        if url.startswith('postgres://'):
            url = 'postgresql://' + url[11:]
        return psycopg2.connect(url)

    def _init_db():
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    username      TEXT PRIMARY KEY,
                    display_name  TEXT NOT NULL,
                    password_hash TEXT NOT NULL
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolios (
                    username TEXT PRIMARY KEY,
                    data     TEXT NOT NULL DEFAULT '{}'
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_list (
                    id         TEXT PRIMARY KEY,
                    user_id    TEXT NOT NULL,
                    name       TEXT NOT NULL,
                    currency   TEXT NOT NULL DEFAULT 'PLN',
                    created_at TIMESTAMP DEFAULT NOW()
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_holdings (
                    id           TEXT PRIMARY KEY,
                    portfolio_id TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    symbol       TEXT NOT NULL,
                    qty          NUMERIC NOT NULL,
                    avg_price    NUMERIC NOT NULL,
                    currency     TEXT NOT NULL DEFAULT 'PLN',
                    UNIQUE(portfolio_id, symbol)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_transactions (
                    id                 TEXT PRIMARY KEY,
                    portfolio_id       TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    type               TEXT NOT NULL,
                    symbol             TEXT,
                    qty                NUMERIC,
                    price              NUMERIC,
                    currency           TEXT,
                    date               DATE,
                    note               TEXT,
                    broker_position_id TEXT,
                    extra_json         TEXT DEFAULT '{}'
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_snapshots (
                    portfolio_id TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    date         DATE NOT NULL,
                    total        NUMERIC,
                    invested     NUMERIC,
                    PRIMARY KEY (portfolio_id, date)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_cash (
                    portfolio_id TEXT NOT NULL REFERENCES portfolio_list(id) ON DELETE CASCADE,
                    currency     TEXT NOT NULL,
                    amount       NUMERIC NOT NULL DEFAULT 0,
                    PRIMARY KEY (portfolio_id, currency)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS financials (
                    symbol     TEXT NOT NULL,
                    period     TEXT NOT NULL,
                    data_json  TEXT NOT NULL,
                    source     TEXT NOT NULL,
                    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (symbol, period)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS stock_summaries (
                    symbol     TEXT PRIMARY KEY,
                    summary    TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_watchlist (
                    username   TEXT PRIMARY KEY,
                    items_json TEXT NOT NULL DEFAULT '[]'
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_insights (
                    username     TEXT PRIMARY KEY,
                    insights_json TEXT NOT NULL DEFAULT '{}'
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS financial_analyses (
                    symbol     TEXT NOT NULL,
                    period     TEXT NOT NULL,
                    analysis   TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (symbol, period)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_import_snapshots (
                    portfolio_id TEXT NOT NULL,
                    import_id    TEXT NOT NULL,
                    snapshot_json TEXT NOT NULL,
                    PRIMARY KEY (portfolio_id, import_id)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS portfolio_layouts (
                    portfolio_id TEXT PRIMARY KEY,
                    layout_json  TEXT NOT NULL
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS fx_rates_history (
                    currency TEXT NOT NULL,
                    date     DATE NOT NULL,
                    rate     NUMERIC NOT NULL,
                    PRIMARY KEY (currency, date)
                )""")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    token      TEXT PRIMARY KEY,
                    username   TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )""")

    def load_users():
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT username, display_name, password_hash FROM users")
            return {r['username']: {'display_name': r['display_name'],
                                     'password_hash': r['password_hash']}
                    for r in cur.fetchall()}

    def save_user(username, display_name, password_hash):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO users (username, display_name, password_hash) VALUES (%s, %s, %s)
                ON CONFLICT (username) DO UPDATE
                  SET display_name  = EXCLUDED.display_name,
                      password_hash = EXCLUDED.password_hash
            """, (username, display_name, password_hash))

    def load_data(username):
        with _conn() as c, c.cursor() as cur:
            cur.execute("SELECT data FROM portfolios WHERE username = %s", (username,))
            row = cur.fetchone()
        return row[0].encode() if row else b'{}'

    def save_data(username, raw):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO portfolios (username, data) VALUES (%s, %s)
                ON CONFLICT (username) DO UPDATE SET data = EXCLUDED.data
            """, (username, raw.decode('utf-8')))

    def list_portfolios(username):
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, name, currency FROM portfolio_list WHERE user_id=%s ORDER BY created_at", (username,))
            return [dict(r) for r in cur.fetchall()]

    def create_portfolio(username, portfolio_id, name, currency):
        with _conn() as c, c.cursor() as cur:
            cur.execute(
                "INSERT INTO portfolio_list (id, user_id, name, currency) VALUES (%s, %s, %s, %s)",
                (portfolio_id, username, name, currency)
            )

    def update_portfolio(portfolio_id, username, name, currency):
        with _conn() as c, c.cursor() as cur:
            cur.execute(
                "UPDATE portfolio_list SET name=%s, currency=%s WHERE id=%s AND user_id=%s",
                (name, currency, portfolio_id, username)
            )

    def delete_portfolio(portfolio_id, username):
        with _conn() as c, c.cursor() as cur:
            cur.execute("DELETE FROM portfolio_list WHERE id=%s AND user_id=%s", (portfolio_id, username))

    def load_portfolio_data(portfolio_id):
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, symbol, qty, avg_price, currency, asset_type FROM portfolio_holdings WHERE portfolio_id=%s", (portfolio_id,))
            holdings = [{'id': r['id'], 'symbol': r['symbol'], 'qty': float(r['qty']),
                         'avgPrice': float(r['avg_price']), 'currency': r['currency'], 'name': '',
                         **({'assetType': r['asset_type']} if r['asset_type'] else {})} for r in cur.fetchall()]
            cur.execute("""SELECT id, type, symbol, qty, price, currency, date::text, note, broker_position_id, extra_json
                           FROM portfolio_transactions WHERE portfolio_id=%s ORDER BY date""", (portfolio_id,))
            transactions = []
            for r in cur.fetchall():
                tx = {'id': r['id'], 'type': r['type'], 'symbol': r['symbol'],
                      'qty': float(r['qty']) if r['qty'] is not None else None,
                      'price': float(r['price']) if r['price'] is not None else None,
                      'currency': r['currency'], 'date': r['date'], 'note': r['note'],
                      'brokerPositionId': r['broker_position_id']}
                try:
                    extra = json.loads(r['extra_json'] or '{}')
                    tx.update(extra)
                except Exception:
                    pass
                transactions.append(tx)
            cur.execute("SELECT date::text, total, invested FROM portfolio_snapshots WHERE portfolio_id=%s ORDER BY date", (portfolio_id,))
            snaps_rows = cur.fetchall()
            snapshots = {r['date']: float(r['total']) for r in snaps_rows if r['total'] is not None}
            snapshots_inv = {r['date']: float(r['invested']) for r in snaps_rows if r['invested'] is not None}
            cur.execute("SELECT currency, amount FROM portfolio_cash WHERE portfolio_id=%s", (portfolio_id,))
            cash = {r['currency']: float(r['amount']) for r in cur.fetchall()}
            cur.execute("SELECT id, name, category, value, currency, note, updated_at FROM portfolio_other_assets WHERE portfolio_id=%s", (portfolio_id,))
            other_assets = [{'id': r['id'], 'name': r['name'], 'category': r['category'],
                             'value': float(r['value']), 'currency': r['currency'],
                             'note': r['note'], 'updatedAt': r['updated_at']} for r in cur.fetchall()]
            cur.execute("SELECT import_id, snapshot_json FROM portfolio_import_snapshots WHERE portfolio_id=%s", (portfolio_id,))
            import_snapshots = {}
            for r in cur.fetchall():
                try:
                    import_snapshots[r['import_id']] = json.loads(r['snapshot_json'])
                except Exception:
                    pass
        return {'portfolio': {'holdings': holdings}, 'transactions': transactions,
                'snapshots': snapshots, 'snapshotsInvested': snapshots_inv, 'cash': cash,
                'otherAssets': other_assets, 'importSnapshots': import_snapshots}

    def save_portfolio_data(portfolio_id, data):
        holdings = data.get('portfolio', {}).get('holdings', [])
        transactions = data.get('transactions', [])
        snapshots = data.get('snapshots', {})
        snapshots_inv = data.get('snapshotsInvested', {})
        cash = data.get('cash', {})
        with _conn() as c, c.cursor() as cur:
            cur.execute("DELETE FROM portfolio_holdings WHERE portfolio_id=%s", (portfolio_id,))
            for h in holdings:
                hid = h.get('id') or secrets.token_hex(8)
                cur.execute("""INSERT INTO portfolio_holdings (id, portfolio_id, symbol, qty, avg_price, currency, asset_type)
                               VALUES (%s, %s, %s, %s, %s, %s, %s)
                               ON CONFLICT (portfolio_id, symbol) DO UPDATE
                               SET qty=EXCLUDED.qty, avg_price=EXCLUDED.avg_price, currency=EXCLUDED.currency, asset_type=EXCLUDED.asset_type""",
                            (hid, portfolio_id, h['symbol'], h.get('qty', 0), h.get('avgPrice', 0), h.get('currency', 'PLN'), h.get('assetType', '')))
            cur.execute("DELETE FROM portfolio_transactions WHERE portfolio_id=%s", (portfolio_id,))
            for tx in transactions:
                extra = {k: v for k, v in tx.items()
                         if k not in ('id','type','symbol','qty','price','currency','date','note','brokerPositionId')}
                cur.execute("""INSERT INTO portfolio_transactions
                               (id, portfolio_id, type, symbol, qty, price, currency, date, note, broker_position_id, extra_json)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                               ON CONFLICT (id) DO UPDATE SET
                               type=EXCLUDED.type, symbol=EXCLUDED.symbol, qty=EXCLUDED.qty, price=EXCLUDED.price,
                               currency=EXCLUDED.currency, date=EXCLUDED.date, note=EXCLUDED.note,
                               broker_position_id=EXCLUDED.broker_position_id, extra_json=EXCLUDED.extra_json""",
                            (tx['id'], portfolio_id, tx.get('type'), tx.get('symbol'), tx.get('qty'),
                             tx.get('price'), tx.get('currency'), tx.get('date'), tx.get('note'),
                             tx.get('brokerPositionId'), json.dumps(extra)))
            cur.execute("DELETE FROM portfolio_snapshots WHERE portfolio_id=%s", (portfolio_id,))
            for date, total in snapshots.items():
                inv = snapshots_inv.get(date)
                cur.execute("INSERT INTO portfolio_snapshots (portfolio_id, date, total, invested) VALUES (%s,%s,%s,%s)",
                            (portfolio_id, date, total, inv))
            cur.execute("DELETE FROM portfolio_cash WHERE portfolio_id=%s", (portfolio_id,))
            for cur_code, amount in cash.items():
                cur.execute("INSERT INTO portfolio_cash (portfolio_id, currency, amount) VALUES (%s,%s,%s)",
                            (portfolio_id, cur_code, amount))
            other_assets = data.get('otherAssets', [])
            cur.execute("DELETE FROM portfolio_other_assets WHERE portfolio_id=%s", (portfolio_id,))
            for a in other_assets:
                cur.execute("""INSERT INTO portfolio_other_assets (id, portfolio_id, name, category, value, currency, note, updated_at)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (a.get('id', secrets.token_hex(8)), portfolio_id, a.get('name',''), a.get('category','Inne'),
                             a.get('value', 0), a.get('currency','PLN'), a.get('note',''), a.get('updatedAt','')))
            import_snapshots = data.get('importSnapshots', {})
            cur.execute("DELETE FROM portfolio_import_snapshots WHERE portfolio_id=%s", (portfolio_id,))
            for imp_id, snap in import_snapshots.items():
                cur.execute("INSERT INTO portfolio_import_snapshots (portfolio_id, import_id, snapshot_json) VALUES (%s,%s,%s)",
                            (portfolio_id, imp_id, json.dumps(snap, ensure_ascii=False)))

    def load_layout(portfolio_id):
        with _conn() as c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT layout_json FROM portfolio_layouts WHERE portfolio_id=%s", (portfolio_id,))
            row = cur.fetchone()
        return json.loads(row['layout_json']) if row else None

    def save_layout(portfolio_id, layout):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO portfolio_layouts (portfolio_id, layout_json) VALUES (%s, %s)
                ON CONFLICT (portfolio_id) DO UPDATE SET layout_json = EXCLUDED.layout_json
            """, (portfolio_id, json.dumps(layout, ensure_ascii=False)))

    def load_watchlist(username):
        with _conn() as c, c.cursor() as cur:
            cur.execute("SELECT items_json FROM user_watchlist WHERE username=%s", (username,))
            row = cur.fetchone()
        return json.loads(row[0]) if row else []

    def save_watchlist(username, items):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO user_watchlist (username, items_json) VALUES (%s, %s)
                ON CONFLICT (username) DO UPDATE SET items_json = EXCLUDED.items_json
            """, (username, json.dumps(items, ensure_ascii=False)))

    def load_insights(username):
        with _conn() as c, c.cursor() as cur:
            cur.execute("SELECT insights_json FROM user_insights WHERE username=%s", (username,))
            row = cur.fetchone()
        return json.loads(row[0]) if row else {}

    def save_insights(username, data):
        with _conn() as c, c.cursor() as cur:
            cur.execute("""
                INSERT INTO user_insights (username, insights_json) VALUES (%s, %s)
                ON CONFLICT (username) DO UPDATE SET insights_json = EXCLUDED.insights_json
            """, (username, json.dumps(data, ensure_ascii=False)))

    _init_db()

else:
    USERS_FILE = BASE / 'users.json'

    def load_users():
        if USERS_FILE.exists():
            return json.loads(USERS_FILE.read_text(encoding='utf-8'))
        return {}

    def save_user(username, display_name, password_hash):
        users = load_users()
        users[username] = {'display_name': display_name, 'password_hash': password_hash}
        USERS_FILE.write_text(json.dumps(users, ensure_ascii=False, indent=2), encoding='utf-8')

    def load_data(username):
        f = BASE / f'portfolio_{username}.json'
        if not f.exists():
            old = BASE / 'portfolio_data.json'
            return old.read_bytes() if old.exists() else b'{}'
        return f.read_bytes()

    def save_data(username, raw):
        (BASE / f'portfolio_{username}.json').write_bytes(raw)

    def _read_pfile(username):
        f = BASE / f'multiportfolio_{username}.json'
        if f.exists():
            return json.loads(f.read_text(encoding='utf-8'))
        return {'portfolio_list': []}

    def _write_pfile(username, pdata):
        f = BASE / f'multiportfolio_{username}.json'
        f.write_text(json.dumps(pdata, ensure_ascii=False), encoding='utf-8')

    def list_portfolios(username):
        return _read_pfile(username)['portfolio_list']

    def create_portfolio(username, portfolio_id, name, currency):
        pdata = _read_pfile(username)
        pdata['portfolio_list'].append({'id': portfolio_id, 'name': name, 'currency': currency})
        _write_pfile(username, pdata)

    def update_portfolio(portfolio_id, username, name, currency):
        pdata = _read_pfile(username)
        for p in pdata['portfolio_list']:
            if p['id'] == portfolio_id:
                p['name'] = name
                p['currency'] = currency
        _write_pfile(username, pdata)

    def delete_portfolio(portfolio_id, username):
        pdata = _read_pfile(username)
        pdata['portfolio_list'] = [p for p in pdata['portfolio_list'] if p['id'] != portfolio_id]
        _write_pfile(username, pdata)
        f = BASE / f'pdata_{portfolio_id}.json'
        if f.exists():
            f.unlink()

    def load_portfolio_data(portfolio_id):
        f = BASE / f'pdata_{portfolio_id}.json'
        if f.exists():
            return json.loads(f.read_text(encoding='utf-8'))
        return {'portfolio': {'holdings': []}, 'transactions': [], 'snapshots': {}, 'snapshotsInvested': {}, 'cash': {}}

    def save_portfolio_data(portfolio_id, data):
        f = BASE / f'pdata_{portfolio_id}.json'
        f.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')

    def load_watchlist(username):
        f = BASE / f'watchlist_{username}.json'
        if f.exists():
            try:
                return json.loads(f.read_text(encoding='utf-8'))
            except Exception:
                return []
        return []

    def save_watchlist(username, items):
        f = BASE / f'watchlist_{username}.json'
        f.write_text(json.dumps(items, ensure_ascii=False), encoding='utf-8')

    def load_insights(username):
        f = BASE / f'insights_{username}.json'
        if f.exists():
            try:
                return json.loads(f.read_text(encoding='utf-8'))
            except Exception:
                return {}
        return {}

    def save_insights(username, data):
        f = BASE / f'insights_{username}.json'
        f.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')


def migrate_user_to_portfolios(username):
    """If user has old blob data but no portfolios, create a default portfolio and migrate."""
    existing = list_portfolios(username)
    if existing:
        return existing  # already migrated
    # load old blob
    try:
        raw = load_data(username)
        old = json.loads(raw)
    except Exception:
        old = {}
    if not old:
        return []
    # create default portfolio
    pid = secrets.token_hex(12)
    create_portfolio(username, pid, 'Portfel domyślny', 'PLN')
    save_portfolio_data(pid, old)
    print(f'[migration] {username}: migrated old blob to "Portfel domyślny" (id={pid})')
    return list_portfolios(username)


def load_aggregate_data(username):
    """Merge all portfolios into a single data blob for dashboard 'Wszystkie' view."""
    portfolios = list_portfolios(username)
    merged_holdings = []
    merged_txs = []
    merged_snaps = {}
    merged_snaps_inv = {}
    merged_cash = {}
    symbol_set = {}

    for p in portfolios:
        pid = p['id']
        data = load_portfolio_data(pid)
        for h in data.get('portfolio', {}).get('holdings', []):
            key = h['symbol']
            if key in symbol_set:
                idx = symbol_set[key]
                old = merged_holdings[idx]
                total_qty = old['qty'] + h['qty']
                if total_qty > 0:
                    merged_holdings[idx] = {
                        **old,
                        'qty': total_qty,
                        'avgPrice': (old['qty'] * old['avgPrice'] + h['qty'] * h['avgPrice']) / total_qty,
                    }
            else:
                symbol_set[key] = len(merged_holdings)
                merged_holdings.append({**h, '_portfolioId': p['id'], '_portfolioName': p['name']})
        for tx in data.get('transactions', []):
            merged_txs.append({**tx, '_portfolioId': p['id'], '_portfolioName': p['name']})
        for date, val in data.get('snapshots', {}).items():
            merged_snaps[date] = merged_snaps.get(date, 0) + val
        for date, val in data.get('snapshotsInvested', {}).items():
            merged_snaps_inv[date] = merged_snaps_inv.get(date, 0) + val
        for cur, amt in data.get('cash', {}).items():
            merged_cash[cur] = merged_cash.get(cur, 0) + amt

    merged_txs.sort(key=lambda t: t.get('date', ''))
    return {
        'portfolio': {'holdings': merged_holdings},
        'transactions': merged_txs,
        'snapshots': merged_snaps,
        'snapshotsInvested': merged_snaps_inv,
        'cash': merged_cash,
    }


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def check_password(password: str, stored_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    except Exception:
        return False


def get_username(handler):
    token = handler.headers.get('X-Auth-Token', '')
    if not isinstance(token, str) or len(token) > 100:
        return None
    username = SESSIONS.get(token)
    if username is None and DATABASE_URL:
        try:
            with _conn() as c, c.cursor() as cur:
                cur.execute("SELECT username FROM sessions WHERE token=%s", (token,))
                row = cur.fetchone()
                if row:
                    username = row[0]
                    SESSIONS[token] = username
        except Exception as e:
            print(f'[sessions] lookup failed: {e}')
            return None
    return username


# ── HTTP HANDLER ───────────────────────────────────────────────────────────────

class Handler(SimpleHTTPRequestHandler):

    def _cors_origin(self):
        origin = self.headers.get('Origin', '')
        return origin if origin in _ALLOWED_ORIGINS else 'https://stockstracker.onrender.com'

    def _serve_static(self, filepath):
        """Serwuje plik statyczny z React dist."""
        content  = filepath.read_bytes()
        mime, _  = mimetypes.guess_type(str(filepath))
        in_assets = 'assets' in filepath.parts
        self.send_response(200)
        self.send_header('Content-Type', mime or 'application/octet-stream')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        # Assets mają hash w nazwie → można cachować długo
        self.send_header('Cache-Control',
                         'public, max-age=31536000, immutable' if in_assets else 'no-store, no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.end_headers()
        self.wfile.write(content)

    def _serve_react(self):
        """Serwuje React SPA (index.html)."""
        if not REACT_DIST.exists():
            self.send_json(503, {'error': 'React app not built — run: cd frontend-react && npm run build'})
            return
        self._serve_static(REACT_DIST / 'index.html')

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Cache-Control', 'no-store, no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.end_headers()
        self.wfile.write(body)

    def read_json(self, max_size: int = 8 * 1024):
        length = int(self.headers.get('Content-Length', 0))
        if length > max_size:
            raise ValueError('Request body too large')
        body = json.loads(self.rfile.read(max(0, length)))
        if not isinstance(body, dict):
            raise ValueError('Expected JSON object')
        return body

    def do_GET(self):
        path = self.path.split('?')[0]

        if path == '/api/health':
            self.send_json(200, {'status': 'ok'}); return

        elif path == '/api/calendar':
            qs   = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            week = qs.get('week', 'thisweek')
            if week not in ('thisweek', 'nextweek'):
                self.send_json(400, {'error': 'invalid week'}); return
            self.send_json(200, _fetch_calendar(week))

        elif path == '/api/users':
            users = load_users()
            self.send_json(200, [
                {'username': u, 'display_name': v['display_name']}
                for u, v in users.items()
            ])

        elif path == '/api/watchlist':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                self.send_json(200, load_watchlist(username))
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/insights':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                self.send_json(200, load_insights(username))
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/search':
            qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            q = qs.get('q', '').strip()
            if len(q) < 1:
                self.send_json(200, {'results': []}); return
            try:
                # Twelve Data free symbol_search — works from server IPs, no auth needed
                _MIC_SUFFIX = {
                    'XWAR': '.WA', 'XLON': '.L',  'XETR': '.DE', 'XPAR': '.PA',
                    'XAMS': '.AS', 'XMIL': '.MI', 'XMAD': '.MC', 'XHEL': '.HE',
                    'XSTO': '.ST', 'XOSL': '.OL', 'XSWX': '.SW', 'XIST': '.IS',
                }
                url = (f'https://api.twelvedata.com/symbol_search'
                       f'?symbol={urllib.parse.quote(q)}&outputsize=10')
                req = urllib.request.Request(url, headers={'User-Agent': _YF_UA, 'Accept': 'application/json'})
                with urllib.request.urlopen(req, timeout=8) as r:
                    data = json.loads(r.read())
                results = []
                seen = set()
                for item in data.get('data', []):
                    sym_raw  = item.get('symbol', '')
                    mic      = item.get('mic_code', '')
                    typ      = item.get('instrument_type', '')
                    exchange = item.get('exchange', '')
                    if not sym_raw or typ not in ('Common Stock', 'ETF'):
                        continue
                    suffix = _MIC_SUFFIX.get(mic, '')
                    symbol = sym_raw + suffix if suffix else sym_raw
                    if symbol in seen:
                        continue
                    seen.add(symbol)
                    results.append({
                        'symbol':   symbol,
                        'name':     item.get('instrument_name') or symbol,
                        'exchange': exchange,
                        'type':     'EQUITY' if typ == 'Common Stock' else 'ETF',
                    })
                self.send_json(200, {'results': results})
            except Exception as e:
                print(f'[search] {q}: {e}')
                self.send_json(200, {'results': []})

        elif path == '/api/logos':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            raw = qs.get('symbols', '')
            symbols = [s.strip().upper() for s in raw.split(',')
                       if s.strip() and re.fullmatch(r'[A-Z0-9.\-]{1,15}', s.strip())][:30]
            logos = {}
            uncached = [s for s in symbols if s not in _logo_cache]
            if uncached:
                from concurrent.futures import ThreadPoolExecutor, as_completed
                def _fetch_logo(sym):
                    try:
                        res = _yf_quotesummary(sym, 'assetProfile')
                        if res:
                            website = (res.get('assetProfile') or {}).get('website', '')
                            if website:
                                netloc = urllib.parse.urlparse(website).netloc
                                if netloc.startswith('www.'):
                                    netloc = netloc[4:]
                                _logo_cache[sym] = netloc
                                return sym, netloc
                    except Exception as e:
                        print(f'[logos] {sym}: {e}')
                    _logo_cache[sym] = None
                    return sym, None
                with ThreadPoolExecutor(max_workers=6) as ex:
                    futs = {ex.submit(_fetch_logo, s): s for s in uncached}
                    for f in as_completed(futs, timeout=15):
                        try:
                            sym, domain = f.result()
                            if domain:
                                logos[sym] = domain
                        except Exception:
                            pass
            for s in symbols:
                if s in _logo_cache and _logo_cache[s]:
                    logos.setdefault(s, _logo_cache[s])
            self.send_json(200, logos)

        elif path == '/api/portfolios':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                portfolios = migrate_user_to_portfolios(username)
                self.send_json(200, portfolios)
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path.startswith('/api/portfolios/') and path.endswith('/data'):
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):-len('/data')]
            if not pid or (pid != 'all' and not re.fullmatch(r'[a-f0-9]{24}', pid)):
                self.send_json(400, {'error': 'invalid portfolio id'}); return
            try:
                if pid == 'all':
                    migrate_user_to_portfolios(username)
                    data = load_aggregate_data(username)
                else:
                    portfolios = list_portfolios(username)
                    if not any(p['id'] == pid for p in portfolios):
                        self.send_json(403, {'error': 'forbidden'}); return
                    data = load_portfolio_data(pid)
                self.send_json(200, data)
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path.startswith('/api/portfolios/') and path.endswith('/layout'):
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):-len('/layout')]
            try:
                layout = load_layout(pid) if DATABASE_URL else None
                self.send_json(200, {'layout': layout})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/data':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body = load_data(username)
            except Exception as e:
                print(f'[db] load_data error for {username}: {e}')
                self.send_json(503, {'error': 'db_error'}); return
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', self._cors_origin())
            self.send_header('Cache-Control', 'no-store, no-cache')
            self.end_headers()
            self.wfile.write(body)

        elif path.startswith('/api/finnhub/'):
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            token = os.environ.get('FINNHUB_TOKEN', '')
            if not token:
                self.send_json(503, {'error': 'FINNHUB_TOKEN not configured'}); return
            sub = path[len('/api/finnhub'):]          # e.g. /v1/quote
            if not re.fullmatch(r'[/a-zA-Z0-9_\-\.]+', sub) or '..' in sub:
                self.send_json(400, {'error': 'invalid path'}); return
            qs  = self.path.split('?', 1)[1] if '?' in self.path else ''
            if len(qs) > 500:
                self.send_json(400, {'error': 'query too long'}); return
            sep = '&' if qs else ''
            url = f'https://finnhub.io/api{sub}?{qs}{sep}token={token}'
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f'[proxy] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/alphavantage':
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            key = os.environ.get('ALPHAVANTAGE_KEY', '')
            if not key:
                self.send_json(503, {'error': 'ALPHAVANTAGE_KEY not configured'}); return
            qs  = self.path.split('?', 1)[1] if '?' in self.path else ''
            url = f'https://www.alphavantage.co/query?{qs}&apikey={key}'
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=12) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f'[proxy] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/proxy':
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            qs     = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            target = qs.get('url', '')
            if not target or len(target) > 2000:
                self.send_json(400, {'error': 'invalid url'}); return
            allowed = (
                'https://query1.finance.yahoo.com/',
                'https://query2.finance.yahoo.com/',
                'https://finance.yahoo.com/',
                'https://stooq.com/',
                'https://nfs.faireconomy.media/',
                'https://api.frankfurter.app/',
            )
            if not any(target.startswith(a) for a in allowed):
                self.send_json(403, {'error': 'forbidden'}); return
            try:
                req = urllib.request.Request(target, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.send_header('Cache-Control', 'no-store, no-cache')
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                print(f'[proxy] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/financials':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            qs     = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            symbol = qs.get('symbol', '').upper()
            period = qs.get('period', 'quarterly')
            force  = qs.get('force', '') == '1'
            if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                self.send_json(400, {'error': 'invalid symbol'}); return
            if period not in ('quarterly', 'annual'):
                self.send_json(400, {'error': 'invalid period'}); return
            # Cache check (skip when force=1)
            try:
                with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    cur.execute(
                        "SELECT data_json, source, fetched_at FROM financials WHERE symbol=%s AND period=%s",
                        (symbol, period)
                    )
                    row = cur.fetchone()
                if row and not force:
                    age_days = (datetime.datetime.now(datetime.timezone.utc) - row['fetched_at']).days
                    cached = json.loads(row['data_json'])
                    # If stored data's actual period doesn't match request (e.g. quarterly key holds annual fallback),
                    # delete the stale record so the re-fetch stores correctly.
                    actual_stored_period = cached.get('period', period)
                    if actual_stored_period != period:
                        try:
                            with _conn() as conn, conn.cursor() as cur:
                                cur.execute("DELETE FROM financials WHERE symbol=%s AND period=%s", (symbol, period))
                        except Exception:
                            pass
                    elif age_days < 90:
                        cached['source']    = row['source']
                        cached['fetchedAt'] = row['fetched_at'].isoformat()
                        self.send_json(200, cached); return
            except Exception as e:
                print(f'[financials] db read error: {e}')
            # Cache miss → Yahoo Finance
            try:
                data = _fetch_yahoo_financials(symbol, period)
            except Exception as e:
                print(f'[financials] yahoo fetch error for {symbol}: {e}')
                self.send_json(404, {'error': 'no_data'}); return
            if not data or not data.get('periods'):
                self.send_json(404, {'error': 'no_data'}); return
            try:
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO financials (symbol, period, data_json, source, fetched_at)
                        VALUES (%s, %s, %s, 'yahoo', NOW())
                        ON CONFLICT (symbol, period) DO UPDATE
                            SET data_json  = EXCLUDED.data_json,
                                source     = 'yahoo',
                                fetched_at = NOW()
                    """, (symbol, data.get('period', period), json.dumps(data)))
            except Exception as e:
                print(f'[financials] db write error: {e}')
            data['source']    = 'yahoo'
            data['fetchedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.send_json(200, data)

        elif path == '/api/financials/keystats':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            symbol = qs.get('symbol', '').upper()
            if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                self.send_json(400, {'error': 'invalid symbol'}); return

            out = {}

            # 1. Finnhub – Beta, 52W range, dividend (no crumb needed)
            fh_token = os.environ.get('FINNHUB_TOKEN', '')
            if fh_token:
                try:
                    fh_url = (f'https://finnhub.io/api/v1/stock/metric?symbol='
                              f'{urllib.parse.quote(symbol)}&metric=all&token={fh_token}')
                    req = urllib.request.Request(fh_url, headers={'User-Agent': _YF_UA})
                    with urllib.request.urlopen(req, timeout=10) as r:
                        fh = json.loads(r.read()).get('metric', {})
                    out['fiftyTwoWeekHigh'] = fh.get('52WeekHigh')
                    out['fiftyTwoWeekLow']  = fh.get('52WeekLow')
                    out['beta']             = fh.get('beta')
                    out['dividendYield']    = fh.get('currentDividendYieldTTM')
                    out['dividendRate']     = fh.get('dividendPerShareAnnual')
                    out['priceToBook']      = fh.get('pbAnnual')
                except Exception as e:
                    print(f'[keystats/finnhub] {symbol}: {e}')
                try:
                    div_url = (f'https://finnhub.io/api/v1/stock/dividend2?symbol='
                               f'{urllib.parse.quote(symbol)}&token={fh_token}')
                    req = urllib.request.Request(div_url, headers={'User-Agent': _YF_UA})
                    with urllib.request.urlopen(req, timeout=10) as r:
                        div_data = json.loads(r.read()).get('data', [])
                    annual_div: dict = {}
                    for d in div_data:
                        yr = d.get('year')
                        if yr:
                            annual_div[yr] = annual_div.get(yr, 0) + (d.get('amount') or 0)
                    years_desc = sorted(annual_div.keys(), reverse=True)
                    streak = 0
                    for i in range(len(years_desc) - 1):
                        if annual_div[years_desc[i]] > annual_div[years_desc[i + 1]]:
                            streak += 1
                        else:
                            break
                    out['dividendGrowthStreak'] = streak
                except Exception as e:
                    print(f'[keystats/finnhub/div2] {symbol}: {e}')

            # 2. Stored financials from DB → send raw TTM values for frontend to compute ratios
            try:
                with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    for period in ('quarterly', 'annual'):
                        cur.execute("SELECT data_json FROM financials WHERE symbol=%s AND period=%s",
                                    (symbol, period))
                        row = cur.fetchone()
                        if not row:
                            continue
                        fin      = json.loads(row['data_json'])
                        periods  = fin.get('periods', [])
                        val      = fin.get('valuation', {})
                        shares   = val.get('sharesOutstanding')
                        if shares and not out.get('sharesOutstanding'):
                            out['sharesOutstanding'] = shares
                        # Use the actual period stored in JSON (may differ from DB key if fallback occurred)
                        actual_period = fin.get('period', period)
                        if periods:
                            # Sort newest-first — handles Yahoo (already newest-first) and CSV/Biznesradar sources
                            sorted_p = sorted(periods, key=lambda p: p.get('date', '') or '', reverse=True)
                            last4 = sorted_p[:4] if actual_period == 'quarterly' else sorted_p[:1]
                            def _ttm(field):
                                vals = [p[field] for p in last4 if p.get(field) is not None]
                                return sum(vals) if vals else None
                            out.setdefault('ttmNetIncome', _ttm('netIncome'))
                            out.setdefault('ttmRevenue',   _ttm('revenue'))
                            out.setdefault('ttmEbitda',    _ttm('ebitda'))
                            fcf_vals = []
                            for p in last4:
                                f = p.get('fcf')
                                if (f is None or f == 0) and p.get('operatingCashFlow') is not None and p.get('capex') is not None:
                                    f = p['operatingCashFlow'] - abs(p['capex'])
                                if f is not None:
                                    fcf_vals.append(f)
                            out.setdefault('ttmFcf', sum(fcf_vals) if fcf_vals else None)
                            last = sorted_p[0]  # most recent period
                            out.setdefault('totalDebt',           last.get('totalDebt'))
                            out.setdefault('cashAndEquivalents',  last.get('cashAndEquivalents'))
                            equity = last.get('equity')
                            out.setdefault('equity', equity)
                            # Book per share (use most recently resolved shares)
                            eff_shares = out.get('sharesOutstanding') or shares
                            if equity is not None and eff_shares:
                                out.setdefault('bookPerShare', equity / eff_shares)
                            # Revenue growth YoY (TTM vs prior year TTM)
                            if actual_period == 'quarterly' and len(sorted_p) >= 8:
                                prev4 = sorted_p[4:8]
                                ttm_curr = _ttm('revenue')
                                prev_vals = [p['revenue'] for p in prev4 if p.get('revenue') is not None]
                                ttm_prev = sum(prev_vals) if len(prev_vals) == 4 else None
                                if ttm_curr and ttm_prev:
                                    out.setdefault('revenueGrowthYoY', (ttm_curr - ttm_prev) / ttm_prev)
            except Exception as e:
                print(f'[keystats/db] {symbol}: {e}')

            # DCF fair value — earnings-based (net income TTM as proxy for earnings power)
            out['dcfFairValue'] = _dcf_fair_value(
                net_income_ttm=out.get('ttmNetIncome'),
                growth_rate=out.get('revenueGrowthYoY'),
                shares=out.get('sharesOutstanding'),
            )

            # 3. Best-effort Yahoo Finance (crumb) – analyst targets, forward PE, earnings
            try:
                result = _yf_quotesummary(symbol,
                    'defaultKeyStatistics,calendarEvents,financialData,earningsTrend')
                if result:
                    def _gv(d, k):
                        v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                    ks  = result.get('defaultKeyStatistics', {})
                    cal = result.get('calendarEvents', {})
                    fd  = result.get('financialData', {})
                    out.setdefault('forwardPE',               _gv(ks, 'forwardPE'))
                    out.setdefault('forwardEps',              _gv(ks, 'forwardEps'))
                    out.setdefault('pegRatio',                _gv(ks, 'pegRatio'))
                    out.setdefault('payoutRatio',             _gv(ks, 'payoutRatio'))
                    ex_div = ks.get('exDividendDate')
                    if isinstance(ex_div, dict):
                        out.setdefault('exDividendDate', ex_div.get('fmt'))
                    elif ex_div:
                        try:
                            out.setdefault('exDividendDate', datetime.date.fromtimestamp(ex_div).isoformat())
                        except Exception:
                            pass
                    out.setdefault('targetMeanPrice',         _gv(fd, 'targetMeanPrice'))
                    out.setdefault('targetLowPrice',          _gv(fd, 'targetLowPrice'))
                    out.setdefault('targetHighPrice',         _gv(fd, 'targetHighPrice'))
                    out.setdefault('numberOfAnalystOpinions', _gv(fd, 'numberOfAnalystOpinions'))
                    out.setdefault('recommendationKey',       fd.get('recommendationKey'))
                    eds = cal.get('earnings', {}).get('earningsDate', [])
                    now_ts = time.time()
                    for ed in eds:
                        ts = ed.get('raw') if isinstance(ed, dict) else ed
                        if ts and ts > now_ts:
                            out.setdefault('nextEarningsDate', ts)
                            break
                    et = result.get('earningsTrend', {})
                    trend = et.get('trend', [])
                    annual = next(
                        (t for t in trend if t.get('period') in ('0y', '+1y')), None
                    )
                    if annual:
                        er = annual.get('epsRevisions', {})
                        def _rv(d, k):
                            v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                        out.setdefault('epsRevisionsUp30d',      _rv(er, 'upLast30days'))
                        out.setdefault('epsRevisionsDown30d',    _rv(er, 'downLast30days'))
                        re_ = annual.get('revenueEstimate', {})
                        out.setdefault('forwardRevenueEstimate', _rv(re_, 'avg'))
            except Exception as e:
                print(f'[keystats/yf] {symbol}: {e}')

            self.send_json(200, out)

        elif path == '/api/financials/summary':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            symbol = qs.get('symbol', '').upper()
            if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                self.send_json(400, {'error': 'invalid symbol'}); return

            # Check 7-day cache
            try:
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute(
                        "SELECT summary FROM stock_summaries WHERE symbol=%s AND created_at > NOW() - INTERVAL '7 days'",
                        (symbol,))
                    row = cur.fetchone()
                    if row:
                        self.send_json(200, {'summary': row[0], 'cached': True}); return
            except Exception as e:
                print(f'[summary/cache_read] {e}')

            # Gather metrics from DB for the prompt
            m = {}
            try:
                with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    for period in ('quarterly', 'annual'):
                        cur.execute("SELECT data_json FROM financials WHERE symbol=%s AND period=%s",
                                    (symbol, period))
                        row = cur.fetchone()
                        if not row: continue
                        fin = json.loads(row['data_json'])
                        ps  = fin.get('periods', [])
                        val = fin.get('valuation', {})
                        m['shares'] = val.get('sharesOutstanding')
                        # Use actual period from JSON (may differ from DB key if fallback occurred)
                        actual_period = fin.get('period', period)
                        if ps:
                            sorted_ps = sorted(ps, key=lambda p: p.get('date', '') or '', reverse=True)
                            last4 = sorted_ps[:4] if actual_period == 'quarterly' else sorted_ps[:1]
                            def _s(field):
                                vs = [p[field] for p in last4 if p.get(field) is not None]
                                return sum(vs) if vs else None
                            m['revenue']    = _s('revenue')
                            m['netIncome']  = _s('netIncome')
                            m['ebitda']     = _s('ebitda')
                            last = sorted_ps[0]  # most recent period
                            m['equity']     = last.get('equity')
                            m['totalDebt']  = last.get('totalDebt')
                            m['cash']       = last.get('cashAndEquivalents')
                            # FCF
                            fcf_vs = []
                            for p in last4:
                                f = p.get('fcf')
                                if (f is None or f == 0) and p.get('operatingCashFlow') is not None and p.get('capex') is not None:
                                    f = p['operatingCashFlow'] - abs(p['capex'])
                                if f is not None: fcf_vs.append(f)
                            m['fcf'] = sum(fcf_vs) if fcf_vs else None
                            # Revenue growth YoY
                            if actual_period == 'quarterly' and len(sorted_ps) >= 8:
                                prev4 = sorted_ps[4:8]
                                pv = [p['revenue'] for p in prev4 if p.get('revenue') is not None]
                                if m['revenue'] and len(pv) == 4:
                                    m['revGrowth'] = (m['revenue'] - sum(pv)) / sum(pv)
                        break
            except Exception as e:
                print(f'[summary/db] {e}')

            def _b(v):
                if v is None: return 'N/A'
                if abs(v) >= 1e12: return f'{v/1e12:.2f} T'
                if abs(v) >= 1e9:  return f'{v/1e9:.2f} B'
                if abs(v) >= 1e6:  return f'{v/1e6:.2f} M'
                return f'{v:.2f}'

            # Best-effort: fetch company profile + analyst targets + forward estimates
            try:
                yf_res = _yf_quotesummary(symbol, 'assetProfile,financialData,earningsTrend')
                if yf_res:
                    def _gv2(d, k):
                        v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                    ap2 = yf_res.get('assetProfile', {})
                    m['bizSummary'] = ap2.get('longBusinessSummary', '')
                    m['sector']     = ap2.get('sector', '')
                    m['industry']   = ap2.get('industry', '')
                    m['country']    = ap2.get('country', '')
                    m['employees']  = ap2.get('fullTimeEmployees')
                    fd2 = yf_res.get('financialData', {})
                    m['targetPrice'] = _gv2(fd2, 'targetMeanPrice')
                    m['recKey']      = fd2.get('recommendationKey')
                    trend2 = yf_res.get('earningsTrend', {}).get('trend', [])
                    ann2   = next((t for t in trend2 if t.get('period') in ('0y', '+1y')), None)
                    if ann2:
                        def _rv3(d, k):
                            v = d.get(k); return v.get('raw') if isinstance(v, dict) else v
                        er2 = ann2.get('epsRevisions', {})
                        m['epsUp']      = _rv3(er2, 'upLast30days')
                        m['epsDown']    = _rv3(er2, 'downLast30days')
                        m['fwdRevenue'] = _rv3(ann2.get('revenueEstimate', {}), 'avg')
            except Exception:
                pass

            _rec_pl = {
                'strong_buy': 'Silne kupno', 'buy': 'Kupno', 'hold': 'Trzymaj',
                'underperform': 'Sprzedaj', 'sell': 'Silna sprzedaż',
            }
            # Build company context block
            ctx_lines = []
            if m.get('bizSummary'):
                ctx_lines.append(f'Opis spółki: {m["bizSummary"][:800]}')
            if m.get('sector'):
                ctx_lines.append(f'Sektor: {m["sector"]}' + (f' / {m["industry"]}' if m.get('industry') else ''))
            if m.get('country'):
                ctx_lines.append(f'Kraj: {m["country"]}')
            if m.get('employees'):
                ctx_lines.append(f'Pracownicy: {m["employees"]:,}')

            # Build financial data block
            lines = [f'Dane finansowe {symbol} (TTM/ostatni kwartał):']
            if m.get('revenue'):    lines.append(f'- Przychody TTM: {_b(m["revenue"])}')
            if m.get('netIncome'):  lines.append(f'- Zysk netto TTM: {_b(m["netIncome"])}')
            if m.get('revenue') and m.get('netIncome'):
                lines.append(f'- Marża netto: {m["netIncome"]/m["revenue"]*100:.1f}%')
            if m.get('ebitda') and m.get('revenue'):
                lines.append(f'- Marża EBITDA: {m["ebitda"]/m["revenue"]*100:.1f}%')
            if m.get('fcf'):        lines.append(f'- FCF TTM: {_b(m["fcf"])}')
            if m.get('revGrowth') is not None:
                lines.append(f'- Wzrost przychodów r/r: {m["revGrowth"]*100:.1f}%')
            if m.get('equity') and m.get('shares'):
                lines.append(f'- Wartość księgowa/akcję: {m["equity"]/m["shares"]:.2f}')
            if m.get('totalDebt') and m.get('cash'):
                lines.append(f'- Dług netto: {_b(m["totalDebt"] - m["cash"])}')
            if m.get('targetPrice'):
                lines.append(f'- Cel analityków (śr.): {m["targetPrice"]:.2f}')
            if m.get('recKey'):
                lines.append(f'- Rekomendacja: {_rec_pl.get(m["recKey"].lower(), m["recKey"])}')
            if m.get('fwdRevenue'):
                lines.append(f'- Prognoza przychodów nast. rok: {_b(m["fwdRevenue"])}')
            if m.get('epsUp') is not None or m.get('epsDown') is not None:
                lines.append(f'- Rewizje EPS 30d: ↑{m.get("epsUp") or 0} ↓{m.get("epsDown") or 0}')
            dcf_val = _dcf_fair_value(
                net_income_ttm=m.get('netIncome'), growth_rate=m.get('revGrowth'),
                shares=m.get('shares'),
            )
            if dcf_val:
                lines.append(f'- Wycena DCF (szacowana): {dcf_val:.2f}')

            if len(lines) == 1 and not ctx_lines:
                self.send_json(422, {'error': 'no financial data — load financials first'}); return

            ctx_block = ('\n'.join(ctx_lines) + '\n\n') if ctx_lines else ''
            fin_block = '\n'.join(lines)
            prompt = (
                f'{ctx_block}{fin_block}\n\n'
                'Napisz po polsku konkretną analizę fundamentalną tej spółki (8-10 zdań), '
                'strukturyzując ją w 3 akapity:\n'
                '1. Kim jest spółka, czym konkretnie się zajmuje, jaka jest jej pozycja rynkowa i przewagi konkurencyjne.\n'
                '2. Kluczowe wyniki finansowe: przychody, marże, FCF, zadłużenie — podaj konkretne liczby z danych powyżej.\n'
                '3. Wycena vs rynek, rekomendacje analityków, główne katalizatory wzrostu lub ryzyka.\n\n'
                'ZASADY: Używaj wyłącznie faktów z dostarczonych danych. '
                'Całkowicie zakazane słowa: prawdopodobnie, może, być może, wydaje się, sugeruje, potencjalnie, możliwe że. '
                'Pisz w trybie oznajmującym. Nie używaj wypunktowań ani nagłówków.'
            )

            api_key = os.environ.get('GROQ_API_KEY', '').strip()
            if not api_key:
                self.send_json(503, {'error': 'AI unavailable'}); return

            try:
                from groq import Groq as _GroqClient
                client = _GroqClient(api_key=api_key)
                resp = client.chat.completions.create(
                    model='llama-3.3-70b-versatile',
                    max_tokens=1200,
                    messages=[{'role': 'user', 'content': prompt}],
                )
                text = resp.choices[0].message.content
                try:
                    with _conn() as conn, conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO stock_summaries (symbol, summary, created_at)
                            VALUES (%s, %s, NOW())
                            ON CONFLICT (symbol) DO UPDATE
                            SET summary=EXCLUDED.summary, created_at=NOW()
                        """, (symbol, text))
                except Exception as e:
                    print(f'[summary/cache_write] {e}')
                self.send_json(200, {'summary': text})
            except Exception as e:
                print(f'[summary/groq] {type(e).__name__}: {e}')
                self.send_json(502, {'error': f'AI request failed: {type(e).__name__}'})

        elif path == '/api/wig20-quote':
            # Public endpoint — no auth required (used on login screen)
            now = time.time()
            entry = _WIG20_QUOTE_CACHE.get('wig20')
            if entry and now - entry['ts'] < _WIG20_QUOTE_TTL:
                self.send_json(200, entry['data'])
            else:
                try:
                    url = 'https://query1.finance.yahoo.com/v8/finance/chart/WIG20.WA?interval=1d&range=2d'
                    req = urllib.request.Request(url, headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                    })
                    with urllib.request.urlopen(req, timeout=8) as resp:
                        body = json.loads(resp.read())
                    meta   = body['chart']['result'][0]['meta']
                    price  = meta.get('regularMarketPrice', 0)
                    prev   = meta.get('chartPreviousClose') or meta.get('previousClose') or price
                    pct    = round((price - prev) / prev * 100, 2) if prev else 0
                    payload = {'price': round(price, 2), 'changePct': pct}
                    _WIG20_QUOTE_CACHE['wig20'] = {'data': payload, 'ts': now}
                    self.send_json(200, payload)
                except Exception as e:
                    print(f'[wig20-quote] {e}')
                    self.send_json(502, {'error': 'upstream failed'})

        elif path == '/api/crypto-price':
            # Public endpoint — no auth required
            qs      = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            raw_syms = [s.strip().upper() for s in qs.get('symbols', '').split(',') if s.strip()]
            _COINGECKO_IDS = {
                'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin',
                'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin', 'MATIC': 'matic-network',
                'DOT': 'polkadot', 'SHIB': 'shiba-inu', 'AVAX': 'avalanche-2', 'LINK': 'chainlink',
                'UNI': 'uniswap', 'LTC': 'litecoin', 'BCH': 'bitcoin-cash', 'ATOM': 'cosmos',
                'XLM': 'stellar', 'NEAR': 'near', 'APT': 'aptos', 'ARB': 'arbitrum',
                'OP': 'optimism', 'INJ': 'injective-protocol', 'SUI': 'sui', 'TRX': 'tron',
                'TON': 'the-open-network', 'PEPE': 'pepe', 'WIF': 'dogwifcoin',
            }
            # Map symbols to CoinGecko IDs; skip unknowns
            sym_to_id = {s: _COINGECKO_IDS[s] for s in raw_syms if s in _COINGECKO_IDS}
            if not sym_to_id:
                self.send_json(200, {}); return
            ids_str = ','.join(sym_to_id.values())
            # Cache check
            cache_entry = _CRYPTO_CACHE.get(ids_str)
            if cache_entry and time.time() - cache_entry['ts'] < _CRYPTO_TTL:
                self.send_json(200, cache_entry['data']); return
            try:
                url = (f'https://api.coingecko.com/api/v3/simple/price'
                       f'?ids={urllib.parse.quote(ids_str)}'
                       f'&vs_currencies=usd,pln,eur&include_24hr_change=true')
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'application/json',
                })
                with urllib.request.urlopen(req, timeout=10) as resp:
                    cg_data = json.loads(resp.read())
                # Build id→symbol reverse map
                id_to_sym = {v: k for k, v in sym_to_id.items()}
                result = {}
                for cg_id, vals in cg_data.items():
                    sym = id_to_sym.get(cg_id)
                    if sym:
                        result[sym] = {
                            'usd':      vals.get('usd'),
                            'pln':      vals.get('pln'),
                            'eur':      vals.get('eur'),
                            'change24h': vals.get('usd_24h_change'),
                        }
                _CRYPTO_CACHE[ids_str] = {'data': result, 'ts': time.time()}
                self.send_json(200, result)
            except Exception as e:
                print(f'[crypto-price] {e}')
                self.send_json(502, {'error': 'upstream request failed'})

        elif path == '/api/bench-pl':
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            qs  = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            sym = qs.get('s', '').upper()
            if sym not in ('WIG20', 'MWIG40', 'SWIG80'):
                self.send_json(400, {'error': 'invalid symbol'}); return
            data = _fetch_bench_pl(sym)
            if data is None:
                self.send_json(502, {'error': 'upstream request failed'})
            else:
                self.send_json(200, data)

        elif path.startswith('/api/dividends/upcoming'):
            if not get_username(self):
                self.send_json(401, {'error': 'unauthorized'}); return
            qs      = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
            _sym_re = re.compile(r'^[A-Z0-9.]{1,12}$')
            symbols = [s.strip().upper() for s in qs.get('symbols', '').split(',') if s.strip()]
            symbols = [s for s in symbols if _sym_re.match(s)][:_MAX_SYMBOLS]
            token   = os.environ.get('FINNHUB_TOKEN', '')
            today   = __import__('datetime').datetime.now().strftime('%Y-%m-%d')
            results = []

            for symbol in symbols:
                if '.' in symbol:
                    # GPW / non-US — use Yahoo Finance calendarEvents
                    try:
                        yf_url = (f'https://query1.finance.yahoo.com/v10/finance/quoteSummary/'
                                  f'{urllib.parse.quote(symbol)}'
                                  f'?modules=calendarEvents%2CdefaultKeyStatistics')
                        req = urllib.request.Request(yf_url, headers={'User-Agent': _YF_UA, 'Accept': 'application/json'})
                        with urllib.request.urlopen(req, timeout=8) as r:
                            yf_data = json.loads(r.read())
                        res0 = (yf_data.get('quoteSummary', {}).get('result') or [{}])[0]
                        cal   = res0.get('calendarEvents', {})
                        stats = res0.get('defaultKeyStatistics', {})
                        ex_ts = cal.get('exDividendDate', {}).get('raw')
                        if not ex_ts:
                            continue
                        ex_date = datetime.date.fromtimestamp(ex_ts).isoformat()
                        if ex_date < today:
                            continue
                        pay_ts = cal.get('dividendDate', {}).get('raw')
                        pay_date = datetime.date.fromtimestamp(pay_ts).isoformat() if pay_ts else None
                        amount = (stats.get('trailingAnnualDividendRate') or {}).get('raw') \
                              or (stats.get('dividendRate') or {}).get('raw')
                        results.append({
                            'symbol':   symbol,
                            'exDate':   ex_date,
                            'payDate':  pay_date,
                            'amount':   amount,
                            'currency': 'PLN',
                            'isManual': False,
                        })
                    except Exception as e:
                        print(f'[dividends] {symbol}: {e}')
                else:
                    # US stock — Finnhub
                    try:
                        url = f'https://finnhub.io/api/v1/stock/dividend2?symbol={symbol}&token={token}'
                        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req, timeout=6) as resp:
                            data = json.loads(resp.read())
                        upcoming = [d for d in data.get('data', []) if (d.get('payDate') or '') >= today]
                        if upcoming:
                            nxt = upcoming[0]
                            results.append({
                                'symbol':   symbol,
                                'exDate':   nxt.get('exDate'),
                                'payDate':  nxt.get('payDate'),
                                'amount':   nxt.get('amount'),
                                'currency': 'USD',
                                'isManual': False,
                            })
                    except Exception as e:
                        print(f'[dividends] {symbol}: {e}')

            self.send_json(200, results)

        elif path == '/api/espi-digest':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
                raw = qs.get('symbols', '')
                wa_syms = [s.strip().upper() for s in raw.split(',') if s.strip().upper().endswith('.WA')][:8]
                if not wa_syms:
                    self.send_json(200, {'items': []}); return
                api_key = os.environ.get('GROQ_API_KEY', '').strip()
                if not api_key:
                    self.send_json(503, {'error': 'AI unavailable'}); return
                cache_key = ','.join(sorted(wa_syms))
                cached = _ESPI_CACHE.get(cache_key)
                if cached and time.time() - cached['ts'] < 3600:
                    self.send_json(200, cached['data']); return
                import concurrent.futures as _cf
                def _fetch_yf_news(sym):
                    ticker_base = sym.replace('.WA', '').upper()
                    url = (f'https://query1.finance.yahoo.com/v1/finance/search'
                           f'?q={sym}&newsCount=8&quotesCount=0&lang=pl-PL&region=PL')
                    req = urllib.request.Request(url, headers={
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0)',
                        'Accept': 'application/json',
                    })
                    try:
                        with urllib.request.urlopen(req, timeout=8) as r:
                            data = json.loads(r.read().decode())
                        all_titles = [n['title'] for n in data.get('news', []) if n.get('title')]
                        relevant = [h for h in all_titles if ticker_base in h.upper()]
                        return relevant[:4]
                    except Exception as e:
                        print(f'[espi/yf_news] {sym}: {e}')
                        return []
                def _fetch_yf_fin(sym):
                    try:
                        return _yf_quotesummary(sym, 'financialData,defaultKeyStatistics,summaryDetail,assetProfile,earningsTrend')
                    except Exception as e:
                        print(f'[espi/yf_fin] {sym}: {e}')
                        return {}
                def _fetch_db_fin(sym):
                    """Read cached quarterly financials from DB for enriched AI context."""
                    if not DATABASE_URL:
                        return []
                    try:
                        with _conn() as conn, conn.cursor() as cur:
                            cur.execute(
                                "SELECT data_json FROM financials WHERE symbol=%s AND period='quarterly'",
                                (sym,)
                            )
                            row = cur.fetchone()
                        if not row:
                            return []
                        return json.loads(row[0]).get('periods', [])[:4]
                    except Exception:
                        return []

                with _cf.ThreadPoolExecutor(max_workers=8) as ex:
                    news_futures = [ex.submit(_fetch_yf_news, s) for s in wa_syms]
                    fin_futures  = [ex.submit(_fetch_yf_fin, s)  for s in wa_syms]
                    db_futures   = [ex.submit(_fetch_db_fin, s)  for s in wa_syms]
                    news_list = [f.result() for f in news_futures]
                    fin_list  = [f.result() for f in fin_futures]
                    db_list   = [f.result() for f in db_futures]
                news_map = dict(zip(wa_syms, news_list))
                fin_map  = dict(zip(wa_syms, fin_list))
                db_map   = dict(zip(wa_syms, db_list))

                def _gv(d, k):
                    v = d.get(k)
                    return v.get('raw') if isinstance(v, dict) else v
                def _bfmt(v):
                    if v is None: return None
                    av = abs(v)
                    if av >= 1e9: return f'{v/1e9:.2f}B'
                    if av >= 1e6: return f'{v/1e6:.1f}M'
                    return f'{v:.2f}'

                prompt_parts = []
                for sym in wa_syms:
                    fd    = fin_map.get(sym) or {}
                    fdata = fd.get('financialData', {})
                    kstat = fd.get('defaultKeyStatistics', {})
                    sdet  = fd.get('summaryDetail', {})
                    prof  = fd.get('assetProfile', {})
                    trend = fd.get('earningsTrend', {}).get('trend', [])

                    lines = [f'## {sym}']
                    if prof.get('industry'):
                        lines.append(f'Branża: {prof["industry"]}')
                    desc = prof.get('longBusinessSummary', '')
                    if desc:
                        lines.append(f'Opis: {desc[:250]}')

                    price  = _gv(fdata, 'currentPrice') or _gv(sdet, 'regularMarketPrice')
                    target = _gv(fdata, 'targetMeanPrice')
                    rec    = fdata.get('recommendationKey', '')
                    n_buy  = _gv(fdata, 'numberOfAnalystOpinions')
                    pe     = _gv(sdet, 'trailingPE') or _gv(kstat, 'trailingPE')
                    fwd_pe = _gv(kstat, 'forwardPE')
                    rev    = _gv(fdata, 'totalRevenue')
                    net_i  = _gv(fdata, 'netIncomeToCommon')
                    fcf    = _gv(fdata, 'freeCashflow')
                    gm     = _gv(fdata, 'grossMargins')
                    om     = _gv(fdata, 'operatingMargins')
                    debt   = _gv(fdata, 'totalDebt')
                    cash   = _gv(fdata, 'totalCash')
                    rev_g  = _gv(fdata, 'revenueGrowth')

                    ann = next((t for t in trend if t.get('period') in ('0y', '+1y')), None)
                    fwd_rev = _gv(ann.get('revenueEstimate', {}), 'avg') if ann else None
                    eps_up  = _gv(ann.get('epsRevisions', {}), 'upLast30days') if ann else None
                    eps_dn  = _gv(ann.get('epsRevisions', {}), 'downLast30days') if ann else None

                    has_fin = any(v is not None for v in [price, rev, net_i, pe, target])
                    if has_fin:
                        if price:  lines.append(f'Cena: {price:.2f} PLN')
                        if target and price:
                            upside = (target / price - 1) * 100
                            lines.append(f'Cel analityków (śr.): {target:.2f} PLN ({upside:+.1f}% upside)')
                        if rec:    lines.append(f'Rekomendacja: {rec}' + (f' ({n_buy} analityków)' if n_buy else ''))
                        if pe:     lines.append(f'P/E trailing: {pe:.1f}x')
                        if fwd_pe: lines.append(f'P/E forward: {fwd_pe:.1f}x')
                        if rev:    lines.append(f'Przychody TTM: {_bfmt(rev)}')
                        if rev_g:  lines.append(f'Wzrost przychodów r/r: {rev_g*100:.1f}%')
                        if net_i:  lines.append(f'Zysk netto TTM: {_bfmt(net_i)}')
                        if gm:     lines.append(f'Marża brutto: {gm*100:.1f}%')
                        if om:     lines.append(f'Marża operacyjna: {om*100:.1f}%')
                        if fcf:    lines.append(f'FCF TTM: {_bfmt(fcf)}')
                        if debt and cash:
                            lines.append(f'Dług netto: {_bfmt(debt - cash)}')
                        if fwd_rev: lines.append(f'Prognoza przychodów nast. rok: {_bfmt(fwd_rev)}')
                        if eps_up is not None or eps_dn is not None:
                            lines.append(f'Rewizje EPS 30d: ↑{eps_up or 0} ↓{eps_dn or 0}')
                    else:
                        lines.append('[BRAK DANYCH FUNDAMENTALNYCH — nie podawaj żadnych liczb ani cen akcji]')

                    # Enrich with historical quarterly data from DB (4 most recent quarters)
                    db_periods = db_map.get(sym, [])
                    if db_periods:
                        lines.append('Dane kwartalne (najnowszy kwartał = pierwszy):')
                        for p in db_periods:
                            parts = [p.get('label', '')]
                            r = p.get('revenue')
                            rg = p.get('revenueGrowthYoY')
                            if r: parts.append(f'Rev={_bfmt(r)}' + (f'({rg*100:+.1f}%r/r)' if rg is not None else ''))
                            gm2 = p.get('grossMargin')
                            em = p.get('ebitdaMargin')
                            if gm2 is not None: parts.append(f'GM={gm2*100:.1f}%')
                            if em  is not None: parts.append(f'EBITDA-M={em*100:.1f}%')
                            ni = p.get('netIncome')
                            fc = p.get('fcf')
                            nd = p.get('netDebt')
                            if ni is not None: parts.append(f'NI={_bfmt(ni)}')
                            if fc is not None: parts.append(f'FCF={_bfmt(fc)}')
                            if nd is not None: parts.append(f'DługNetto={_bfmt(nd)}')
                            lines.append('  ' + ' | '.join(parts))

                    headlines = news_map.get(sym, [])
                    if headlines:
                        lines.append('Ostatnie newsy:')
                        for h in headlines:
                            lines.append(f'• {h}')
                    else:
                        lines.append('[BRAK NEWSÓW]')

                    prompt_parts.append('\n'.join(lines))

                summaries = {}
                if prompt_parts:
                    try:
                        from groq import Groq as _GroqClient
                        client = _GroqClient(api_key=api_key)
                        prompt = (
                            'Jesteś doświadczonym analitykiem sell-side specjalizującym się w GPW '
                            '(Giełdzie Papierów Wartościowych w Warszawie).\n'
                            'Napisz dla każdej z poniższych spółek GPW profesjonalne, '
                            'samodzielne podsumowanie inwestycyjne w języku polskim.\n\n'
                            'ZASADY (przestrzegaj ściśle):\n'
                            '1. Każde podsumowanie: 5-6 zdań, SAMODZIELNE — nie odwołuj się do innych spółek z listy.\n'
                            '2. Obowiązkowa struktura: (a) model biznesowy i pozycja rynkowa, '
                            '(b) przewagi konkurencyjne lub moat, '
                            '(c) kondycja finansowa lub perspektywy wzrostu, '
                            '(d) główna szansa, (e) główne ryzyko.\n'
                            '3. UŻYWAJ swojej wiedzy ogólnej o spółkach GPW: historia, produkty, '
                            'segment, konkurencja, otoczenie branżowe — to jest pożądane.\n'
                            '4. ZAKAZ podawania konkretnych liczb (cena akcji, P/E, przychody, '
                            'EBITDA, marże) — chyba że są podane wprost w danych poniżej.\n'
                            '5. Jeśli podano dane finansowe — odnieś się do nich i skomentuj '
                            '(wzrost/spadek, siła bilansu, jakość FCF).\n'
                            '6. Jeśli podano nagłówki newsów — uwzględnij TYLKO wyraźnie '
                            'powiązane z daną spółką; pomiń niezwiązane.\n'
                            '7. Pisz obiektywnie. Bez przesadnego optymizmu ani pesymizmu.\n\n'
                            'FORMAT: Każda spółka MUSI zaczynać się dokładnie od "TICKER.WA: " '
                            'na początku nowej linii (np. "CDR.WA: ..."). '
                            'Bez numeracji, bez gwiazdek, bez nagłówków markdown.\n\n'
                            + '\n\n'.join(prompt_parts)
                        )
                        resp = client.chat.completions.create(
                            model='llama-3.3-70b-versatile',
                            max_tokens=4000,
                            messages=[{'role': 'user', 'content': prompt}],
                        )
                        current_sym = None
                        current_buf = []
                        def _flush(sym, buf):
                            if sym and buf:
                                summaries[sym] = ' '.join(buf).strip()
                        for line in resp.choices[0].message.content.strip().splitlines():
                            matched = None
                            for s in wa_syms:
                                pfx1 = s + ':'
                                pfx2 = s.replace('.WA', '') + '.WA:'
                                pfx3 = s.replace('.WA', '') + ':'
                                if line.upper().startswith(pfx1) or line.upper().startswith(pfx2) or line.upper().startswith(pfx3):
                                    matched = s; break
                            if matched:
                                _flush(current_sym, current_buf)
                                current_sym = matched
                                after = line.partition(':')[2].strip()
                                current_buf = [after] if after else []
                            elif current_sym and line.strip():
                                current_buf.append(line.strip())
                        _flush(current_sym, current_buf)
                    except Exception as _ai_e:
                        print(f'[espi/ai] {_ai_e}')
                items = [
                    {'symbol': s, 'headlines': news_map.get(s, []), 'summary': summaries.get(s)}
                    for s in wa_syms
                ]
                result = {
                    'items': items,
                    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
                _ESPI_CACHE[cache_key] = {'ts': time.time(), 'data': result}
                self.send_json(200, result)
            except Exception as _top_e:
                import traceback
                print(f'[espi/top] {_top_e}\n{traceback.format_exc()}')
                self.send_json(500, {'error': str(_top_e)})

        elif path == '/api/fx-rate':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
                currency = qs.get('currency', '').strip().upper()
                if not re.match(r'^[A-Z]{3}$', currency):
                    self.send_json(400, {'error': 'invalid currency'}); return
                dates = sorted(set(d.strip() for d in qs.get('dates', '').split(',') if d.strip()))[:500]
                if not dates:
                    self.send_json(200, {'currency': currency, 'rates': {}}); return

                if currency == 'PLN':
                    self.send_json(200, {'currency': currency, 'rates': {d: 1.0 for d in dates}}); return

                rates = {}
                if DATABASE_URL:
                    with _conn() as conn, conn.cursor() as cur:
                        cur.execute(
                            "SELECT date, rate FROM fx_rates_history WHERE currency=%s AND date = ANY(%s)",
                            (currency, dates)
                        )
                        for d, r in cur.fetchall():
                            rates[d.isoformat()] = float(r)

                missing = [d for d in dates if d not in rates]

                def _fetch_nbp(date_str):
                    base = datetime.date.fromisoformat(date_str)
                    for offset in range(8):
                        d = base - datetime.timedelta(days=offset)
                        url = (f'https://api.nbp.pl/api/exchangerates/rates/A/{currency}/'
                               f'{d.isoformat()}/?format=json')
                        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
                        try:
                            with urllib.request.urlopen(req, timeout=6) as resp:
                                data = json.loads(resp.read().decode())
                            rate = data.get('rates', [{}])[0].get('mid')
                            if rate:
                                return date_str, float(rate)
                        except Exception:
                            continue
                    return date_str, None

                if missing:
                    import concurrent.futures as _cf
                    with _cf.ThreadPoolExecutor(max_workers=4) as ex:
                        results = list(ex.map(_fetch_nbp, missing))
                    to_insert = [(currency, d, r) for d, r in results if r is not None]
                    for d, r in results:
                        if r is not None:
                            rates[d] = r
                    if to_insert and DATABASE_URL:
                        with _conn() as conn, conn.cursor() as cur:
                            cur.executemany(
                                "INSERT INTO fx_rates_history (currency, date, rate) "
                                "VALUES (%s,%s,%s) ON CONFLICT (currency,date) DO NOTHING",
                                to_insert
                            )

                self.send_json(200, {'currency': currency, 'rates': {d: rates.get(d) for d in dates}})
            except Exception as e:
                print(f'[fx-rate] {e}')
                self.send_json(500, {'error': str(e)})

        elif path == '/api/newsfeed':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                qs = dict(urllib.parse.parse_qsl(self.path.split('?', 1)[1] if '?' in self.path else ''))
                raw = qs.get('symbols', '')
                seen_syms = set()
                symbols = []
                for s in raw.split(','):
                    sym = s.strip().upper()
                    if sym and sym not in seen_syms:
                        seen_syms.add(sym)
                        symbols.append(sym)
                symbols = symbols[:40]
                if not symbols:
                    self.send_json(200, {
                        'items': [],
                        'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    })
                    return

                cache_key = ','.join(sorted(symbols))
                cached = _NEWS_CACHE.get(cache_key)
                if cached and time.time() - cached['ts'] < 1800:
                    self.send_json(200, cached['data']); return

                import concurrent.futures as _cf

                def _fetch_finnhub_news(sym):
                    token = os.environ.get('FINNHUB_TOKEN', '')
                    if not token:
                        return []
                    try:
                        today_dt = datetime.datetime.now(datetime.timezone.utc).date()
                        from_dt = today_dt - datetime.timedelta(days=7)
                        url = (f'https://finnhub.io/api/v1/company-news?symbol={sym}'
                               f'&from={from_dt.isoformat()}&to={today_dt.isoformat()}&token={token}')
                        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req, timeout=8) as r:
                            data = json.loads(r.read().decode())
                        out = []
                        for n in data:
                            ts = n.get('datetime')
                            if not ts or not n.get('headline'):
                                continue
                            out.append({
                                'symbol': sym,
                                'title': n.get('headline'),
                                'url': n.get('url'),
                                'source': n.get('source'),
                                'publishedAt': datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat(),
                                'origin': 'finnhub',
                            })
                        return out
                    except Exception as e:
                        print(f'[newsfeed/finnhub] {sym}: {e}')
                        return []

                def _fetch_yahoo_news(sym):
                    try:
                        url = (f'https://query1.finance.yahoo.com/v1/finance/search'
                               f'?q={sym}&newsCount=8&quotesCount=0&lang=pl-PL&region=PL')
                        req = urllib.request.Request(url, headers={
                            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:125.0)',
                            'Accept': 'application/json',
                        })
                        with urllib.request.urlopen(req, timeout=8) as r:
                            data = json.loads(r.read().decode())
                        out = []
                        for n in data.get('news', []):
                            if not n.get('title'):
                                continue
                            related = n.get('relatedTickers')
                            if related and sym not in related:
                                continue
                            ts = n.get('providerPublishTime')
                            if not ts:
                                continue
                            out.append({
                                'symbol': sym,
                                'title': n.get('title'),
                                'url': n.get('link'),
                                'source': n.get('publisher'),
                                'publishedAt': datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).isoformat(),
                                'origin': 'yahoo',
                            })
                        return out[:5]
                    except Exception as e:
                        print(f'[newsfeed/yahoo] {sym}: {e}')
                        return []

                with _cf.ThreadPoolExecutor(max_workers=10) as ex:
                    finnhub_futures = [ex.submit(_fetch_finnhub_news, s) for s in symbols]
                    yahoo_futures   = [ex.submit(_fetch_yahoo_news, s)   for s in symbols]
                    finnhub_list = [f.result() for f in finnhub_futures]
                    yahoo_list   = [f.result() for f in yahoo_futures]
                finnhub_map = dict(zip(symbols, finnhub_list))
                yahoo_map   = dict(zip(symbols, yahoo_list))

                def _norm_title(t):
                    return re.sub(r'[^a-z0-9]+', '', (t or '').lower())

                merged = []
                for sym in symbols:
                    combined = (finnhub_map.get(sym) or []) + (yahoo_map.get(sym) or [])
                    combined.sort(key=lambda n: n['publishedAt'], reverse=True)
                    dedup = []
                    seen_titles = set()
                    for n in combined:
                        key = _norm_title(n['title'])
                        if key in seen_titles:
                            continue
                        seen_titles.add(key)
                        dedup.append(n)
                    merged.extend(dedup[:5])

                merged.sort(key=lambda n: n['publishedAt'], reverse=True)
                merged = merged[:60]

                api_key = os.environ.get('GROQ_API_KEY', '').strip()
                if merged and api_key:
                    try:
                        from groq import Groq as _GroqClient
                        client = _GroqClient(api_key=api_key)
                        ai_input = [
                            {'i': i, 'symbol': n['symbol'], 'title': n['title']}
                            for i, n in enumerate(merged)
                        ]
                        prompt = (
                            'Jesteś analitykiem finansowym. Dla każdej poniższej wiadomości '
                            'przetłumacz/streść nagłówek na 1-2 zwięzłe zdania w języku polskim '
                            'oraz sklasyfikuj sentyment DLA KONKRETNEJ SPÓŁKI ("symbol"), '
                            'której dotyczy wiadomość — nagłówek może być neutralny dla rynku, '
                            'ale pozytywny lub negatywny dla tej konkretnej spółki.\n\n'
                            'Odpowiedz WYŁĄCZNIE w ścisłym formacie JSON, dokładnie w tym kształcie:\n'
                            '{"items": [{"i": 0, "sentiment": "positive", "summary": '
                            '"Krótkie polskie podsumowanie 1-2 zdania."}, ...]}\n\n'
                            'sentiment musi być jedną z wartości: "positive", "negative", "neutral".\n\n'
                            'Dane wejściowe:\n' + json.dumps(ai_input, ensure_ascii=False)
                        )
                        resp = client.chat.completions.create(
                            model='llama-3.3-70b-versatile',
                            max_tokens=4000,
                            temperature=0.3,
                            response_format={'type': 'json_object'},
                            messages=[{'role': 'user', 'content': prompt}],
                        )
                        parsed = json.loads(resp.choices[0].message.content)
                        for entry in parsed.get('items', []):
                            idx = entry.get('i')
                            if isinstance(idx, int) and 0 <= idx < len(merged):
                                merged[idx]['summary'] = entry.get('summary')
                                merged[idx]['sentiment'] = entry.get('sentiment')
                    except Exception as e:
                        print(f'[newsfeed/ai] {e}')

                items = []
                for n in merged:
                    items.append({
                        'symbol': n['symbol'],
                        'title': n['title'],
                        'summary': n.get('summary'),
                        'sentiment': n.get('sentiment'),
                        'source': n['source'],
                        'url': n['url'],
                        'publishedAt': n['publishedAt'],
                    })

                result = {
                    'items': items,
                    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
                _NEWS_CACHE[cache_key] = {'ts': time.time(), 'data': result}
                self.send_json(200, result)
            except Exception as _top_e:
                import traceback
                print(f'[newsfeed/top] {_top_e}\n{traceback.format_exc()}')
                self.send_json(500, {'error': str(_top_e)})

        elif path in ('/', '/index.html', '/myfund.html'):
            content = (BASE / 'myfund.html').read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        elif path == '/recover':
            html = '''<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Recover Portfolio Data</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:32px;max-width:520px;width:100%}
h1{font-size:1.25rem;font-weight:700;margin-bottom:8px;color:#f8fafc}
p{color:#94a3b8;font-size:.9rem;margin-bottom:20px;line-height:1.5}
input{width:100%;padding:10px 14px;background:#0f172a;border:1px solid #475569;border-radius:8px;color:#f1f5f9;font-size:.9rem;margin-bottom:12px}
input:focus{outline:2px solid #6366f1;border-color:transparent}
button{width:100%;padding:11px;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;transition:opacity .15s}
.btn-primary{background:#6366f1;color:#fff}
.btn-primary:hover{opacity:.85}
.btn-success{background:#059669;color:#fff;margin-top:8px}
.btn-success:hover{opacity:.85}
.msg{padding:12px 16px;border-radius:8px;margin-top:16px;font-size:.875rem;line-height:1.5}
.msg-ok{background:#052e16;border:1px solid #166534;color:#4ade80}
.msg-err{background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171}
.msg-info{background:#0c1a2e;border:1px solid #1d4ed8;color:#93c5fd}
pre{font-size:.75rem;margin-top:8px;overflow:auto;max-height:200px;padding:8px;background:#0f172a;border-radius:6px;color:#94a3b8}
</style></head><body>
<div class="card">
<h1>&#128190; Odzysk danych portfela</h1>
<p>Ta strona odczyta dane portfela z Twojej przeglądarki i przywróci je do bazy danych.<br>
Zaloguj się, a następnie kliknij <strong>Przywróć dane</strong>.</p>
<div id="loginForm">
  <input id="uname" type="text" placeholder="Nazwa użytkownika" autocomplete="username">
  <input id="upass" type="password" placeholder="Hasło" autocomplete="current-password">
  <button class="btn-primary" onclick="doLogin()">Zaloguj się i sprawdź dane</button>
</div>
<div id="recoverSection" style="display:none">
  <div id="foundMsg"></div>
  <button class="btn-success" id="recoverBtn" style="display:none" onclick="doRecover()">&#128190; Przywróć dane do chmury</button>
</div>
<div id="msg"></div>
</div>
<script>
let _token = null;
let _oldData = null;

function showMsg(text, type='info') {
  document.getElementById('msg').innerHTML = `<div class="msg msg-${type}">${text}</div>`;
}

function readOldData() {
  const portfolio = JSON.parse(localStorage.getItem('myfund_v3_portfolio') || 'null');
  const transactions = JSON.parse(localStorage.getItem('myfund_v3_transactions') || 'null');
  const snapshots = JSON.parse(localStorage.getItem('myfund_v3_snapshots') || 'null');
  const cash = JSON.parse(localStorage.getItem('myfund_v4_cash') || 'null');
  return { portfolio, transactions, snapshots, cash };
}

async function doLogin() {
  const u = document.getElementById('uname').value.trim();
  const p = document.getElementById('upass').value;
  if (!u || !p) { showMsg('Podaj login i hasło.', 'err'); return; }
  showMsg('Logowanie...', 'info');
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const d = await r.json();
    if (!d.ok) { showMsg('Błąd logowania: ' + d.error, 'err'); return; }
    _token = d.token;
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('recoverSection').style.display = 'block';
    checkOldData();
  } catch(e) { showMsg('Błąd: ' + e.message, 'err'); }
}

function checkOldData() {
  const old = readOldData();
  const holdings = old.portfolio?.holdings || [];
  const transactions = old.transactions || [];
  const snapKeys = Object.keys(old.snapshots || {}).length;
  const div = document.getElementById('foundMsg');
  if (holdings.length === 0 && transactions.length === 0 && snapKeys === 0) {
    div.innerHTML = '<div class="msg msg-err">Brak danych portfela w tej przeglądarce.<br>Dane mogły zostać usunięte lub używasz innej przeglądarki/urządzenia niż wcześniej.</div>';
    return;
  }
  div.innerHTML = `<div class="msg msg-info">Znaleziono dane:<ul style="margin-top:8px;padding-left:18px">
    <li>${holdings.length} pozycji w portfelu</li>
    <li>${transactions.length} transakcji</li>
    <li>${snapKeys} snapshotów historii</li>
    </ul></div>`;
  _oldData = old;
  document.getElementById('recoverBtn').style.display = 'block';
}

async function doRecover() {
  if (!_oldData || !_token) return;
  showMsg('Przywracanie danych...', 'info');
  try {
    const current = await fetch('/api/data', {
      headers: { 'X-Auth-Token': _token }
    }).then(r => r.json());
    const merged = {
      ...current,
      portfolio: _oldData.portfolio || current.portfolio,
      transactions: _oldData.transactions || current.transactions,
      snapshots: { ...(current.snapshots || {}), ...(_oldData.snapshots || {}) },
      cash: _oldData.cash || current.cash,
    };
    const r = await fetch('/api/data', {
      method: 'POST',
      headers: { 'X-Auth-Token': _token, 'Content-Type': 'application/json' },
      body: JSON.stringify(merged)
    });
    if (r.ok) {
      showMsg('&#10003; Dane przywrócone! <a href="https://stockstracker-mu.vercel.app" style="color:#818cf8">Przejdź do aplikacji</a>', 'ok');
      document.getElementById('recoverBtn').style.display = 'none';
    } else {
      showMsg('Błąd zapisu: HTTP ' + r.status, 'err');
    }
  } catch(e) { showMsg('Błąd: ' + e.message, 'err'); }
}
</script></body></html>'''.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(html)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(html)

        elif path in ('/app', '/app/') or path.startswith('/app/'):
            # React app has moved to Vercel — redirect permanently
            self.send_response(301)
            self.send_header('Location', 'https://stockstracker-ai.vercel.app')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()

        elif path.startswith('/assets/') or path in ('/favicon.ico', '/favicon.png'):
            # Static assets built by Vite — serve from frontend-react/dist
            rel = path.lstrip('/')
            filepath = (REACT_DIST / rel).resolve()
            try:
                filepath.relative_to(REACT_DIST.resolve())
            except ValueError:
                self.send_response(403); self.end_headers(); return
            if filepath.exists() and filepath.is_file():
                self._serve_static(filepath)
            else:
                self.send_response(404); self.end_headers()

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        path = self.path.split('?')[0]

        if path in ('/api/login', '/api/register'):
            ip = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()
            if _rate_limited(ip):
                self.send_json(429, {'ok': False, 'error': 'Za dużo prób. Spróbuj ponownie za 15 minut.'}); return

        if path == '/api/login':
            try:
                body     = self.read_json(_MAX_BODY_AUTH)
                username = _str(body.get('username', ''), 64, 'username').lower()
                password = _str(body.get('password', ''), 1024, 'password')
                if not _USERNAME_RE.match(username):
                    self.send_json(400, {'ok': False, 'error': 'Nieprawidłowa nazwa użytkownika'}); return
                users = load_users()
                authenticated = False
                if username in users:
                    stored = users[username]['password_hash']
                    if check_password(password, stored):
                        authenticated = True
                    elif hashlib.sha256(password.encode()).hexdigest() == stored:
                        # Migrate legacy SHA-256 hash to bcrypt on first login
                        save_user(username, users[username]['display_name'], hash_password(password))
                        authenticated = True
                if authenticated:
                    token = secrets.token_hex(24)
                    SESSIONS[token] = username
                    if DATABASE_URL:
                        try:
                            with _conn() as c, c.cursor() as cur:
                                cur.execute("INSERT INTO sessions (token, username) VALUES (%s,%s) ON CONFLICT (token) DO NOTHING", (token, username))
                        except Exception as e:
                            print(f'[sessions] persist failed: {e}')
                    self.send_json(200, {'ok': True, 'token': token,
                                         'display_name': users[username]['display_name']})
                else:
                    self.send_json(401, {'ok': False, 'error': 'Błędny login lub hasło'})
            except ValueError as e:
                self.send_json(400, {'ok': False, 'error': str(e)})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': 'Bad request'})

        elif path == '/api/register':
            try:
                body         = self.read_json(_MAX_BODY_AUTH)
                username     = _str(body.get('username', ''), 64, 'username').lower()
                display_name = _str(body.get('display_name', ''), 64, 'display_name')
                password     = _str(body.get('password', ''), 1024, 'password')
                if not _USERNAME_RE.match(username):
                    self.send_json(400, {'ok': False,
                                         'error': 'Nazwa użytkownika: 1–64 znaków, tylko litery/cyfry/-/_'}); return
                if len(password) < 6:
                    self.send_json(400, {'ok': False, 'error': 'Hasło musi mieć co najmniej 6 znaków'}); return
                users = load_users()
                if username in users:
                    self.send_json(409, {'ok': False, 'error': 'Nazwa użytkownika już zajęta'}); return
                save_user(username, display_name or username, hash_password(password))
                token = secrets.token_hex(24)
                SESSIONS[token] = username
                if DATABASE_URL:
                    try:
                        with _conn() as c, c.cursor() as cur:
                            cur.execute("INSERT INTO sessions (token, username) VALUES (%s,%s) ON CONFLICT (token) DO NOTHING", (token, username))
                    except Exception as e:
                        print(f'[sessions] persist failed: {e}')
                self.send_json(200, {'ok': True, 'token': token,
                                      'display_name': display_name or username})
            except ValueError as e:
                self.send_json(400, {'ok': False, 'error': str(e)})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': 'Bad request'})

        elif path == '/api/logout':
            token = self.headers.get('X-Auth-Token', '')
            SESSIONS.pop(token, None)
            if DATABASE_URL:
                try:
                    with _conn() as c, c.cursor() as cur:
                        cur.execute("DELETE FROM sessions WHERE token=%s", (token,))
                except Exception as e:
                    print(f'[sessions] delete failed: {e}')
            self.send_json(200, {'ok': True})

        elif path == '/api/change-password':
            username = get_username(self)
            if not username:
                self.send_json(401, {'ok': False, 'error': 'unauthorized'}); return
            try:
                body       = self.read_json(_MAX_BODY_AUTH)
                current_pw = _str(body.get('current_password', ''), 1024, 'current_password')
                new_pw     = _str(body.get('new_password', ''),     1024, 'new_password')
                if len(new_pw) < 6:
                    self.send_json(400, {'ok': False, 'error': 'Nowe hasło musi mieć co najmniej 6 znaków'}); return
                users = load_users()
                if not check_password(current_pw, users.get(username, {}).get('password_hash', '')):
                    self.send_json(401, {'ok': False, 'error': 'Aktualne hasło jest nieprawidłowe'}); return
                save_user(username, users[username]['display_name'], hash_password(new_pw))
                self.send_json(200, {'ok': True})
            except ValueError as e:
                self.send_json(400, {'ok': False, 'error': str(e)})
            except Exception as e:
                self.send_json(400, {'ok': False, 'error': 'Bad request'})

        elif path == '/api/watchlist':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                length = int(self.headers.get('Content-Length', 0))
                if length > 256 * 1024:
                    self.send_json(400, {'error': 'body too large'}); return
                body = json.loads(self.rfile.read(max(0, length)))
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json(400, {'error': str(e)}); return
            items = body if isinstance(body, list) else body.get('items', [])
            if not isinstance(items, list):
                self.send_json(400, {'error': 'expected list'}); return
            try:
                save_watchlist(username, items)
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/insights':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body = self.read_json(max_size=512 * 1024)
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json(400, {'error': str(e)}); return
            if not isinstance(body, dict):
                self.send_json(400, {'error': 'expected object'}); return
            try:
                save_insights(username, body)
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/portfolios':
            # POST /api/portfolios — create new portfolio
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body = self.read_json(max_size=1024)
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json(400, {'error': str(e)}); return
            name = str(body.get('name', '')).strip()[:64]
            currency = str(body.get('currency', 'PLN')).upper()[:4]
            if not name:
                self.send_json(400, {'error': 'name required'}); return
            if currency not in ('PLN', 'USD', 'EUR', 'GBP'):
                self.send_json(400, {'error': 'unsupported currency'}); return
            pid = secrets.token_hex(12)
            try:
                create_portfolio(username, pid, name, currency)
                self.send_json(201, {'id': pid, 'name': name, 'currency': currency})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path.startswith('/api/portfolios/') and path.endswith('/data'):
            # POST /api/portfolios/:id/data — save portfolio data
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):-len('/data')]
            if not pid or pid == 'all' or not re.fullmatch(r'[a-f0-9]{24}', pid):
                self.send_json(400, {'error': 'invalid portfolio id'}); return
            try:
                portfolios = list_portfolios(username)
                if not any(p['id'] == pid for p in portfolios):
                    self.send_json(403, {'error': 'forbidden'}); return
                length = int(self.headers.get('Content-Length', 0))
                if length > _MAX_BODY_DATA:
                    self.send_json(413, {'error': 'too large'}); return
                raw = self.rfile.read(max(0, length))
                data = json.loads(raw)
                save_portfolio_data(pid, data)
                self.send_json(200, {'ok': True})
            except (ValueError, json.JSONDecodeError) as e:
                self.send_json(400, {'error': str(e)})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path.startswith('/api/portfolios/') and path.endswith('/layout'):
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):-len('/layout')]
            try:
                body = self.read_json(max_size=32 * 1024)
                layout = body.get('layout')
                if layout is None:
                    self.send_json(400, {'error': 'missing layout'}); return
                if DATABASE_URL:
                    save_layout(pid, layout)
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/portfolios/save-snapshots':
            # POST {pid: {total, invested}} — batch-save today's snapshot for multiple portfolios
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                snapshots_map = self.read_json(max_size=65536)
                today = datetime.date.today().isoformat()
                portfolios_list = list_portfolios(username)
                pid_set = {p['id'] for p in portfolios_list}
                for pid, vals in snapshots_map.items():
                    if pid not in pid_set or not re.fullmatch(r'[a-f0-9]{24}', pid):
                        continue
                    total = vals.get('total')
                    invested = vals.get('invested')
                    if total is None or invested is None or total <= 0:
                        continue
                    pdata = load_portfolio_data(pid)
                    pdata.setdefault('snapshots', {})[today] = total
                    pdata.setdefault('snapshotsInvested', {})[today] = invested
                    save_portfolio_data(pid, pdata)
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path.startswith('/api/portfolios/') and not path.endswith('/data'):
            # PUT/DELETE /api/portfolios/:id — update or delete a portfolio
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            pid = path[len('/api/portfolios/'):]
            if not pid or not re.fullmatch(r'[a-f0-9]{24}', pid):
                self.send_json(400, {'error': 'invalid portfolio id'}); return
            try:
                body = self.read_json(max_size=1024)
            except (ValueError, json.JSONDecodeError):
                body = {}
            method = str(body.get('_method', 'PUT')).upper()
            try:
                portfolios = list_portfolios(username)
                if not any(p['id'] == pid for p in portfolios):
                    self.send_json(403, {'error': 'forbidden'}); return
                if method == 'DELETE':
                    if len(portfolios) <= 1:
                        self.send_json(400, {'error': 'Nie można usunąć ostatniego portfela'}); return
                    delete_portfolio(pid, username)
                    self.send_json(200, {'ok': True})
                else:
                    name = str(body.get('name', '')).strip()[:64]
                    currency = str(body.get('currency', 'PLN')).upper()[:4]
                    if not name:
                        self.send_json(400, {'error': 'name required'}); return
                    if currency not in ('PLN', 'USD', 'EUR', 'GBP'):
                        self.send_json(400, {'error': 'unsupported currency'}); return
                    update_portfolio(pid, username, name, currency)
                    self.send_json(200, {'id': pid, 'name': name, 'currency': currency})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        elif path == '/api/data':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                length = int(self.headers.get('Content-Length', 0))
                if length > _MAX_BODY_DATA:
                    self.send_json(413, {'ok': False, 'error': 'Dane zbyt duże (max 512 KB)'}); return
                raw    = self.rfile.read(max(0, length))
                parsed = json.loads(raw)
                if not isinstance(parsed, dict):
                    self.send_json(400, {'ok': False, 'error': 'Oczekiwano obiektu JSON'}); return
                save_data(username, raw)
                self.send_json(200, {'ok': True})
            except json.JSONDecodeError:
                self.send_json(400, {'ok': False, 'error': 'Nieprawidłowy JSON'})

        elif path == '/api/financials/upload':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body      = self.read_json(max_size=10 * 1024 * 1024)
                symbol    = str(body.get('symbol', '')).upper()
                period    = str(body.get('period', 'quarterly'))
                image_b64 = str(body.get('image_b64', ''))
                if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                    self.send_json(400, {'error': 'invalid symbol'}); return
                if period not in ('quarterly', 'annual'):
                    self.send_json(400, {'error': 'invalid period'}); return
                if not image_b64:
                    self.send_json(400, {'error': 'missing image_b64'}); return
                try:
                    import base64 as _base64
                    _base64.b64decode(image_b64[:64], validate=True)
                except Exception:
                    self.send_json(400, {'error': 'invalid image_b64'}); return
            except ValueError as e:
                self.send_json(400, {'error': str(e)}); return
            api_key = os.environ.get('GROQ_API_KEY', '').strip()
            if not api_key:
                self.send_json(503, {'error': 'GROQ_API_KEY not configured'}); return
            try:
                from groq import Groq as _GroqClient
                client = _GroqClient(api_key=api_key)
                prompt = (
                    f'Parse the financial table in this screenshot for stock {symbol}. '
                    f'Extract {period} financial data. Return ONLY a JSON object with this exact schema '
                    f'(use null for missing values, raw numbers not millions):\n'
                    '{"periods":[{"label":"Q1 2025","date":"2025-03-31","revenue":1181000000,'
                    '"revenueGrowthYoY":0.63,"grossProfit":973000000,"grossMargin":0.824,'
                    '"operatingCost":null,"operatingIncome":420000000,"ebitda":500000000,'
                    '"ebitdaMargin":0.423,"netIncome":370000000,"netDebt":-5400000000,'
                    '"totalAssets":null,"totalLiabilities":null,"equity":null,'
                    '"cashAndEquivalents":5400000000,"totalDebt":0,'
                    '"operatingCashFlow":450000000,"capex":-80000000,"fcf":370000000,'
                    '"shareRepurchases":null}],'
                    '"valuation":{"peRatio":null,"forwardPE":null,"evEbitda":null,"ps":null,'
                    '"marketCap":null,"sharesOutstanding":null,"ev":null,"pfcf":null,"netDebtLatest":null},'
                    f'"currency":"USD","period":"{period}"'
                    '}'
                )
                # Detect image type from base64 header bytes
                _sig = image_b64[:12]
                if _sig.startswith('/9j/'):
                    _media_type = 'image/jpeg'
                elif _sig.startswith('R0lGOD'):
                    _media_type = 'image/gif'
                elif _sig.startswith('UklGR'):
                    _media_type = 'image/webp'
                else:
                    _media_type = 'image/png'
                resp = client.chat.completions.create(
                    model='meta-llama/llama-4-scout-17b-16e-instruct',
                    max_tokens=4096,
                    messages=[{
                        'role': 'user',
                        'content': [
                            {'type': 'image_url', 'image_url': {'url': f'data:{_media_type};base64,{image_b64}'}},
                            {'type': 'text', 'text': prompt},
                        ],
                    }],
                )
                text = resp.choices[0].message.content.strip()
                if text.startswith('```'):
                    parts = text.split('\n', 1)
                    if len(parts) < 2:
                        raise json.JSONDecodeError('empty fence', text, 0)
                    text = parts[1].rsplit('```', 1)[0].strip()
                data = json.loads(text)
                if not isinstance(data, dict):
                    raise json.JSONDecodeError('expected dict', text, 0)
            except json.JSONDecodeError:
                self.send_json(422, {'error': 'parse_failed'}); return
            except Exception as e:
                print(f'[financials/upload] vision error: {type(e).__name__}: {e}')
                self.send_json(502, {'error': str(e) or 'vision_error'}); return
            try:
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO financials (symbol, period, data_json, source, fetched_at)
                        VALUES (%s, %s, %s, 'screenshot', NOW())
                        ON CONFLICT (symbol, period) DO UPDATE
                            SET data_json  = EXCLUDED.data_json,
                                source     = 'screenshot',
                                fetched_at = NOW()
                    """, (symbol, period, json.dumps(data)))
            except Exception as e:
                print(f'[financials/upload] db write error: {e}')
            data['source']    = 'screenshot'
            data['fetchedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.send_json(200, data)

        elif path == '/api/financials/manual':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            try:
                body   = self.read_json(max_size=512 * 1024)
                symbol = str(body.get('symbol', '')).upper()
                period = str(body.get('period', 'annual'))
                data   = body.get('data')
                if not re.fullmatch(r'[A-Z0-9.\-]{1,15}', symbol):
                    self.send_json(400, {'error': 'invalid symbol'}); return
                if period not in ('quarterly', 'annual'):
                    self.send_json(400, {'error': 'invalid period'}); return
                if not isinstance(data, dict) or 'periods' not in data:
                    self.send_json(400, {'error': 'invalid data'}); return
            except ValueError as e:
                self.send_json(400, {'error': str(e)}); return
            try:
                with _conn() as conn, conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO financials (symbol, period, data_json, source, fetched_at)
                        VALUES (%s, %s, %s, 'manual', NOW())
                        ON CONFLICT (symbol, period) DO UPDATE
                            SET data_json  = EXCLUDED.data_json,
                                source     = 'manual',
                                fetched_at = NOW()
                    """, (symbol, period, json.dumps(data)))
            except Exception as e:
                print(f'[financials/manual] db error: {e}')
                self.send_json(500, {'error': 'db_error'}); return
            data['source']    = 'manual'
            data['fetchedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.send_json(200, data)

        elif path == '/api/analyze':
            username = get_username(self)
            if not username:
                self.send_json(401, {'error': 'unauthorized'}); return
            body = self.read_json(max_size=1024)
            if not body:
                self.send_json(400, {'error': 'invalid_json'}); return
            symbol = body.get('symbol', '')
            period = body.get('period', '')
            company_name = str(body.get('companyName', '')).strip()[:120]
            force = body.get('force', False)
            import re as _re
            if not _re.match(r'^[A-Z0-9.\-]{1,15}$', symbol) or period not in ('annual', 'quarterly'):
                self.send_json(400, {'error': 'invalid_params'}); return

            # Check DB cache (skip if force=true)
            row = None
            if not force:
                try:
                    with _conn() as c, c.cursor() as cur:
                        cur.execute(
                            "SELECT analysis FROM financial_analyses WHERE symbol=%s AND period=%s AND created_at > NOW() - INTERVAL '7 days'",
                            (symbol, period)
                        )
                        row = cur.fetchone()
                except Exception as e:
                    print(f'[analyze] db error: {e}')
                    self.send_json(500, {'error': 'err_db'}); return

            if row:
                cached_text = row[0]
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('X-Accel-Buffering', 'no')
                self.send_header('Access-Control-Allow-Origin', self._cors_origin())
                self.end_headers()
                for i in range(0, len(cached_text), 50):
                    chunk = cached_text[i:i+50]
                    self.wfile.write(f'data: {json.dumps({"text": chunk})}\n\n'.encode('utf-8'))
                    self.wfile.flush()
                self.wfile.write(b'data: [DONE]\n\n')
                self.wfile.flush()
                return

            # Fetch financial data from DB
            try:
                with _conn() as c, c.cursor() as cur:
                    cur.execute(
                        "SELECT data_json FROM financials WHERE symbol=%s AND period=%s ORDER BY fetched_at DESC LIMIT 1",
                        (symbol, period)
                    )
                    fin_row = cur.fetchone()
            except Exception as e:
                print(f'[analyze] db error fetching financials: {e}')
                self.send_json(500, {'error': 'err_db'}); return

            if not fin_row:
                self.send_json(404, {'error': 'err_no_financials'}); return

            api_key = os.environ.get('GROQ_API_KEY', '').strip()
            if not api_key:
                self.send_json(503, {'error': 'err_no_groq_key'}); return

            fin_data = fin_row[0] if isinstance(fin_row[0], dict) else json.loads(fin_row[0])
            currency = fin_data.get('currency', 'PLN')
            # Build prompt
            company_display = f'{company_name} ({symbol})' if company_name else symbol
            system_prompt = (
                'Jesteś profesjonalnym analitykiem giełdowym (Equity Research Analyst) specjalizującym się w GPW i rynkach europejskich. '
                'Przeprowadzasz rygorystyczną analizę fundamentalną spółki na podstawie danych finansowych. '
                'Bądź krytyczny, szukaj anomalii, unikaj ogólników. '
                'Skup się na liczbach, trendach i faktach — ale zawsze osadzaj analizę w kontekście branży i makroekonomii. '
                'Sektor i branżę spółki MUSISZ wywnioskować z jej pełnej nazwy — nie zgaduj na podstawie skrótu giełdowego. '
                'Oceń perspektywy wzrostu całej branży, wskaż strukturalne trendy, czynniki napędowe i zagrożenia sektorowe. '
                'Odpowiadaj wyłącznie w języku polskim. '
                'Używaj profesjonalnego słownictwa finansowego. '
                'Formatuj odpowiedź w Markdownie.'
            )
            user_prompt = (
                f'Dane finansowe spółki {company_display} (dane {period}, waluta: {currency}):\n\n'
                f'{json.dumps(fin_data, ensure_ascii=False)}\n\n'
                'Wygeneruj raport według struktury:\n\n'
                '### 1. TEZA INWESTYCYJNA, FOSA I PERSPEKTYWY BRANŻY\n'
                '(zidentyfikuj sektor/branżę, oceń perspektywy wzrostu całej branży, wskaż moat spółki na tle sektora)\n'
                '### 2. ANALIZA PRZYCHODÓW I MARŻ\n'
                '### 3. ZDROWIE BILANSU I ZADŁUŻENIE\n'
                '### 4. JAKOŚĆ PRZEPŁYWÓW GOTÓWKOWYCH\n'
                '### 5. WYCENA I CZERWONE FLAGI'
            )

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('X-Accel-Buffering', 'no')
            self.send_header('Access-Control-Allow-Origin', self._cors_origin())
            self.end_headers()

            full_text = []
            try:
                from groq import Groq as _GroqClient, RateLimitError as _RateLimitError
                client = _GroqClient(api_key=api_key)
                stream = client.chat.completions.create(
                    messages=[
                        {'role': 'system', 'content': system_prompt},
                        {'role': 'user', 'content': user_prompt},
                    ],
                    model='llama-3.3-70b-versatile',
                    max_tokens=2000,
                    stream=True,
                )
                for chunk in stream:
                    text = chunk.choices[0].delta.content or ''
                    if text:
                        full_text.append(text)
                        self.wfile.write(f'data: {json.dumps({"text": text})}\n\n'.encode('utf-8'))
                        self.wfile.flush()
            except Exception as e:
                from groq import RateLimitError as _RateLimitError
                err_key = 'err_rate_limit' if isinstance(e, _RateLimitError) else 'err_groq_failed'
                debug_info = f'{type(e).__name__}: {str(e)[:150]}'
                print(f'[analyze] groq error: {debug_info}')
                self.wfile.write(f'data: {json.dumps({"error": err_key, "debug": debug_info})}\n\n'.encode('utf-8'))
                self.wfile.flush()
                self.wfile.write(b'data: [DONE]\n\n')
                self.wfile.flush()
                return

            self.wfile.write(b'data: [DONE]\n\n')
            self.wfile.flush()

            # Cache to DB
            if full_text:
                analysis_text = ''.join(full_text)
                try:
                    with _conn() as c, c.cursor() as cur:
                        cur.execute(
                            """INSERT INTO financial_analyses (symbol, period, analysis, created_at)
                               VALUES (%s, %s, %s, NOW())
                               ON CONFLICT (symbol, period) DO UPDATE
                               SET analysis = EXCLUDED.analysis, created_at = NOW()""",
                            (symbol, period, analysis_text)
                        )
                except Exception as e:
                    print(f'[analyze] db cache write error: {e}')

        else:
            self.send_response(405); self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


# ── START ──────────────────────────────────────────────────────────────────────

def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80)); return s.getsockname()[0]
    except Exception:
        return 'localhost'
    finally:
        s.close()


# ── DAILY SNAPSHOT SCHEDULER ──────────────────────────────────────────────────

def _fetch_prices_batch(symbols):
    """Batch price fetch via YF v7/finance/quote. Works for US/global stocks."""
    if not symbols:
        return {}
    url = ('https://query1.finance.yahoo.com/v7/finance/quote'
           f'?symbols={urllib.parse.quote(",".join(symbols))}'
           '&fields=regularMarketPrice')
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
        result = {}
        for q in data.get('quoteResponse', {}).get('result', []):
            sym = q.get('symbol', '')
            price = q.get('regularMarketPrice')
            if sym and price is not None:
                result[sym] = float(price)
        return result
    except Exception as e:
        print(f'[snapshot] v7/quote batch error: {e}')
        return {}


def _fetch_price_chart(symbol):
    """Single price via YF v8/chart — works for .WA stocks from Render IP."""
    url = (f'https://query1.finance.yahoo.com/v8/finance/chart/'
           f'{urllib.parse.quote(symbol)}?interval=1d&range=1d')
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
    })
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            data = json.loads(r.read().decode())
        meta = (data.get('chart', {}).get('result') or [{}])[0].get('meta', {})
        price = meta.get('regularMarketPrice') or meta.get('chartPreviousClose')
        return float(price) if price else None
    except Exception as e:
        print(f'[snapshot] chart price error {symbol}: {e}')
        return None


def _fetch_all_prices(symbols):
    """
    Fetch prices for all symbols.
    Step 1: batch v7/quote (fast, handles US/global).
    Step 2: individual v8/chart fallback for any still missing (handles .WA).
    """
    prices = {}
    for i in range(0, len(symbols), 20):
        prices.update(_fetch_prices_batch(symbols[i:i + 20]))

    missing = [s for s in symbols if s not in prices]
    if missing:
        print(f'[snapshot] Chart fallback for {len(missing)} symbols: {missing}')
        for sym in missing:
            p = _fetch_price_chart(sym)
            if p is not None:
                prices[sym] = p

    return prices


def _run_daily_snapshots():
    """Compute and save today's portfolio snapshots for ALL portfolios in the DB."""
    if not DATABASE_URL:
        return
    today = datetime.date.today().isoformat()
    print(f'[snapshot] Starting daily snapshot job — {today}')
    try:
        with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id FROM portfolio_list")
            all_pids = [r['id'] for r in cur.fetchall()]

        if not all_pids:
            print('[snapshot] No portfolios — skipping')
            return

        # Load holdings for each portfolio, collect all unique symbols
        pid_holdings = {}
        all_symbols = set()
        for pid in all_pids:
            with _conn() as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "SELECT symbol, qty, avg_price FROM portfolio_holdings "
                    "WHERE portfolio_id=%s AND qty>0",
                    (pid,)
                )
                holdings = list(cur.fetchall())
            pid_holdings[pid] = holdings
            for h in holdings:
                all_symbols.add(h['symbol'])

        if not all_symbols:
            print('[snapshot] No holdings found — skipping')
            return

        # Fetch prices with .WA fallback
        prices = _fetch_all_prices(list(all_symbols))
        print(f'[snapshot] Prices fetched: {len(prices)}/{len(all_symbols)} symbols')

        # Compute and upsert snapshot per portfolio
        saved = 0
        skipped = []
        for pid in all_pids:
            holdings = pid_holdings.get(pid, [])
            priced   = [h for h in holdings if h['symbol'] in prices]
            if not priced:
                skipped.append(pid)
                continue
            total    = sum(float(h['qty']) * prices[h['symbol']] for h in priced)
            invested = sum(float(h['qty']) * float(h['avg_price']) for h in priced)
            if total <= 0:
                skipped.append(pid)
                continue
            with _conn() as conn, conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO portfolio_snapshots (portfolio_id, date, total, invested)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (portfolio_id, date) DO UPDATE
                        SET total=EXCLUDED.total, invested=EXCLUDED.invested
                """, (pid, today, total, invested))
            saved += 1

        if skipped:
            print(f'[snapshot] WARNING — {len(skipped)} portfolios skipped '
                  f'(no prices available): {skipped}')
        print(f'[snapshot] Done — {saved}/{len(all_pids)} portfolios saved for {today}')

        # Refresh stale financial data for all portfolio symbols in a background thread
        import threading as _threading
        _threading.Thread(
            target=_refresh_financials_background,
            args=(list(all_symbols),),
            daemon=True,
            name='financials-daily-refresh'
        ).start()
        print(f'[snapshot] Financials refresh started for {len(all_symbols)} symbols')

    except Exception as e:
        import traceback
        print(f'[snapshot] Error: {e}\n{traceback.format_exc()}')


def _snapshot_scheduler():
    """
    Daemon thread: sleep until 22:00 Warsaw time, take snapshots, repeat daily.
    On startup: if server restarted after 22:00 and today has no snapshots, catch up.
    The outer loop catches all exceptions so the thread never dies silently.
    """
    # Catch-up: handle server restart after 22:00
    try:
        now_utc  = datetime.datetime.now(datetime.timezone.utc)
        offset_h = 2 if 4 <= now_utc.month <= 10 else 1
        hour_waw = (now_utc.hour + offset_h) % 24
        if hour_waw >= 22:
            today = datetime.date.today().isoformat()
            with _conn() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM portfolio_snapshots WHERE date=%s", (today,)
                )
                count = cur.fetchone()[0]
            if count == 0:
                print('[snapshot] Catchup: restarted after 22:00, no snapshot today — running now')
                _run_daily_snapshots()
    except Exception as e:
        print(f'[snapshot] catchup check error: {e}')

    while True:
        try:
            now_utc  = datetime.datetime.now(datetime.timezone.utc)
            offset_h = 2 if 4 <= now_utc.month <= 10 else 1
            now_waw  = now_utc + datetime.timedelta(hours=offset_h)
            target   = now_waw.replace(hour=22, minute=0, second=0, microsecond=0)
            if now_waw >= target:
                target += datetime.timedelta(days=1)
            wait_s = (target - now_waw).total_seconds()
            print(f'[snapshot] Next run in {wait_s/3600:.1f}h '
                  f'({target.strftime("%Y-%m-%d %H:%M")} Warsaw)')
            time.sleep(wait_s)
            _run_daily_snapshots()
        except Exception as e:
            print(f'[snapshot] scheduler loop error: {e} — retrying in 5 min')
            time.sleep(300)


if __name__ == '__main__':
    if DATABASE_URL:
        import threading as _threading
        _snap_thread = _threading.Thread(
            target=_snapshot_scheduler, daemon=True, name='snapshot-scheduler'
        )
        _snap_thread.start()
        # On startup: proactively refresh financial data for all portfolio stocks
        _threading.Thread(
            target=_refresh_financials_background,
            daemon=True, name='financials-startup'
        ).start()

    server = HTTPServer(('0.0.0.0', PORT), Handler)
    ip = local_ip()
    print('StocksTracker server działa:')
    print(f'  Komputer : http://localhost:{PORT}/myfund.html')
    print(f'  Telefon  : http://{ip}:{PORT}/myfund.html')
    if DATABASE_URL:
        print('  Baza     : Neon PostgreSQL ✓')
    else:
        print('  Baza     : pliki lokalne (brak .env / DATABASE_URL)')
    print('Ctrl+C aby zatrzymać.')
    server.serve_forever()
