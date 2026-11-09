import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistentStorage } from './db/database';
import './index.css';
import { detectLang, setLang } from './i18n';

// Langue du téléphone par défaut (remplacée par le choix du profil s'il existe).
setLang(detectLang());

// Empêche Android/Chrome de purger IndexedDB : les données survivent aux redémarrages.
requestPersistentStorage();

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
