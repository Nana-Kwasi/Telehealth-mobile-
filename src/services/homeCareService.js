import { api, uploadFile, STORAGE_KEYS, getStoredUserId } from './apiClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  NURSE_ACCOUNT_STATUS,
  BOOKING_STATUS,
  NURSE_PRESENCE,
  EMERGENCY_RADIUS_KM,
  DEFAULT_SEARCH_RADIUS_KM,
} from '../constants/homeCareConstants';
import { nurseIsBookable, formatProfileLocation, resolvePatientDisplayName, isValidEmergencyPhone, collapseActivePatientBookingsByNurse } from '../utils/homeCareUtils';
import {
  isPackageDuration,
  isValidBookingYmd,
  packageInclusiveDayNumber,
  packageWeekOrdinal,
  packageSpanDaysInclusive,
  localTodayYmd,
} from '../utils/homeCarePackage';
import { attachDistance, withinRadiusKm } from '../utils/homeCareGeo';
import { geocodeAddressMobile, getCurrentLocationMobile, reverseGeocodeMobile } from './homeCareGeoService';

export { getCurrentLocationMobile, geocodeAddressMobile, reverseGeocodeMobile };

/**
 * Normalise a nurse record coming off the API.
 *
 * `languages`, `specialties`, `fees` and `availability` are TEXT columns holding
 * JSON, but every screen treats them as arrays/objects — the profile screen calls
 * `nurse.languages.join(', ')`, which threw "join is not a function" and took the
 * whole screen down. Parse them once here so no screen has to guess.
 */
function parseJsonField(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    // Not JSON — a plain "English, Twi" string is still meaningful as a list.
    return Array.isArray(fallback)
      ? value.split(',').map((x) => x.trim()).filter(Boolean)
      : fallback;
  }
}

export function hydrateNurse(nurse) {
  if (!nurse) return nurse;
  const meta = parseJsonField(nurse.metadataJson, {});
  return {
    ...meta,
    ...nurse,
    languages: parseJsonField(nurse.languages, []),
    specialties: parseJsonField(nurse.specialties, []),
    fees: parseJsonField(nurse.fees, {}),
    availability: parseJsonField(nurse.availability, {}),
  };
}

export function mapNurseDoc(id, data) {
  return hydrateNurse({ id, ...data });
}

// ── Nurse browsing ─────────────────────────────────────────────────────────────
export async function fetchApprovedNurses(filters = {}) {
  const params = new URLSearchParams();
  if (filters.specialty) params.set('specialty', filters.specialty);
  if (filters.gender) params.set('gender', filters.gender);
  if (filters.minRating) params.set('minRating', String(filters.minRating));
  if (filters.onlineOnly) params.set('onlineOnly', 'true');
  if (filters.language) params.set('language', filters.language);
  if (filters.latitude != null) params.set('latitude', String(filters.latitude));
  if (filters.longitude != null) params.set('longitude', String(filters.longitude));
  const radiusKm = Number(filters.radiusKm) || DEFAULT_SEARCH_RADIUS_KM;
  params.set('radiusKm', String(radiusKm));

  const list = await api(`/api/v1/homecare/nurses?${params.toString()}`) || [];
  let nurses = (Array.isArray(list) ? list : []).map(hydrateNurse).filter(nurseIsBookable);

  const hasLocation = filters.latitude != null && filters.longitude != null;

  // A location search returns only nurses inside `radiusKm`. That is correct, but
  // it renders as a blank screen with no reason — and it hits hard when the
  // device's location is nowhere near the nurses (e.g. a simulator defaulting to
  // San Francisco while every nurse is in Ghana). Fall back to the unfiltered
  // list and flag it, so the screen can say why instead of showing nothing.
  let outsideRadius = false;
  if (hasLocation && nurses.length === 0) {
    const wider = await api('/api/v1/homecare/nurses').catch(() => []);
    const fallback = (Array.isArray(wider) ? wider : []).map(hydrateNurse).filter(nurseIsBookable);
    if (fallback.length) {
      nurses = fallback;
      outsideRadius = true;
    }
  }

  const anchor = hasLocation
    ? { latitude: Number(filters.latitude), longitude: Number(filters.longitude) } : null;

  if (anchor) {
    nurses = attachDistance(nurses, anchor);
  } else {
    nurses.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
  }
  // Non-enumerable-ish marker the list screen can read without it affecting keys.
  nurses.outsideRadius = outsideRadius;
  nurses.searchRadiusKm = radiusKm;
  return nurses;
}

