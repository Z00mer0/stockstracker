import React from 'react';

export default function Spinner({ size = 'md' }) {
  const s = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  return (
    <div className={`${s} rounded-full border-2 border-slate-600 border-t-indigo-400 animate-spin`} />
  );
}
