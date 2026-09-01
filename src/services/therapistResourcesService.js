import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { api, uploadFile, getStoredUserId } from './apiClient';
import { loadTherapistCalendarClients } from './therapistCalendarService';

// ── Attachments ───────────────────────────────────────────────────────────────
// Each resource type needs a real file behind it, otherwise "Image" or "Audio" is
// just a label on a text form and the client has nothing to open.
//
// Uploads go through the same store as chat attachments (file_blobs in Postgres).
// Keep the first path segment SHORT: uploadFile uses it as the `domain` column,
// which is varchar(64) — a long prefix overflows it and the request 409s.
const UPLOAD_PREFIX = 'resources';

/** Audio is capped so a long recording can't be pushed into the database. */
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;   // 10 MB
export const MAX_FILE_BYTES = 25 * 1024 * 1024;    // 25 MB

function extensionFor(name, fallback) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : fallback;
}

async function put(uri, { name, mimeType, size, kind }) {
  const limit = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_FILE_BYTES;
  if (size && size > limit) {
    throw new Error(
      `That ${kind} is ${(size / 1024 / 1024).toFixed(1)} MB. Please choose one under ${limit / 1024 / 1024} MB.`,
    );
  }
  const ext = extensionFor(name, kind === 'image' ? 'jpg' : 'bin');
  const path = `${UPLOAD_PREFIX}/${kind}-${Date.now()}.${ext}`;
  const url = await uploadFile(path, uri, mimeType || 'application/octet-stream');
  return { fileUrl: url, fileName: name || path.split('/').pop(), fileSize: size || null, mimeType: mimeType || null };
}

/** Pick + upload an image. */
export async function pickResourceImage() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Photo access is needed to attach an image.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return put(a.uri, { name: a.fileName, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize, kind: 'image' });
}

/** Pick + upload a video. */
export async function pickResourceVideo() {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Media access is needed to attach a video.');
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return put(a.uri, { name: a.fileName, mimeType: a.mimeType || 'video/mp4', size: a.fileSize, kind: 'video' });
}

