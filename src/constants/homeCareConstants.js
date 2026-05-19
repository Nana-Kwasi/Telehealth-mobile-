export const HOME_CARE_SPECIALTIES = [
  'General Nursing',
  'Elderly Care',
  'Post-Surgery Care',
  'Wound Care',
  'Medication Management',
  'Pediatric Home Care',
  'Community Health',
  'Midwifery',
];

export const CARE_TYPES = [
  { value: 'post_surgery', label: 'Post-surgery care' },
  { value: 'elderly', label: 'Elderly care' },
  { value: 'wound', label: 'Wound dressing' },
  { value: 'medication', label: 'Medication management' },
  { value: 'physio_support', label: 'Physiotherapy support' },
  { value: 'general', label: 'General nursing' },
  { value: 'other', label: 'Other' },
];

export const PACKAGE_DURATION_TYPES = ['weekly', 'monthly', 'yearly'];

export const DURATION_TYPES = [
  { value: 'daily', label: 'Daily (per visit)' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

export const BOOKING_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EN_ROUTE: 'en_route',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const EMERGENCY_RADIUS_KM = 25;
export const DEFAULT_SEARCH_RADIUS_KM = 50;

export const NURSE_ACCOUNT_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
};

export const NURSE_PRESENCE = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  BUSY: 'busy',
};

export const FEE_DISCLAIMER =
  'These are flat reference rates. Final charges depend on the specific care required and are agreed between you and the nurse.';

export const BOOKING_FEE_DISCLAIMER =
  'This is a flat reference rate. Actual payment is arranged directly with the nurse and may vary based on care needs.';

export const BOOKING_TYPE = {
  SCHEDULED: 'scheduled',
  EMERGENCY: 'emergency',
};

export const COMPLAINT_STATUS = {
  OPEN: 'open',
  REVIEWING: 'reviewing',
  RESOLVED: 'resolved',
};

export const EMERGENCY_DISCLAIMER =
  'Emergency requests notify available nurses immediately. Final response time depends on nurse availability in your area.';
