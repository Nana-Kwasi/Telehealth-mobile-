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
};
