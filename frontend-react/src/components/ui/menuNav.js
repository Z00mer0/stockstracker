// Czysta logika menu rozwijanego (Menu.jsx) — do testów bez przeglądarki.

const MARGIN = 8;

// Gdzie narysować menu przy przycisku. Domyślnie pod spodem; gdy się nie
// mieści, nad przyciskiem; gdy nie mieści się nigdzie — tak nisko, jak się
// da bez wychodzenia za ekran. W poziomie trzyma się krawędzi przycisku
// (lewej albo prawej), ale nigdy nie wystaje poza okno.
export function placeMenu(trigger, menu, viewport, align = 'left', gap = 4) {
  const below = trigger.bottom + gap;
  const above = trigger.top - gap - menu.height;
  let top;
  if (below + menu.height <= viewport.height - MARGIN) top = below;
  else if (above >= MARGIN) top = above;
  else top = Math.max(MARGIN, viewport.height - MARGIN - menu.height);

  let left = align === 'right' ? trigger.right - menu.width : trigger.left;
  left = Math.max(MARGIN, Math.min(left, viewport.width - MARGIN - menu.width));
  return { top, left };
}

// Strzałki po pozycjach menu z zawijaniem; `focusable` to indeksy pozycji,
// które mogą dostać fokus (bez nagłówków, separatorów i wyłączonych).
export function nextMenuIndex(current, focusable, key) {
  if (!focusable.length) return null;
  const pos = focusable.indexOf(current);
  switch (key) {
    case 'ArrowDown': return focusable[(pos + 1) % focusable.length];
    case 'ArrowUp':   return focusable[pos <= 0 ? focusable.length - 1 : pos - 1];
    case 'Home':      return focusable[0];
    case 'End':       return focusable[focusable.length - 1];
    default:          return null;
  }
}
