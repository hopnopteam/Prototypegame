package com.hopnop.nightexpress;

import android.app.Application;
import android.util.Log;
import com.adjust.sdk.Adjust;
import com.adjust.sdk.AdjustConfig;
import com.adjust.sdk.LogLevel;

/**
 * Starts Adjust as the app starts (session 45), so the install and the very first session are attributed.
 * Adjust follows the app in and out of the foreground by itself (its lifecycle provider, merged from its own
 * manifest), so nothing else is needed for sessions. Which environment it reports to comes from the build
 * (BuildConfig.ADJUST_ENVIRONMENT, set in build.gradle): production for Google Play, the sandbox for test
 * APKs, off for the god-mode build. A failure here never stops the game from starting.
 */
public class NightExpressApp extends Application {
    private static final String TAG = "NightExpress";

    @Override
    public void onCreate() {
        super.onCreate();
        String environment = BuildConfig.ADJUST_ENVIRONMENT;
        if (!AdjustConfig.ENVIRONMENT_PRODUCTION.equals(environment)
            && !AdjustConfig.ENVIRONMENT_SANDBOX.equals(environment)) {
            return;
        }
        try {
            boolean production = AdjustConfig.ENVIRONMENT_PRODUCTION.equals(environment);
            // In production the SDK's logs are suppressed; in the sandbox they show in logcat for checking.
            AdjustConfig config = new AdjustConfig(this, BuildConfig.ADJUST_APP_TOKEN, environment, production);
            config.setLogLevel(production ? LogLevel.SUPPRESS : LogLevel.INFO);
            Adjust.initSdk(config);
        } catch (Throwable error) {
            Log.e(TAG, "Adjust did not start", error);
        }
    }
}
