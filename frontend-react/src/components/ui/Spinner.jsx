import { cx } from './cx.js';

const SIZE = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };

// Bez `label` kręciołek jest ozdobą (np. w przycisku, który sam ma
// aria-busy); z `label` ogłasza czytnikowi ekranu, co się ładuje.
export default function Spinner({ size = 'md', label, className }) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cx('inline-block shrink-0 animate-spin rounded-full border-2 border-line border-t-accent', SIZE[size], className)}
    />
  );
}
