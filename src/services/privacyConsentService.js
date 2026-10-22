import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './apiClient';

export const PRIVACY_STORAGE_KEY = 'nessaHubPrivacyAccepted';
export const POLICIES_URL = 'https://policy.nessahub.com/';
export const POLICY_VERSION = '2025-05';

export const DEVICE_ID_KEY = 'nessaHubDeviceId';

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
      // Signed in, and the server uses the signed-in account: the old
      // link-user call was unauthenticated and attached consents to whatever
      // id was sent (and the profile id it sent was not the account id).
      await api(`/api/v1/consents/device/${encodeURIComponent(deviceId)}/link`, { method: 'POST' });
    }
  } catch (e) {
    console.warn('syncPrivacyConsentToUser:', e?.message);
  }
  recordPendingTeenConsent().catch(() => {});
}

/**
 * Parent/guardian consent for teen therapy is collected before the account
 * exists and was kept only on the phone. Once signed in, record it in the
 * append-only consent ledger (context teen_registration), once.
 */
async function recordPendingTeenConsent() {
  let consent = null;
  try { consent = JSON.parse((await AsyncStorage.getItem('th.parentConsent')) || 'null'); } catch { consent = null; }
  if (!consent || !consent.signedAt || consent.recordedAt) return;
  const { TEEN_CONSENT_ITEMS } = require('../constants/teenTherapyConfig');
  const signer = consent.signature ? ` — signed by ${consent.signature}` : '';
  const items = TEEN_CONSENT_ITEMS
    .filter((c) => consent[c.key] === true)
    .map((c) => ({
      key: `teen_${c.key.replace(/Consent$/, '').replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}`,
      title: `${c.title}${signer}`,
      version: POLICY_VERSION,
    }));
  if (!items.length) return;
  await api('/api/v1/consents', { method: 'POST', body: { context: 'teen_registration', platform: Platform.OS, items } });
  await AsyncStorage.setItem('th.parentConsent', JSON.stringify({ ...consent, recordedAt: new Date().toISOString() }));
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
