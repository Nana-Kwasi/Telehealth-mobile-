import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';

/**
 * For each patient in patMap whose name is missing/generic,
 * fetches the real name from auth/{patientId} in Firestore.
 * Returns a new Map with enriched names.
 */
export async function enrichPatientNames(patMap) {
  const enriched = new Map(patMap);
  const lookups = [];

  for (const [id, patient] of enriched.entries()) {
    if (!patient.name || patient.name === 'Patient') {
      lookups.push(id);
    }
  }

  await Promise.all(
    lookups.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'auth', id));
        if (snap.exists()) {
          const d = snap.data();
          const name = d.name || d.displayName || d.fullName || null;
          if (name) {
            const existing = enriched.get(id);
            enriched.set(id, { ...existing, name });
          }
        }
      } catch (_) {}
    })
  );

  return enriched;
}

/**
 * Builds a patient map from an appointments snapshot,
 * then enriches with real names from Firestore auth collection.
 */
export async function buildEnrichedPatientMap(apptDocs) {
  const patMap = new Map();

  apptDocs.forEach(d => {
    const data = d.data ? d.data() : d;
    if (!data.clientId) return;
    const prev = patMap.get(data.clientId);
    if (!prev) {
      patMap.set(data.clientId, {
        id: data.clientId,
        name: data.clientName || '',
        email: data.clientEmail || '',
        lastVisit: data.date || '',
        visitCount: 1,
        completedCount: data.status === 'completed' ? 1 : 0,
      });
    } else {
      prev.visitCount += 1;
      if (data.status === 'completed') prev.completedCount += 1;
      if ((data.date || '') > prev.lastVisit) prev.lastVisit = data.date;
      if (!prev.name && data.clientName) prev.name = data.clientName;
    }
  });

  return enrichPatientNames(patMap);
}
