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
