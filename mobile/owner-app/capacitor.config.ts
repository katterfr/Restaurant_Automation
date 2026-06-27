import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.carefulserver.manager',
  appName: 'Careful Server Manager',
  webDir: 'www',
  // Loads the live deployed web app — no rebuild needed when the web app updates
  server: {
    url: 'https://carefulserver.workers.dev/portal',
    cleartext: false,
    androidScheme: 'https',
    allowNavigation: [
      'carefulserver.workers.dev',
      'api-production-731b.up.railway.app',
      '*.facebook.com',
      '*.google.com',
      '*.googleapis.com',
    ],
  },
  android: {
    buildOptions: {
      releaseType: 'APK',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'large',
      spinnerColor: '#16a34a',
    },
    StatusBar: {
      style: 'Light',
      backgroundColor: '#ffffff',
    },
    PushNotifications: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#16a34a',
    },
  },
}

export default config
