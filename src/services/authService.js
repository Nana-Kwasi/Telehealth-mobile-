import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, storeSession, clearSession, STORAGE_KEYS, getStoredToken, getStoredUserId } from './apiClient';
import { registerForPushNotifications, unregisterPushNotifications } from './notificationService';
import { isBiometricLoginEnabled, enableBiometricLogin, disableBiometricLogin } from './biometricAuth';

// ─── Role mapping: backend enum → mobile string ───────────────────────────────
function mapRole(backendRole) {
  const map = {
    ADMIN: 'admin',
    DOCTOR: 'doctor',
    PATIENT: 'patient',
    PHARMACY: 'pharmacy',
    LAB: 'lab',
    SCAN_CENTER: 'scan',
    THERAPIST: 'therapist',
    CLIENT: 'client',
    HOME_CARE_NURSE: 'homecare_nurse',
  };
  return map[String(backendRole).toUpperCase()] || 'client';
}

// Strip a leading title ("Dr", "Prof", "Mr"…) so screens that render "Dr. {name}"
// don't produce "Dr. Dr Zack". Leaves names like "Drew" intact.
function stripHonorific(name) {
  if (!name) return name;
  return String(name).replace(/^\s*(dr|prof|professor|mr|mrs|ms|miss|mister)\.?\s+/i, '').trim();
}

