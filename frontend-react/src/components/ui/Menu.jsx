import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { cx } from './cx.js';
import { placeMenu, nextMenuIndex } from './menuNav.js';

// Menu rozwijane spod przycisku: filtry, eksport, „+ Dodaj", menu ⋯ przy
// pozycji. Wcześniej każde było pisane od nowa, z hoverem przez
// onMouseEnter/onMouseLeave i bez obsługi klawiatury.
//
// - rysowane w portalu z position: fixed — nie ucina go karta z
//   overflow: hidden ani tabela przewijana w bok,
// - pod przyciskiem albo nad nim, zależnie od miejsca na ekranie,
// - klik obok, Esc i Tab zamykają; przy przewijaniu menu jedzie za
//   przyciskiem; strzałki chodzą po pozycjach, Esc oddaje fokus przyciskowi.
//
// items: { label, icon?, onSelect, danger?, disabled?, title?, hint?,
//          checked? (pozycja z ptaszkiem), swatch? (kolorowa kropka),
//          keepOpen? (nie zamykaj po wyborze — np. filtry) }
//        | { heading: 'tekst' } | { separator: true }
export default function Menu({ trigger, items, align = 'left', width = 208, label }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const id = useId();

  const close = useCallback(focusTrigger => {
    setOpen(false);
    setPos(null);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  // Pozycja liczona po pierwszym renderze, gdy znamy już rozmiar menu.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !triggerRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    setPos(placeMenu(t, { width: m.width, height: m.height }, { width: window.innerWidth, height: window.innerHeight }, align));
  }, [open, align]);

  const focusable = items.map((it, i) => (it && !it.heading && !it.separator && !it.disabled ? i : -1)).filter(i => i >= 0);

  useEffect(() => {
    if (open && pos && focusable.length) itemRefs.current[focusable[0]]?.focus();
    // Tylko przy otwarciu (pos pojawia się raz) — nie przy każdym renderze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos != null]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = e => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      close(false);
    };
    // Przewijanie nie zamyka menu, tylko przesuwa je za przyciskiem —
    // zamykanie przy każdym scrollu gasiło menu otwarte w trakcie płynnego
    // przewijania (np. stuknięcie tuż po geście na telefonie). Zamykamy
    // dopiero, gdy przycisk wyjedzie poza ekran.
    const onScroll = e => {
      if (menuRef.current?.contains(e.target)) return;
      const t = triggerRef.current?.getBoundingClientRect();
      if (!t || t.bottom < 0 || t.top > window.innerHeight) { close(false); return; }
      const m = menuRef.current?.getBoundingClientRect();
      if (m) setPos(placeMenu(t, { width: m.width, height: m.height }, { width: window.innerWidth, height: window.innerHeight }, align));
    };
    const onResize = () => close(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, align]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    const current = itemRefs.current.indexOf(document.activeElement);
    const next = nextMenuIndex(current, focusable, e.key);
    if (next != null) { e.preventDefault(); itemRefs.current[next]?.focus(); }
  }

  const triggerEl = cloneElement(trigger, {
    ref: triggerRef,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    onClick: e => { trigger.props.onClick?.(e); open ? close(false) : setOpen(true); },
  });

  return (
    <>
      {triggerEl}
      {open && createPortal(
        <div
          ref={menuRef}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width, visibility: pos ? 'visible' : 'hidden' }}
          className="ui-menu z-[400] max-h-[70vh] overflow-y-auto rounded-card-sm border border-line bg-panel p-1 shadow-pop"
        >
          {items.map((item, i) => {
            if (!item) return null;
            if (item.separator) return <div key={i} role="separator" className="mx-1 my-1 h-px bg-line" />;
            if (item.heading) return <div key={i} className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{item.heading}</div>;
            const Icon = item.icon;
            const isCheck = item.checked !== undefined;
            return (
              <button
                key={i}
                ref={el => { itemRefs.current[i] = el; }}
                type="button"
                role={isCheck ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={isCheck ? Boolean(item.checked) : undefined}
                tabIndex={-1}
                disabled={item.disabled}
                title={item.title}
                onClick={() => { item.onSelect?.(); if (!item.keepOpen) close(true); }}
                className={cx(
                  'flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-[13px] outline-none transition-colors',
                  'hover:bg-panel-hover focus:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
                  item.danger ? 'text-down' : 'text-fg',
                )}
              >
                {isCheck && <Check size={14} aria-hidden className={cx('shrink-0 text-accent-text', !item.checked && 'invisible')} />}
                {Icon && <Icon size={15} aria-hidden className={cx('shrink-0', !item.danger && 'text-dim')} />}
                {item.swatch && <span aria-hidden className="h-2 w-2 shrink-0 rounded-sm" style={{ background: item.swatch }} />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && <span className="shrink-0 text-[11px] text-faint">{item.hint}</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
