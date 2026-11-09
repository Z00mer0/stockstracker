import { useEffect, useMemo, useState } from 'react';
import { fetchCpiSeries, valueBond } from '../services/bondService';

// Wartość obligacji skarbowych (nominał + narosłe odsetki) w złotych — do
// „Majątku łącznego”, tak jak inne aktywa. Do czasu wczytania inflacji 0,
// żeby suma nie skakała między wyceną bez inflacji a z nią.
export default function useBondsValue(bonds = []) {
  const [cpiMap, setCpiMap] = useState(null);
  useEffect(() => {
    if (!bonds.length || cpiMap) return;
    let cancelled = false;
    fetchCpiSeries().then(m => { if (!cancelled) setCpiMap(m); });
    return () => { cancelled = true; };
  }, [bonds.length, cpiMap]);
  return useMemo(
    () => (cpiMap ? bonds.reduce((s, b) => s + valueBond(b, cpiMap).totalValue, 0) : 0),
    [bonds, cpiMap],
  );
}
