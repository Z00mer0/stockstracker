// Gest na uchwycie arkusza (telefon): przeciągnięcie w dół zamyka, w górę
// rozwija na pełny ekran, z pełnego ekranu w dół — wraca do zwykłej wysokości.
// Krótkie, szybkie machnięcie liczy się tak samo jak długie przeciągnięcie.
//   dy        — przesunięcie palca w px (dodatnie = w dół)
//   velocity  — px/ms na końcu gestu (dodatnie = w dół)
//   → 'close' | 'expand' | 'collapse' | 'stay'
export const DRAG_DISTANCE = 90;
export const FLICK_VELOCITY = 0.6;

export function sheetGestureResult({ dy, velocity = 0, expanded, dismissible = true }) {
  const down = dy > DRAG_DISTANCE || (dy > 20 && velocity > FLICK_VELOCITY);
  const up = dy < -DRAG_DISTANCE / 2 || (dy < -20 && velocity < -FLICK_VELOCITY);
  if (down) return expanded ? 'collapse' : dismissible ? 'close' : 'stay';
  if (up && !expanded) return 'expand';
  return 'stay';
}
