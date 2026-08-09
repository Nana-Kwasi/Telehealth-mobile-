import { api } from './apiClient';
import { loadTherapistCalendarClients } from './therapistCalendarService';

export const NOTE_TEMPLATES = {
  soap: {
    name: 'SOAP Note',
    fields: ['subjective', 'objective', 'assessment', 'plan'],
  },
  progress: {
    name: 'Progress Note',
    fields: ['interventions', 'clientResponse', 'moodRating', 'nextSteps', 'sessionFocus'],
  },
  risk: {
    name: 'Risk Assessment',
    fields: ['riskAssessment', 'safetyPlan', 'interventions', 'followUp'],
  },
  discharge: {
    name: 'Discharge Summary',
    fields: ['treatmentSummary', 'goalsAchieved', 'recommendations', 'followUp'],
  },
  therapyBook: {
    name: 'Therapy Book',
    fields: [
      'bookTitle',
      'author',
      'description',
      'targetAudience',
      'difficultyLevel',
      'estimatedReadingTime',
      'tableOfContents',
      'chapters',
      'keyTopics',
      'exercises',
      'resources',
      'bibliography',
    ],
  },
};

export const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'soap', label: 'SOAP' },
  { id: 'progress', label: 'Progress' },
  { id: 'risk', label: 'Risk' },
  { id: 'discharge', label: 'Discharge' },
  { id: 'therapyBook', label: 'Therapy books' },
];

const emptyForm = () => ({
  clientId: '',
  clientName: '',
  sessionDate: new Date().toISOString().split('T')[0],
  noteType: 'soap',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
  interventions: '',
  clientResponse: '',
  moodRating: '',
  nextSteps: '',
  sessionFocus: '',
  riskAssessment: '',
  safetyPlan: '',
  followUp: '',
  treatmentSummary: '',
  goalsAchieved: '',
  recommendations: '',
  signature: '',
  isDraft: false,
  visibleToClient: false,
  bookTitle: '',
  author: '',
  description: '',
  targetAudience: 'all',
  assignedClientIds: [],
  difficultyLevel: 'beginner',
  estimatedReadingTime: '',
  tableOfContents: '',
  chapters: '',
  keyTopics: '',
  exercises: '',
  resources: '',
  bibliography: '',
});

export { emptyForm };

function sortByCreated(a, b) {
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

async function fetchNotes(therapistUid) {
  const [notesRaw, booksRaw] = await Promise.all([
    api(`/api/v1/clinical-notes?therapistId=${therapistUid}`).catch(() => []),
    api(`/api/v1/therapy-books?therapistId=${therapistUid}`).catch(() => []),
  ]);
  const notes = (notesRaw || []).map((n) => ({
    ...n,
    collection: 'clinicalNotes',
    noteType: n.noteType || 'soap',
  }));
  const books = (booksRaw || []).map((b) => ({
    ...b,
    collection: 'therapyBooks',
    noteType: 'therapyBook',
    bookTitle: b.title,
  }));
  return [...notes, ...books].sort(sortByCreated);
}

export function subscribeTherapistNotes(therapistUid, onData, options = {}) {
  if (!therapistUid) return () => {};
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    try {
      onData(await fetchNotes(therapistUid));
    } catch {
      onData([]);
    }
  };

  poll();
  const id = setInterval(poll, 30_000);
  return () => { cancelled = true; clearInterval(id); };
}

export function groupNotesByAuthor(notes, therapistUid) {
  const byYou = [];
  const byOthers = [];
  notes.forEach((note) => {
    if (note.therapistId === therapistUid) byYou.push(note);
    else byOthers.push(note);
  });
  return { byYou, byOthers };
}

export async function loadTherapistNoteClients(therapistUid) {
  // `lite` — the note form only needs each client's id and name. The full path
  // makes four extra API calls per client (sessions, notes, assignment, auth
  // profile) purely to compute metrics this picker never shows.
  return loadTherapistCalendarClients(therapistUid, { lite: true });
}

function buildStructuredData(form) {
  const template = NOTE_TEMPLATES[form.noteType] || NOTE_TEMPLATES.soap;
  const structured = {};
  template.fields.forEach((field) => {
    if (form[field] !== undefined && form[field] !== '') {
      structured[field] = form[field];
    }
  });
  return JSON.stringify(structured);
}

/**
 * "Specific clients" is only meaningful if the chosen ids travel with the book.
 * Stored as a JSON array string — `assigned_client_ids` is a text column.
 */
function assignedIdsPayload(form) {
  if (form.targetAudience !== 'specific') return null;
  const ids = Array.isArray(form.assignedClientIds) ? form.assignedClientIds.filter(Boolean) : [];
  return ids.length ? JSON.stringify(ids) : null;
}

