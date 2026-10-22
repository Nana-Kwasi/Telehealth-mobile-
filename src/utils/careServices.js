import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One patient account covers both medical care and therapy (same as the web).
 *
 * resolve-role reports `profile.services` (the ones this account uses) and
 * `profile.userIntent` (the one used most recently). Which dashboard opens:
 *   1. a flow the person just finished (therapy questionnaire, doctor booking)
 *      — that flow calls chooseService() before landing;
 *   2. otherwise the service they last switched to on this phone;
 *   3. otherwise the server's most-recently-used service;
 *   4. otherwise the role they signed up with (patient → medical).
 * The drawer's "Switch to …" row changes it at any time.
 */

const KEY = (uid) => `nessa.activeService.${uid}`;
export const CARE_SERVICES = ['medical', 'therapy'];

export async function getChosenService(uid) {
  if (!uid) return null;
  try { return await AsyncStorage.getItem(KEY(uid)); } catch { return null; }
}

export async function chooseService(uid, service) {
  if (!uid || !CARE_SERVICES.includes(service)) return;
  try {
    await AsyncStorage.multiSet([[KEY(uid), service], ['userIntent', service]]);
  } catch { /* storage unavailable */ }
}

/** Services this account uses; an older backend without `services` reports one. */
export function accountServices(profile, role) {
  if (Array.isArray(profile?.services) && profile.services.length) return profile.services;
  const intent = String(profile?.userIntent || '').toLowerCase();
  if (CARE_SERVICES.includes(intent)) return [intent];
  return [role === 'patient' ? 'medical' : 'therapy'];
}

/** 'medical' or 'therapy' — the dashboard a patient-side account opens on. */
export async function activeService(profile, role) {
  const uid = profile?.id || profile?.uid;
  const services = accountServices(profile, role);
  // A flow may have just started a service the server has no record of yet.
  const chosen = await getChosenService(uid);
  if (CARE_SERVICES.includes(chosen)) return chosen;
  const intent = String(profile?.userIntent || '').toLowerCase();
  if (services.includes(intent)) return intent;
  return services[0];
}

export const rootRouteForService = (service) => (service === 'medical' ? 'MedicalMain' : 'Main');
