import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The App Store and Play Store builds: Capacitor wraps the same single-page game (dist/app/index.html, written
 * by `npm run build`) in a native iOS and Android app. See NATIVE.md for building, signing and submitting.
 * The game itself talks to the native side only through src/services/native.ts.
 */
const NIGHT = '#161C44';

const config: CapacitorConfig = {
  appId: 'com.hopnop.nightexpress',
  appName: 'Night Express',
  webDir: 'dist/app',
  backgroundColor: NIGHT,
  ios: {
    // Full screen under the notch: the page reads the safe-area insets itself (viewport-fit=cover).
    contentInset: 'never',
    // A game, not a page: no rubber-band scrolling, no link previews.
    scrollEnabled: false,
    allowsLinkPreview: false,
    backgroundColor: NIGHT,
    preferredContentMode: 'mobile',
  },
  android: {
    backgroundColor: NIGHT,
    allowMixedContent: false,
    // Release builds never expose the web view to a debugger.
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    // The launch screen waits for the first frame (src/main.ts hides it), so the game never flashes in.
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: NIGHT,
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      overlaysWebView: true,
      backgroundColor: '#00000000',
    },
  },
};

export default config;
