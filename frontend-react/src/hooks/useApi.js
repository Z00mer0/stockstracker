import axios from 'axios';
import { useState, useCallback } from 'react';

// Token jest współdzielony z myfund.html (ten sam localStorage)
const getToken = () => localStorage.getItem('myfund_auth_token');

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers['X-Auth-Token'] = token;
  return config;
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
