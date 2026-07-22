import React, { useState } from 'react';
import { api } from '../hooks/useApi';

const TOKEN_KEY = 'myfund_auth_token';

export default function LoginForm({ onLogin }) {
  const [mode, setMode]               = useState('login');
  const [username, setUsername]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword]       = useState('');
  const [password2, setPassword2]     = useState('');
  const [error, setError]             = useState(null);
  const [loading, setLoading]         = useState(false);

  function switchMode(m) { setMode(m); setError(null); setPassword(''); setPassword2(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password !== password2) { setError('Hasła nie są identyczne'); return; }
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/login' : '/api/register';
      const payload  = mode === 'login'
        ? { username, password }
        : { username, display_name: displayName || username, password };
      const res = await api.post(endpoint, payload);
      localStorage.setItem(TOKEN_KEY, res.data.token);
      onLogin(res.data.token, res.data.display_name);
    } catch (err) {
      setError(err.response?.data?.error ?? (mode === 'login' ? 'Błąd logowania' : 'Błąd rejestracji'));
    } finally {
      setLoading(false);
    }
  }

  const isLogin = mode === 'login';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 32,
        width: '100%', maxWidth: 360,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, background: 'var(--accent)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>myfund<span style={{ color: 'var(--accent)' }}>.</span></span>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--panel-2)', borderRadius: 8, marginBottom: 20 }}>
          {[['login', 'Logowanie'], ['register', 'Rejestracja']].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              style={{
                flex: 1, padding: '6px 0', fontSize: 13, fontWeight: 600,
                border: 'none', borderRadius: 6, cursor: 'pointer',
                background: mode === m ? 'var(--bg-2)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
                transition: 'background 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="field-label">Nazwa użytkownika</label>
            <input
              className="field-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          {!isLogin && (
            <div>
              <label className="field-label">
                Imię / nazwa wyświetlana <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(opcjonalnie)</span>
              </label>
              <input
                className="field-input"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="field-label">Hasło</label>
            <input
              type="password"
              className="field-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          {!isLogin && (
            <div>
              <label className="field-label">Powtórz hasło</label>
              <input
                type="password"
                className="field-input"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>Minimum 6 znaków</p>
            </div>
          )}

          {error && <p style={{ fontSize: 13, color: 'var(--down)' }}>{error}</p>}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !username || !password || (!isLogin && !password2)}
            style={{ width: '100%', padding: '10px 0', fontSize: 14, fontWeight: 600, opacity: (loading || !username || !password || (!isLogin && !password2)) ? 0.4 : 1 }}
          >
            {loading
              ? (isLogin ? 'Logowanie…' : 'Rejestracja…')
              : (isLogin ? 'Zaloguj' : 'Załóż konto')}
          </button>
        </form>
      </div>
    </div>
  );
}
