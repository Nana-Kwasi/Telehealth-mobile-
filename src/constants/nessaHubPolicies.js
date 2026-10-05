/** Hosted policy site — same project as Nessa-Hub-Policies (Firebase Hosting). */
const DEFAULT_POLICIES_BASE = 'https://teleehealth.web.app';

export function getNessaHubPoliciesBase() {
  return DEFAULT_POLICIES_BASE.replace(/\/+$/, '');
}

export function nessaHubPolicyUrl(slug) {
  return `${getNessaHubPoliciesBase()}/policy.html?slug=${encodeURIComponent(slug)}`;
}

export const NESSA_HUB_POLICY_LINKS = {
  terms: nessaHubPolicyUrl('terms-of-service'),
  privacy: nessaHubPolicyUrl('patient-privacy-data-protection'),
  cookies: nessaHubPolicyUrl('cookie-policy'),
  policiesHome: getNessaHubPoliciesBase(),
  therapyOverview: nessaHubPolicyUrl('mental-health-therapy-policy'),
  individualInformedConsent: nessaHubPolicyUrl('individual-therapy-informed-consent'),
  therapyAssessments: nessaHubPolicyUrl('therapy-clinical-assessments-questionnaires'),
  therapyMatching: nessaHubPolicyUrl('therapy-therapist-matching-selection'),
  electronicSignature: nessaHubPolicyUrl('therapy-electronic-signature-consent'),
  coupleSensitiveScreening: nessaHubPolicyUrl('couple-therapy-sensitive-screening'),
  notifications: nessaHubPolicyUrl('notifications-electronic-communications'),
  medpsychScope: nessaHubPolicyUrl('medpsych-second-opinion'),
  medpsychMembership: nessaHubPolicyUrl('medpsych-membership-upgrade'),
};

/**
 * The consent keys the MedPsych sign-up gates on, mapped to the documents that
 * back them. The key is what the backend records; the slug is what the user
 * reads. Defined together so the two cannot drift apart.
 */
export const POLICY_KEY_TO_SLUG = {
  terms_of_use: 'terms-of-service',
  privacy_policy: 'patient-privacy-data-protection',
  informed_consent: 'medpsych-second-opinion',
  telehealth_consent: 'telemedicine-policy',
};

/** Full URL for a consent key, or the policy index if the key is unknown. */
export function policyUrlForKey(key) {
  const slug = POLICY_KEY_TO_SLUG[key];
  return slug ? nessaHubPolicyUrl(slug) : getNessaHubPoliciesBase();
}
