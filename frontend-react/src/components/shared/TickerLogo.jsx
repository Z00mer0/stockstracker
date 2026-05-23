// src/components/shared/TickerLogo.jsx
export default function TickerLogo({ symbol = '', size = 'sm' }) {
  const chars = symbol.replace(/\.(WA|US|UK)$/i, '').slice(0, 2).toUpperCase();
  const cls = size === 'lg' ? 'ticker-logo ticker-logo-lg' : 'ticker-logo';
  return <span className={cls}>{chars}</span>;
}
