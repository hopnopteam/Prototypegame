using System;
using NightExpress.Core;
using NightExpress.Core.Save;
using NightExpress.Core.Session;
using NightExpress.Services.Ads;
using NightExpress.Services.Analytics;
using NightExpress.Services.IAP;
using UnityEngine;

namespace NightExpress.UI.DevTools
{
    /// <summary>
    /// Developer panel for testing on a phone with no extra UI setup: FPS, save and session state, and buttons
    /// that drive the mock ad and IAP services. The bootstrap adds it only in the Editor and Development Builds.
    /// IMGUI on purpose: zero scene setup, and its per-frame garbage never ships to players.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class DebugOverlay : MonoBehaviour
    {
        // Layout is authored for a 540-unit-wide virtual screen and scaled to the device.
        private const float ReferenceWidth = 540f;
        private const float Margin = 8f;
        private const float ToggleWidth = 130f;
        private const float ToggleHeight = 44f;
        private const float PanelWidth = 400f;
        private const float RowHeight = 40f;
        private const int FontSize = 17;
        private const int AdFontSize = 30;
        private const float FpsSampleSeconds = 0.5f;
        private const int ShortIdLength = 8;
        private const int VisibleAnalyticsLines = 8;
        private const float AdBackdropAlpha = 0.92f;

        private const string RewardedPlacement = "debug_rewarded";
        private const string InterstitialPlacement = "debug_interstitial";

        private SaveSystem _save;
        private SessionTracker _session;
        private IAdService _ads;
        private MockAdService _mockAds;
        private IIAPService _iap;
        private MockIAPService _mockIap;
        private MockAnalyticsService _mockAnalytics;

        private bool _expanded;
        private Vector2 _scroll;
        private string _lastResult = "-";

        private int _fpsFrames;
        private float _fpsElapsed;
        private string _fpsLabel = "-- fps";

        private bool _stylesReady;
        private GUIStyle _buttonStyle;
        private GUIStyle _labelStyle;
        private GUIStyle _headerStyle;
        private GUIStyle _adLabelStyle;
        private GUIStyle _backdropStyle;
        private Texture2D _backdropTexture;

        private void Start()
        {
            ServiceLocator.TryGet(out _save);
            ServiceLocator.TryGet(out _session);
            ServiceLocator.TryGet(out _ads);
            ServiceLocator.TryGet(out _iap);
            ServiceLocator.TryGet(out IAnalyticsService analytics);

            _mockAds = _ads as MockAdService;
            _mockIap = _iap as MockIAPService;
            _mockAnalytics = analytics as MockAnalyticsService;
        }

        private void Update()
        {
            _fpsFrames++;
            _fpsElapsed += Time.unscaledDeltaTime;
            if (_fpsElapsed < FpsSampleSeconds)
            {
                return;
            }

            _fpsLabel = Mathf.RoundToInt(_fpsFrames / _fpsElapsed) + " fps";
            _fpsFrames = 0;
            _fpsElapsed = 0f;
        }

        private void OnDestroy()
        {
            if (_backdropTexture != null)
            {
                Destroy(_backdropTexture);
            }
        }

        private void OnGUI()
        {
            EnsureStyles();

            float scale = Screen.width / ReferenceWidth;
            Matrix4x4 previousMatrix = GUI.matrix;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));

            float virtualWidth = ReferenceWidth;
            float virtualHeight = Screen.height / scale;

            // IMGUI's origin is top-left while Screen.safeArea's is bottom-left.
            Rect safeArea = Screen.safeArea;
            float top = (Screen.height - safeArea.yMax) / scale + Margin;
            float left = safeArea.xMin / scale + Margin;

            if (_ads != null && _ads.IsShowing)
            {
                DrawAdPlaceholder(virtualWidth, virtualHeight);
            }

            if (GUI.Button(new Rect(left, top, ToggleWidth, ToggleHeight), _fpsLabel, _buttonStyle))
            {
                _expanded = !_expanded;
            }

            if (_expanded)
            {
                float panelTop = top + ToggleHeight + Margin;
                float panelHeight = virtualHeight - panelTop - Margin;
                DrawPanel(new Rect(left, panelTop, Mathf.Min(PanelWidth, virtualWidth - left - Margin), panelHeight));
            }