export async function fetchNurseById(nurseId) {
  try {
    return hydrateNurse(await api(`/api/v1/homecare/nurses/${nurseId}`));
  } catch {
    return null;
  }
}

export async function fetchNurseProfile(uid) {
  // uid is the user's auth ID; look up nurse profile by userId
  try {
    const nurses = await api(`/api/v1/homecare/nurses?userId=${uid}`);
    const nurse = Array.isArray(nurses) ? nurses[0] : null;
    if (nurse?.id) await AsyncStorage.setItem(STORAGE_KEYS.nurseId, String(nurse.id));
    return nurse ? hydrateNurse(nurse) : null;
  } catch {
    return null;
  }
}

async function resolveNurseId() {
  return AsyncStorage.getItem(STORAGE_KEYS.nurseId);
}

// ── Presence & location ────────────────────────────────────────────────────────
export async function updateNursePresence(uid, presenceStatus) {
  const nurseId = await resolveNurseId();
  if (!nurseId) return;
  await api(`/api/v1/homecare/nurses/${nurseId}/presence`, {
    method: 'PATCH',
    body: { presenceStatus },
  });
}

export async function updateNurseLocation(uid, { latitude, longitude }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const nurseId = await resolveNurseId();
  if (!nurseId) return;
  await api(`/api/v1/homecare/nurses/${nurseId}/location`, {
    method: 'PATCH',
    body: { latitude, longitude },
  });
}

export async function updateNurseAvailability(uid, availability) {
  const nurseId = await resolveNurseId();
  if (!nurseId) return;
  await api(`/api/v1/homecare/nurses/${nurseId}/availability`, {
    method: 'PATCH',
    body: { availability: typeof availability === 'string' ? availability : JSON.stringify(availability) },
  });
}

/**
 * Save the nurse's profile.
 *
 * Two things used to make edits vanish while the screen said "Saved":
 *  • a missing stored nurseId returned early WITHOUT throwing, so the caller's
 *    success path ran on a request that was never sent;
 *  • the form sends arrays/objects (languages, specialties, fees) and extra keys
 *    (yearsExperience, licenseNumber, profileComplete) that the API binds as
 *    strings or not at all, so Jackson dropped them silently.
 */
export async function updateNurseProfile(uid, patch = {}) {
  let nurseId = await resolveNurseId();
  if (!nurseId && uid) {
    // Fall back to looking the profile up by user id rather than no-op'ing.
    const found = await api(`/api/v1/homecare/nurses?userId=${uid}`).catch(() => []);
    nurseId = Array.isArray(found) && found[0]?.id ? found[0].id : null;
    if (nurseId) await AsyncStorage.setItem(STORAGE_KEYS.nurseId, nurseId);
  }
  if (!nurseId) throw new Error('Your nurse profile could not be found. Please sign in again.');

  const asText = (v) => (v === undefined || v === null
    ? undefined
    : (typeof v === 'string' ? v : JSON.stringify(v)));

  // Keys the columns can't hold travel in metadataJson instead of being dropped.
  const KNOWN = new Set([
    'fullName', 'phone', 'whatsapp', 'email', 'gender', 'specialty', 'specialties',
    'languages', 'bio', 'availability', 'fees', 'profilePhotoUrl',
    'accountStatus', 'documentsStatus', 'licenseVerified', 'adminNote', 'metadataJson',
  ]);
  const extra = {};
  Object.entries(patch).forEach(([k, v]) => { if (!KNOWN.has(k)) extra[k] = v; });

  const body = {
    ...Object.fromEntries(Object.entries(patch).filter(([k]) => KNOWN.has(k))),
    ...(patch.specialties !== undefined ? { specialties: asText(patch.specialties) } : {}),
    ...(patch.languages !== undefined ? { languages: asText(patch.languages) } : {}),
    ...(patch.fees !== undefined ? { fees: asText(patch.fees) } : {}),
    ...(patch.availability !== undefined ? { availability: asText(patch.availability) } : {}),
    ...(Object.keys(extra).length ? { metadataJson: JSON.stringify(extra) } : {}),
  };

  return api(`/api/v1/homecare/nurses/${nurseId}`, { method: 'PATCH', body });
}

