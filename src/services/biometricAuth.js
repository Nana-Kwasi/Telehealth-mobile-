import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Biometric sign-in: Face ID / Touch ID / fingerprint.
 *
 * WHAT IS STORED, AND WHY IT IS NOT THE PASSWORD
 *
 * A biometric unlock has to produce something the server will accept. The
 * tempting shortcut is to keep the user's password and replay it — that turns
 * every stolen device into a stolen credential, and the password is reusable
 * on other services.
 *
 * Instead the REFRESH TOKEN is kept in the device keychain (expo-secure-store,
 * which is the iOS Keychain and Android Keystore — not AsyncStorage, which is
 * a plaintext file). It is scoped to this app, revocable server-side, and
 * useless once the user logs out.
 *
 * `requireAuthentication` is deliberately NOT set on the SecureStore item.
 * That option makes the OS gate the read itself, but it throws on devices
 * where biometrics are enrolled and then removed, stranding the user with no
 * way back in. We prompt explicitly instead, and only read the token after the
 * prompt succeeds — same guarantee, recoverable failure mode.
 */

const TOKEN_KEY = 'nessa.biometric.refreshToken';
const ENABLED_KEY = 'nessa.biometric.enabled';
const EMAIL_KEY = 'nessa.biometric.email';

/** What this device can actually do. */
export async function biometricCapability() {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return { available: false, reason: 'no_hardware', label: 'Biometrics' };

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) return { available: false, reason: 'not_enrolled', label: 'Biometrics' };

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const T = LocalAuthentication.AuthenticationType;
    const label = types.includes(T.FACIAL_RECOGNITION) ? 'Face ID'
      : types.includes(T.FINGERPRINT) ? 'Fingerprint'
      : 'Biometrics';
    return { available: true, reason: null, label };
  } catch {
    return { available: false, reason: 'error', label: 'Biometrics' };
  }
}

/** Show the OS prompt. Resolves true only on a genuine success. */
export async function promptBiometric(reason = 'Sign in to NessaHub') {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      // Let the user fall back to their device passcode: a failed fingerprint
      // must not be a locked account.
      disableDeviceFallback: false,
      cancelLabel: 'Use password instead',
    });
    return !!res.success;
  } catch {
    return false;
  }
}

/** Called after a successful password login, when the user has opted in. */
export async function enableBiometricLogin(refreshToken, email) {
  if (!refreshToken) return false;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, refreshToken);
    await AsyncStorage.multiSet([[ENABLED_KEY, 'true'], [EMAIL_KEY, email || '']]);
    return true;
  } catch {
    return false;
  }
}

/** Switching it off must destroy the stored token, not just hide the button. */
export async function disableBiometricLogin() {
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch { /* already gone */ }
  await AsyncStorage.multiRemove([ENABLED_KEY, EMAIL_KEY]);
}

export async function refreshBiometricTokenIfEnabled(nextRefreshToken, email) {
  if (!(await isBiometricLoginEnabled())) return false;
  if (!nextRefreshToken) return false;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, nextRefreshToken);
    if (email) await AsyncStorage.setItem(EMAIL_KEY, String(email));
    return true;
  } catch {
    return false;
  }
}

export async function isBiometricLoginEnabled() {
  const v = await AsyncStorage.getItem(ENABLED_KEY);
  return v === 'true';
}

export async function biometricAccountEmail() {
  return (await AsyncStorage.getItem(EMAIL_KEY)) || '';
}

/**
 * The stored refresh token, but ONLY after a successful biometric prompt.
 *
 * Returns null on any failure, including a cancelled prompt — the caller then
 * falls back to the password form rather than being stuck.
 */
export async function unlockRefreshToken(reason) {
  if (!(await isBiometricLoginEnabled())) return null;
  const ok = await promptBiometric(reason);
  if (!ok) return null;
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}