// ─── Fetch role-appropriate profile after login ───────────────────────────────
async function fetchProfileForRole(userId, mobileRole) {
  try {
    if (mobileRole === 'therapist' || mobileRole === 'admin') {
      return await api(`/api/v1/therapists/${userId}`);
    }
    if (mobileRole === 'doctor') {
      return await api(`/api/v1/doctors/${userId}`);
    }
    if (mobileRole === 'patient' || mobileRole === 'client') {
      const base = await api(`/api/v1/patients/${userId}`);

      // The MEMBERSHIP TIER decides which dashboard a client gets — a Second
      // Opinion user must not see a programme they have not bought. It does not
      // live on the patient record, so it was absent from every profile the app
      // cached: the tier check silently read undefined and everyone landed on
      // the member dashboard. Ask the one endpoint that knows.
      const tier = await api('/api/v1/medpsych/me').catch(() => null);
      return {
        ...(base || {}),
        membershipTier: tier?.membershipTier || 'member',
        isSecondOpinion: Boolean(tier?.isSecondOpinion),
        isLimited: Boolean(tier?.isLimited),
      };
    }
    if (mobileRole === 'homecare_nurse') {
      const nurses = await api(`/api/v1/homecare/nurses?userId=${userId}`);
      const nurse = Array.isArray(nurses) ? nurses[0] : nurses;
      if (nurse?.id) {
        await AsyncStorage.setItem(STORAGE_KEYS.nurseId, String(nurse.id));
      }
      return nurse || null;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Core login ───────────────────────────────────────────────────────────────
export async function signInWithEmailOrUsername(identifier, password) {
  const email = identifier.trim().toLowerCase();
  const data = await api('/api/v1/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { email, password },
  });

  // 2FA on: the password was right, but this is NOT a session yet. Returning
  // here matters — storeSession would otherwise write a null token and the
  // profile fetch below would 401, which looks like a broken login rather
  // than a second factor being required.
  if (data.twoFactorRequired) {
    return {
      twoFactorRequired: true,
      challengeId: data.challengeId,
      email: data.email || email,
    };
  }

  const mobileRole = mapRole(data.role);

  await storeSession({
    token: data.token,
    refreshToken: data.refreshToken,
    userId: data.userId,
    role: mobileRole,
    // Kept for Paystack: every charge needs a real email for the receipt.
    email: data.email || email,
  });

  const profile = await fetchProfileForRole(data.userId, mobileRole);

  const resolvedProfile = {
    id: data.userId,
    uid: data.userId,
    email: data.email,
    role: mobileRole,
    fullName: profile?.fullName || profile?.name || '',
    name: profile?.fullName || profile?.name || '',
    status: 'active',
    ...(profile || {}),
  };

  // Doctors/therapists render as "Dr. {name}" — strip any stored title so it
  // doesn't double up ("Dr. Dr Zack").
  if (mobileRole === 'doctor' || mobileRole === 'therapist') {
    const stripped = stripHonorific(resolvedProfile.name || resolvedProfile.fullName);
    resolvedProfile.name = stripped;
    resolvedProfile.fullName = stripped;
  }

  // The forced password-change flag lives on the canonical `users` row, not the
  // role-specific profile (e.g. /api/v1/patients/{id} never returns it). Pull it
  // from resolve-role so the ForcedPasswordChangeGate can fire on first login.
  //
  // resolve-role is also the only source of truth for organisation accounts:
  // `users.role` is just PHARMACY / LAB / SCAN_CENTER for a parent *and* for each
  // of its branch logins, so /auth/login alone cannot tell them apart. resolve-role
  // detects a branch (uid == organization_branches.id) and returns the branch role
  // plus the org/branch names and ids the dashboards read.
  let effectiveRole = mobileRole;
  try {
    const rr = await api(`/api/v1/auth/mobile/resolve-role/${data.userId}`);
    if (rr?.profile?.mustChangePassword !== undefined) {
      resolvedProfile.mustChangePassword = rr.profile.mustChangePassword;
    }
    if (rr?.profile) {
      // Merge the organisation fields (organizationId, pharmacyName / labName /
      // centerName, branchId, branchName…). `id` and `role` are pinned below so a
      // stale value in the payload cannot break routing.
      Object.assign(resolvedProfile, rr.profile, {
        id: data.userId,
        uid: data.userId,
        email: resolvedProfile.email,
      });
      if (rr.profile.fullName || rr.profile.name || rr.profile.displayName) {
        resolvedProfile.name = rr.profile.name || rr.profile.displayName || rr.profile.fullName;
        resolvedProfile.fullName = resolvedProfile.name;
      }
    }
    // Only adopt the branch roles. Every other role already resolves correctly from
    // /auth/login, and narrowing this keeps working dashboards untouched.
    const BRANCH_ROLES = ['branch_user', 'lab_branch', 'scan_branch'];
    if (BRANCH_ROLES.includes(rr?.role)) {
      effectiveRole = rr.role;
      await AsyncStorage.setItem(STORAGE_KEYS.role, effectiveRole);
    }
    resolvedProfile.role = effectiveRole;
  } catch (_) {
    /* non-fatal — gate simply won't show if this lookup fails */
  }

  // persist for quick re-access
  await AsyncStorage.setItem('userProfile', JSON.stringify(resolvedProfile));
  await AsyncStorage.setItem('th.userId', data.userId);

  // Detect & publish current location right after login (best-effort).
  import('./liveLocation').then((m) => m.refreshCurrentLocation({ force: true })).catch(() => {});

  // Register this device for push now that we have a session. Deliberately not
  // awaited: a permission prompt or a slow Expo round trip must not hold up the
  // login, and a device that declines simply never gets pushes.
  registerForPushNotifications().catch(() => {});

  return { role: effectiveRole, profile: resolvedProfile };
}

// ─── Resolve role from stored session (no Firestore lookup needed) ─────────────
export async function resolveRole(uid) {
  const storedRole = await AsyncStorage.getItem(STORAGE_KEYS.role);
  const storedUserId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (storedRole && storedUserId) {
    let profile = null;
    try {
      const raw = await AsyncStorage.getItem('userProfile');
      if (raw) profile = JSON.parse(raw);
    } catch {}
    return { role: storedRole, profile: profile || { id: storedUserId, uid: storedUserId, role: storedRole } };
  }
  return { role: 'guest', profile: null };
}

// ─── Username/email lookup (username not supported by backend — treat as email) ─
export async function findUserByUsernameOrEmail(identifier) {
  return null; // backend resolves by email only in login endpoint
}

// ─── Logout ────────────────────────────────────────────────────────────────────
export async function logUserLogout(userId, userRole, profile) {
  try {
    const token = await getStoredToken();
    if (!token) return;
    await api('/api/v1/auth/logout', {
      method: 'POST',
      body: { refreshToken: await AsyncStorage.getItem(STORAGE_KEYS.refreshToken) },
    }).catch(() => {}); // best-effort
  } catch {}
}

export async function performLogout({ userId, role, profile, clearCoupleKeys = false } = {}) {
  // Withdraw this device's push token BEFORE the session is cleared — the call
  // needs the access token to authenticate. Leaving it registered would keep
  // this handset receiving the departing user's notifications, previews and all.
  try {
    await unregisterPushNotifications();
  } catch {}

  try {
    await logUserLogout(userId, role, profile);
  } catch {}

  if (clearCoupleKeys) {
    try {
      const { clearCoupleLocalSession } = await import('./coupleTherapyService');
      await clearCoupleLocalSession();
    } catch {}
  }

  // Do not force-disable biometric sign-in on every logout. A normal logout is
  // not the same as a revoked refresh-token family. If the stored biometric
  // refresh token is no longer valid, the login screen catches the backend error
  // and disables it there with a clearer recovery message.
  await clearSession();
  await AsyncStorage.multiRemove(['userProfile', 'clientData', 'therapistData', 'th.clientId', 'userName']);
  await wipeLocalData();
}

/**
 * Remove every locally cached key.
 *
 * Deliberately NOT `AsyncStorage.clear()`. On iOS that deletes the storage
 * DIRECTORY itself, which fails with NSCocoaErrorDomain Code=4
 * ("RCTAsyncLocalStorage couldn't be removed") — and because every caller had
 * it before the navigation line, a failed wipe left the user logged in and
 * staring at an error. Removing the keys leaves the directory alone.
 *
 * Never throws: signing out must not be blocked by a storage problem. The
 * session token is already gone by this point, which is what actually matters.
 */
export async function wipeLocalData() {
  try {
    const keepKeys = new Set([
      'nessa.biometric.enabled',
      'nessa.biometric.email',
      'nessa.biometric.refreshToken',
    ]);
    const keys = await AsyncStorage.getAllKeys();
    const removable = keys.filter((key) => !keepKeys.has(key));
    if (removable.length) await AsyncStorage.multiRemove(removable);
  } catch (err) {
    if (__DEV__) console.warn('[authService] local data wipe failed (ignored):', err?.message);
  }
}

// ─── Stub kept for compatibility ───────────────────────────────────────────────
export function signOut() {
  return performLogout();
}

/**
 * Finish a 2FA sign-in by exchanging the emailed code for a session.
 *
 * Shares everything after the token exchange with the password path, so a
 * 2FA login lands in exactly the same state as an ordinary one.
 */
export async function completeTwoFactorSignIn(challengeId, code) {
  const data = await api('/api/v1/auth/2fa/verify', {
    method: 'POST',
    authenticated: false,
    body: { challengeId, code: String(code || '').trim() },
  });
  return finishSession(data, data.email);
}

/**
 * Sign in with a refresh token released by the device's biometric prompt.
 *
 * No password is involved and none is stored — see services/biometricAuth.js.
 * A rejected refresh means the token was revoked (logout elsewhere, password
 * change), so the caller falls back to the password form.
 */
export async function signInWithRefreshToken(refreshToken) {
  const data = await api('/api/v1/auth/refresh', {
    method: 'POST',
    authenticated: false,
    body: { refreshToken },
  });
  if (!data?.token) throw new Error('Your saved sign-in has expired. Please use your password.');
  return finishSession(data, data.email);
}

/** The half of sign-in that runs once a real token exists. */
async function finishSession(data, fallbackEmail) {
  const mobileRole = mapRole(data.role);

  await storeSession({
    token: data.token,
    refreshToken: data.refreshToken,
    userId: data.userId,
    role: mobileRole,
    email: data.email || fallbackEmail,
  });

  if (await isBiometricLoginEnabled()) {
    await enableBiometricLogin(data.refreshToken, data.email || fallbackEmail);
  }

  const profile = await fetchProfileForRole(data.userId, mobileRole);

  const resolvedProfile = {
    id: data.userId,
    uid: data.userId,
    email: data.email,
    role: mobileRole,
    fullName: profile?.fullName || profile?.name || '',
    name: profile?.fullName || profile?.name || '',
    status: 'active',
    ...(profile || {}),
  };

  await AsyncStorage.setItem('userRole', mobileRole);
  await AsyncStorage.setItem('userProfile', JSON.stringify(resolvedProfile));

  return { role: mobileRole, profile: resolvedProfile, refreshToken: data.refreshToken };
}
