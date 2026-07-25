import axios from 'axios';
import { useState, useCallback } from 'react';

// Uwierzytelnienie niesie ciasteczko HttpOnly, wysyłane przez przeglądarkę
// automatycznie — nie ma już czego wstrzykiwać w nagłówki. withCredentials
// jest potrzebne tylko wtedy, gdy VITE_API_URL wskazuje inne źródło; przy
// domyślnych ścieżkach względnych i tak nic nie zmienia.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  withCredentials: true,
});

export function useApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const request = useCallback(async (method, path, data) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api({ method, url: path, data });
      return res.data;
    } catch (err) {
      const msg = err.response?.data?.error ?? err.message;
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get  = useCallback((path)       => request('get',  path),       [request]);
  const post = useCallback((path, data) => request('post', path, data), [request]);

  return { get, post, loading, error };
}

export { api };
