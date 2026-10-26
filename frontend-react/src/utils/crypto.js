// Rozpoznawanie kryptowalut — wspólne dla notowań i PIT-38.
export const CRYPTO_SYMBOLS = new Set([
  'BTC','ETH','SOL','BNB','XRP','ADA','DOGE','MATIC','DOT','SHIB',
  'AVAX','LINK','UNI','LTC','BCH','ATOM','XLM','NEAR','APT','ARB',
  'OP','INJ','SUI','TRX','TON','PEPE','WIF',
]);

// Symbol z listy, para w stylu Yahoo (BTC-USD) albo symbol oznaczony jako
// krypto w pozycjach (`extra`, np. własny token dodany w oknie krypto).
export function isCryptoSymbol(symbol, extra) {
  const s = String(symbol ?? '').toUpperCase();
  return CRYPTO_SYMBOLS.has(s) || /-(USD|USDT|USDC|EUR|PLN)$/.test(s) || !!extra?.has(s);
}
