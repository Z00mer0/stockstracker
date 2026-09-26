import { cx } from './cx.js';

// Szary kształt w miejscu treści, która się ładuje — strona nie skacze,
// gdy dane dojdą, a użytkownik widzi, co się pojawi.
export default function Skeleton({ className, rounded = 'rounded-card-sm' }) {
  return <span aria-hidden className={cx('block animate-pulse bg-panel-2', rounded, className)} />;
}
