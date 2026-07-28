import React, { createContext, useContext, useState, useEffect } from 'react';
import { lsSet } from '../utils/safeStorage.js';

const PrivacyContext = createContext({ isPrivate: false, toggle: () => {} });

export function PrivacyProvider({ children }) {
  const [isPrivate, setIsPrivate] = useState(
    () => localStorage.getItem('privacyMode') === 'true'
  );

  useEffect(() => {
    lsSet('privacyMode', isPrivate);
    document.body.classList.toggle('privacy-mode', isPrivate);
  }, [isPrivate]);

  const toggle = () => setIsPrivate(p => !p);

  return (
    <PrivacyContext.Provider value={{ isPrivate, toggle }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
