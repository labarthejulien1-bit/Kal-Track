import type { CapacitorConfig } from '@capacitor/cli';

// Application Android (Play Store) : le site compilé (dist/) est intégré dans l'appli,
// les données restent dans l'espace privé de l'application.
const config: CapacitorConfig = {
  appId: 'com.kaltrack.app',
  appName: 'Kal-Track',
  webDir: 'dist',
  android: {
    backgroundColor: '#ffffff',
  },
  plugins: {
    SystemBars: { insetsHandling: 'css', initialViewportFitValueHint: 'cover' },
    LocalNotifications: { smallIcon: 'ic_stat_kaltrack', iconColor: '#059669' },
  },
};

export default config;
