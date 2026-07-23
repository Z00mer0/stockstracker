import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './tabs.css';
import { PrivacyProvider } from './context/PrivacyContext';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { installFetchRetry } from './services/apiClient';
import { inject } from '@vercel/analytics';

inject();

function FetchRetryInstaller() {
  const { showToast } = useToast();
  useEffect(() => {
    installFetchRetry(showToast);
  }, [showToast]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <PrivacyProvider>
        <ToastProvider>
          <FetchRetryInstaller />
          <App />
        </ToastProvider>
      </PrivacyProvider>
    </LanguageProvider>
  </React.StrictMode>
);