/** Pick + upload a document, audio file, or anything else. */
export async function pickResourceFile(kind = 'document') {
  const typeFilter = kind === 'audio' ? 'audio/*' : '*/*';
  const res = await DocumentPicker.getDocumentAsync({ type: typeFilter, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return put(a.uri, { name: a.name, mimeType: a.mimeType, size: a.size, kind });
}

export const RESOURCE_CATEGORIES = {
  homework: { name: 'Homework & Exercises', icon: 'book-outline', fields: ['exercises', 'instructions', 'completionTime', 'materialsNeeded'] },
  psychoeducation: { name: 'Psychoeducational Materials', icon: 'bulb-outline', fields: ['learningObjectives', 'keyConcepts', 'additionalReading', 'discussionQuestions'] },
  community: { name: 'Community Resources', icon: 'people-outline', fields: ['resourceType', 'location', 'contactInfo', 'availability', 'eligibility', 'cost'] },
  crisis: { name: 'Crisis Intervention', icon: 'warning-outline', fields: ['crisisType', 'urgencyLevel', 'contactInfo', 'safetyPlan', 'followUpSteps', 'warningSigns'] },
  assessments: { name: 'Assessment Instruments', icon: 'clipboard-outline', fields: ['assessmentType', 'scoringMethod', 'interpretation', 'validityInfo', 'ageRange'] },
  protocols: { name: 'Treatment Protocols', icon: 'flag-outline', fields: ['protocolType', 'evidenceBase', 'sessionCount', 'outcomeMeasures', 'contraindications'] },
  research: { name: 'Research & References', icon: 'document-text-outline', fields: ['researchType', 'authors', 'publicationDate', 'journal', 'doi', 'abstract', 'keyFindings'] },
  education: { name: 'Continuing Education', icon: 'school-outline', fields: ['trainingLevel', 'certification', 'prerequisites', 'learningOutcomes', 'ceuCredits'] },
  videos: { name: 'Training Videos', icon: 'videocam-outline', fields: ['videoLength', 'instructor', 'topics', 'skillLevel', 'certificate'] },
  guidelines: { name: 'Best Practice Guidelines', icon: 'ribbon-outline', fields: ['guidelineType', 'organization', 'lastUpdated', 'complianceLevel', 'implementation', 'monitoring'] },
  legal: { name: 'Legal & Ethical Guidelines', icon: 'shield-outline', fields: ['legalType', 'jurisdiction', 'effectiveDate', 'complianceRequirements', 'penalties', 'resources'] },
};

export const RESOURCE_TYPES = { document: 'Document', video: 'Video', link: 'Link', image: 'Image', audio: 'Audio' };
export const DIFFICULTY_LEVELS = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const TARGET_AUDIENCES = { all: 'All Clients', individuals: 'Individuals', teen: 'Teen', couples: 'Couples', specific: 'Specific Clients' };

export const WORKSHEET_CATEGORIES = {
  CBT: 'Cognitive Behavioral Therapy', DBT: 'Dialectical Behavior Therapy', journaling: 'Journaling',
  moodTracking: 'Mood Tracking', mindfulness: 'Mindfulness', anxiety: 'Anxiety Management',
  depression: 'Depression Management', trauma: 'Trauma Recovery', relationships: 'Relationships',
  selfCare: 'Self Care', other: 'Other',
};

export const WORKSHEET_FIELD_TYPES = [
  { id: 'text', label: 'Text' }, { id: 'textarea', label: 'Long Text' }, { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' }, { id: 'select', label: 'Dropdown' }, { id: 'checkbox', label: 'Checkboxes' },
  { id: 'radio', label: 'Radio Buttons' }, { id: 'rating', label: 'Rating Scale' }, { id: 'multiple-choice', label: 'Multiple Choice' },
];

export function getWorksheetFieldTypeLabel(type) {
  return WORKSHEET_FIELD_TYPES.find((t) => t.id === type)?.label || type || 'Text';
}

// Checkbox counts as a choice type: a tick box with no wording on it is nothing
// the client can answer, so the therapist has to be able to type the boxes.
export function worksheetFieldTypeNeedsOptions(type) {
  return type === 'select' || type === 'radio' || type === 'multiple-choice' || type === 'checkbox';
}

// A lone tick ("I agree") is a legitimate checkbox; the other choice types need
// two entries before they are a choice at all.
export function minWorksheetOptions(type) {
  return type === 'checkbox' ? 1 : 2;
}

export const DEFAULT_RATING_MAX = 10;
export const RATING_MAX_CHOICES = [3, 4, 5, 7, 10];

export function normalizeWorksheetFieldType(field, nextType) {
  const next = { ...field, type: nextType };
  if (worksheetFieldTypeNeedsOptions(nextType)) {
    next.options = field.options?.length
      ? [...field.options]
      : Array(minWorksheetOptions(nextType)).fill('');
  } else {
    next.options = [];
  }
  // The scale belongs to a rating and nothing else.
  if (nextType === 'rating') next.max = Number(field.max) || DEFAULT_RATING_MAX;
  else delete next.max;
  return next;
}

const BASIC_RESOURCE_FIELDS = ['title', 'description', 'category', 'type', 'content', 'difficulty', 'duration', 'targetAudience', 'isPublic', 'linkUrl', 'fileUrl', 'fileName', 'fileSize'];

export const emptyResourceForm = () => ({
  title: '', description: '', category: 'homework', type: 'document', content: '', tags: '',
  difficulty: 'beginner', duration: '', targetAudience: 'all', isPublic: true, linkUrl: '',
  fileUrl: '', fileName: '', fileSize: '', mimeType: '',
  // `selectedClients` was the Firestore-era name and nothing read it; the picker
  // and the client-side filter both use assignedClients.
  selectedClients: [], assignedClients: [], exercises: '', instructions: '',
  completionTime: '', materialsNeeded: '', learningObjectives: '', keyConcepts: '',
  additionalReading: '', discussionQuestions: '', resourceType: '', location: '', contactInfo: '',
  availability: '', eligibility: '', cost: '', crisisType: '', urgencyLevel: '', safetyPlan: '',
  followUpSteps: '', warningSigns: '', assessmentType: '', scoringMethod: '', interpretation: '',
  validityInfo: '', ageRange: '', protocolType: '', evidenceBase: '', sessionCount: '',
  outcomeMeasures: '', contraindications: '', researchType: '', authors: '', publicationDate: '',
  journal: '', doi: '', abstract: '', keyFindings: '', trainingLevel: '', certification: '',
  prerequisites: '', learningOutcomes: '', ceuCredits: '', videoLength: '', instructor: '',
  topics: '', skillLevel: '', certificate: '', guidelineType: '', organization: '', lastUpdated: '',
  complianceLevel: '', implementation: '', monitoring: '', legalType: '', jurisdiction: '',
  effectiveDate: '', complianceRequirements: '', penalties: '', resources: '',
});

export const emptyWorksheetForm = () => ({
  title: '', description: '', goal: '', instructions: '', category: 'CBT',
  type: 'patient-facing', status: 'active',
  fields: [{ name: '', type: 'text', required: true, options: [] }],
  allowMultipleResponses: true, assignedTo: [],
});

function sortByCreated(a, b) {
  return new Date(b.createdAt || b.dateCreated || 0) - new Date(a.createdAt || a.dateCreated || 0);
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (!tags || typeof tags !== 'string') return [];
  return tags.split(',').map((t) => t.trim()).filter(Boolean);
}

export function getCategoryLabel(category) {
  return RESOURCE_CATEGORIES[category]?.name || category || 'Resource';
}

export function getCategoryIcon(category) {
  return RESOURCE_CATEGORIES[category]?.icon || 'document-outline';
}

/**
 * The resources table has columns for title/body/url/isPublic only — description,
 * category, type, difficulty, duration, targetAudience, assignedClients and every
 * uploaded-file field round-trip through `metadataJson`. Nothing unpacked it on
 * read, so the detail sheet showed a title and nothing else, and opening a
 * resource for edit gave a blank form that then overwrote the saved values.
 */
export function hydrateResource(raw) {
  if (!raw) return raw;
  let meta = {};
  try { meta = raw.metadataJson ? JSON.parse(raw.metadataJson) : {}; } catch { /* ignore */ }
  return {
    ...meta,
    ...raw,
    // Columns win where they exist; fall back to whatever metadata carried.
    title: raw.title || meta.title || '',
    description: meta.description || raw.description || '',
    content: raw.body || meta.content || '',
    linkUrl: meta.linkUrl || raw.url || '',
    fileUrl: meta.fileUrl || '',
    category: meta.category || 'homework',
    type: meta.type || 'document',
    targetAudience: meta.targetAudience || 'all',
    assignedClients: Array.isArray(meta.assignedClients) ? meta.assignedClients : [],
  };
}

export function subscribeTherapistResources(therapistUid, onData, { isAdmin = false } = {}) {
  if (!therapistUid) return () => {};
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      // /api/v1/resources is the SAME store the web library reads
      // (content_resources_v2). Mobile used to read therapist_resources_v2, a
      // different table, so a resource created on web was invisible here and vice
      // versa — two libraries that never agreed.
      const data = await api(
        isAdmin ? '/api/v1/resources' : `/api/v1/resources?therapistId=${therapistUid}`
      );
      onData((Array.isArray(data) ? data : []).map(hydrateResource).sort(sortByCreated));
    } catch { onData([]); }
  };

  poll();
  const id = setInterval(poll, 30_000);
  return () => { cancelled = true; clearInterval(id); };
}


/**
 * Unpack a worksheet's authoring form.
 *
 * The table only has title/prompt/status, so goal, description, instructions,
 * category and the field definitions all round-trip through metadataJson. Handing
 * the raw row to the edit screen left Goal and Instructions blank, and the form
 * then refused to save because it requires them — on a worksheet that already had
 * them. `prompt` is the joined "goal / instructions / description" written at
 * create time, so it's the fallback when metadata is missing.
 */
export function hydrateWorksheet(w) {
  if (!w) return w;
  let meta = {};
  try { meta = w.metadataJson ? JSON.parse(w.metadataJson) : {}; } catch { /* ignore */ }
  const promptLines = String(w.prompt || '').split('\n').map(l => l.trim()).filter(Boolean);
  return {
    ...meta,
    ...w,
    title: w.title || meta.title || '',
    goal: meta.goal || promptLines[0] || '',
    instructions: meta.instructions || promptLines[1] || w.prompt || '',
    description: meta.description || promptLines[2] || '',
    category: meta.category || 'Cognitive',
    fields: Array.isArray(meta.fields) ? meta.fields : [],
    assignedTo: w.clientId ? [w.clientId] : (meta.assignedTo || meta.assignedClients || []),
    status: w.status || 'active',
    // The client's latest submitted answers, keyed by field index.
    responses: (() => {
      try { return w.latestResponse ? JSON.parse(w.latestResponse) : null; } catch { return null; }
    })(),
    lastSubmittedAt: w.lastSubmittedAt || null,
    isCompleted: ['completed', 'submitted'].includes(String(w.status || '').toLowerCase()),
  };
}

export function subscribeWorksheets(therapistUid, onData, { isAdmin = false } = {}) {
  if (!therapistUid) return () => {};
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      const data = await api(`/api/v1/therapy-engagement/worksheets?therapistId=${therapistUid}`);
      onData((Array.isArray(data) ? data : []).map(hydrateWorksheet).sort(sortByCreated));
    } catch { onData([]); }
  };

  poll();
  const id = setInterval(poll, 30_000);
  return () => { cancelled = true; clearInterval(id); };
}

