import { useState } from 'react';
import { api } from '../../hooks/useApi';
import AuthScreen from './AuthScreen';
import RecoveryCodes from './RecoveryCodes';

/**
 * Bridges AuthScreen (pure UI) with the myfund REST API.
 * Throws on failure so AuthScreen's internal error state catches and displays it.
 * After a successful registration it shows the one-time recovery codes and only
 * then completes the login, so the user cannot miss them.
 */
export default function AuthGate({ onLogin }) {
  // { token, displayName, codes } — set after registration, before entering the app
  const [pendingCodes, setPendingCodes] = useState(null);

  async function handleLogin({ username, password }) {
    try {
      const res = await api.post('/api/login', { username, password });
      onLogin(res.data.token, res.data.display_name);
    } catch (err) {
      throw new Error(err.response?.data?.error ?? 'Błąd logowania — spróbuj ponownie');
    }
  }

  async function handleRegister({ username, password }) {
    let res;
    try {
      res = await api.post('/api/register', {
        username,
        display_name: username,
        password,
      });
    } catch (err) {
      throw new Error(err.response?.data?.error ?? 'Błąd rejestracji — spróbuj ponownie');
    }
    try {
      const rc = await api.post('/api/recovery-codes', {}, {
        headers: { 'X-Auth-Token': res.data.token },
      });
      setPendingCodes({
        token: res.data.token,
        displayName: res.data.display_name,
        codes: rc.data.codes,
      });
    } catch {
      // Codes are a bonus — never block a successful registration on them.
      onLogin(res.data.token, res.data.display_name);
    }
  }

  async function handleDemo() {
    try {
      const res = await api.post('/api/demo', {});
      onLogin(res.data.token, res.data.display_name, { demo: true });
    } catch (err) {
      throw new Error(err.response?.data?.error ?? 'Nie udało się uruchomić demo — spróbuj ponownie');
    }
  }

  async function handleResetPassword({ username, code, newPassword }) {
    try {
      await api.post('/api/reset-password', {
        username,
        recovery_code: code,
        new_password: newPassword,
      });
    } catch (err) {
      throw new Error(err.response?.data?.error ?? 'Nie udało się zresetować hasła');
    }
  }

  if (pendingCodes) {
    return (
      <RecoveryCodes
        codes={pendingCodes.codes}
        onContinue={() => onLogin(pendingCodes.token, pendingCodes.displayName)}
      />
    );
  }

  return (
    <AuthScreen
      variant="terminal"
      onLogin={handleLogin}
      onRegister={handleRegister}
      onResetPassword={handleResetPassword}
      onDemo={handleDemo}
    />
  );
}
