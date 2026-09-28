# Niezależna implementacja wskaźników (inny kod, te same definicje) — generuje
# indicators.fixture.json: python3 indicators.fixture.py > indicators.fixture.json
import json, math
closes = [100 + 10*math.sin(i/5) + i*0.3 + ((i*7919) % 13 - 6)*0.4 for i in range(80)]
def sma(x, n): return [None if i < n-1 else sum(x[i-n+1:i+1])/n for i in range(len(x))]
def ema(x, n):
    k = 2/(n+1); out = [None]*len(x); vals = [(i, v) for i, v in enumerate(x) if v is not None]
    if len(vals) < n: return out
    e = sum(v for _, v in vals[:n])/n; out[vals[n-1][0]] = e
    for i, v in vals[n:]: e = v*k + e*(1-k); out[i] = e
    return out
def rsi(x, n=14):
    out = [None]*len(x); d = [x[i]-x[i-1] for i in range(1, len(x))]
    g = sum(max(v, 0) for v in d[:n])/n; l = sum(max(-v, 0) for v in d[:n])/n
    out[n] = 100 - 100/(1 + g/l)
    for i in range(n+1, len(x)):
        v = d[i-1]; g = (g*(n-1) + max(v, 0))/n; l = (l*(n-1) + max(-v, 0))/n
        out[i] = 100 - 100/(1 + g/l)
    return out
e12, e26 = ema(closes, 12), ema(closes, 26)
macd = [a-b if a is not None and b is not None else None for a, b in zip(e12, e26)]
sig = ema(macd, 9)
m20 = sma(closes, 20)
bb = [None if m is None else (m + 2*math.sqrt(sum((v-m)**2 for v in closes[i-19:i+1])/20)) for i, m in enumerate(m20)]
print(json.dumps({'closes': closes, 'ma20': m20, 'ema21': ema(closes, 21), 'rsi': rsi(closes), 'macd': macd, 'signal': sig, 'bbUpper': bb}))
