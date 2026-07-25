// Sesję niesie ciasteczko HttpOnly, dokładane przez przeglądarkę samoczynnie.
// authHeader zostaje, bo woła ją kilkanaście miejsc — zwraca pusty obiekt,
// żeby nie trzeba było przerabiać każdego wywołania fetch osobno.
export function authHeader() {
  return {};
}

// Flaga „ktoś jest zalogowany". Nie jest poświadczeniem i niczego nie
// odblokowuje — służy wyłącznie do tego, żeby nie wysyłać zapytań, o których
// z góry wiadomo, że wrócą z 401. O dostępie decyduje wyłącznie ciasteczko.
export const AUTHED_KEY = 'myfund_authed';

export function isAuthed() {
  return localStorage.getItem(AUTHED_KEY) === '1'
      || !!localStorage.getItem('myfund_auth_token');   // sesja sprzed migracji
}
