import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx.js';
import { controlClass } from './Input.jsx';

// Natywny <select> — na telefonie otwiera systemowy wybierak, który jest
// wygodniejszy niż każda lista rysowana w przeglądarce.
const Select = forwardRef(function Select({ className, children, ...rest }, ref) {
  return (
    <div className={cx('relative', className)}>
      <select ref={ref} className={cx(controlClass, 'cursor-pointer appearance-none pr-9')} {...rest}>
        {children}
      </select>
      <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
    </div>
  );
});

export default Select;