export async function uploadNursePhoto(uid, fileOrUri, mimeType = 'image/jpeg') {
  const nurseId = await resolveNurseId();
  if (!nurseId) throw new Error('Nurse profile not found.');
  const uri = fileOrUri instanceof Blob ? URL.createObjectURL(fileOrUri) : fileOrUri;
  const photoUrl = await uploadFile(`homecare/nurses/${nurseId}/photo`, uri, mimeType);
  await api(`/api/v1/homecare/nurses/${nurseId}`, {
    method: 'PATCH',
    body: { profilePhotoUrl: photoUrl },
  });
  // Also save it as the user's avatar. The nurse row is only read by home-care
  // screens, so without this the nurse's picture never appeared anywhere else in
  // the app (headers, chat, admin lists) that resolves avatars by user id.
  const userId = uid || (await getStoredUserId());
  if (userId) {
    await api(`/api/v1/auth/mobile/users/${userId}/avatar`, {
      method: 'PATCH',
      body: { avatarUrl: photoUrl },
    }).catch(() => {});
  }
  return photoUrl;
}

export async function uploadNurseDocument(uid, type, uri, mimeType = 'image/jpeg') {
  const nurseId = await resolveNurseId();
  if (!nurseId) throw new Error('Nurse profile not found.');
  const url = await uploadFile(`homecare/nurses/${nurseId}/${type}`, uri, mimeType);
  await api(`/api/v1/homecare/nurses/${nurseId}/documents`, {
    method: 'POST',
    body: { type, fileUrl: url, mimeType },
  });
  return url;
}

// ── Patient auth helper ────────────────────────────────────────────────────────
export async function getHomeCareAuthUser() {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  return userId ? { uid: userId } : null;
}

export async function resolveBookingCoords(address, coords) {
  if (coords?.latitude != null && coords?.longitude != null) return coords;
  if (address) { const g = await geocodeAddressMobile(address); if (g) return g; }
  return getCurrentLocationMobile();
}

// ── Patient profile (best-effort from stored data) ────────────────────────────
export async function fetchHomeCarePatientProfile(uid) {
  try {
    const data = await api(`/api/v1/patients/${uid}`);
    return {
      name: data?.fullName || data?.name || '',
      location: formatProfileLocation(data) || '',
      phone: String(data?.phone || data?.phoneNumber || '').trim(),
    };
  } catch {
    const raw = await AsyncStorage.getItem('userProfile').catch(() => null);
    const profile = raw ? JSON.parse(raw) : {};
    return {
      name: profile?.name || profile?.fullName || '',
      location: formatProfileLocation(profile) || '',
      phone: String(profile?.phone || profile?.phoneNumber || '').trim(),
    };
  }
}

// ── Bookings — patient side ────────────────────────────────────────────────────
export async function createBooking(payload) {
  const user = await getHomeCareAuthUser();
  if (!user) throw new Error('Your session expired. Please sign in again to book.');

  const { patientPhone: payloadPhone, ...restPayload } = payload || {};
  const profile = await fetchHomeCarePatientProfile(user.uid);
  const patientPhone = String(payloadPhone ?? '').trim() || profile.phone;

  if (!isValidEmergencyPhone(patientPhone)) {
    throw new Error('A valid phone number is required so your nurse can reach you (at least 8 digits).');
  }

  const booking = await api('/api/v1/homecare/bookings', {
    method: 'POST',
    body: {
      ...restPayload,
      patientId: user.uid,
      patientPhone,
      bookingType: restPayload.bookingType || 'scheduled',
    },
  });
  return booking?.id;
}

