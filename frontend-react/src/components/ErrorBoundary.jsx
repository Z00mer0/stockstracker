import React from 'react';

// Jedyny sposób na złapanie wyjątku z renderowania w Reakcie — hooki tego nie
// potrafią, musi być klasa.
//
// Powód istnienia: dotąd nie było ani jednej granicy błędu w całej aplikacji,
// więc dowolny wyjątek w dowolnym komponencie kasował całe drzewo i zostawiał
// pustą białą stronę. Zdarzyło się to naprawdę — „tickers is not iterable"
// w pasku notowań zabijało cały pulpit.
//
// `resetKey`: po zmianie tej wartości granica próbuje renderować od nowa.
// Dzięki temu przejście na inną stronę czyści błąd i użytkownik nie zostaje
// z komunikatem, który już go nie dotyczy.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', this.props.name ?? 'root', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div style={{
        padding: '24px 20px', textAlign: 'center', color: 'var(--text-dim)',
        border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)',
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
        <p style={{ fontWeight: 600, marginBottom: 4 }}>{this.props.title ?? 'Coś poszło nie tak'}</p>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', maxWidth: 420, margin: '0 auto 12px' }}>
          {this.props.hint ?? 'Ta część nie mogła się wyświetlić. Reszta aplikacji działa normalnie.'}
        </p>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13,
          }}
        >
          ↻ Spróbuj ponownie
        </button>
      </div>
    );
  }
}
