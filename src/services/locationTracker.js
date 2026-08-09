// ─── Live location tracker (mobile) ──────────────────────────────────────────
//
// Replaces the previous one-shot `getCurrentPositionAsync({ accuracy: Balanced })`
// that only ran when the app was opened. Problems with that approach:
//   • Balanced accuracy resolves from wifi/cell towers, which is both coarse and
//     frequently a cached fix — so a user who moved kept reporting the old spot.
//   • A single reading on app-open means movement during a session never updates.
//
// This module keeps ONE watch subscription per process, streams high-accuracy
// fixes, and only calls the backend when the position has meaningfully changed.
//
// This is an Expo project (expo-location is a dependency; react-native-geolocation-
// service is not installed and would require a native rebuild), so expo-location's
// watchPositionAsync is the correct API here.

import { AppState } from 'react-native';
import * as Location from 'expo-location';

// ── Tuning ───────────────────────────────────────────────────────────────────
// distanceInterval is the primary battery control: the OS only wakes us when the
// device has actually moved this far, rather than us polling on a timer.
export const DISTANCE_THRESHOLD_M = 30;      // "significant movement" (20–50m band)
const TIME_INTERVAL_MS = 15_000;             // floor between OS callbacks
const ACCURACY_IMPROVE_FACTOR = 0.5;         // treat 2x tighter as a real improvement
const MAX_BACKOFF_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 5_000;

let _subscription = null;   // the single active watch
let _starting = false;      // guards against concurrent start() races
let _lastSent = null;       // last position actually pushed to the backend
let _retryTimer = null;
let _retryAttempt = 0;
let _appStateSub = null;
let _onFix = null;          // consumer callback, set by start()

/** Metres between two coordinates (haversine). */
export function metresBetween(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Should this fix go to the backend?
 * Anything that isn't real movement or a real accuracy gain is dropped, so a
 * stationary device doesn't generate a request every time the OS re-reports.
 */
export function shouldSend(prev, next, threshold = DISTANCE_THRESHOLD_M) {
  if (!next) return false;
  if (!prev) return true;                                   // first fix
  if (next.latitude !== prev.latitude) {
    if (metresBetween(prev, next) >= threshold) return true;
  }
  if (next.longitude !== prev.longitude) {
    if (metresBetween(prev, next) >= threshold) return true;
  }
  // Accuracy improved materially at the same spot — worth correcting the record.
  if (
    Number.isFinite(next.accuracy) && Number.isFinite(prev.accuracy)
    && next.accuracy <= prev.accuracy * ACCURACY_IMPROVE_FACTOR
  ) return true;
  return false;
}

function logFix(coords, timestamp, reason) {
  // Everything needed to diagnose a "wrong location" report without a debugger.
  if (!__DEV__) return;
  console.log('[locationTracker]', {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    speed: coords.speed ?? null,
    heading: coords.heading ?? null,
    timestamp: new Date(timestamp).toISOString(),
    ageMs: Date.now() - timestamp,
    // A fix noticeably older than "now" came from the OS cache, not a live read.
    source: Date.now() - timestamp > 5_000 ? 'cached' : 'fresh-gps',
    reason,
  });
}

/** Permission state, distinguishing "denied" from "location services off". */
export async function checkLocationAccess() {
  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesOn) return { ok: false, reason: 'services-disabled' };
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  if (status === 'granted') return { ok: true };
  if (status === 'denied' && !canAskAgain) return { ok: false, reason: 'denied-permanently' };
  const req = await Location.requestForegroundPermissionsAsync();
  if (req.status === 'granted') return { ok: true };
  return { ok: false, reason: 'denied' };
}

function scheduleRetry(reason) {
  clearTimeout(_retryTimer);
  // Exponential backoff, capped — a device indoors with no GPS shouldn't retry in a
  // tight loop and flatten the battery.
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** _retryAttempt, MAX_BACKOFF_MS);
  _retryAttempt += 1;
  if (__DEV__) console.log(`[locationTracker] retry in ${delay}ms (${reason})`);
  _retryTimer = setTimeout(() => { start(_onFix).catch(() => {}); }, delay);
}

/** Tear down the watch. Always called before starting a new one — a leaked
 *  subscription is what produces duplicate updates and doubled battery use. */
export async function stop() {
  clearTimeout(_retryTimer);
  _retryTimer = null;
  if (_subscription) {
    try { _subscription.remove(); } catch { /* already gone */ }
    _subscription = null;
  }
}

/**
 * Start (or restart) tracking. Safe to call repeatedly: any existing watch is
 * removed first, so there is only ever one subscription.
 *
 * @param onFix called with {latitude, longitude, accuracy, gpsTimestamp, speed, heading}
 *              ONLY when the fix is worth persisting.
 */
export async function start(onFix) {
  if (_starting) return false;
  _starting = true;
  _onFix = onFix || _onFix;
  try {
    await stop();

    const access = await checkLocationAccess();
    if (!access.ok) {
      // Not fatal: the user may grant permission or switch services on later, and
      // the AppState listener re-runs start() when they come back to the app.
      if (__DEV__) console.log('[locationTracker] no access:', access.reason);
      return false;
    }

    _subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation, // force real GPS, not wifi
        distanceInterval: DISTANCE_THRESHOLD_M,        // only wake on real movement
        timeInterval: TIME_INTERVAL_MS,
        mayShowUserSettingsDialog: true,
      },
      (pos) => {
        _retryAttempt = 0; // a good fix resets the backoff
        const { coords, timestamp } = pos;
        const next = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy ?? null,
          speed: coords.speed ?? null,
          heading: coords.heading ?? null,
          // The DEVICE's fix time — the backend uses this to reject out-of-order
          // updates, so it must be the GPS timestamp and not Date.now().
          gpsTimestamp: new Date(timestamp).toISOString(),
        };
        const send = shouldSend(_lastSent, next);
        logFix(coords, timestamp, send ? 'sending' : 'skipped (no significant change)');
        if (!send) return;
        _lastSent = next;
        try { _onFix?.(next); } catch { /* consumer errors must not kill the watch */ }
      },
    );
    return true;
  } catch (e) {
    scheduleRetry(e?.message || 'watch failed');
    return false;
  } finally {
    _starting = false;
  }
}

/**
 * Restart tracking whenever the app returns to the foreground. iOS/Android may kill
 * or suspend a watch while backgrounded, and the GPS provider can change (e.g.
 * moving between wifi and cellular), leaving a subscription alive but silent.
 */
export function attachLifecycle(onFix) {
  detachLifecycle();
  _appStateSub = AppState.addEventListener('change', (state) => {
    if (state === 'active') start(onFix).catch(() => {});
    // Foreground-only tracking: dropping the watch on background is what keeps this
    // from draining the battery. Background location needs its own task + native
    // permission and is intentionally not enabled here.
    else stop().catch(() => {});
  });
  return () => detachLifecycle();
}

export function detachLifecycle() {
  if (_appStateSub) {
    try { _appStateSub.remove(); } catch { /* older RN returns void */ }
    _appStateSub = null;
  }
}

/** Test seam / lets a caller force the next fix to be treated as new. */
export function resetLastSent() {
  _lastSent = null;
}
