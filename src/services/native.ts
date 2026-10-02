import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar } from '@capacitor/status-bar';
import { log } from '../core/log';

/**
 * The native app layer (Capacitor: the same game, wrapped as an iOS and an Android app for the stores). In a
 * browser every call here is a no-op or falls back to the web, so the Artifact build behaves as before.
 *
 * - Saves: localStorage in an app's web view can be cleared by the system when the phone runs low on space,
 *   so every save is mirrored to the app's own preferences (UserDefaults / SharedPreferences) and restored
 *   from there at launch if the web copy is missing or older.
 * - Haptics: real taps on iPhones (Safari has no vibration API) and Android's own feedback.
 * - Lifecycle: going to the background saves and pauses at once (the web view's visibility events can be
 *   late); the Android back button closes the open sheet, or sends the app to the background.
 * - Look: full screen (no status bar over the HUD), the launch screen held until the first frame is ready.
 */
export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform();

/** Restores the save from native preferences if the web copy is missing or older (call before the game loads). */
export async function restoreSave(key: string): Promise<void> {
  if (!isNative) return;
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return;
    const web = window.localStorage.getItem(key);
    if (web && savedAt(web) >= savedAt(value)) return;
    window.localStorage.setItem(key, value);
    log.info('Native', 'Save restored from app storage');
  } catch (error) {
    log.warn('Native', 'Restoring the save failed', error);
  }
}

/** When a save was written (its lastActiveAt), or 0 if it cannot be read. */
function savedAt(json: string): number {
  try {
    const at = (JSON.parse(json) as { lastActiveAt?: unknown }).lastActiveAt;
    return typeof at === 'number' ? at : 0;
  } catch {
    return 0;
  }
}

let pendingMirror: { key: string; contents: string } | null = null;
let mirrorBusy = false;

/** Copies a save into native preferences (coalesced: only the newest of a burst of writes is sent). */
export function mirrorSave(key: string, contents: string): void {
  if (!isNative) return;
  pendingMirror = { key, contents };
  if (mirrorBusy) return;
  mirrorBusy = true;
  const flush = (): void => {
    const next = pendingMirror;
    pendingMirror = null;
    if (!next) {
      mirrorBusy = false;
      return;
    }
    Preferences.set({ key: next.key, value: next.contents }).catch((error: unknown) => log.warn('Native', 'Mirroring the save failed', error)).finally(flush);
  };
  flush();
}

export function forgetSave(key: string): void {
  if (!isNative) return;
  void Preferences.remove({ key }).catch(() => undefined);
}

export type HapticKind = 'tick' | 'light' | 'medium' | 'heavy' | 'success';

/** A native haptic, or false when not running as an app (the caller then uses the web's vibration). */
export function nativeHaptic(kind: HapticKind): boolean {
  if (!isNative) return false;
  const run = (): Promise<void> => {
    switch (kind) {
      case 'tick':
        return Haptics.selectionChanged();
      case 'light':
        return Haptics.impact({ style: ImpactStyle.Light });
      case 'medium':
        return Haptics.impact({ style: ImpactStyle.Medium });
      case 'heavy':
        return Haptics.impact({ style: ImpactStyle.Heavy });
      case 'success':
        return Haptics.notification({ type: NotificationType.Success });
    }
  };
  void run().catch(() => undefined);
  return true;
}

export interface NativeHooks {
  /** The app went to the background (save now, pause, quiet the audio). */
  pause(): void;
  /** Back in the foreground. */
  resume(): void;
  /** Android's back button: return true if something (a sheet) was closed. */
  back(): boolean;
}

/** Wires the app's lifecycle and look. Call once the game exists; `ready` once its first frame is drawn. */
export function connectNative(hooks: NativeHooks): { ready(): void } {
  if (!isNative) return { ready: () => undefined };
  void StatusBar.hide().catch(() => undefined);
  void App.addListener('appStateChange', ({ isActive }) => (isActive ? hooks.resume() : hooks.pause()));
  void App.addListener('backButton', () => {
    if (!hooks.back()) void App.minimizeApp().catch(() => undefined);
  });
  return {
    ready: () => {
      void SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
    },
  };
}
