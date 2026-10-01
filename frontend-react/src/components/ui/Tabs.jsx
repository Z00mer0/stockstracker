import { useRef } from 'react';
import { cx } from './cx.js';
import { nextTabIndex } from './tabsNav.js';

// Zakładki sekcji strony (np. Analiza: Ryzyko / Alokacja / Podatki).
// Do przełączania widoku jednej karty (1T…MAX) dalej służy SegmentedControl.
//
// `id` spina zakładki z panelami: <Tabs id="an" …/> + <TabPanel tabsId="an" value="risk">.
export default function Tabs({ id, tabs, value, onChange, className }) {
  const refs = useRef([]);

  function onKeyDown(e, index) {
    const next = nextTabIndex(index, tabs.length, e.key);
    if (next == null) return;
    e.preventDefault();
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" className={cx('no-scrollbar flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((tab, i) => {
        const selected = tab.value === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.value}
            ref={el => { refs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${id}-tab-${tab.value}`}
            aria-controls={`${id}-panel-${tab.value}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={e => onKeyDown(e, i)}
            className={cx(
              '-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-[13px] font-medium transition',
              selected ? 'border-accent text-fg' : 'border-transparent text-dim hover:text-fg',
            )}
          >
            {Icon && <Icon size={15} aria-hidden />}
            {tab.label}
            {tab.count != null && (
              <span className={cx('rounded-full px-1.5 text-[11px] font-semibold', selected ? 'bg-accent text-accent-fg' : 'bg-panel-2 text-faint')}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ tabsId, value, className, children }) {
  return (
    <div role="tabpanel" id={`${tabsId}-panel-${value}`} aria-labelledby={`${tabsId}-tab-${value}`} tabIndex={0} className={cx('outline-none', className)}>
      {children}
    </div>
  );
}
