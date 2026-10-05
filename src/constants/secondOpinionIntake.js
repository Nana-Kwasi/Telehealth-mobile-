// ─── Second Opinion intake ───────────────────────────────────────────────────
// The structured case questionnaire for someone already under mental-health
// care elsewhere who wants an independent view.
//
// Deliberately SHORT. This is not the membership questionnaire: that one builds
// a treatment programme over 27 steps, whereas a second opinion needs only
// enough context for a specialist to review a decision someone else has already
// made. Asking more here would be asking a person in distress to re-tell their
// whole history to get a single answer.
//
// Kept identical to the web copy in Telehealth/src/utils/secondOpinionIntake.js
// — there is no shared build between the apps, so a question added in one must
// be added in the other.

/** What the client wants a second view on. Multi-select: cases overlap. */
export const REVIEW_AREAS = [
  { key: 'diagnosis',        label: 'Diagnosis' },
  { key: 'treatment_plan',   label: 'Current treatment plan' },
  { key: 'therapy_progress', label: 'Therapy progress' },
  { key: 'medication',       label: 'Medication / side effects' },
  { key: 'prior_assessment', label: 'Previous assessment' },
  { key: 'other',            label: 'Other concern' },
];

/**
 * The free-text fields, in the order they are asked.
 *
 * Only `reason` is required. The rest are genuinely optional: a client may not
 * know their diagnosis — that can be exactly why they are here — and making it
 * mandatory would either block them or invite a guess into a clinical record.
 */
export const INTAKE_FIELDS = [
  {
    key: 'reason',
    label: 'Why are you seeking a second opinion?',
    placeholder: 'What prompted this, and what would help you most?',
    required: true,
    multiline: true,
  },
  {
    key: 'currentDiagnosis',
    label: 'Current diagnosis (if known)',
    placeholder: 'e.g. Generalised anxiety disorder — or leave blank',
    required: false,
    multiline: false,
  },
  {
    key: 'currentTreatment',
    label: 'Current treatment or therapy',
    placeholder: 'Medication, therapy type, how long you have been receiving it',
    required: false,
    multiline: true,
  },
];

/** True when the answers are complete enough to submit. */
export function canSubmitIntake(intake) {
  if (!intake) return false;
  const areas = Array.isArray(intake.reviewAreas) ? intake.reviewAreas : [];
  return areas.length > 0 && Boolean(String(intake.reason || '').trim());
}

/** Human-readable summary of the selected areas, for the therapist's view. */
export function describeReviewAreas(keys) {
  const set = new Set(Array.isArray(keys) ? keys : []);
  const labels = REVIEW_AREAS.filter((a) => set.has(a.key)).map((a) => a.label);
  return labels.length ? labels.join(', ') : '—';
}

/** The intake shaped for `intakeAnswers` on the register call. */
export function toIntakeAnswers(intake) {
  return {
    serviceType: 'second_opinion',
    reviewAreas: intake?.reviewAreas || [],
    reviewAreasLabel: describeReviewAreas(intake?.reviewAreas),
    reason: intake?.reason || '',
    currentDiagnosis: intake?.currentDiagnosis || '',
    currentTreatment: intake?.currentTreatment || '',
    // File ids from the uploads step; the therapist screen resolves them.
    reportFileIds: intake?.reportFileIds || [],
  };
}
