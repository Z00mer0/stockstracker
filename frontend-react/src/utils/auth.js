// Shared auth header helper — jedno źródło prawdy o tokenie sesji.
export const AUTH_TOKEN_KEY = 'myfund_auth_token';

export function authHeader() {
  return { 'X-Auth-Token': localStorage.getItem(AUTH_TOKEN_KEY) || '' };
}
