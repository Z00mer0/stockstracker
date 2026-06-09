import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './tabs.css';
import { PrivacyProvider } from './context/PrivacyContext';
import { LanguageProvider } from './context/LanguageContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <PrivacyProvider>
        <App />
      </PrivacyProvider>
    </LanguageProvider>
  </React.StrictMode>
);
