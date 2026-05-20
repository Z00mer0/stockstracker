import React, { useState } from 'react';
import { api } from '../hooks/useApi';

const TOKEN_KEY = 'myfund_auth_token';

export default function LoginForm({ onLogin }) {
  const [mode, setMode]             = useState('login'); // 'login' | 'register'
  const [username, setUsername]     = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword]     = useState('');
  const [password2, setPassword2]   = useState('');
  const [error, setError]           = useState(null);
  const [loading, setLoading]       = useState(false);

  function switchMode(m) {
    setMode(m);
    setError(null);
    setPassword('');
    setPassword2('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && password !== password2) {
      setError('Hasła nie są identyczne'); return;
    }

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
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 w-full max-w-sm space-y-5">

        {/* tab switcher */}
        <div className="flex rounded-lg overflow-hidden border border-slate-700">
          {['login', 'register'].map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {m === 'login' ? 'Logowanie' : 'Rejestracja'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-slate-400 block mb-1">Nazwa użytkownika</label>
            <input
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>

          {!isLogin && (
            <div>
              <label className="text-sm text-slate-400 block mb-1">
                Imię / nazwa wyświetlana <span className="text-slate-500">(opcjonalnie)</span>
              </label>
              <input
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="text-sm text-slate-400 block mb-1">Hasło</label>
            <input
              type="password"
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </div>

          {!isLogin && (
            <div>
              <label className="text-sm text-slate-400 block mb-1">Powtórz hasło</label>
              <input
                type="password"
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
                value={password2}
                onChange={e => setPassword2(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-slate-500 mt-1">Minimum 6 znaków</p>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password || (!isLogin && !password2)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg py-3 text-base font-semibold transition-colors"
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