export function groupByAuthor(items, therapistUid, idField = 'therapistId') {
  const byYou = [];
  const byOthers = [];
  // Compare as trimmed strings: ids arrive as UUID strings from the API but can
  // be a different case or carry whitespace depending on where they were stored,
  // and a strict === mismatch silently reassigns an item to "by others".
  const me = String(therapistUid || '').trim().toLowerCase();
  items.forEach((item) => {
    const authorId = String(item[idField] || item.createdBy || item.therapistId || '')
      .trim()
      .toLowerCase();
    if (me && authorId === me) byYou.push(item);
    else byOthers.push(item);
  });
  return { byYou, byOthers };
}

export async function loadResourceClients(therapistUid) {
  // `lite` — the resource and worksheet pickers only need each client's id and
  // name. The full path makes four extra calls per client (sessions, notes,
  // assignment, auth profile) and DROPS a client entirely if any of them throws,
  // which is why these pickers came up empty while the notes picker (already on
  // the lite path) listed everyone.
  return loadTherapistCalendarClients(therapistUid, { lite: true });
}

export async function fetchTherapistNames(therapistIds) {
  const names = {};
  const unique = [...new Set(therapistIds.filter(Boolean))];
  await Promise.all(
    unique.map(async (id) => {
      try {
        const data = await api(`/api/v1/therapists/${id}`);
        names[id] = data?.fullName || data?.name || 'Therapist';
      } catch {
        names[id] = 'Therapist';
      }
    }),
  );
  return names;
}

