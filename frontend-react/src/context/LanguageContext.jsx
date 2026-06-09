import { createContext, useContext, useState } from 'react';
import pl from '../translations/pl';
import en from '../translations/en';

const LANG_KEY = 'myfund_language';
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(
    () => localStorage.getItem(LANG_KEY) || 'pl'
  );

  const locale = language === 'en' ? 'en-US' : 'pl-PL';

  function changeLanguage(lang) {
    localStorage.setItem(LANG_KEY, lang);
    setLanguage(lang);
  }

  const toggle = () => changeLanguage(language === 'pl' ? 'en' : 'pl');

  return (
    <LanguageContext.Provider value={{ language, locale, setLanguage: changeLanguage, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useT() {
  const { language } = useLanguage();
  const dict = language === 'en' ? en : pl;
  return (key) => dict[key] ?? pl[key] ?? key;
}