export async function createEmergencyBooking(payload) {
  const user = await getHomeCareAuthUser();
  if (!user) throw new Error('Your session expired. Please sign in again.');

  const { patientPhone: payloadPhone, ...restPayload } = payload;
  const fromForm = String(payloadPhone ?? '').trim();
  if (!fromForm) throw new Error('Phone number is required for emergency requests so the nurse can reach you.');
  if (!isValidEmergencyPhone(fromForm)) throw new Error('Enter a valid phone number (at least 8 digits).');

  const booking = await api('/api/v1/homecare/bookings/emergency', {
    method: 'POST',
    body: {
      ...restPayload,
      patientId: user.uid,
      patientPhone: fromForm,
      bookingType: 'emergency',
      isEmergency: true,
      urgency: restPayload.urgency || 'high',
    },
  });
  return booking?.id;
}

export async function fetchBooking(bookingId) {
  try {
    return await api(`/api/v1/homecare/bookings/${bookingId}`);
  } catch {
    return null;
  }
}

export async function fetchPatientBookings(patientId) {
  const data = await api(`/api/v1/homecare/bookings?patientId=${patientId}`);
  return Array.isArray(data) ? data : [];
}

export async function fetchNurseBookings(nurseId, statuses = null) {
  const data = await api(`/api/v1/homecare/bookings?nurseId=${nurseId}`);
  let list = Array.isArray(data) ? data : [];
  if (statuses?.length) list = list.filter((b) => statuses.includes(b.status));
  return list;
}

export async function fetchPendingRequestsForNurse(nurseId) {
  const data = await api(`/api/v1/homecare/bookings?nurseId=${nurseId}&status=pending`);
  return Array.isArray(data) ? data : [];
}

// ── Booking lifecycle mutations ────────────────────────────────────────────────
export async function updateBookingStatus(bookingId, status, extra = {}) {
  await api(`/api/v1/homecare/bookings/${bookingId}/status`, {
    method: 'PATCH',
    body: { status, ...extra },
  });
}

