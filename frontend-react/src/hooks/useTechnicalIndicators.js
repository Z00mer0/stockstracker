// src/hooks/useTechnicalIndicators.js
import { useMemo } from 'react';
import { calcMA, calcEMA, calcRSI, calcMACD, calcBollingerBands } from '../utils/indicators.js';

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
