import pl from '../translations/pl';
import en from '../translations/en';

// Tłumaczenie poza komponentami (klasy, kod sieciowy) — język z tego samego
// klucza, który zapisuje LanguageProvider.
export function tStatic(key) {
  let lang = 'pl';
  try { lang = localStorage.getItem('myfund_language') || 'pl'; } catch { /* brak dostępu */ }
  return (lang === 'en' ? en : pl)[key] ?? pl[key] ?? key;
}
