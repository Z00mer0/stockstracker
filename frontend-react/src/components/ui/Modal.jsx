import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from './cx.js';
import IconButton from './IconButton.jsx';
import { FOCUSABLE, trapTarget } from './focus.js';
import { sheetGestureResult } from './sheetGesture.js';
import { useT } from '../../context/LanguageContext';

// Jedno okno dla całej aplikacji. Do tej pory 11 modali budowało własną
// nakładkę, każdy trochę inaczej: różne tła, promienie, zachowanie Esc,
// brak pułapki fokusu, a na telefonie okno na środku małego ekranu.
//
// - Esc i klik w tło zamykają (chyba że `dismissible={false}`),
// - Tab nie ucieka z okna, a po zamknięciu fokus wraca tam, skąd przyszedł,
// - na telefonie okno wyjeżdża od dołu jako arkusz (bottom sheet),
// - przy oknach zagnieżdżonych Esc zamyka tylko to na wierzchu,
// - na telefonie uchwyt arkusza: w dół zamyka, w górę pełny ekran
//   (z pełnego ekranu w dół — zwykła wysokość), stuknięcie przełącza.

const stack = [];

// full — prawie cały ekran (widok spółki „na pełnym ekranie"); na telefonie
// i tak jest arkuszem od dołu.
const WIDTH = {
  sm: 'md:max-w-sm', md: 'md:max-w-lg', lg: 'md:max-w-2xl', xl: 'md:max-w-4xl',
  full: 'md:h-[calc(100dvh-2rem)] md:max-h-none md:max-w-[calc(100vw-2rem)]',
};

export default function Modal({
  onClose, title, description, children, footer,
  size = 'md', role = 'dialog', dismissible = true, initialFocusRef, className,
}) {
  const t = useT();
  const panelRef = useRef(null);
  const titleId = useId();
  const descId = useId();
  // Najnowsze wartości propsów bez ponownego podpinania nasłuchu przy
  // każdym renderze rodzica.
  const latest = useRef({ onClose, dismissible });
  useEffect(() => { latest.current = { onClose, dismissible }; });
  const [expanded, setExpanded] = useState(false);
  const drag = useRef(null);
  const dragged = useRef(false);

  useEffect(() => {
    const opener = document.activeElement;
    const token = {};
    stack.push(token);
    const panel = panelRef.current;
    // Fokus startuje na pierwszym polu treści, nie na „✕" w nagłówku —
    // użytkownik otwiera okno, żeby coś wpisać, a nie żeby je zamknąć.
    const firstInBody = [...panel.querySelectorAll(FOCUSABLE)].find(el => !el.closest('[data-modal-close],[data-sheet-handle]'));
    (initialFocusRef?.current ?? firstInBody ?? panel).focus();

    function onKey(e) {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape' && latest.current.dismissible) {
        e.stopPropagation();
        latest.current.onClose?.();
      } else if (e.key === 'Tab') {
        // Uchwyt arkusza jest ukryty na komputerze — nie może łapać Tab.
        const els = [...panel.querySelectorAll(FOCUSABLE)].filter(el => !el.hasAttribute('data-sheet-handle') || el.offsetParent !== null);
        const target = trapTarget(els.indexOf(document.activeElement), els.length, e.shiftKey);
        if (target === -1) { e.preventDefault(); panel.focus(); }
        else if (target != null) { e.preventDefault(); els[target].focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
    // Celowo raz, przy otwarciu: fokus początkowy i powrót dotyczą życia okna,
    // a nie kolejnych renderów.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Uchwyt arkusza (telefon) ──────────────────────────────────────────────
  // Arkusz jedzie za palcem (w górę z oporem); decyzję po puszczeniu podejmuje
  // sheetGestureResult. Transform ustawiany bezpośrednio na elemencie, żeby
  // ruch nie przechodził przez render Reacta przy każdym pikselu.
  function setOffset(px, animate) {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
    el.style.transform = px ? `translateY(${px}px)` : '';
  }
  function onHandleDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    dragged.current = false;
  }
  function onHandleMove(e) {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 6) dragged.current = true;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setOffset(dy > 0 ? dy : dy * 0.3);
  }
  function onHandleUp(e) {
    const d = drag.current;
    drag.current = null;
    if (!d || !dragged.current) { setOffset(0); return; }
    const result = sheetGestureResult({
      dy: e.clientY - d.startY, velocity: d.v, expanded, dismissible: latest.current.dismissible,
    });
    if (result === 'close') {
      setOffset(panelRef.current?.offsetHeight ?? 600, true);
      setTimeout(() => latest.current.onClose?.(), 180);
      return;
    }
    setOffset(0, true);
    if (result === 'expand') setExpanded(true);
    if (result === 'collapse') setExpanded(false);
  }
  function onHandleClick() {
    // Stuknięcie (i Enter z klawiatury) przełącza pełny ekran; po przeciągnięciu
    // przeglądarka też wysyła click — ten ignorujemy.
    if (dragged.current) { dragged.current = false; return; }
    setExpanded(x => !x);
  }

  function onBackdrop(e) {
    // mousedown, nie click: zaznaczanie tekstu w polu i puszczenie myszy
    // nad tłem nie może zamykać okna z wpisanymi danymi.
    if (e.target === e.currentTarget && dismissible) onClose?.();
  }

  return createPortal(
    <div
      className="ui-overlay fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-[3px] md:items-center md:p-4"
      onMouseDown={onBackdrop}
      role="presentation"
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'ui-sheet flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-panel shadow-pop outline-none',
          'rounded-t-card-lg md:rounded-card-lg',
          expanded && 'max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:rounded-none max-md:border-0',
          WIDTH[size], className,
        )}
      >
        <button
          type="button"
          data-sheet-handle
          aria-label={expanded ? t('sheet_collapse') : t('sheet_expand')}
          aria-expanded={expanded}
          className={cx(
            'flex w-full shrink-0 cursor-grab touch-none justify-center pb-1 pt-2 outline-none active:cursor-grabbing md:hidden',
            'focus-visible:[&>span]:bg-accent',
            expanded && 'pt-[max(8px,env(safe-area-inset-top))]',
          )}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => { drag.current = null; setOffset(0, true); }}
          onClick={onHandleClick}
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </button>
        {(title || dismissible) && (
          <div className="flex shrink-0 items-start gap-3 px-5 pb-2 pt-4">
            <div className="min-w-0 flex-1">
              {title && <h2 id={titleId} className="text-base font-semibold leading-snug text-fg">{title}</h2>}
              {description && <p id={descId} className="mt-1 text-small text-dim">{description}</p>}
            </div>
            {dismissible && <span data-modal-close><IconButton icon={X} label={t('close_btn')} size="sm" onClick={onClose} className="-mr-1.5 -mt-0.5" /></span>}
          </div>
        )}
        {children != null
          ? <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 text-body text-fg">{children}</div>
          : <div className="h-3 shrink-0" />}
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line bg-bg-2 px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))] max-md:[&>*]:flex-1">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
