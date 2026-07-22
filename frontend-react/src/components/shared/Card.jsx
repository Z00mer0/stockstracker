// src/components/shared/Card.jsx
import { useRef, useState } from 'react';

const COLLAPSE_KEY = 'myfund_collapsed_cards';

function loadCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
}

// iOS Safari doesn't clamp scrollTop when content shrinks inside an inner
// scroll container, so taps can land on stale offsets until the user
// scrolls. Nudge the nearest scroll ancestor after a collapse.
function clampAncestorScroll(el) {
  let node = el?.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY)) {
      const max = node.scrollHeight - node.clientHeight;
      if (node.scrollTop > max) node.scrollTop = max;
      return;
    }
    node = node.parentElement;
  }
}

export default function Card({ title, actions, children, className = '', collapsible = false, collapseKey }) {
  const storageKey = collapseKey ?? (typeof title === 'string' ? title : null);
  const [collapsed, setCollapsed] = useState(() => collapsible && storageKey ? !!loadCollapsed()[storageKey] : false);
  const rootRef = useRef(null);

  function toggle() {
    setCollapsed(prev => {
      const next = !prev;
      if (storageKey) {
        const all = loadCollapsed();
        all[storageKey] = next;
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(all));
      }
      if (next) requestAnimationFrame(() => clampAncestorScroll(rootRef.current));
      return next;
    });
  }

  return (
    <div ref={rootRef} className={`card ${className}`}>
      {title != null && (
        <div
          className="card-head"
          onClick={collapsible ? toggle : undefined}
          style={collapsible ? { cursor: 'pointer', userSelect: 'none', touchAction: 'manipulation' } : undefined}
        >
          <span className="card-title">{title}</span>
          <div className="flex items-center gap-2" onClick={e => collapsible && e.stopPropagation()}>
            {actions}
            {collapsible && (
              <span
                onClick={toggle}
                style={{ fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', padding: '0 2px', touchAction: 'manipulation' }}
              >▼</span>
            )}
          </div>
        </div>
      )}
      {!(collapsible && collapsed) && children}
    </div>
  );
}
