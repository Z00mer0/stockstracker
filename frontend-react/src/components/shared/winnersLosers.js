// Kogo pokazać w „Wygrani i przegrani": 4 najlepsze + do 3 najgorszych ze
// stratą. `sorted` — malejąco po _plPct. Najgorsze bierzemy dopiero za
// czwórką najlepszych: przy mniej niż 7 pozycjach obie grupy nachodziły na
// siebie i ta sama spółka pojawiała się dwa razy.
export function pickWinnersLosers(sorted) {
  const top = sorted.slice(0, 4);
  const bottom = sorted.slice(Math.max(4, sorted.length - 3)).filter(p => p._plPct < 0);
  return [...top, ...bottom];
}
