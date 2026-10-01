// src/context/ChartContext.jsx
import { createContext, lazy, Suspense, useContext, useState } from 'react';

// Wykres zaawansowany dociągany dopiero przy otwarciu — nie obciąża
// pierwszego wczytania aplikacji.
const AdvancedPriceChart = lazy(() => import('../components/AdvancedPriceChart'));

const ChartContext = createContext(null);

export function ChartProvider({ children }) {
  const [symbol, setSymbol] = useState(null);

  return (
    <ChartContext.Provider value={{ openChart: setSymbol }}>
      {children}
      {symbol && (
        <Suspense fallback={null}>
          <AdvancedPriceChart symbol={symbol} onClose={() => setSymbol(null)} />
        </Suspense>
      )}
    </ChartContext.Provider>
  );
}

export function useChart() {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error('useChart musi być użyty wewnątrz ChartProvider');
  return ctx;
}
