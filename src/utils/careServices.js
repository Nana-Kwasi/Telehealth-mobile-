import { useEffect, useState } from 'react';
import { api, getStoredUserId } from '../services/apiClient';
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

// ── The account's services, even when the navigator's profile is stale ─────
// After a fresh sign-in the navigator can still hold the profile from app start
// (none), so the drawer would think this account has one service. Ask the
// server once per sign-in instead.

let servicesCache = null; // { uid, services, intent, name }

export function resetAccountServicesCache() { servicesCache = null; chooserShownFor = null; }

export function useAccountServices(profile, role) {
  const fromProfile = Array.isArray(profile?.services) && profile.services.length ? profile.services : null;
  const [info, setInfo] = useState(() => (fromProfile ? { services: fromProfile, name: profile?.fullName || profile?.name } : servicesCache));
  useEffect(() => {
    if (fromProfile) return undefined;
    let alive = true;
    (async () => {
      const uid = await getStoredUserId();
      if (!uid) return;
      if (servicesCache && servicesCache.uid === uid) { if (alive) setInfo(servicesCache); return; }
      try {
        const r = await api(`/api/v1/auth/mobile/resolve-role/${uid}`);
        const p = r?.profile || {};
        servicesCache = { uid, services: accountServices(p, String(r?.role || role || '').toLowerCase()), name: p.fullName || p.name };
        if (alive) setInfo(servicesCache);
      } catch { /* keep what we have */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromProfile ? fromProfile.join(',') : '']);
  return { services: info?.services || accountServices(profile, role), name: info?.name || profile?.fullName || profile?.name };
}

// The sign-in chooser is asked once per sign-in (app launch or new sign-in).
let chooserShownFor = null;
export function chooserNeeded(uid) { return !!uid && chooserShownFor !== uid; }
export function markChooserShown(uid) { chooserShownFor = uid; }
