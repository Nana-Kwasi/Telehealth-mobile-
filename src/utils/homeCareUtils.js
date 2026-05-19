import { BOOKING_STATUS } from '../constants/homeCareConstants';

export function maskPatientName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Patient';
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

export function formatGhs(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `GHS ${n.toLocaleString()}`;
}

export function feeForDuration(nurse, durationType) {
  const fees = nurse?.fees || {};
  if (durationType === 'weekly') return { amount: fees.weekly, label: 'per week' };
  if (durationType === 'monthly') return { amount: fees.monthly, label: 'per month' };
  if (durationType === 'yearly') {
    const y = fees.yearly;
    if (y != null && Number(y) > 0) return { amount: y, label: 'per year' };
    const m = Number(fees.monthly) || 0;
    return { amount: m * 12, label: 'per year (est. from monthly)' };
  }
  return { amount: fees.daily, label: 'per visit' };
}

export function nursePresenceLabel(presenceStatus) {
  if (presenceStatus === 'online') return 'Available';
  if (presenceStatus === 'busy') return 'On assignment';
  return 'Offline';
}

export function nurseIsBookable(nurse) {
  if (!nurse) return false;
  if (nurse.accountStatus !== 'approved') return false;
  if (nurse.presenceStatus === 'offline') return false;
  const exp = nurse.licenseExpiry;
  if (exp?.seconds) {
    if (exp.seconds * 1000 < Date.now()) return false;
  }
  return true;
}

export function formatProfileLocation(data) {
  if (!data) return '';
  const m = data.locationMeta || data.location || {};
  const parts = [data.area || m.area, data.city || m.city, data.region || m.region, data.street || m.street]
    .filter(Boolean);
  const unique = [...new Set(parts)];
  if (unique.length) return unique.join(', ');
  if (data.ghanaDigitalAddress) return data.ghanaDigitalAddress;
  if (data.country || m.country) return data.country || m.country;
  return '';
}

export function resolvePatientDisplayName(authData, clientData, firebaseUser) {
  return (
    authData?.name
    || clientData?.clientName
    || clientData?.displayName
    || clientData?.name
    || firebaseUser?.displayName
    || ''
  ).trim();
}

export function bookingStatusTone(status) {
  const map = {
    [BOOKING_STATUS.PENDING]: { bg: '#fef3c7', text: '#b45309' },
    [BOOKING_STATUS.ACCEPTED]: { bg: '#d1fae5', text: '#047857' },
    [BOOKING_STATUS.DECLINED]: { bg: '#fee2e2', text: '#b91c1c' },
    [BOOKING_STATUS.EN_ROUTE]: { bg: '#e0f2fe', text: '#0369a1' },
    [BOOKING_STATUS.ARRIVED]: { bg: '#e0f2fe', text: '#0369a1' },
    [BOOKING_STATUS.IN_PROGRESS]: { bg: '#ccfbf1', text: '#0f766e' },
    [BOOKING_STATUS.ONGOING]: { bg: '#ccfbf1', text: '#0f766e' },
    [BOOKING_STATUS.COMPLETED]: { bg: '#f1f5f9', text: '#475569' },
    [BOOKING_STATUS.CANCELLED]: { bg: '#f1f5f9', text: '#64748b' },
  };
  return map[status] || { bg: '#f1f5f9', text: '#64748b' };
}

export function statusLabel(status) {
  const map = {
    [BOOKING_STATUS.PENDING]: 'Pending',
    [BOOKING_STATUS.ACCEPTED]: 'Accepted',
    [BOOKING_STATUS.DECLINED]: 'Declined',
    [BOOKING_STATUS.EN_ROUTE]: 'En route',
    [BOOKING_STATUS.ARRIVED]: 'Arrived',
    [BOOKING_STATUS.IN_PROGRESS]: 'In progress',
    [BOOKING_STATUS.ONGOING]: 'Ongoing',
    [BOOKING_STATUS.COMPLETED]: 'Completed',
    [BOOKING_STATUS.CANCELLED]: 'Cancelled',
  };
  return map[status] || status;
}

export function contactRevealed(booking) {
  return ['accepted', 'en_route', 'arrived', 'in_progress', 'ongoing', 'completed'].includes(booking?.status);
}

export function isValidEmergencyPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 8;
}

const ACTIVE_DASH_RANK = {
  [BOOKING_STATUS.ONGOING]: 60,
  [BOOKING_STATUS.IN_PROGRESS]: 55,
  [BOOKING_STATUS.ARRIVED]: 50,
  [BOOKING_STATUS.EN_ROUTE]: 45,
  [BOOKING_STATUS.ACCEPTED]: 30,
  [BOOKING_STATUS.PENDING]: 10,
};

function bookingDashScore(booking) {
  const tier = ACTIVE_DASH_RANK[booking.status] ?? 0;
  const ts = Math.max(booking.updatedAt?.seconds ?? 0, booking.createdAt?.seconds ?? 0);
  return tier * 1e12 + ts;
}

export function collapseActivePatientBookingsByNurse(bookings) {
  const byNurse = new Map();
  for (const b of bookings) {
    const key = b.nurseId ? String(b.nurseId) : `no-nurse:${b.id}`;
    const prev = byNurse.get(key);
    if (!prev || bookingDashScore(b) > bookingDashScore(prev)) byNurse.set(key, b);
  }
  return [...byNurse.values()].sort((a, b) => bookingDashScore(b) - bookingDashScore(a));
}
