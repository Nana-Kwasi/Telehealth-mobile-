import { useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/apiClient';
import useAddressAutofillMobile from '../hooks/useAddressAutofillMobile';

function roleEndpoint(role, id) {
  if (!id) return null;
  if (role === 'doctor') return `/api/v1/doctors/${id}`;
  if (role === 'therapist' || role === 'admin') return `/api/v1/therapists/${id}`;
  if (role === 'homecare_nurse') return `/api/v1/homecare/nurses/${id}`;
  return `/api/v1/patients/${id}`;
}

function roleTarget(role, profile) {
  const id = profile?.id || null;
  if (!id) return null;
  return { endpoint: roleEndpoint(role, id), id };
}

function hasLocationData(data) {
  if (!data) return false;
  const lat = Number(data?.latitude ?? data?.locationMeta?.latitude ?? data?.location?.latitude);
  const lng = Number(data?.longitude ?? data?.locationMeta?.longitude ?? data?.location?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  return !!(data?.country || data?.city || data?.area || data?.region || data?.street);
}

/**
 * Silent location gate. On login it auto-detects the user's current location
 * (once) and saves it to their profile — no modal, no manual step, no repeated
 * prompts. If the user already has a saved location, or detection isn't
 * available (permission denied), it simply does nothing. Users can still edit
 * their address manually from the Profile screen.
 */
export default function DashboardLocationGateMobile({ role, profile, active = false }) {
  const { detectAddress } = useAddressAutofillMobile();
  const target = useMemo(() => roleTarget(role, profile), [role, profile]);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!active || !target || ranRef.current) return;
    ranRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const doneKey = `loc.autosaved.${target.id}`;
        if (await AsyncStorage.getItem(doneKey)) return; // already auto-saved this account

        const data = (target.endpoint ? await api(target.endpoint).catch(() => null) : null) || {};
        if (hasLocationData(data)) { await AsyncStorage.setItem(doneKey, '1'); return; }

        // No location yet — detect the current location and save it silently.
        detectAddress(async (loc) => {
          if (cancelled || !loc) return;
          const latitude = Number.isFinite(Number(loc.latitude)) ? Number(loc.latitude) : null;
          const longitude = Number.isFinite(Number(loc.longitude)) ? Number(loc.longitude) : null;
          if (latitude == null && !loc.city && !loc.country) return; // nothing usable
          try {
            await api(target.endpoint, {
              method: 'PATCH',
              body: {
                country: loc.countryCode || loc.country || null,
                city: loc.city || null,
                area: loc.area || null,
                region: loc.region || null,
                street: loc.street || null,
                latitude,
                longitude,
              },
            });
            await AsyncStorage.setItem(doneKey, '1');
          } catch { /* best-effort; user can set it manually in Profile */ }
        });
      } catch { /* ignore */ }
    })();

    return () => { cancelled = true; };
  }, [active, target, detectAddress]);

  return null; // never renders UI
}
