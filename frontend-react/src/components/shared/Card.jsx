// src/components/shared/Card.jsx
import { useState } from 'react';

const COLLAPSE_KEY = 'myfund_collapsed_cards';

function loadCollapsed() {
  try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}'); } catch { return {}; }
}

export default function Card({ title, actions, children, className = '', collapsible = false, collapseKey }) {
  const storageKey = collapseKey ?? (typeof title === 'string' ? title : null);
  const [collapsed, setCollapsed] = useState(() => collapsible && storageKey ? !!loadCollapsed()[storageKey] : false);

  function toggle() {
    setCollapsed(prev => {
      const next = !prev;
      if (storageKey) {
        const all = loadCollapsed();
        all[storageKey] = next;
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(all));
      }
      return next;
    });
  }

  return (
    <div className={`card ${className}`}>
      {title != null && (
        <div
          className="card-head"
          onClick={collapsible ? toggle : undefined}
          style={collapsible ? { cursor: 'pointer', userSelect: 'none' } : undefined}
        >
          <span className="card-title">{title}</span>
          <div className="flex items-center gap-2" onClick={e => collapsible && e.stopPropagation()}>
            {actions}
            {collapsible && (
              <span
                onClick={toggle}
                style={{ fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', padding: '0 2px' }}
              >▼</span>
            )}
          </div>
        </div>
      )}
      {!(collapsible && collapsed) && children}
    </div>
  );
}