export async function createTherapistResource(form, profile) {
  if (form.type === 'link' && !form.linkUrl) {
    throw new Error('Link URL is required for link resources.');
  }
  const categoryFields = RESOURCE_CATEGORIES[form.category]?.fields || [];
  const extra = {};
  categoryFields.forEach((f) => { if (form[f]) extra[f] = form[f]; });

  const resource = await api('/api/v1/resources', {
    method: 'POST',
    body: {
      therapistId: profile?.id || profile?.uid,
      title: form.title,
      body: form.content || form.description || null,
      url: form.linkUrl || form.fileUrl || null,
      isPublic: form.isPublic ?? true,
      metadataJson: JSON.stringify({ ...extra, linkUrl: form.linkUrl, fileUrl: form.fileUrl, ...form }),
    },
  });
  return resource?.id;
}

export async function updateTherapistResource(resourceId, form, profile) {
  const categoryFields = RESOURCE_CATEGORIES[form.category]?.fields || [];
  const extra = {};
  categoryFields.forEach((f) => { if (form[f]) extra[f] = form[f]; });

  await api(`/api/v1/resources/${resourceId}`, {
    method: 'PATCH',
    body: {
      title: form.title,
      body: form.content || form.description || null,
      url: form.linkUrl || form.fileUrl || null,
      isPublic: form.isPublic ?? true,
      therapistId: profile?.id || profile?.uid,
      metadataJson: JSON.stringify({ ...extra, linkUrl: form.linkUrl, fileUrl: form.fileUrl, ...form }),
    },
  });
}

export async function deleteTherapistResource(resourceId) {
  // Same store as the list — deleting against therapist_resources_v2 never matched
  // an id from this library, so nothing was removed.
  await api(`/api/v1/resources/${resourceId}`, { method: 'DELETE' });
}

export function resourceFormFromRecord(resource) {
  const form = emptyResourceForm();
  Object.keys(form).forEach((key) => {
    if (resource[key] !== undefined && resource[key] !== null) {
      form[key] = resource[key];
    }
  });
  if (Array.isArray(resource.tags)) form.tags = resource.tags.join(', ');
  if (resource.content) {
    try {
      const parsed = JSON.parse(resource.content);
      Object.assign(form, parsed);
    } catch {}
  }
  return form;
}

