const FIELD_LABELS = {
  notes: 'Clinical notes',
  content: 'Content',
  noteContent: 'Note',
  sessionFocus: 'Session focus',
  progressAssessment: 'Progress',
  mood: 'Mood',
  subjective: 'Subjective',
  objective: 'Objective',
  assessment: 'Assessment',
  plan: 'Plan',
  interventions: 'Interventions',
  clientResponse: 'Client response',
  moodRating: 'Mood rating',
  nextSteps: 'Next steps',
  riskAssessment: 'Risk assessment',
  safetyPlan: 'Safety plan',
  followUp: 'Follow-up',
  treatmentSummary: 'Treatment summary',
  goalsAchieved: 'Goals achieved',
  recommendations: 'Recommendations',
  therapistName: 'Therapist',
  behavioralObservations: 'Behavioral observations',
  homework: 'Homework',
  nextSessionFocus: 'Next session focus',
  sessionNumber: 'Session number',
  sessionTime: 'Session time',
  bookTitle: 'Book title',
  author: 'Author',
  description: 'Description',
  targetAudience: 'Target audience',
  difficultyLevel: 'Difficulty',
  estimatedReadingTime: 'Reading time',
  tableOfContents: 'Table of contents',
  chapters: 'Chapters',
  keyTopics: 'Key topics',
  exercises: 'Exercises',
  resources: 'Resources',
  bibliography: 'Bibliography',
};

export const NOTE_TYPE_LABELS = {
  soap: 'SOAP note',
  progress: 'Progress note',
  risk: 'Risk assessment',
  discharge: 'Discharge summary',
  therapyBook: 'Therapy book',
};

const CONTENT_FIELD_ORDER = [
  'sessionFocus',
  'progressAssessment',
  'mood',
  'moodRating',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'interventions',
  'interventionsUsed',
  'clientResponse',
  'behavioralObservations',
  'homework',
  'nextSessionFocus',
  'riskAssessment',
  'safetyPlan',
  'treatmentSummary',
  'goalsAchieved',
  'recommendations',
  'followUp',
  'nextSteps',
  'bookTitle',
  'author',
  'description',
  'keyTopics',
  'exercises',
  'resources',
  'bibliography',
  'tableOfContents',
  'chapters',
  'notes',
  'content',
  'noteContent',
];

const SKIP_KEYS = new Set([
  'id',
  'clientId',
  'clientName',
  'clientNames',
  'therapistId',
  'therapistName',
  'createdAt',
  'updatedAt',
  'sessionDate',
  'isDraft',
  'visibleToClient',
  'assignedClients',
  'noteType',
  'version',
  'shareWithAllClients',
  'selectedClients',
  // Jackson strips the `is` prefix from boolean getters, so the API sends
  // `draft`/`public`, not `isDraft`/`isPublic` — the entries above never matched
  // and the note view ended up printing a bare "DRAFT / false" row.
  'draft',
  'public',
  'signedAt',
  // Raw JSON blob: expanded into real sections below rather than dumped.
  'structuredData',
  // Internal bookkeeping the mobile services attach; not part of the note.
  'collection',
  'assignmentId',
  'sessionId',
  // Therapy books: `title` duplicates bookTitle (which the header already shows),
  // and the audience/visibility plumbing is not reading material.
  'title',
  'bookTitle',
  'assignedClientIds',
  'isPublic',
  'targetAudience',
]);

function formatFieldLabel(key) {
  return FIELD_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function fieldValue(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val).trim();
}

export function getNoteTitle(note, kind = 'clinical') {
  if (!note) return 'Note';
  if (kind === 'therapy') return 'Therapy note';
  return NOTE_TYPE_LABELS[note.noteType] || 'Clinical note';
}

/**
 * SOAP/progress fields are stored as a `structuredData` JSON string. Showing that
 * string raw gave the note view a wall of `{"subjective":"…","objective":"…"}`.
 * Merge it into the note so each field becomes a proper labelled section.
 */
function parseMaybeJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function withStructuredFields(note) {
  if (!note) return note;
  // Clinical notes keep their fields in `structuredData`; therapy books pack
  // author/chapters/exercises/… into `content`. Both were rendered as one raw
  // JSON blob, so a book's view showed {"author":"Joana","targetAudience":…}
  // instead of its chapters.
  const structured = parseMaybeJson(note.structuredData);
  const bookContent = note.noteType === 'therapyBook' ? parseMaybeJson(note.content) : null;
  const merged = { ...(structured || {}), ...(bookContent || {}) };
  if (Object.keys(merged).length === 0) return note;
  // The note's own fields win — an explicit edit beats the stored blob.
  return { ...merged, ...note, __hasStructured: true };
}

export function getNoteSections(rawNote) {
  if (!rawNote) return [];
  const note = withStructuredFields(rawNote);
  const sections = [];
  const seen = new Set();
  CONTENT_FIELD_ORDER.forEach((key) => {
    // This ordered pass used to bypass SKIP_KEYS entirely, so anything listed
    // there still rendered — e.g. a book's title, already in the modal header.
    if (SKIP_KEYS.has(key)) { seen.add(key); return; }
    // `content` is just the SOAP fields concatenated at save time. When those
    // fields are shown individually, repeating the joined copy is pure noise.
    // Mark it seen as well, or the catch-all loop below simply adds it back.
    if (key === 'content' && note.__hasStructured) { seen.add(key); return; }
    const val = fieldValue(note[key]);
    if (!val) return;
    sections.push({ key, label: formatFieldLabel(key), value: val });
    seen.add(key);
  });
  Object.entries(note).forEach(([key, raw]) => {
    if (seen.has(key) || SKIP_KEYS.has(key)) return;
    const val = fieldValue(raw);
    if (!val) return;
    if (key.endsWith('At') || key.endsWith('Id') || key.startsWith('_')) return;
    sections.push({ key, label: formatFieldLabel(key), value: val });
  });
  return sections;
}

export function getNotePreview(note, maxLen = 140) {
  const sections = getNoteSections(note);
  if (!sections.length) return 'No preview — tap to open';
  const text = sections.map((s) => s.value).join(' · ');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trim()}…`;
}
