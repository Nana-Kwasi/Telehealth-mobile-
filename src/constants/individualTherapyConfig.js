/** Individual therapy consent items (mobile questionnaire; policy site links). */
export const INDIVIDUAL_CONSENT_ITEMS = [
  {
    key: 'informedConsent',
    title: 'Informed consent for treatment',
    policySlug: 'individual-therapy-informed-consent',
    description:
      'I understand the nature of online therapy, its limitations, and what to expect from licensed professionals on this platform.',
  },
  {
    key: 'confidentialityConsent',
    title: 'Confidentiality',
    policySlug: 'individual-therapy-confidentiality',
    description:
      'I understand how my therapy information is kept private and the legal limits to confidentiality (e.g., imminent harm, abuse of a minor).',
  },
  {
    key: 'assessmentsConsent',
    title: 'Clinical assessments & questionnaires',
    policySlug: 'therapy-clinical-assessments-questionnaires',
    description:
      'I agree that intake answers and screening tools (including PHQ-9) may be stored in my clinical record and used for matching, treatment, and safety review.',
  },
  {
    key: 'matchingConsent',
    title: 'Therapist matching & selection',
    policySlug: 'therapy-therapist-matching-selection',
    description:
      'I understand how therapist matching works after onboarding and that selecting a therapist is subject to availability and clinical fit.',
  },
  {
    key: 'electronicSignatureConsent',
    title: 'Electronic signature & records',
    policySlug: 'therapy-electronic-signature-consent',
    description:
      'I agree that typing my full legal name below constitutes my electronic signature, with the same legal effect as a handwritten signature where permitted by law.',
  },
];

export const INDIVIDUAL_CONSENT_STEP = {
  key: 'consent',
  title: 'Consent & agreements',
  fields: [
    ...INDIVIDUAL_CONSENT_ITEMS.map((item) => ({
      type: 'consent_check',
      name: item.key,
      label: item.title,
      description: item.description,
      policySlug: item.policySlug,
    })),
    {
      type: 'signature',
      name: 'consentSignature',
      label: 'Electronic signature (full legal name)',
      required: true,
    },
    { type: 'consent_footer' },
  ],
};

export function needsIndividualQuestionnaireConsent(therapyType) {
  return therapyType !== 'teen' && therapyType !== 'couples';
}

export function buildIndividualConsentRecord(data) {
  const signedAt = new Date().toISOString();
  const consents = {};
  INDIVIDUAL_CONSENT_ITEMS.forEach((item) => {
    consents[item.key] = !!data[item.key];
  });
  return {
    ...consents,
    signature: String(data.consentSignature || '').trim(),
    signedAt,
    consentComplete: INDIVIDUAL_CONSENT_ITEMS.every((item) => data[item.key]),
  };
}
