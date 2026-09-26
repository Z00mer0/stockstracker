import { forwardRef } from 'react';
import { cx } from './cx.js';
import Spinner from './Spinner.jsx';

// Tekst na czerwieni to kolor tła strony, nie biel: w ciemnym motywie
// czerwień jest jasna (#f87171) i biały napis miał na niej kontrast 2,8.
const VARIANT = {
  primary:   'bg-accent text-accent-fg border-accent hover:brightness-110',
  secondary: 'bg-panel-2 text-fg border-line hover:bg-panel-hover hover:border-line-strong',
  ghost:     'bg-transparent text-dim border-transparent hover:bg-panel-hover hover:text-fg',
  danger:    'bg-down text-bg border-down hover:brightness-110',
};

const SIZE = {
  sm: 'h-8 px-3 gap-1.5 text-small',
  md: 'h-9 px-4 gap-2 text-[13px]',
  lg: 'h-11 px-5 gap-2 text-sm',
};

const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex select-none items-center justify-center whitespace-nowrap rounded-card-sm border font-semibold',
        'transition duration-100 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        VARIANT[variant], SIZE[size], className,
      )}
      {...rest}
    >
      {loading ? <Spinner size="sm" /> : Icon && <Icon size={size === 'sm' ? 14 : 16} aria-hidden />}
      {children}
    </button>
  );
});

export default Button;
