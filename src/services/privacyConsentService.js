import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';

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

/** Legal fields merged onto the signed-in user's Firestore profile. */
export function buildLegalPrivacyFields() {
  return {
    legal: {
      privacyAccepted: true,
      privacyAcceptedAt: serverTimestamp(),
      privacyPolicyUrl: POLICIES_URL,
      privacyPolicyVersion: POLICY_VERSION,
      privacySource: 'mobile_intro',
    },
  };
}

/**
 * Pre-login: log acceptance on this device (Firestore doc id = deviceId).
 * Requires `appPrivacyConsents` rules in firestore.rules.
 */
export async function recordDevicePrivacyConsent() {
  const deviceId = await getOrCreateDeviceId();
  await setDoc(
    doc(db, 'appPrivacyConsents', deviceId),
    {
      deviceId,
      accepted: true,
      acceptedAt: serverTimestamp(),
      policyUrl: POLICIES_URL,
      policyVersion: POLICY_VERSION,
      platform: Platform.OS,
      source: 'mobile_intro',
      userId: null,
      linkedAt: null,
    },
    { merge: true },
  );
  await AsyncStorage.setItem(PRIVACY_STORAGE_KEY, 'true');
  return deviceId;
}

/** Map role → Firestore collection for the signed-in account. */
export function profileCollectionForRole(role) {
  switch (role) {
    case 'doctor':
      return 'doctors';
    case 'therapist':
    case 'admin':
      return 'therapists';
    case 'pharmacy':
      return 'pharmacies';
    case 'branch_user':
      return 'pharmacyBranches';
    case 'lab':
      return 'labs';
    case 'lab_branch':
      return 'labBranches';
    case 'scan':
      return 'scanCenters';
    case 'scan_branch':
      return 'scanBranches';
    case 'client':
    default:
      return 'auth';
  }
}

/**
 * After login/sign-up: copy acceptance onto the user's profile and link the device consent doc.
 */
export async function syncPrivacyConsentToUser({ userId, role, profileId }) {
  if (!userId) return;
  const docId = profileId || userId;
  const collection = profileCollectionForRole(role);

  try {
    await updateDoc(doc(db, collection, docId), buildLegalPrivacyFields());
  } catch (e) {
    console.warn('syncPrivacyConsentToUser profile update:', e?.message || e);
  }

  if (role === 'client') {
    try {
      const clientId = profileId && profileId !== userId ? profileId : null;
      if (clientId) {
        await updateDoc(doc(db, 'clients', clientId), buildLegalPrivacyFields());
      }
    } catch (_) {}
    try {
      await updateDoc(doc(db, 'patientProfiles', docId), buildLegalPrivacyFields());
    } catch (_) {}
  }

  try {
    const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (deviceId) {
      await updateDoc(doc(db, 'appPrivacyConsents', deviceId), {
        userId,
        role: role || 'client',
        linkedAt: serverTimestamp(),
      });
    }
  } catch (_) {}
}

/** Accept on intro screen: local cache + Firestore device log. */
export async function acceptPrivacyOnDevice() {
  await recordDevicePrivacyConsent();
  const user = auth.currentUser;
  if (user) {
    await syncPrivacyConsentToUser({ userId: user.uid, role: 'client', profileId: user.uid });
  }
}
