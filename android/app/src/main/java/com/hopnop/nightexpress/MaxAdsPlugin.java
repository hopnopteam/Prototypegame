package com.hopnop.nightexpress;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.adjust.sdk.Adjust;
import com.adjust.sdk.AdjustAdRevenue;
import com.applovin.mediation.MaxAd;
import com.applovin.mediation.MaxAdListener;
import com.applovin.mediation.MaxAdRevenueListener;
import com.applovin.mediation.MaxError;
import com.applovin.mediation.ads.MaxInterstitialAd;
import com.applovin.sdk.AppLovinMediationProvider;
import com.applovin.sdk.AppLovinSdk;
import com.applovin.sdk.AppLovinSdkInitializationConfiguration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;

/**
 * AppLovin MAX for the game (session 46): interstitials only, the one forced ad, which the game asks for only while
 * the train departs (AdPolicy decides when; this only loads and shows). Every paid impression is reported to Adjust
 * as ad revenue (AdjustAdRevenue "applovin_max_sdk": revenue in USD, network, ad unit, placement).
 *
 * The SDK key and the interstitial ad unit come from the build (BuildConfig.MAX_SDK_KEY, MAX_INTERSTITIAL_ID in
 * build.gradle). With no ad unit, or in the god build, nothing starts and the game simply has no ads.
 *
 * JavaScript side: src/services/maxAds.ts. Events: "interstitialReady" { ready }. Methods: status(),
 * showInterstitial({ placement }) → { result: completed | failed | notAvailable }.
 */
@CapacitorPlugin(name = "MaxAds")
public class MaxAdsPlugin extends Plugin {
    private static final String TAG = "NightExpressAds";
    /** Retry a failed load after 2, 4, 8 … seconds, at most this long. */
    private static final long MAX_RETRY_MS = 64_000;

    private final Handler main = new Handler(Looper.getMainLooper());
    private MaxInterstitialAd interstitial;
    private boolean initialized = false;
    private int retryAttempt = 0;
    /** The game's pending show call, answered when the ad is closed or fails to display. */
    private PluginCall showCall;

    private static boolean configured() {
        return BuildConfig.MAX_ENABLED && !BuildConfig.MAX_SDK_KEY.isEmpty() && !BuildConfig.MAX_INTERSTITIAL_ID.isEmpty();
    }

    @Override
    public void load() {
        if (!configured()) {
            Log.i(TAG, "MAX off in this build (no SDK key or interstitial ad unit)");
            return;
        }
        try {
            AppLovinSdk sdk = AppLovinSdk.getInstance(getContext());
            sdk.getSettings().setVerboseLogging(BuildConfig.MAX_VERBOSE);
            sdk.getSettings().setCreativeDebuggerEnabled(false);
            AppLovinSdkInitializationConfiguration config = AppLovinSdkInitializationConfiguration
                .builder(BuildConfig.MAX_SDK_KEY)
                .setMediationProvider(AppLovinMediationProvider.MAX)
                .setAdUnitIds(Collections.singletonList(BuildConfig.MAX_INTERSTITIAL_ID))
                .build();
            sdk.initialize(config, sdkConfig -> main.post(this::onSdkReady));
        } catch (Throwable error) {
            Log.e(TAG, "MAX did not start", error);
        }
    }

    private void onSdkReady() {
        if (initialized) return;
        initialized = true;
        Log.i(TAG, "MAX initialised, SDK " + AppLovinSdk.VERSION);
        interstitial = new MaxInterstitialAd(BuildConfig.MAX_INTERSTITIAL_ID, getContext());
        interstitial.setListener(listener);
        interstitial.setRevenueListener(revenueListener);
        interstitial.loadAd();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("configured", configured());
        result.put("initialized", initialized);
        result.put("ready", interstitial != null && interstitial.isReady());
        call.resolve(result);
    }

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        String placement = call.getString("placement", "departing");
        main.post(() -> {
            if (interstitial == null || !interstitial.isReady() || getActivity() == null) {
                answer(call, "notAvailable");
                return;
            }
            if (showCall != null) {
                answer(call, "failed");
                return;
            }
            showCall = call;
            interstitial.showAd(placement, getActivity());
        });
    }

    private void answer(PluginCall call, String outcome) {
        JSObject result = new JSObject();
        result.put("result", outcome);
        call.resolve(result);
    }

    private void finishShow(String outcome) {
        PluginCall call = showCall;
        showCall = null;
        if (call != null) answer(call, outcome);
    }

    private void announceReady(boolean ready) {
        JSObject data = new JSObject();
        data.put("ready", ready);
        notifyListeners("interstitialReady", data);
    }

    private void loadNext() {
        announceReady(false);
        if (interstitial != null) interstitial.loadAd();
    }

    private final MaxAdListener listener = new MaxAdListener() {
        @Override
        public void onAdLoaded(MaxAd ad) {
            retryAttempt = 0;
            announceReady(true);
        }

        @Override
        public void onAdLoadFailed(String adUnitId, MaxError error) {
            announceReady(false);
            retryAttempt = Math.min(retryAttempt + 1, 6);
            long delay = Math.min(MAX_RETRY_MS, (long) Math.pow(2, retryAttempt) * 1000);
            Log.w(TAG, "Interstitial did not load (" + error.getCode() + " " + error.getMessage() + "), retrying in " + delay + " ms");
            main.postDelayed(() -> {
                if (interstitial != null) interstitial.loadAd();
            }, delay);
        }

        @Override
        public void onAdDisplayed(MaxAd ad) {
            announceReady(false);
        }

        @Override
        public void onAdHidden(MaxAd ad) {
            finishShow("completed");
            loadNext();
        }

        @Override
        public void onAdClicked(MaxAd ad) {}

        @Override
        public void onAdDisplayFailed(MaxAd ad, MaxError error) {
            Log.w(TAG, "Interstitial did not display (" + error.getCode() + " " + error.getMessage() + ")");
            finishShow("failed");
            loadNext();
        }
    };

    /** Every paid impression goes to Adjust as ad revenue (Adjust's MAX source, revenue in USD). */
    private final MaxAdRevenueListener revenueListener = ad -> {
        try {
            AdjustAdRevenue revenue = new AdjustAdRevenue("applovin_max_sdk");
            revenue.setRevenue(ad.getRevenue(), "USD");
            revenue.setAdRevenueNetwork(ad.getNetworkName());
            revenue.setAdRevenueUnit(ad.getAdUnitId());
            revenue.setAdRevenuePlacement(ad.getPlacement());
            Adjust.trackAdRevenue(revenue);
        } catch (Throwable error) {
            Log.e(TAG, "Ad revenue not sent to Adjust", error);
        }
    };
}
