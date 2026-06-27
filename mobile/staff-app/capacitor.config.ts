import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.carefulserver.staff',
  appName: 'Careful Server',
  webDir: 'www',
  // Loads the live deployed web app — no rebuild needed when the web app updates
  server: {
    url: 'https://carefulserver.workers.dev/app',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'carefulserver.workers.dev',
      'api-production-731b.up.railway.app',
    ],
  },
  android: {
    // Kiosk: prevent back gesture from exiting
    overrideUserAgent: 'CarefulServerStaff/1.0',
    buildOptions: {
      releaseType: 'APK',
    },
  },
  ios: {
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#020617',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      spinnerColor: '#16a34a',
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#020617',
    },
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#22c55e',
    },
  },
}

export default config
