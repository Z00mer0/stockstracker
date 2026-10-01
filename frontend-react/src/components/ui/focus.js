// Czysta logika pułapki fokusu dla Modal — wydzielona, żeby dało się ją
// przetestować bez przeglądarki.

export const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// Dokąd przenieść fokus po Tab. `index` to pozycja aktywnego elementu wśród
// fokusowalnych (-1, gdy fokus jest poza nimi, np. na samym panelu).
// Zwraca indeks docelowy, -1 gdy nie ma dokąd (fokus zostaje na panelu),
// albo null — wtedy przeglądarka robi swoje, bo ruch nie wychodzi poza okno.
export function trapTarget(index, count, shift) {
  if (count === 0) return -1;
  if (shift) return index <= 0 ? count - 1 : null;
  return index === -1 || index >= count - 1 ? 0 : null;
}
