import { useEffect, useMemo, useState } from 'react';
import { fetchFxRates } from './useFxBreakdown.js';
import { fxDatesNeeded } from '../utils/fxHistory.js';

// Kursy NBP z dni transakcji, wspólne dla wszystkich stron: raz pobrany
// kurs zostaje w pamięci do przeładowania aplikacji (kurs z danego dnia się
// nie zmienia). Do czasu pobrania obliczenia używają dzisiejszego kursu.
const cache = {};   // { USD: { date: rate } }

export function useHistoricalFx(transactions) {
  const need = useMemo(() => fxDatesNeeded(transactions), [transactions]);
  const missingKey = JSON.stringify(Object.entries(need)
    .map(([c, s]) => [c, [...s].filter(d => cache[c]?.[d] == null).sort()])
    .filter(([, d]) => d.length));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const missing = JSON.parse(missingKey);
    if (!missing.length) return;
    let cancelled = false;
    const jobs = [];
    for (const [ccy, dates] of missing) {
      for (let i = 0; i < dates.length; i += 400) {
        jobs.push(fetchFxRates(ccy, dates.slice(i, i + 400)).then(r => { cache[ccy] = { ...cache[ccy], ...r }; }));
      }
    }
    Promise.all(jobs).then(() => { if (!cancelled) setVersion(v => v + 1); });
    return () => { cancelled = true; };
  }, [missingKey]);

  // Nowy obiekt po każdym pobraniu, żeby zależne useMemo się przeliczyły.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ ...cache }), [version, missingKey]);
}
