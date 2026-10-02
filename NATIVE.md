# Night Express on the App Store and Google Play

The game is one web page (TypeScript + Three.js, built into `dist/app/index.html`). For the stores,
[Capacitor](https://capacitorjs.com) wraps that same page in a real iOS app and a real Android app: a native
shell around the system web view (WKWebView on iOS, the Chromium WebView on Android), with native plugins
for what a web page cannot do well. There is one game and one codebase; the web build (the Artifact) and the
apps run the same file.

## What the apps add over the web build

| | Web build | App |
|---|---|---|
| Saves | localStorage | localStorage, mirrored into the app's own storage (UserDefaults / SharedPreferences) and restored at launch if the system cleared the web view |
| Haptics | Android browsers only | The phone's own taps on iPhone and Android (`@capacitor/haptics`) |
| Background | Tab visibility | The app's own lifecycle: saves and pauses the moment it goes to the background |
| Back button | — | Android: closes the open sheet, otherwise sends the app to the background |
| Screen | Browser chrome | Full screen, portrait only, no status bar, the screen stays on; Android asks the display for 60 Hz |
| Launch | — | A launch screen held until the first frame is drawn (no white flash) |
| Offline | Yes | Yes (everything is inside the app) |

All of it lives in `src/services/native.ts`; in a browser every call there is a no-op, so the web build is
unchanged. Configuration: `capacitor.config.ts` (app id `com.hopnop.nightexpress`, name, colours, plugins).

## Building

You need Node 22+, and for iOS a Mac with Xcode 26 (or the version Capacitor 8 asks for), for Android
Android Studio with the Android SDK 36.

```bash
npm install
npm run app:sync      # builds the game and copies it into ios/ and android/
npm run app:ios       # …and opens the Xcode project
npm run app:android   # …and opens the Android Studio project
```

Run on a device from Xcode (pick your team under Signing & Capabilities) or Android Studio (Run). After any
change to the game, `npm run app:sync` again. The app icon and launch screen are drawn by
`scripts/native/assets.py` (`npm run app:assets`).

## Submitting

**App Store (iOS)**
- Signing: an Apple Developer account; set the team in Xcode (bundle id `com.hopnop.nightexpress`).
- Version: `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in Xcode (General tab).
- Privacy: `ios/App/App/PrivacyInfo.xcprivacy` declares no tracking and no collected data (the save in
  UserDefaults, reason CA92.1). When real ad, analytics or purchase SDKs arrive, add what they collect here
  and in App Store Connect's privacy answers.
- Export compliance: `ITSAppUsesNonExemptEncryption` is false (the game uses no encryption of its own).
- Archive (Product › Archive) and upload from the Organizer.

**Google Play (Android)**
- Signing: create an upload key (Android Studio › Build › Generate Signed App Bundle) and keep it out of the
  repository; Play App Signing holds the release key.
- Version: `versionCode` / `versionName` in `android/app/build.gradle`.
- Target: API 36 (Capacitor 8), as Play requires for new apps.
- Build an `.aab` (Generate Signed App Bundle) and upload it in the Play Console. The data-safety form: no
  data collected, until real SDKs are added.

## Purchases and ads

The game talks to ads, purchases, analytics and remote config only through the interfaces in
`src/services/` (with mocks today). For the stores, swap in plugins behind the same interfaces, for example
RevenueCat (`@revenuecat/purchases-capacitor`) for purchases and AdMob (`@capacitor-community/admob`) for
rewarded and interstitial ads; the ad rules (`src/sim/AdPolicy.ts`) and placements stay as they are.
Real SDKs wait until a publisher signs (CLAUDE.md, decisions pending).

## Performance on phones

Phones render straight to the screen (Low and Medium tiers have no post-processing); every character is
drawn in one batched draw call; every shader is compiled before the first frame; the render scale settles
quickly and is remembered between launches; the frame rate is held at 60 on high-refresh screens. See the
art section of CLAUDE.md for the details.
