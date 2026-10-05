// ─── medpsychFlow (mobile) ───────────────────────────────────────────────────
// The MedPsych sign-up, held on the device until it is finished.
//
// Mirrors Telehealth/src/utils/medpsychFlow.js. Nothing about this user reaches
// the database until they have chosen a psychiatrist and paid: someone who
// abandons the flow leaves no orphaned account, no unpaid booking and no
// half-written consent record behind.
//
// AsyncStorage rather than component state so backgrounding the app, or a
// payment sheet taking over the screen, does not throw the user back to step
// one. Cleared the moment the flow commits.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nessa.medpsych.flow';

/** Every policy that must be ticked. Mirrors MedPsychController.REQUIRED_POLICIES. */
export const REQUIRED_POLICIES = [
  {
    key: 'terms_of_use',
    label: 'Terms of Use',
    summary: 'The rules for using NessaHub, including acceptable use and account responsibilities.',
  },
  {
    key: 'privacy_policy',
    label: 'Privacy Policy',
    summary: 'How your health information is stored, who can see it, and your rights over it.',
  },
  {
    key: 'informed_consent',
    label: 'Informed Consent to Care',
    summary:
      'You understand this is a second opinion and does not replace the care you receive from your current provider.',
  },
  {
    key: 'telehealth_consent',
    label: 'Telehealth Consent',
    summary: 'You consent to being seen remotely by video or audio, and understand its limits.',
  },
];

const EMPTY = {
  step: 'signup',
  details: null,
  acceptedPolicies: [],
  policyVersion: '1.0',
  // Which service this flow is for: 'medpsych' (Psychology & Counseling) or
  // 'second_opinion'. Both share these steps, this cache and the commit
  // endpoint; they differ in which intake is collected and what the resulting
  // dashboard shows.
  serviceType: 'medpsych',
  // individual | teen | couples. Enforced from one place so the questionnaire,
  // matching and the committed account cannot disagree.
  therapyType: 'individual',
  intake: null,             // questionnaire answers, cached until commit
  therapist: null,
  booking: null,
  payment: null,
  startedAt: null,
};

export async function getFlow() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export async function updateFlow(patch) {
  const current = await getFlow();
  const next = {
    ...current,
    ...patch,
    startedAt: current.startedAt || new Date().toISOString(),
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or unavailable — the flow still works for this session.
  }
  return next;
}

export async function clearFlow() {
  try { await AsyncStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

export function allPoliciesAccepted(accepted) {
  const set = new Set(accepted || []);
  return REQUIRED_POLICIES.every((p) => set.has(p.key));
}

/** The UI mirror of the backend's own check, so the button can stay disabled. */
export function canCommit(f) {
  return Boolean(
    f?.details?.fullName
    && f?.details?.email
    && f?.details?.password
    && allPoliciesAccepted(f?.acceptedPolicies)
    && f?.therapist?.id
    && f?.booking?.scheduledAt
    && f?.payment?.reference,
  );
}

/**
 * A couple sign-up commits against its server-side draft, not this flow, so the
 * things `canCommit` insists on are deliberately absent: the password lives on
 * the draft (never on the device) and consent was captured in the couple
 * intake. What still has to be true is that a therapist, a slot and a real
 * payment reference exist.
 */
export function canCommitCouple(f) {
  return Boolean(f?.therapist?.id && f?.booking?.scheduledAt && f?.payment?.reference);
}

export function toRegisterPayload(f) {
  return {
    fullName: f.details.fullName,
    email: f.details.email,
    password: f.details.password,
    phone: f.details.phone || null,
    acceptedPolicies: f.acceptedPolicies,
    policyVersion: f.policyVersion,
    therapistId: f.therapist.id,
    scheduledAt: f.booking.scheduledAt,
    durationMinutes: f.booking.durationMinutes || 50,
    sessionType: f.booking.sessionType || 'video',
    reasonForVisit: f.booking.reasonForVisit || null,
    paymentReference: f.payment.reference,
    amountPaid: f.payment.amount ?? 0,
    currency: f.payment.currency || 'GHS',
    // Cached with the rest of the flow and only sent at commit time, like
    // everything else here — an abandoned sign-up must leave nothing behind.
    // The server writes these into client_profiles_v2.preferences_json, which
    // is where the assigned psychiatrist's client screen already reads intake.
    intakeAnswers: f.intake || null,
    serviceType: f.serviceType || 'medpsych',
    therapyType: f.therapyType || 'individual',
  };
}