export async function createWorksheet(form) {
  // therapistId is @NotNull server-side, and nothing on the worksheet form ever
  // set it — every save was rejected and the screen's `catch {}` reported only
  // "Failed to save worksheet". Fall back to the signed-in therapist.
  const authorId = form.therapistId || form.createdBy || (await getStoredUserId());
  if (!authorId) throw new Error('Your session expired. Please sign in again.');
  const ws = await api('/api/v1/therapy-engagement/worksheets', {
    method: 'POST',
    body: {
      therapistId: authorId,
      clientId: form.assignedTo?.[0] || null,
      title: form.title,
      prompt: [form.goal, form.instructions, form.description].filter(Boolean).join('\n'),
      dueDate: null,
      // Keep the builder's field definitions — the columns only hold title/prompt,
      // so without this everything the therapist configured is discarded on save.
      metadataJson: JSON.stringify(form),
    },
  });
  return ws?.id;
}

export async function updateWorksheet(worksheetId, form) {
  await api(`/api/v1/therapy-engagement/worksheets/${worksheetId}`, {
    method: 'PATCH',
    body: {
      title: form.title,
      prompt: [form.goal, form.instructions, form.description].filter(Boolean).join('\n'),
      // Never echo 'completed' back on an edit. The therapist editing a worksheet
      // is what REOPENS it for the client (the backend flips completed →
      // assigned), so sending the old status would immediately undo that and the
      // client would still be locked out.
      status: String(form.status || '').toLowerCase() === 'completed' ? undefined : form.status,
      clientId: form.assignedTo?.[0] || null,
      metadataJson: JSON.stringify(form),
    },
  });
}

export async function deleteWorksheet(worksheetId) {
  await api(`/api/v1/therapy-engagement/worksheets/${worksheetId}`, { method: 'DELETE' });
}

export function worksheetFormFromRecord(worksheet) {
  return {
    title: worksheet.title || '',
    description: worksheet.description || worksheet.prompt || '',
    goal: worksheet.goal || '',
    instructions: worksheet.instructions || '',
    category: worksheet.category || 'CBT',
    type: worksheet.type || 'patient-facing',
    status: worksheet.status || 'active',
    // `fields` can arrive as an array, or as a JSON string when metadataJson was
    // written by an older client. A string here used to pass the `.length > 0`
    // check and then blow up on .map, leaving the editor with no fields at all —
    // which then failed validation on save with nothing the therapist could fix.
    fields: (() => {
      let raw = worksheet.fields;
      if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = null; }
      }
      const list = Array.isArray(raw) ? raw.filter((f) => f && typeof f === 'object') : [];
      return list.length
        ? list.map((f) => ({ ...f }))
        : [{ name: '', type: 'text', required: true, options: [] }];
    })(),
    allowMultipleResponses: worksheet.allowMultipleResponses !== false,
    assignedTo: worksheet.assignedTo || (worksheet.clientId ? [worksheet.clientId] : []),
  };
}

export function matchesResourceSearch(resource, q) {
  if (!q) return true;
  const hay = [resource.title, resource.description, resource.therapistName]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function matchesWorksheetSearch(worksheet, q) {
  if (!q) return true;
  const hay = [worksheet.title, worksheet.description, worksheet.goal, worksheet.prompt]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q.toLowerCase());
}

export function getResourceDetailFields(resource) {
  const skip = new Set(['id', 'therapistId', 'therapistName', 'createdAt', 'updatedAt', 'downloads', 'rating', 'reviews', 'selectedClients']);
  const rows = [];
  const catFields = RESOURCE_CATEGORIES[resource.category]?.fields || [];
  [...BASIC_RESOURCE_FIELDS, ...catFields].forEach((key) => {
    if (skip.has(key) || !resource[key]) return;
    if (key === 'isPublic') { rows.push({ label: 'Public', value: resource.isPublic ? 'Yes' : 'No' }); return; }
    const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    rows.push({ label, value: String(resource[key]) });
  });
  return rows;
}

export function countWorksheetResponses(worksheet) {
  // `clientResponses` is a Firestore-era map the API never returns, so this always
  // reported 0 — even for a worksheet the client had completed. Count the answers
  // actually submitted.
  const answered = worksheet?.responses;
  if (answered && typeof answered === 'object') return Object.keys(answered).length;
  const legacy = worksheet?.clientResponses || {};
  return Object.keys(legacy).length;
}

/** The client's answer for a given field index, formatted for display. */
export function worksheetAnswerFor(worksheet, index) {
  const answered = worksheet?.responses;
  if (!answered || typeof answered !== 'object') return null;
  const raw = answered[index] ?? answered[String(index)];
  if (raw === undefined || raw === null || raw === '') return null;
  // multiple-choice answers are stored pipe-joined.
  return String(raw).split('|').filter(Boolean).join(', ');
}
