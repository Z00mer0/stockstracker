// Widok na czas dociągania kodu strony (React.lazy). Celowo oszczędny —
// przy szybkim przejściu migający spinner wygląda gorzej niż spokojna kropka.
export default function RouteFallback() {
  return (
    <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-faint)' }}>
      …
    </div>
  );
}
