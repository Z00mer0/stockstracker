import { forwardRef } from 'react';
import { cx } from './cx.js';

export const controlClass = cx(
  'h-9 w-full rounded-card-sm border border-line bg-panel-2 px-3 text-body text-fg',
  'placeholder:text-faint transition duration-100',
  'hover:border-line-strong focus:border-accent focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-down',
);

// `icon` po lewej (np. lupa), `suffix` po prawej (np. „zł", „%").
const Input = forwardRef(function Input({ icon: Icon, suffix, className, ...rest }, ref) {
  if (!Icon && !suffix) return <input ref={ref} className={cx(controlClass, className)} {...rest} />;
  return (
    <div className={cx('relative', className)}>
      {Icon && <Icon size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />}
      <input ref={ref} className={cx(controlClass, Icon && 'pl-9', suffix && 'pr-12 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')} {...rest} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-small text-faint">{suffix}</span>}
    </div>
  );
});

export default Input;
