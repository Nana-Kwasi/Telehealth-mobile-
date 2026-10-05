import { api } from '../services/apiClient';
import { steps, phq9Questions } from '../constants/questionnaireSteps';

export const PHQ9_SCALE = [
  { value: 0, label: 'Not at all' },
  { value: 1, label: 'Several days' },
  { value: 2, label: 'More than half the days' },
  { value: 3, label: 'Nearly every day' },
];

export function formatPhq9Answer(raw) {
  const num = Number(raw);
  if (Number.isNaN(num)) return { score: null, label: String(raw), display: String(raw) };
  const match = PHQ9_SCALE.find((o) => o.value === num);
  const label = match?.label ?? `Score ${num}`;
  return { score: num, label, display: label };
}

export function getPhq9Severity(total) {
  if (total == null || Number.isNaN(total)) return null;
  if (total <= 4)  return { key: 'minimal',           label: 'Minimal symptoms',     hint: '0–4' };
  if (total <= 9)  return { key: 'mild',              label: 'Mild depression',       hint: '5–9' };
  if (total <= 14) return { key: 'moderate',          label: 'Moderate depression',   hint: '10–14' };
  if (total <= 19) return { key: 'moderately-severe', label: 'Moderately severe',     hint: '15–19' };
  return              { key: 'severe',             label: 'Severe depression',     hint: '20–27' };
}

