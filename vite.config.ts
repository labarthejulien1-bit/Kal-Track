import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import pkg from './package.json';

export default defineConfig({
  base: './',
  // Numéro de version affiché dans l'appli : celui de la version Android (1.0.N, fourni par le CI), sinon package.json.
  define: { __APP_VERSION__: JSON.stringify(process.env.VERSION_NAME || pkg.version) },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'logo.svg'],
      manifest: {
        id: 'kal-track',
        name: 'Kal-Track – Calories & Macros',
        short_name: 'Kal-Track',
        description: 'Suivi des calories et macronutriments 100% local avec analyse IA des repas.',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        categories: ['health', 'fitness', 'food'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Scanner un repas', short_name: 'Scanner', url: './?action=scan', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Ajouter mon poids', short_name: 'Poids', url: './?tab=weight', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: 'index.html',
        // Aucun appel réseau vers l'API Gemini ou Open Food Facts n'est mis en cache.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { chunkSizeWarningLimit: 1200 },
});
