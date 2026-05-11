import React from 'react';

const VARIANTS = {
  green:  'bg-green-900/40 text-green-400 border-green-700/40',
  red:    'bg-red-900/40 text-red-400 border-red-700/40',
  yellow: 'bg-yellow-900/40 text-yellow-400 border-yellow-700/40',
  gray:   'bg-slate-700/40 text-slate-400 border-slate-600/40',
};

export default function Badge({ children, variant = 'gray' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${VARIANTS[variant]}`}>
      {children}
    </span>
  );
}
