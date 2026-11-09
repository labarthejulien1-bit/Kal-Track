import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { requestPersistentStorage } from './db/database';
import './index.css';
import './theme.css';
import { applyTheme, storedTheme } from './lib/theme';
import { detectLang, setLang } from './i18n';
import { initNative, isNative } from './lib/native';

// Langue du téléphone par défaut (remplacée par le choix du profil s'il existe).
setLang(detectLang());
// Thème appliqué avant le premier affichage (pas de flash).
applyTheme(storedTheme());

// Empêche Android/Chrome de purger IndexedDB : les données survivent aux redémarrages.
requestPersistentStorage();

// Site web / PWA : mise à jour automatique hors ligne. Application Android : le code est intégré, pas de cache web.
if (isNative) initNative();
else import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
