// src/context/ChartContext.jsx
import React, { createContext, useContext, useState } from 'react';
import AdvancedPriceChart from '../components/AdvancedPriceChart';

const ChartContext = createContext(null);

export function ChartProvider({ children }) {
  const [symbol, setSymbol] = useState(null);

  return (
    <ChartContext.Provider value={{ openChart: setSymbol }}>
      {children}
      {symbol && (
        <AdvancedPriceChart symbol={symbol} onClose={() => setSymbol(null)} />
      )}
    </ChartContext.Provider>
  );
}

export function useChart() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error('useChart musi być użyty wewnątrz ChartProvider');
  return ctx;
}
