import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.disnana.moneymanagement',
  appName: 'DMM',
  webDir: 'dist',
  ios: {
    // Draw edge-to-edge; the web UI handles safe areas itself (env(safe-area-inset-*))
    contentInset: 'never',
    backgroundColor: '#F2F3F7',
  },
};

export default config;
