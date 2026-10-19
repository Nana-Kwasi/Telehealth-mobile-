/** Stable key for deduping `patientProfiles.pharmacies` entries */
export function patientPharmacyKey(ph) {
  if (!ph || typeof ph !== 'object') return '';
  const bid = String(ph.branchId || '').trim();
  if (bid) return `branch:${bid}`;
  const pid = String(ph.pharmacyId || '').trim();
  const bname = String(ph.branchName || '').trim().toLowerCase();
  if (pid && bname) return `plat:${pid}:${bname}`;
  const name = String(ph.name || '').trim().toLowerCase();
  const phone = String(ph.phone || '').trim();
  if (!name && !phone) return '';
  return `manual:${name}|${phone}`;
}

export function hasPatientPharmacy(existing, pharmacy) {
  const k = patientPharmacyKey(pharmacy);
  if (!k) return false;
  return (existing || []).some((p) => patientPharmacyKey(p) === k);
}

export function removePatientPharmacyByKey(existing, pharmacyOrKey) {
  const k = typeof pharmacyOrKey === 'string' ? pharmacyOrKey : patientPharmacyKey(pharmacyOrKey);
  if (!k) return [...(existing || [])];
  return (existing || []).filter((p) => patientPharmacyKey(p) !== k);
}

export function dedupePatientPharmacies(list) {
  const seen = new Set();
  const out = [];
  for (const p of list || []) {
    const k = patientPharmacyKey(p);
    if (!k) {
      out.push(p);
      continue;
    }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/**
 * A `patientProfiles.pharmacies` entry for a directory pharmacy (and branch,
 * when it has one) — the same shape the doctor's "Add E-Pharmacy" saves, so
 * prescription routing and the doctor's screens read it the same way.
 */
export function pharmacyEntryFromDirectory(ph, br, addedBy = 'patient') {
  const pick = (k) => String(br?.[k] || ph?.[k] || br?.location?.[k] || ph?.location?.[k] || '').trim();
  const num = (k) => {
    const n = Number(br?.[k] ?? ph?.[k] ?? br?.location?.[k] ?? ph?.location?.[k]);
    return Number.isFinite(n) && (br?.[k] ?? ph?.[k] ?? br?.location?.[k] ?? ph?.location?.[k]) != null ? n : null;
  };
  const pharmacyName = ph?.pharmacyName || ph?.name || 'Pharmacy';
  const branchName = br?.branchName || '';
  return {
    name: [branchName, pharmacyName].filter(Boolean).join(' · '),
    address: pick('address'),
    country: pick('country'),
    city: pick('city'),
    area: pick('area'),
    region: pick('region'),
    street: pick('street'),
    ghanaDigitalAddress: pick('ghanaDigitalAddress'),
    latitude: num('latitude'),
    longitude: num('longitude'),
    phone: String(br?.phone || ph?.phone || '').trim(),
    pharmacyId: ph?.id || null,
    branchId: br?.id || null,
    pharmacyName,
    branchName,
    source: 'platform',
    addedByPatient: addedBy === 'patient',
    addedAt: new Date().toISOString(),
  };
}
