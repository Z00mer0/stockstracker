// src/hooks/useTechnicalIndicators.js
import { useMemo } from 'react';

function calcMA(closes, period) {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const result = new Array(values.length).fill(null);
  let ema = null;
  let seedCount = 0;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || isNaN(v)) continue;
    if (ema == null) {
      seedCount++;
      seedSum += v;
      if (seedCount === period) {
        ema = seedSum / period;
        result[i] = ema;
      }
    } else {
      ema = v * k + ema * (1 - k);
      result[i] = ema;
    }
  }
  return result;
}

function calcRSI(closes, period = 14) {
  const result = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = (avgGain === 0 && avgLoss === 0) ? null : 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = (avgGain === 0 && avgLoss === 0) ? null : 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  }
  return result;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = closes.map((_, i) =>
    ema12[i] != null && ema26[i] != null ? ema12[i] - ema26[i] : null
  );
  const signalLine = calcEMA(macdLine, 9);
  const histogram = closes.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? macdLine[i] - signalLine[i] : null
  );
  return { macd: macdLine, signal: signalLine, histogram };
}

function calcBollingerBands(closes, period = 20, mult = 2) {
  const middle = calcMA(closes, period);
  return closes.map((_, i) => {
    if (middle[i] == null) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    return { upper: mean + mult * sd, middle: mean, lower: mean - mult * sd };
  });
}

export function useTechnicalIndicators(candles) {
  return useMemo(() => {
    if (!candles.length) return { ma20: [], ma50: [], ema: [], rsi: [], macd: null, bb: [] };
    const closes = candles.map(c => c.close);
    return {
      ma20: calcMA(closes, 20),
      ma50: calcMA(closes, 50),
      ema:  calcEMA(closes, 21),
      rsi:  calcRSI(closes, 14),
      macd: calcMACD(closes),
      bb:   calcBollingerBands(closes),
    };
  }, [candles]);
}
