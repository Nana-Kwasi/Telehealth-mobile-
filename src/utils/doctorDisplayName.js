import { api } from '../services/apiClient';

// db parameter kept for backward compatibility but ignored
export async function getDoctorDisplayName(dbOrDoctorId, doctorIdOrFallbacks, fallbacksOrUndefined) {
  // Support both old signature (db, doctorId, fallbacks) and new (doctorId, fallbacks)
  let doctorId, fallbacks;
  if (typeof dbOrDoctorId === 'string') {
    doctorId = dbOrDoctorId;
    fallbacks = Array.isArray(doctorIdOrFallbacks) ? doctorIdOrFallbacks : [];
  } else {
    doctorId = doctorIdOrFallbacks;
    fallbacks = Array.isArray(fallbacksOrUndefined) ? fallbacksOrUndefined : [];
  }

  if (!doctorId) {
    for (const f of fallbacks) if (f && String(f).trim()) return String(f).trim();
    return 'Doctor';
  }
  try {
    const data = await api(`/api/v1/doctors/${doctorId}`);
    const n = data?.fullName || data?.name;
    if (n && String(n).trim()) return String(n).trim();
  } catch (_) {}
  for (const f of fallbacks) {
    if (f && String(f).trim() && f !== 'Doctor') return String(f).trim();
  }
  return 'Doctor';
}