export async function cancelBooking(bookingId, { cancelledBy, reason = '' }) {
  const booking = await fetchBooking(bookingId);
  if (!booking) throw new Error('Booking not found.');
  if ([BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(booking.status)) {
    throw new Error('Cannot cancel this booking.');
  }
  await api(`/api/v1/homecare/bookings/${bookingId}/cancel`, {
    method: 'PATCH',
    body: { cancelledBy, cancelReason: reason },
  });
}

export async function markBookingOngoing(bookingId) {
  await api(`/api/v1/homecare/bookings/${bookingId}/ongoing`, { method: 'PATCH', body: {} });
}

export async function maybeCloseExpiredHomeCarePackage(booking) {
  if (!booking?.id || !isPackageDuration(booking.durationType)) return booking;
  if (booking.status !== BOOKING_STATUS.ONGOING) return booking;
  if (!booking.endDate) return booking;
  if (localTodayYmd() <= booking.endDate) return booking;

  await api(`/api/v1/homecare/bookings/${booking.id}/status`, {
    method: 'PATCH',
    body: { status: BOOKING_STATUS.COMPLETED },
  });
  return { ...booking, status: BOOKING_STATUS.COMPLETED, packageClosureReason: 'period_end' };
}

// ── Nurse accept/decline/claim ─────────────────────────────────────────────────
export async function nurseAcceptBooking(bookingId, nurse) {
  const booking = await fetchBooking(bookingId);
  await api(`/api/v1/homecare/bookings/${bookingId}/accept`, {
    method: 'POST',
    body: { nursePhone: nurse.phone || '', nurseWhatsapp: nurse.whatsapp || nurse.phone || '' },
  });
}

export async function nurseDeclineBooking(bookingId) {
  await api(`/api/v1/homecare/bookings/${bookingId}/decline`, { method: 'POST', body: {} });
}

export async function claimEmergencyBooking(bookingId, nurse) {
  const booking = await fetchBooking(bookingId);
  if (!booking) throw new Error('Request not found.');
  if (booking.nurseId) throw new Error('Already claimed by another nurse.');
  await api(`/api/v1/homecare/bookings/${bookingId}/claim-emergency`, {
    method: 'POST',
    body: { nurseId: nurse.id, nurseName: nurse.fullName, nursePhone: nurse.phone || '' },
  });
}

export async function fetchOpenEmergencyRequests(nurseAnchor = null, radiusKm = EMERGENCY_RADIUS_KM) {
  const data = await api('/api/v1/homecare/bookings/emergency/open');
  let list = Array.isArray(data) ? data : [];
  if (nurseAnchor) {
    list = list.filter((b) => withinRadiusKm(b, nurseAnchor, radiusKm));
    list = attachDistance(list, nurseAnchor);
  }
  return list;
}

export async function fetchOngoingEngagements(nurseId) {
  const list = await fetchNurseBookings(nurseId);
  return list.filter(
    (b) => b.status === BOOKING_STATUS.ONGOING ||
      (['accepted', 'in_progress'].includes(b.status) && isPackageDuration(b.durationType)),
  );
}

// ── Visit logs ─────────────────────────────────────────────────────────────────
export async function addVisitLog(bookingId, log) {
  await api(`/api/v1/homecare/bookings/${bookingId}/visit-logs`, {
    method: 'POST',
    body: {
      vitals: typeof log.vitals === 'string' ? log.vitals : JSON.stringify(log.vitals || {}),
      careProvided: log.careSummary || log.careProvided || '',
      medicationsGiven: log.medicationsGiven || '',
      concerns: log.concerns || '',
      incidentFlag: !!log.incidentFlag,
      incidentDescription: log.incidentDescription || '',
      visitDate: log.visitDate || null,
      planCycleNotes: log.planCycleNotes || null,
    },
  });
}

export async function fetchVisitLogs(bookingId) {
  const data = await api(`/api/v1/homecare/bookings/${bookingId}/visit-logs`);
  return Array.isArray(data) ? data : [];
}

export async function submitVisitReport(bookingId, report) {
  let booking = await fetchBooking(bookingId);
  if (!booking) throw new Error('Booking not found.');

  booking = await maybeCloseExpiredHomeCarePackage(booking);

  const isPackage = isPackageDuration(booking.durationType);
  if (
    booking.status !== BOOKING_STATUS.IN_PROGRESS &&
    !(booking.status === BOOKING_STATUS.ONGOING && isPackage)
  ) {
    throw new Error('This booking is not open for visit reports.');
  }

  if (isPackage) {
    const visitDateRaw = String(report.visitDate || '').trim();
    if (!isValidBookingYmd(visitDateRaw)) throw new Error('Visit date is required (calendar day of this visit).');
    if (!booking.startDate || !booking.endDate) throw new Error('This plan is missing start/end dates.');
    if (visitDateRaw < booking.startDate || visitDateRaw > booking.endDate) throw new Error('Visit date must fall between plan start and expected end.');
    const today = localTodayYmd();
    if (today > booking.endDate) {
      booking = await maybeCloseExpiredHomeCarePackage({ ...booking, status: BOOKING_STATUS.ONGOING });
      throw new Error('Scheduled care period has ended.');
    }
  }

  const dayNum = isPackage && booking.startDate && report.visitDate
    ? packageInclusiveDayNumber(booking.startDate, String(report.visitDate).trim()) : null;
  const weekOrd = isPackage && booking.startDate && report.visitDate
    ? packageWeekOrdinal(booking.startDate, String(report.visitDate).trim()) : null;
  const planNotes = typeof report.planCycleNotes === 'string' ? report.planCycleNotes.trim() : '';

  await addVisitLog(bookingId, {
    vitals: report.vitals || {},
    careSummary: report.careProvided || '',
    medicationsGiven: report.medicationsGiven || '',
    concerns: report.concerns || '',
    incidentFlag: !!report.incidentFlag,
    incidentDescription: report.incidentDescription || '',
    ...(isPackage ? {
      visitDate: String(report.visitDate).trim(),
      planCycleNotes: planNotes || undefined,
    } : {}),
  });

  if (!isPackage) {
    await api(`/api/v1/homecare/bookings/${bookingId}/status`, {
      method: 'PATCH',
      body: { status: BOOKING_STATUS.COMPLETED },
    });
  }
}

// ── Patient feedback ───────────────────────────────────────────────────────────
export async function submitPatientFeedback(bookingId, feedback) {
  if (!feedback?.rating) return;
  await api(`/api/v1/homecare/bookings/${bookingId}/feedback`, {
    method: 'PATCH',
    body: { rating: Number(feedback.rating), comment: feedback.comment || feedback.text || '' },
  });
}

// ── Package extension ──────────────────────────────────────────────────────────
export async function extendHomeCarePackage(bookingId, newEndDate, durationTypeOpt) {
  return api(`/api/v1/homecare/bookings/${bookingId}/extend-package`, {
    method: 'POST',
    body: { newEndDate, durationType: durationTypeOpt ?? null },
  });
}

// ── Patient active/ongoing bookings ───────────────────────────────────────────
const ACTIVE_PATIENT_STATUSES = [
  BOOKING_STATUS.PENDING, BOOKING_STATUS.ACCEPTED, BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.ONGOING,
];

export async function fetchPatientOngoingBookings(patientId) {
  const all = await fetchPatientBookings(patientId);
  const synced = [];
  for (const b of all) {
    let row = b;
    if (row.status === BOOKING_STATUS.ONGOING && isPackageDuration(row.durationType) && row.endDate) {
      row = await maybeCloseExpiredHomeCarePackage(row);
    }
    synced.push(row);
  }
  return synced.filter(
    (b) => b.status === BOOKING_STATUS.ONGOING ||
      (isPackageDuration(b.durationType) && ['accepted', 'in_progress', 'ongoing', 'en_route', 'arrived'].includes(b.status)),
  );
}

export async function fetchPatientActiveBookings(patientId) {
  const all = await fetchPatientBookings(patientId);
  const synced = await Promise.all(
    all.map(async (b) =>
      b.status === BOOKING_STATUS.ONGOING && isPackageDuration(b.durationType) && b.endDate
        ? maybeCloseExpiredHomeCarePackage(b) : b,
    ),
  );
  const active = synced.filter((b) => ACTIVE_PATIENT_STATUSES.includes(b.status));
  const nurseIds = [...new Set(active.map((b) => b.nurseId).filter(Boolean))];
  const nurseById = {};
  await Promise.all(
    nurseIds.map(async (id) => {
      const n = await fetchNurseById(id);
      if (n) nurseById[id] = n;
    }),
  );
  return collapseActivePatientBookingsByNurse(
    active.map((b) => ({
      ...b,
      nursePhotoURL: nurseById[b.nurseId]?.profilePhotoUrl || b.nursePhotoURL || null,
    })),
  );
}

export async function fetchRecentlyHiredNurses(patientId, limitCount = 5) {
  const bookings = await fetchPatientBookings(patientId);
  const seen = new Set();
  const nurses = [];
  for (const b of bookings) {
    if (b.status !== BOOKING_STATUS.COMPLETED || !b.nurseId || seen.has(b.nurseId)) continue;
    seen.add(b.nurseId);
    const n = await fetchNurseById(b.nurseId);
    if (n) nurses.push(n);
    if (nurses.length >= limitCount) break;
  }
  return nurses;
}

// ── Complaints ────────────────────────────────────────────────────────────────
export async function uploadComplaintEvidence(uri) {
  return uploadFile('homecare/complaints', uri, 'image/jpeg');
}

export async function submitComplaint({ bookingId, nurseId, nature, description, evidenceUrls = [] }) {
  const user = await getHomeCareAuthUser();
  await api('/api/v1/homecare/complaints', {
    method: 'POST',
    body: {
      bookingId,
      patientId: user?.uid,
      nurseId,
      nature,
      description,
      evidenceUrls: JSON.stringify(evidenceUrls),
    },
  });
}

// ── Admin operations ───────────────────────────────────────────────────────────
export async function fetchAllNursesAdmin() {
  const data = await api('/api/v1/homecare/admin/nurses');
  return Array.isArray(data) ? data : [];
}

export async function updateNurseAccountStatus(nurseId, accountStatus) {
  await api(`/api/v1/homecare/admin/nurses/${nurseId}/account-status`, {
    method: 'PATCH',
    body: { accountStatus },
  });
}

export async function updateNurseFeesAdmin(nurseId, fees) {
  await api(`/api/v1/homecare/admin/nurses/${nurseId}/fees`, {
    method: 'PATCH',
    body: { fees: typeof fees === 'string' ? fees : JSON.stringify(fees) },
  });
}

export async function verifyNurseDocumentsAdmin(nurseId, { licenseVerified, documentsStatus, adminNote }) {
  await api(`/api/v1/homecare/admin/nurses/${nurseId}/verify-documents`, {
    method: 'POST',
    body: { licenseVerified: !!licenseVerified, documentsStatus: documentsStatus || 'verified', adminNote: adminNote || '' },
  });
}

export async function fetchAllBookingsAdmin(limitCount = 100) {
  const user = await getHomeCareAuthUser();
  const data = await api('/api/v1/homecare/bookings');
  return Array.isArray(data) ? data.slice(0, limitCount) : [];
}

export async function fetchAllComplaintsAdmin() {
  const data = await api('/api/v1/homecare/admin/complaints');
  return Array.isArray(data) ? data : [];
}

export async function updateComplaintStatus(complaintId, status, adminNote = '') {
  await api(`/api/v1/homecare/admin/complaints/${complaintId}`, {
    method: 'PATCH',
    body: { status, adminNote },
  });
}

export async function fetchHomeCareAnalyticsAdmin() {
  return api('/api/v1/homecare/admin/analytics');
}

// ── Earnings ──────────────────────────────────────────────────────────────────
export async function addNurseEarning(nurseId, { amount, note, bookingId }) {
  await api(`/api/v1/homecare/nurses/${nurseId}/earnings`, {
    method: 'POST',
    body: { amount: Number(amount) || 0, note: note || '', bookingId: bookingId || null },
  });
}

export async function fetchNurseEarnings(nurseId, limitCount = 50) {
  const data = await api(`/api/v1/homecare/nurses/${nurseId}/earnings`);
  const list = Array.isArray(data?.earnings) ? data.earnings : (Array.isArray(data) ? data : []);
  return list.slice(0, limitCount);
}

// ── Notifications ─────────────────────────────────────────────────────────────
export async function fetchUserNotifications(targetId, limitCount = 40) {
  const data = await api(`/api/v1/homecare/notifications?targetId=${targetId}`);
  const list = Array.isArray(data?.notifications) ? data.notifications : (Array.isArray(data) ? data : []);
  return list.slice(0, limitCount);
}

export async function markNotificationRead(notifId) {
  await api(`/api/v1/homecare/notifications/${notifId}/read`, { method: 'PATCH' });
}

export async function registerPushToken(uid, token, collectionName = 'homeCareNurses') {
  if (!uid || !token) return;
  await api('/api/v1/push-tokens', {
    method: 'POST',
    body: { userId: uid, token, role: 'HOME_CARE_NURSE', platform: 'expo' },
  });
}
