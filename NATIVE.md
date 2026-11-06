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

## Test builds (Android, no local tools needed)

`.github/workflows/android-apk.yml` builds the Android app on GitHub Actions whenever the game changes on the
working branch (or by hand from the Actions tab: "Android test build" → Run workflow). It builds the web game, syncs
it into `android/`, builds a release APK (session 28: not debuggable, so it runs as the store build will; it was a
debug APK before) and publishes it as a pre-release `android-test-<run>` with the file
`night-express-<run>.apk` (also kept as a workflow artifact). The version code is the run number, so each build
is newer than the last.

The APK is signed with `android/app/test-signing.keystore` (password `nightexpress`, alias
`nightexpress-test`), committed on purpose: every test build carries the same signature, so testers install new
builds over old ones and keep their progress (a release test APK installs over the older debug ones too: same key).
It is a test key only, never for the Play Store; a store build is signed with your own upload key (see Submitting).

Installing on a phone: open the release page on the phone, download the `.apk`, open it and allow installs from
that browser when Android asks. iPhone builds need a Mac with Xcode (below) or a TestFlight setup with an Apple
developer account.

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
- App id: `io.heseri.night` (the package name of the app made in the Play Console, session 44; fixed for good). The test
  and god APKs keep `com.hopnop.nightexpress` and `.god`, so they install beside the store version.
- The bundle: the `store` job in `.github/workflows/android-apk.yml` builds an unsigned
  `night-express-store-<run>-unsigned.aab` (release `android-store-<run>`) on every push. `versionCode` is the
  run number, so each new bundle is higher than the last, as Play requires.
- Signing: the upload key lives outside the repository with the owner (keystore file, alias `upload`, and its
  password); Play App Signing holds the release key. Sign each bundle with the same upload key:
  `jarsigner -keystore nightexpress-upload.jks -signedjar night-express-<run>.aab night-express-store-<run>-unsigned.aab upload`
  (it asks for the password), then `jarsigner -verify night-express-<run>.aab`. A lost upload key can be reset
  through Play Console support, but only with the account owner's request.
- Target: API 36 (Capacitor 8), as Play requires for new apps.
- Adjust (session 45): the native Android SDK 5.8.1 with the Play install referrer and the advertising id
  client, started in `NightExpressApp` (app token `sgueyly4m60w`); it tracks installs, attribution and sessions
  on its own. The Google Play bundle reports to production, the test APK to the sandbox (check it in Adjust's
  Testing Console, logs in logcat under the tag `Adjust`), the god build sends nothing (`ADJUST_ENVIRONMENT` in
  `android/app/build.gradle`). Its manifest adds the `AD_ID` permission. No in-game events are sent yet (each
  needs an event token made in the Adjust dashboard).
- AppLovin MAX (session 46): interstitials only (`FORCED_ADS_ENABLED` in `src/config/economy.ts`; rewarded ads,
  offers and the store stay off with `MONETIZATION_ENABLED`). `MaxAdsPlugin.java` starts MAX 13.7.0 (the SDK key and the
  interstitial ad unit `1a85254db169f142` at the top of `android/app/build.gradle`), keeps one interstitial loaded (retrying 2, 4 … 64 s after a failed load) and reports every
  paid impression to Adjust as ad revenue (`AdjustAdRevenue("applovin_max_sdk")`, USD, network, ad unit,
  placement). The game shows it only where `AdPolicy` allows (Departing, never before minute 10 of play, three
  minutes apart, never mid-task) through `src/services/maxAds.ts`. **The SDK key** (`maxSdkKey`: MAX dashboard > Account > Keys >
  SDK Key, about 86 characters) and **the interstitial ad unit** (`maxInterstitialAdUnit`, 16 characters, format
  Interstitial, platform Android, package `io.heseri.night`) are two lines at the top of `android/app/build.gradle`;
  either empty means no ads. Session 46: the owner first gave `1a85254db169f142` as "the SDK key"; its 16-character
  form is an ad unit id, so it is the interstitial unit; the real SDK key followed and is set. No consent flow yet (owner's choice for now): needed before release in the EU/UK. No mediated
  networks yet (AppLovin's own exchange only); each one is an adapter dependency.
- The Play Console's Advertising ID declaration: yes, the app uses an advertising ID, for analytics, attribution
  (Adjust) and advertising (MAX). App content > Ads: yes, the app contains ads.
- The data-safety form with MAX: add that device or other IDs, approximate location (from the IP address), app
  interactions and diagnostics are collected and **shared** with AppLovin for advertising, analytics and fraud
  prevention (AppLovin's own data-safety guidance lists what its SDK sends).
- The data-safety form: GameAnalytics and Adjust are on, so declare app activity (app interactions, in-app
  actions), app info and performance (crash logs, diagnostics) and device or other IDs (a random install id,
  the advertising id and Android id for Adjust), collected, encrypted in transit; Adjust's device ids are shared
  with Adjust as a service provider for analytics and attribution (Play counts a service provider acting for you
  as not "shared"), used for analytics and advertising or marketing (attribution of installs to campaigns). No
  personal data, precise location, contacts or payments.

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
