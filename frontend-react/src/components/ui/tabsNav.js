// Ruch strzałkami po zakładkach (wzorzec WAI-ARIA „tabs"): strzałki w bok
// z zawijaniem, Home/End na skraje. Zwraca null dla innych klawiszy.
export function nextTabIndex(index, count, key) {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight': return (index + 1) % count;
    case 'ArrowLeft':  return (index - 1 + count) % count;
    case 'Home':       return 0;
    case 'End':        return count - 1;
    default:           return null;
  }
}
