import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistentStorage } from './db/database';
import './index.css';

// Empêche Android/Chrome de purger IndexedDB : les données survivent aux redémarrages.
requestPersistentStorage();

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
