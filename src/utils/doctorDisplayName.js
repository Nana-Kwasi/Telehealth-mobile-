import { doc, getDoc } from 'firebase/firestore';

export async function getDoctorDisplayName(db, doctorId, fallbacks = []) {
  if (!doctorId) {
    for (const f of fallbacks) if (f && String(f).trim()) return String(f).trim();
    return 'Doctor';
  }
  try {
    const snap = await getDoc(doc(db, 'doctors', doctorId));
    if (snap.exists()) {
      const d = snap.data();
      const n = d.name || d.displayName || d.fullName;
      if (n && String(n).trim()) return String(n).trim();
    }
  } catch (_) { /* ignore */ }
  for (const f of fallbacks) {
    if (f && String(f).trim() && f !== 'Doctor') return String(f).trim();
  }
  return 'Doctor';
}
