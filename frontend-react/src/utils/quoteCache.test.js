import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cachedQuote, _clearQuoteCache } from '../../../api/_quoteCache.js';

describe('cachedQuote', () => {
  beforeEach(() => _clearQuoteCache());

  it('drugie żądanie w ciągu minuty nie odpytuje źródła', async () => {
    const fetcher = vi.fn(async () => ({ quote: { regularMarketPrice: 100 } }));
    await cachedQuote('AAPL', fetcher, 0);
    const v = await cachedQuote('AAPL', fetcher, 59_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(v.quote.regularMarketPrice).toBe(100);
  });

  it('równoczesne żądania czekają na jedno pobranie', async () => {
    const fetcher = vi.fn(async () => ({ stooq: true, price: 5 }));
    const [a, b] = await Promise.all([cachedQuote('PKN.WA', fetcher, 0), cachedQuote('PKN.WA', fetcher, 0)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('po minucie pobiera od nowa', async () => {
    const fetcher = vi.fn(async () => ({ stooq: true, price: 5 }));
    await cachedQuote('PKN.WA', fetcher, 0);
    await cachedQuote('PKN.WA', fetcher, 60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('błędu przejściowego (null) nie zapamiętuje', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ stooq: true, price: 7 });
    expect(await cachedQuote('MSFT', fetcher, 0)).toBeNull();
    expect((await cachedQuote('MSFT', fetcher, 1_000)).price).toBe(7);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('osobne symbole mają osobne wpisy', async () => {
    const fetcher = vi.fn(async sym => ({ stooq: true, price: sym.length }));
    expect((await cachedQuote('A', fetcher, 0)).price).toBe(1);
    expect((await cachedQuote('AB', fetcher, 0)).price).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
