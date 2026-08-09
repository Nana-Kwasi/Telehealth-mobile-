import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './apiClient';

export const PRIVACY_STORAGE_KEY = 'nessaHubPrivacyAccepted';
export const POLICIES_URL = 'https://teleehealth.firebaseapp.com/';
export const POLICY_VERSION = '2025-05';

const DEVICE_ID_KEY = 'nessaHubDeviceId';

export async function getOrCreateDeviceId() {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `mob_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function buildLegalPrivacyFields() {
  return {
    legal: {
      privacyAccepted: true,
      privacyAcceptedAt: new Date().toISOString(),
      privacyPolicyUrl: POLICIES_URL,
      privacyPolicyVersion: POLICY_VERSION,
      privacySource: 'mobile_intro',
    },
  };
}

export async function recordDevicePrivacyConsent() {
  let deviceId;
  try {
    deviceId = await getOrCreateDeviceId();
  } catch {
    // AsyncStorage unavailable — generate an in-memory ID for the API record
    deviceId = `mob_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  }
  // Save locally first so the user is never blocked by a network failure
  await AsyncStorage.setItem(PRIVACY_STORAGE_KEY, 'true');
  // Best-effort server record — ignore errors (offline, backend down, etc.)
  api('/api/v1/consent/device', {
    method: 'POST',
    authenticated: false,
    body: {
      deviceId,
      policyVersion: POLICY_VERSION,
      platform: Platform.OS,
      source: 'mobile_intro',
    },
  }).catch(() => {});
  return deviceId;
}

export function profileCollectionForRole(role) {
  const map = {
    doctor: 'doctors',
    therapist: 'therapists',
    admin: 'therapists',
    pharmacy: 'pharmacies',
    branch_user: 'pharmacyBranches',
    lab: 'labs',
    lab_branch: 'labBranches',
    scan: 'scanCenters',
    scan_branch: 'scanBranches',
  };
  return map[role] || 'auth';
}

export async function syncPrivacyConsentToUser({ userId, role, profileId }) {
  if (!userId) return;
  try {
    const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (deviceId) {
      await api(`/api/v1/consent/device/${deviceId}/link-user`, {
        method: 'PATCH',
        authenticated: false,
        body: { userId: profileId || userId },
      });
    }
  } catch (e) {
    console.warn('syncPrivacyConsentToUser:', e?.message);
  }
}

export async function acceptPrivacyOnDevice() {
  try {
    await recordDevicePrivacyConsent();
  } catch (e) {
    console.warn('[Privacy] recordDevicePrivacyConsent failed, using direct fallback:', e?.message);
    // getOrCreateDeviceId or AsyncStorage.setItem threw — attempt a bare local write
    // so the user is never blocked by a storage hiccup
    AsyncStorage.setItem(PRIVACY_STORAGE_KEY, 'true').catch(() => {});
  }
}
