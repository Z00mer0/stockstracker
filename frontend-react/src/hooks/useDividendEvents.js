import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'myfund_manual_dividends';

// Odczytaj ręczne dywidendy z localStorage
function loadManual() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

// Zapisz ręczne dywidendy do localStorage
function saveManual(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

// Skonwertuj ręczny wpis na format zdarzenia kalendarza (ex-date = główna data)
function toCalendarEvent(div) {
  return {
    date:     div.exDate,
    type:     'DIV',
    symbol:   div.symbol,
    amount:   div.amount,
    currency: div.currency,
    payDate:  div.payDate,
    note:     div.note,
    isManual: true,
    id:       div.id,
  };
}

// Pobierz nadchodzące dywidendy US z backendu (Finnhub)
async function fetchAutoUS(usSymbols) {
  if (!usSymbols.length) return [];
  try {
    const res = await fetch(
      `/api/dividends/upcoming?symbols=${usSymbols.join(',')}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.map(d => ({
      date:     d.exDate,
      type:     'DIV',
      symbol:   d.symbol,
      amount:   d.amount,
      currency: d.currency ?? 'USD',
      payDate:  d.payDate,
      isManual: false,
    }));
  } catch (err) {
    console.warn('[dividends] auto US fetch failed:', err.message);
    return [];
  }
}

/**
 * Hook łączący ręczne dywidendy (localStorage) z automatycznymi (Finnhub US).
 * @param {string[]} portfolioSymbols - wszystkie symbole z portfela
 * @returns {{ manualDividends, autoEvents, allCalendarEvents, loading,
 *             addDividend, editDividend, deleteDividend }}
 */
export default function useDividendEvents(portfolioSymbols = []) {
  const [manualDividends, setManualDividends] = useState(loadManual);
  const [autoEvents, setAutoEvents]           = useState([]);
  const [loading, setLoading]                 = useState(false);

  // Pobierz auto-dywidendy US przy zmianie portfela
  useEffect(() => {
    const usSymbols = portfolioSymbols.filter(s => !s.includes('.'));
    if (!usSymbols.length) { setAutoEvents([]); return; }

    let cancelled = false;
    setLoading(true);
    fetchAutoUS(usSymbols).then(evs => {
      if (!cancelled) { setAutoEvents(evs); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [portfolioSymbols.join(',')]);

  // Dodaj nową dywidendę ręczną
  const addDividend = useCallback((div) => {
    const entry = { ...div, id: Date.now().toString(), addedAt: new Date().toISOString().slice(0, 10), isManual: true };
    setManualDividends(prev => {
      const updated = [...prev, entry];
      saveManual(updated);
      return updated;
    });
  }, []);

  // Edytuj istniejącą dywidendę ręczną
  const editDividend = useCallback((id, changes) => {
    setManualDividends(prev => {
      const updated = prev.map(d => d.id === id ? { ...d, ...changes } : d);
      saveManual(updated);
      return updated;
    });
  }, []);

  // Usuń ręczną dywidendę
  const deleteDividend = useCallback((id) => {
    setManualDividends(prev => {
      const updated = prev.filter(d => d.id !== id);
      saveManual(updated);
      return updated;
    });
  }, []);

  // Wszystkie zdarzenia kalendarza: ręczne (exDate) + auto US
  const allCalendarEvents = [
    ...manualDividends.map(toCalendarEvent),
    ...autoEvents,
  ].sort((a, b) => a.date.localeCompare(b.date));

  return { manualDividends, autoEvents, allCalendarEvents, loading, addDividend, editDividend, deleteDividend };
}