// Normalize timestamps from either Firestore Timestamp objects or ISO strings
export function toFirestoreDate(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') { const d = new Date(val); return Number.isNaN(d.getTime()) ? null : d; }
  if (val.toDate && typeof val.toDate === 'function') { const d = val.toDate(); return Number.isNaN(d.getTime()) ? null : d; }
  if (typeof val === 'object') {
    const sec = val.seconds ?? val._seconds;
    if (sec != null) { const d = new Date(sec * 1000 + (val.nanoseconds ?? val._nanoseconds ?? 0) / 1e6); return Number.isNaN(d.getTime()) ? null : d; }
  }
  if (typeof val === 'string' || val instanceof Date) { const d = new Date(val); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
}

const PHONE_KEYS = ['phone','phoneNumber','mobilePhone','mobile','cellPhone','phoneCell','contactPhone','telephone','parentGuardianPhone','emergencyContactPhone'];

function pickPhoneFromObject(obj) {
  if (!obj || typeof obj !== 'object') return '';
  if (obj.contact && typeof obj.contact === 'object') { const nested = pickPhoneFromObject(obj.contact); if (nested) return nested; }
  for (const key of PHONE_KEYS) { const v = obj[key]; if (v != null && String(v).trim() !== '') return String(v).trim(); }
  for (const [key, v] of Object.entries(obj)) {
    if (!/phone|mobile|cell|tel/i.test(key)) continue;
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

export function getClientDisplayName(client, authProfile) {
  if (!client) return 'Unknown';
  return client.clientName || client.displayName || client.name || authProfile?.name || client.clientEmail || client.email || 'Unknown';
}

export function getClientPhone(client, authProfile) {
  return pickPhoneFromObject(client) || pickPhoneFromObject(authProfile) || '';
}

export function formatFieldValue(val) {
  if (val == null || val === '') return null;
  if (Array.isArray(val)) { const joined = val.filter((v) => v != null && v !== '').join(', '); return joined || null; }
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([, v]) => v != null && v !== '');
    if (!entries.length) return null;
    return entries.map(([k, v]) => `${k}: ${v}`).join('; ');
  }
  return String(val);
}

export function getTherapyTypeLabel(client) {
  if (!client) return '';
  return formatFieldValue(client.therapyType || client.therapyTypes) || '';
}

export function sessionTimestamp(sess) {
  if (!sess) return null;
  const directFields = [sess.scheduledTime, sess.scheduledAt, sess.appointmentDate, sess.startTime, sess.scheduledDate];
  for (const raw of directFields) { const d = toFirestoreDate(raw); if (d) return d; }
  if (sess.date != null && sess.date !== '') {
    const dateStr = typeof sess.date === 'string' ? sess.date : toFirestoreDate(sess.date)?.toISOString?.().split('T')[0];
    if (dateStr) { const combined = new Date(`${dateStr}T${sess.time || '00:00'}`); if (!Number.isNaN(combined.getTime())) return combined; }
  }
  return null;
}

export function formatSessionDateLabel(sess) {
  const d = sessionTimestamp(sess);
  if (d) return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const created = toFirestoreDate(sess?.createdAt);
  if (created) return `Requested ${created.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`;
  return 'N/A';
}

export function formatSessionTimeLabel(sess) {
  const d = sessionTimestamp(sess);
  if (!d) return '';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

async function fetchSessionsForClientId(clientId) {
  try {
    const data = await api(`/api/v1/scheduled-calls?clientId=${clientId}`);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchClientSessions(clientId, options = {}) {
  const ids = [...new Set([clientId, options.authUid].filter(Boolean))];
  const byId = new Map();
  for (const id of ids) {
    const rows = await fetchSessionsForClientId(id);
    rows.forEach((row) => byId.set(row.id, row));
  }
  const merged = [...byId.values()];
  merged.sort((a, b) => { const ta = sessionTimestamp(a)?.getTime() ?? 0; const tb = sessionTimestamp(b)?.getTime() ?? 0; return tb - ta; });
  return merged;
}

export async function fetchClientNoteCount(clientId) {
  try {
    const data = await api(`/api/v1/clinical-notes?clientId=${clientId}`);
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

export function getLastSessionRecord(sessions) {
  const sorted = [...sessions].map((s) => ({ s, dt: sessionTimestamp(s) })).filter((x) => x.dt).sort((a, b) => b.dt - a.dt);
  return sorted[0]?.s ?? null;
}

export async function resolveTherapistIdForClient(clientId, clientData = {}) {
  if (clientData.therapistId) return clientData.therapistId;
  if (clientData.assignedTherapistId) return clientData.assignedTherapistId;
  try {
    const assignments = await api(`/api/v1/therapy-management/assignments?clientId=${clientId}`);
    const list = Array.isArray(assignments) ? assignments : [];
    return list[0]?.therapistId ?? null;
  } catch {
    return null;
  }
}

/**
 * A person's profile, whichever kind of record they are.
 *
 * A therapy client lives behind /clients/{id}. /patients/{id} is the MEDICAL
 * record and answers 403 for them — which is why therapist screens that only
 * called /patients came back empty with no error to show for it.
 */
export async function fetchPersonProfile(id) {
  if (!id) return null;
  try {
    const c = await api(`/api/v1/clients/${id}`);
    if (c) return c;
  } catch { /* not a therapy client, or not visible to us */ }
  try {
    return await api(`/api/v1/patients/${id}`);
  } catch {
    return null;
  }
}

export async function fetchAuthProfileForClient(clientData) {
  return fetchPersonProfile(clientData.authUid);
}

export async function enrichClientRecord(clientId, clientData = {}) {
  const authProfile = await fetchAuthProfileForClient(clientData);
  const sessions = await fetchClientSessions(clientId, { authUid: clientData.authUid });
  const noteCount = await fetchClientNoteCount(clientId);
  const lastSession = getLastSessionRecord(sessions);
  const therapistId = await resolveTherapistIdForClient(clientId, clientData);
  const lastDt = lastSession ? sessionTimestamp(lastSession) : null;

  return {
    ...clientData,
    id: clientId,
    name: getClientDisplayName(clientData, authProfile),
    email: clientData.email || clientData.clientEmail || authProfile?.email || '',
    therapyTypeLabel: getTherapyTypeLabel(clientData),
    sessionCount: sessions.length,
    lastSession: lastDt,
    noteCount,
    therapistId,
    authProfile,
  };
}

export function getClientRelationshipStatus(client) {
  if (!client) return '';
  return client.relationshipStatus || client.relationship || client.maritalStatus || '';
}

const QUESTIONNAIRE_FIELD_LABELS = {
  country: 'Country', gender: 'Gender', age: 'Age', sexualOrientation: 'Sexual orientation',
  relationshipStatus: 'Relationship status', therapyTypes: 'Therapy types', therapyType: 'Therapy type',
  therapyBefore: 'Previous therapy', reasonsForTherapy: 'Reasons for therapy', therapyGoals: 'Therapy goals',
  therapistStyle: 'Therapist style', sessionStructure: 'Session structure', sessionFrequency: 'Session frequency',
  physicalHealth: 'Physical health', eatingHabits: 'Eating habits', exercise: 'Exercise',
  depression: 'Depression', anxiety: 'Anxiety', sleep: 'Sleep quality', employment: 'Employment', alcohol: 'Alcohol use',
};

const QUESTIONNAIRE_SKIP = new Set([
  'id','authUid','therapistId','assignedTherapistId','assignedTherapistName','status',
  'createdAt','updatedAt','completedAt','phq9','coupleId','displayName','clientName',
  'name','email','clientEmail','phone','password','uid',
]);

export function getQuestionnaireGroupedSections(client) {
  if (!client) return [];
  const seen = new Set();
  const sections = [];

  steps.forEach((step) => {
    const rows = [];
    step.fields.forEach((field) => {
      if (field.type === 'phq9_single') return;
      const val = formatFieldValue(client[field.name]);
      if (!val) return;
      rows.push({ label: field.label, value: val, fieldKey: field.name });
      seen.add(field.name);
    });
    if (rows.length) sections.push({ id: step.key, title: step.title, rows });
  });

  const phq9Rows = [];
  if (client.phq9 && typeof client.phq9 === 'object') {
    phq9Questions.forEach((question, index) => {
      const ans = client.phq9[question];
      if (ans == null || ans === '') return;
      const formatted = formatPhq9Answer(ans);
      phq9Rows.push({ label: `${index + 1}. ${question}`, value: formatted.display, phq9Score: formatted.score, fieldKey: `phq9-${index}` });
    });
  } else {
    phq9Questions.forEach((question, index) => {
      const key = `phq9_${index + 1}`;
      const ans = client[key];
      if (ans == null || ans === '') return;
      const formatted = formatPhq9Answer(ans);
      phq9Rows.push({ label: `${index + 1}. ${question}`, value: formatted.display, phq9Score: formatted.score, fieldKey: key });
      seen.add(key);
    });
  }
  if (phq9Rows.length) {
    const total = phq9Rows.reduce((sum, r) => sum + (r.phq9Score ?? 0), 0);
    sections.push({ id: 'phq9', title: 'PHQ-9 depression screen', rows: phq9Rows, phq9Summary: { total, maxScore: 27, severity: getPhq9Severity(total) } });
  }

  const additional = [];
  Object.entries(QUESTIONNAIRE_FIELD_LABELS).forEach(([key, label]) => {
    if (seen.has(key)) return;
    const val = formatFieldValue(client[key]);
    if (!val) return;
    additional.push({ label, value: val, fieldKey: key });
    seen.add(key);
  });
  Object.entries(client).forEach(([key, val]) => {
    if (QUESTIONNAIRE_SKIP.has(key) || seen.has(key) || QUESTIONNAIRE_FIELD_LABELS[key]) return;
    if (key.startsWith('phq9_')) return;
    const formatted = formatFieldValue(val);
    if (!formatted) return;
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    additional.push({ label, value: formatted, fieldKey: key });
  });
  if (additional.length) sections.push({ id: 'additional', title: 'Additional information', rows: additional });
  return sections;
}
