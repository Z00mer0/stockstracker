import { cloneElement, isValidElement, useId } from 'react';
import { cx } from './cx.js';

// Dymek na najechanie i na fokus klawiatury. Proste CSS, bez pozycjonowania
// w JS — wystarcza przy krótkich podpowiedziach; w kontenerze z
// overflow: hidden dymek może zostać przycięty, wtedy `side="bottom"`.
export default function Tooltip({ content, side = 'top', className, children }) {
  const id = useId();
  return (
    <span className={cx('group relative inline-flex', className)}>
      {isValidElement(children) ? cloneElement(children, { 'aria-describedby': id }) : children}
      <span
        role="tooltip"
        id={id}
        className={cx(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-[240px] -translate-x-1/2 rounded-card-sm border border-line bg-panel-2 px-2.5 py-1.5',
          'text-small font-normal normal-case tracking-normal text-fg shadow-pop',
          'opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
