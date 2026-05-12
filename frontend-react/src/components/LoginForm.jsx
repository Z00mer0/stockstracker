import React, { useState } from 'react';
import { api } from '../hooks/useApi';

const TOKEN_KEY = 'myfund_auth_token';

export default function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/api/login', { username, password });
      localStorage.setItem(TOKEN_KEY, res.data.token);
      onLogin(res.data.token, res.data.display_name);
    } catch (err) {
      setError(err.response?.data?.error ?? 'Błąd logowania');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="bg-slate-800 border border-slate-700 rounded-xl p-8 w-full max-w-sm space-y-4"
      >
        <h2 className="text-xl font-bold text-indigo-400">Zaloguj się</h2>
        <p className="text-sm text-slate-400">StocksTracker — konto z Render</p>

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

        <div>
          <label className="text-sm text-slate-400 block mb-1">Hasło</label>
          <input
            type="password"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !username || !password}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg py-3 text-base font-semibold transition-colors"
        >
          {loading ? 'Logowanie…' : 'Zaloguj'}
        </button>
      </form>
    </div>
  );
}
