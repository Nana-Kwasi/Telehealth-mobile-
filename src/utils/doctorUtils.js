import { api } from '../services/apiClient';

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
        const data = await api(`/api/v1/patients/${id}`);
        const name = data?.fullName || data?.name || null;
        if (name) {
          const existing = enriched.get(id);
          enriched.set(id, { ...existing, name });
        }
      } catch (_) {}
    })
  );

  return enriched;
}

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
