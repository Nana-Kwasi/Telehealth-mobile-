import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchNurseProfile,
  fetchNurseBookings,
  fetchPendingRequestsForNurse,
  fetchOpenEmergencyRequests,
  fetchOngoingEngagements,
  updateNurseLocation,
  getCurrentLocationMobile,
} from '../services/homeCareService';
import { parseCoords } from '../utils/homeCareGeo';

const HomeCareNurseContext = createContext(null);

export function useHomeCareNurse() {
  const ctx = useContext(HomeCareNurseContext);
  if (!ctx) throw new Error('useHomeCareNurse requires HomeCareNurseProvider');
  return ctx;
}

export function HomeCareNurseProvider({ profile, children }) {
  const [nurse, setNurse] = useState(profile);
  const [pending, setPending] = useState([]);
  const [emergency, setEmergency] = useState([]);
  const [ongoing, setOngoing] = useState([]);
  const [active, setActive] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const n = await fetchNurseProfile(profile.id);
      setNurse(n || profile);
      const loc = await getCurrentLocationMobile();
      if (loc) await updateNurseLocation(profile.id, loc).catch(() => {});

      const nurseAnchor = loc || parseCoords(n);
      const [pend, all, em, ong] = await Promise.all([
        fetchPendingRequestsForNurse(profile.id),
        fetchNurseBookings(profile.id),
        fetchOpenEmergencyRequests(nurseAnchor),
        fetchOngoingEngagements(profile.id),
      ]);
      setPending(pend);
      setEmergency(em);
      setOngoing(ong);
      setActive(all.filter((b) => ['accepted', 'in_progress', 'ongoing'].includes(b.status)));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <HomeCareNurseContext.Provider
      value={{
        profile,
        nurse,
        setNurse,
        pending,
        emergency,
        ongoing,
        active,
        loading,
        refresh,
      }}
    >
      {children}
    </HomeCareNurseContext.Provider>
  );
}
