// Sortowanie tabel wydzielone z komponentu, żeby dało się je przetestować.

const isEmpty = v => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));

// Stabilne sortowanie. Puste wartości (brak kursu, brak danych) zawsze na
// końcu, niezależnie od kierunku — inaczej przy sortowaniu malejącym
// „—" lądowało na górze tabeli nad prawdziwymi liczbami.
export function sortRows(rows, getValue, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i, v: getValue(row) }))
    .sort((a, b) => {
      const ea = isEmpty(a.v), eb = isEmpty(b.v);
      if (ea || eb) return ea && eb ? a.i - b.i : ea ? 1 : -1;
      let c;
      if (typeof a.v === 'number' && typeof b.v === 'number') c = a.v - b.v;
      else if (a.v instanceof Date && b.v instanceof Date) c = a.v - b.v;
      else c = String(a.v).localeCompare(String(b.v), 'pl', { numeric: true, sensitivity: 'base' });
      return c === 0 ? a.i - b.i : sign * c;
    })
    .map(x => x.row);
}

// Klik w nagłówek: inna kolumna → jej kierunek startowy (kwoty zwykle
// malejąco — największe pozycje na górze), ta sama → odwrócenie.
export function nextSort(current, key, firstDir = 'asc') {
  if (!current || current.key !== key) return { key, dir: firstDir };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}