export async function createTherapistNote(form, profile) {
  if (form.noteType === 'therapyBook') {
    const book = await api('/api/v1/therapy-books', {
      method: 'POST',
      body: {
        therapistId: profile?.id || profile?.uid,
        title: form.bookTitle || 'Untitled Book',
        description: form.description || '',
        content: JSON.stringify({
          author: form.author,
          targetAudience: form.targetAudience,
          difficultyLevel: form.difficultyLevel,
          estimatedReadingTime: form.estimatedReadingTime,
          tableOfContents: form.tableOfContents,
          chapters: form.chapters,
          keyTopics: form.keyTopics,
          exercises: form.exercises,
          resources: form.resources,
          bibliography: form.bibliography,
        }),
        assignedClientIds: assignedIdsPayload(form),
        isPublic: form.targetAudience === 'all',
        isDraft: !!form.isDraft,
      },
    });
    return book?.id;
  }

  const note = await api('/api/v1/clinical-notes', {
    method: 'POST',
    body: {
      therapistId: profile?.id || profile?.uid,
      clientId: form.clientId,
      noteType: form.noteType,
      content: [form.subjective, form.objective, form.assessment, form.plan, form.sessionFocus]
        .filter(Boolean)
        .join('\n\n') || form.content || '',
      structuredData: buildStructuredData(form),
      visibleToClient: !!form.visibleToClient,
      isDraft: !!form.isDraft,
      signature: form.signature || null,
    },
  });
  return note?.id;
}

export async function updateTherapistNote(note, form, profile) {
  if (note.collection === 'therapyBooks' || note.noteType === 'therapyBook') {
    await api(`/api/v1/therapy-books/${note.id}`, {
      method: 'PATCH',
      body: {
        title: form.bookTitle || note.title,
        description: form.description,
        content: JSON.stringify({
          author: form.author,
          targetAudience: form.targetAudience,
          difficultyLevel: form.difficultyLevel,
          estimatedReadingTime: form.estimatedReadingTime,
          tableOfContents: form.tableOfContents,
          chapters: form.chapters,
          keyTopics: form.keyTopics,
          exercises: form.exercises,
          resources: form.resources,
          bibliography: form.bibliography,
        }),
        assignedClientIds: assignedIdsPayload(form),
        isPublic: form.targetAudience === 'all',
        isDraft: !!form.isDraft,
      },
    });
    return;
  }

  await api(`/api/v1/clinical-notes/${note.id}`, {
    method: 'PATCH',
    body: {
      // Send the client too — reassigning a note to a different client is a
      // normal edit, and omitting it here left the note on the original client.
      clientId: form.clientId,
      noteType: form.noteType,
      content: [form.subjective, form.objective, form.assessment, form.plan, form.sessionFocus]
        .filter(Boolean)
        .join('\n\n') || form.content || '',
      structuredData: buildStructuredData(form),
      visibleToClient: !!form.visibleToClient,
      isDraft: !!form.isDraft,
      signature: form.signature || null,
    },
  });
}

export async function deleteTherapistNote(note) {
  if (note.collection === 'therapyBooks' || note.noteType === 'therapyBook') {
    await api(`/api/v1/therapy-books/${note.id}`, { method: 'DELETE' });
    return;
  }
  await api(`/api/v1/clinical-notes/${note.id}`, { method: 'DELETE' });
}

export function noteFormFromRecord(note) {
  const form = emptyForm();
  Object.keys(form).forEach((key) => {
    if (note[key] !== undefined && note[key] !== null) {
      form[key] = note[key];
    }
  });
  // Restore SOAP fields from structuredData if present
  if (note.structuredData) {
    try {
      const parsed = JSON.parse(note.structuredData);
      Object.assign(form, parsed);
    } catch {}
  }
  // Restore book fields from content if present
  if (note.noteType === 'therapyBook' && note.content) {
    try {
      const parsed = JSON.parse(note.content);
      Object.assign(form, parsed);
    } catch {}
  }
  form.noteType = note.noteType || 'soap';
  // assigned_client_ids comes back as a JSON string; the picker needs an array.
  form.assignedClientIds = (() => {
    const raw = note.assignedClientIds;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string' && raw.trim()) {
      try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  })();
  form.clientId = note.clientId || '';
  form.clientName = note.clientName || '';
  form.bookTitle = note.bookTitle || note.title || form.bookTitle;
  return form;
}

export function matchesNoteSearch(note, q) {
  if (!q) return true;
  const hay = [
    note.clientName,
    note.therapistName,
    note.content,
    note.bookTitle,
    note.title,
    note.author,
    note.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}
