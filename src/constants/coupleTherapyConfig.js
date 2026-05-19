export const COUPLE_STORAGE_KEYS = {
  coupleId: 'th.coupleId',
  partnerRole: 'th.couplePartnerRole',
  inviteToken: 'th.coupleInviteToken',
  myIntakeComplete: 'th.coupleMyIntakeComplete',
  otherPartnerName: 'th.coupleOtherPartnerName',
  myRegistrationEmail: 'th.coupleMyRegistrationEmail',
  /** This partner's legal name from registration (Partner A/B signup). */
  myPartnerName: 'th.coupleMyPartnerName',
};

export const COUPLE_STATUSES = {
  AWAITING_PARTNER_B: 'awaiting_partner_b',
  PARTNER_B_IN_PROGRESS: 'partner_b_in_progress',
  READY_FOR_THERAPIST: 'ready_for_therapist',
  THERAPIST_PENDING_CONFIRM: 'therapist_pending_confirm',
  THERAPIST_SELECTED: 'therapist_selected',
  ACTIVE: 'active',
};

export const RELATIONSHIP_TYPES = [
  'Married',
  'Cohabiting / Living together',
  'Dating / Committed relationship',
  'Engaged / Pre-marital',
  'Separated but seeking reconciliation',
];

export const EMPLOYMENT_STATUSES = [
  'Full-time',
  'Part-time',
  'Self-employed',
  'Not working',
  'On sick leave',
  'Student',
];

export const COUNSELLING_OUTCOMES = [
  'Very successful',
  'Somewhat successful',
  'No change',
  'Got worse',
];

export const GENDER_OPTIONS = [
  'Woman',
  'Man',
  'Non-binary',
  'Transfeminine',
  'Transmasculine',
  'Agender',
  'Prefer not to say',
  'Other',
];

export const TREATMENT_OBJECTIVES = [
  'Improve communication',
  'Conflict resolution',
  'Parenting skills',
  'More emotional intimacy',
  'More sexual intimacy',
  'More quality time together',
  'Resolve individual issues',
  'Power and control issues',
  'More mutual respect and understanding',
  "Help with children's behaviour",
  'Rebuild trust after infidelity',
  'Prepare for a major life decision',
  'Other',
];

export const STRESS_EVENTS = [
  { key: 'economic', label: 'Economic or financial problems' },
  { key: 'legal', label: 'Legal issues or involvement with crime' },
  { key: 'housing', label: 'Housing problems' },
  { key: 'grief', label: 'Grief or bereavement' },
  { key: 'familyConflict', label: 'Family conflict or lack of family support' },
  { key: 'cultural', label: 'Cultural or social challenges' },
  { key: 'educationOccupation', label: 'Educational or occupational difficulties' },
  { key: 'other', label: 'Other significant stressors' },
];

export const THERAPIST_GENDER_PREFS = ['Male', 'Female', 'No preference'];
export const SESSION_FORMAT_PREFS = ['In-person', 'Online', 'Either'];
export const THERAPY_APPROACH_PREFS = [
  'Gottman Method',
  'Emotionally Focused Therapy (EFT)',
  'Cognitive Behavioural Therapy (CBT)',
  'Dialectical Behaviour Therapy (DBT)',
  'No preference',
  'Other',
];

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const TIME_WINDOWS = ['Morning', 'Afternoon', 'Evening'];

export const WHO_IDEAS = ["My idea", "My partner's idea", 'Mutual decision'];
export const WHO_OPTIONS = ['Me', 'My partner', 'Both of us'];
export const CHEAT_OPTIONS = ['Yes', 'No', 'Unsure'];

export const CONSENT_ITEMS = [
  {
    key: 'informedConsent',
    title: 'Informed consent',
    policySlug: 'couple-therapy-informed-consent',
    description:
      'I understand the therapy process, its limitations, and what to expect from couple counselling on this platform.',
  },
  {
    key: 'confidentialityAgreement',
    title: 'Confidentiality agreement',
    policySlug: 'couple-therapy-confidentiality',
    description:
      'I understand what is shared between partners versus what remains private (individual intake and sensitive screening).',
  },
  {
    key: 'cancellationPolicy',
    title: 'Cancellation and fee policy',
    policySlug: 'couple-therapy-cancellation-fees',
    description: 'I agree to session cancellation, rescheduling, and fee policies.',
  },
  {
    key: 'emergencyProtocol',
    title: 'Emergency protocol',
    policySlug: 'couple-therapy-emergency-protocol',
    description:
      'I understand emergency procedures and that therapy is not a substitute for emergency services.',
  },
];

export const INVITE_BASE_URL = 'https://nessahub.com/couple/join';

export const SENSITIVE_PRIVACY_MESSAGE =
  'Your answers in this section are completely private. Your partner will never see your responses. Only your therapist will have access to this information.';
