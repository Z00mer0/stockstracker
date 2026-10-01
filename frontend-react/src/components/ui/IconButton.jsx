import { forwardRef } from 'react';
import { cx } from './cx.js';

// `label` jest obowiązkowy: przycisk z samą ikoną bez nazwy jest dla
// czytnika ekranu pustym „przyciskiem". Ten sam tekst idzie do dymka.
const SIZE = { sm: 'h-8 w-8', md: 'h-9 w-9' };

const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size = 'md', active = false, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-card-sm border transition duration-100',
        active
          ? 'border-line-strong bg-panel-hover text-fg'
          : 'border-transparent text-dim hover:border-line hover:bg-panel-hover hover:text-fg',
        SIZE[size], className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 15 : 17} aria-hidden />
    </button>
  );
});

export default IconButton;
