import { api } from '../../hooks/useApi';
import AuthScreen from './AuthScreen';

/**
 * Bridges AuthScreen (pure UI) with the myfund REST API.
 * Throws on failure so AuthScreen's internal error state catches and displays it.
 */
export default function AuthGate({ onLogin }) {
  async function handleLogin({ username, password }) {
    try {
      const res = await api.post('/api/login', { username, password });
      onLogin(res.data.token, res.data.display_name);
    } catch (err) {
      throw new Error(err.response?.data?.error ?? 'Błąd logowania — spróbuj ponownie');
    }
  }

  async function handleRegister({ username, email, password }) {
    try {
      const res = await api.post('/api/register', {
        username,
        display_name: username,
        password,
      });
      onLogin(res.data.token, res.data.display_name);
    } catch (err) {
      throw new Error(err.response?.data?.error ?? 'Błąd rejestracji — spróbuj ponownie');
    }
  }

  return (
    <AuthScreen
      variant="terminal"
      onLogin={handleLogin}
      onRegister={handleRegister}
      onForgotPassword={() => {}}
    />
  );
}