            GUI.matrix = previousMatrix;
        }

        private void DrawPanel(Rect area)
        {
            GUILayout.BeginArea(area, GUI.skin.box);
            _scroll = GUILayout.BeginScrollView(_scroll);

            GUILayout.Label("Night Express - dev panel", _headerStyle);
            GUILayout.Label($"v{Application.version} | Unity {Application.unityVersion} | {Application.platform}", _labelStyle);

            DrawSessionSection();
            DrawSaveSection();
            DrawAdsSection();
            DrawIapSection();

            GUILayout.Label("Last result: " + _lastResult, _labelStyle);

            DrawAnalyticsSection();

            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }

        private void DrawSessionSection()
        {
            GUILayout.Label("Session", _headerStyle);
            if (_session == null)
            {
                GUILayout.Label("(not available)", _labelStyle);
                return;
            }

            GUILayout.Label($"#{_session.SessionNumber} | this session {FormatDuration(_session.SessionSeconds)} | lifetime {FormatDuration(_session.LifetimePlaySeconds)}", _labelStyle);
        }

        private void DrawSaveSection()
        {
            GUILayout.Label("Save", _headerStyle);
            if (_save == null || !_save.IsLoaded)
            {
                GUILayout.Label("(not loaded)", _labelStyle);
                return;
            }

            string installId = _save.Data.profile.installId ?? string.Empty;
            string shortId = installId.Length > ShortIdLength ? installId.Substring(0, ShortIdLength) : installId;
            GUILayout.Label($"{_save.LastLoadOutcome} | away {FormatDuration(_save.SecondsAwayOnLaunch)} | id {shortId}", _labelStyle);

            GUILayout.BeginHorizontal();
            if (Button("Save now"))
            {
                _lastResult = _save.SaveNow("dev panel") ? "Saved" : "Save FAILED (see console)";
            }

            if (Button("Reset progress"))
            {
                _save.ResetToNewPlayer();
                _lastResult = "Progress reset. Restart the app to begin as a new player.";
            }

            GUILayout.EndHorizontal();
        }

        private void DrawAdsSection()
        {
            GUILayout.Label("Ads (mock)", _headerStyle);
            if (_ads == null)
            {
                GUILayout.Label("(not available)", _labelStyle);
                return;
            }

            GUILayout.BeginHorizontal();
            if (Button("Rewarded"))
            {
                _lastResult = "Rewarded ad requested...";
                _ads.ShowRewarded(RewardedPlacement, result => _lastResult = "Rewarded: " + result);
            }

            if (Button("Interstitial"))
            {
                _lastResult = "Interstitial requested...";
                _ads.ShowInterstitial(InterstitialPlacement, result => _lastResult = "Interstitial: " + result);
            }

            GUILayout.EndHorizontal();

            if (_mockAds == null)
            {
                return;
            }

            GUILayout.BeginHorizontal();
            _mockAds.SimulateNoFill = Toggle(_mockAds.SimulateNoFill, "No fill");
            _mockAds.SimulateRewardedSkip = Toggle(_mockAds.SimulateRewardedSkip, "Skip rewarded");
            GUILayout.EndHorizontal();
        }

        private void DrawIapSection()
        {
            GUILayout.Label("Store (mock)", _headerStyle);
            if (_iap == null)
            {
                GUILayout.Label("(not available)", _labelStyle);
                return;
            }

            bool owned = _iap.IsOwned(ProductIds.FirstClassTicket);
            GUILayout.Label($"First Class Ticket: {(owned ? "OWNED" : "not owned")} ({_iap.GetPriceLabel(ProductIds.FirstClassTicket)})", _labelStyle);

            GUILayout.BeginHorizontal();
            if (Button("Buy ticket"))
            {
                _lastResult = "Purchase started...";
                _iap.Purchase(ProductIds.FirstClassTicket, result => _lastResult = "Purchase: " + result);
            }

            if (_mockIap != null && Button("Clear owned"))
            {
                _mockIap.ClearOwned();
                _lastResult = "Mock purchases cleared";
            }

            GUILayout.EndHorizontal();

            if (_mockIap != null)
            {
                _mockIap.SimulatePurchaseFailure = Toggle(_mockIap.SimulatePurchaseFailure, "Fail purchases");
            }
        }

        private void DrawAnalyticsSection()
        {
            GUILayout.Label("Analytics (mock)", _headerStyle);
            if (_mockAnalytics == null)
            {
                GUILayout.Label("(not available)", _labelStyle);
                return;
            }

            GUILayout.Label($"{_mockAnalytics.TotalEventsLogged} events logged", _labelStyle);

            int skip = Math.Max(0, _mockAnalytics.RecentEvents.Count - VisibleAnalyticsLines);
            foreach (string line in _mockAnalytics.RecentEvents)
            {
                if (skip > 0)
                {
                    skip--;
                    continue;
                }

                GUILayout.Label(line, _labelStyle);
            }
        }

        private void DrawAdPlaceholder(float width, float height)
        {
            GUI.Box(new Rect(0f, 0f, width, height), GUIContent.none, _backdropStyle);

            string kind = _mockAds != null && _mockAds.CurrentIsRewarded ? "REWARDED" : "INTERSTITIAL";
            string placement = _mockAds != null ? _mockAds.CurrentPlacement : string.Empty;
            GUI.Label(new Rect(0f, 0f, width, height), $"MOCK {kind} AD\n{placement}", _adLabelStyle);
        }

        private bool Button(string label)
        {
            return GUILayout.Button(label, _buttonStyle, GUILayout.Height(RowHeight));
        }

        private bool Toggle(bool value, string label)
        {
            return GUILayout.Toggle(value, label + (value ? ": ON" : ": off"), _buttonStyle, GUILayout.Height(RowHeight));
        }

        private static string FormatDuration(double totalSeconds)
        {
            var span = TimeSpan.FromSeconds(Math.Max(0d, totalSeconds));
            return span.TotalHours >= 1d
                ? $"{(int)span.TotalHours}h {span.Minutes:00}m"
                : $"{span.Minutes:00}:{span.Seconds:00}";
        }

        private void EnsureStyles()
        {
            if (_stylesReady)
            {
                return;
            }

            _buttonStyle = new GUIStyle(GUI.skin.button) { fontSize = FontSize };
            _labelStyle = new GUIStyle(GUI.skin.label) { fontSize = FontSize, wordWrap = true };
            _headerStyle = new GUIStyle(_labelStyle) { fontStyle = FontStyle.Bold };

            _backdropTexture = new Texture2D(1, 1);
            _backdropTexture.SetPixel(0, 0, new Color(0f, 0f, 0f, AdBackdropAlpha));
            _backdropTexture.Apply();
            _backdropStyle = new GUIStyle { normal = { background = _backdropTexture } };

            _adLabelStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = AdFontSize,
                fontStyle = FontStyle.Bold,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = Color.white },
            };

            _stylesReady = true;
        }
    }
}
