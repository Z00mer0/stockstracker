import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './tabs.css';
import { PrivacyProvider } from './context/PrivacyContext';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivacyProvider>
      <App />
    </PrivacyProvider>
  </React.StrictMode>
);
