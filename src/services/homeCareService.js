import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  query,
  where,
  serverTimestamp,
  limit,
  orderBy,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, functions, httpsCallable } from './firebaseConfig';
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
import { attachDistance, withinRadiusKm, parseCoords } from '../utils/homeCareGeo';
import { geocodeAddressMobile, getCurrentLocationMobile, reverseGeocodeMobile } from './homeCareGeoService';

const NURSES = 'homeCareNurses';
const BOOKINGS = 'homeCareBookings';
const COMPLAINTS = 'homeCareComplaints';
const EARNINGS = 'homeCareNurseEarnings';
const NOTIFICATIONS = 'notifications';

export { getCurrentLocationMobile, geocodeAddressMobile, reverseGeocodeMobile };

export function mapNurseDoc(id, data) {
  return { id, ...data };
}

export async function fetchApprovedNurses(filters = {}) {
  const snap = await getDocs(
    query(collection(db, NURSES), where('accountStatus', '==', NURSE_ACCOUNT_STATUS.APPROVED), limit(80)),
  );
  let list = snap.docs.map((d) => mapNurseDoc(d.id, d.data())).filter(nurseIsBookable);

  if (filters.specialty) {
    const s = filters.specialty.toLowerCase();
    list = list.filter(
      (n) =>
        (n.specialty || '').toLowerCase().includes(s) ||
        (n.specialties || []).some((x) => String(x).toLowerCase().includes(s)),
    );
  }
  if (filters.gender) {
    list = list.filter((n) => (n.gender || '').toLowerCase() === filters.gender.toLowerCase());
  }
  if (filters.minRating) {
    list = list.filter((n) => (n.ratingAvg || 0) >= Number(filters.minRating));
  }
  if (filters.onlineOnly) {
    list = list.filter((n) => n.presenceStatus === NURSE_PRESENCE.ONLINE);
  }
  if (filters.language) {
    const lang = filters.language.toLowerCase();
    list = list.filter((n) => (n.languages || []).some((l) => String(l).toLowerCase().includes(lang)));
  }

  const anchor =
    filters.latitude != null && filters.longitude != null
      ? { latitude: Number(filters.latitude), longitude: Number(filters.longitude) }
      : null;
  const radiusKm = Number(filters.radiusKm) || DEFAULT_SEARCH_RADIUS_KM;

  if (anchor) {
    list = attachDistance(list, anchor).filter((n) => n.distanceKm == null || n.distanceKm <= radiusKm);
  } else {
    list.sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));
  }
  return list;
}

export async function fetchNurseById(nurseId) {
  const snap = await getDoc(doc(db, NURSES, nurseId));
  if (!snap.exists()) return null;
  return mapNurseDoc(snap.id, snap.data());
}

export async function fetchNurseProfile(uid) {
  return fetchNurseById(uid);
}

export async function updateNursePresence(uid, presenceStatus) {
  await updateDoc(doc(db, NURSES, uid), {
    presenceStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function updateNurseLocation(uid, { latitude, longitude }) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  await updateDoc(doc(db, NURSES, uid), {
    latitude,
    longitude,
    locationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function resolveBookingCoords(address, coords) {
  if (coords?.latitude != null && coords?.longitude != null) return coords;
  if (address) {
    const g = await geocodeAddressMobile(address);
    if (g) return g;
  }
  return getCurrentLocationMobile();
}

export async function getHomeCareAuthUser() {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }
  return auth.currentUser;
}

export async function createBooking(payload) {
  const user = await getHomeCareAuthUser();
  if (!user) throw new Error('Your session expired. Please sign in again to book.');

  const { patientPhone: payloadPhone, ...restPayload } = payload || {};
  const patientSnap = await getDoc(doc(db, 'auth', user.uid));
  const patientData = patientSnap.exists() ? patientSnap.data() : {};

  const fromForm = String(payloadPhone ?? '').trim();
  const fromProfile = String(patientData.phone || patientData.phoneNumber || '').trim();
  const patientPhone = fromForm || fromProfile;

  if (!isValidEmergencyPhone(patientPhone)) {
    throw new Error('A valid phone number is required so your nurse can reach you (at least 8 digits).');
  }

  const ref = await addDoc(collection(db, BOOKINGS), {
    ...restPayload,
    patientId: user.uid,
    patientName: patientData.name || patientData.displayName || 'Patient',
    patientPhone,
    status: BOOKING_STATUS.PENDING,
    bookingType: restPayload.bookingType || 'scheduled',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, 'auth', user.uid),
    { phone: patientPhone, phoneNumber: patientPhone, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});
  await setDoc(
    doc(db, 'clients', user.uid),
    { phone: patientPhone, phoneNumber: patientPhone, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  return ref.id;
}

export async function fetchBooking(bookingId) {
  const snap = await getDoc(doc(db, BOOKINGS, bookingId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function maybeCloseExpiredHomeCarePackage(booking) {
  if (!booking?.id || !isPackageDuration(booking.durationType)) return booking;
  if (booking.status !== BOOKING_STATUS.ONGOING) return booking;
  if (!booking.endDate) return booking;
  if (localTodayYmd() <= booking.endDate) return booking;

  await updateDoc(doc(db, BOOKINGS, booking.id), {
    status: BOOKING_STATUS.COMPLETED,
    packageClosureReason: 'period_end',
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (booking.nurseId) {
    await updateDoc(doc(db, NURSES, booking.nurseId), {
      presenceStatus: NURSE_PRESENCE.ONLINE,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
  return { ...booking, status: BOOKING_STATUS.COMPLETED, packageClosureReason: 'period_end' };
}

export async function fetchPatientBookings(patientId) {
  const snap = await getDocs(query(collection(db, BOOKINGS), where('patientId', '==', patientId), limit(50)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function fetchNurseBookings(nurseId, statuses = null) {
  const snap = await getDocs(query(collection(db, BOOKINGS), where('nurseId', '==', nurseId), limit(50)));
  let list = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  if (statuses?.length) list = list.filter((b) => statuses.includes(b.status));
  return list;
}

export async function fetchPendingRequestsForNurse(nurseId) {
  const snap = await getDocs(
    query(
      collection(db, BOOKINGS),
      where('nurseId', '==', nurseId),
      where('status', '==', BOOKING_STATUS.PENDING),
      limit(30),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function nurseAcceptBooking(bookingId, nurse) {
  const booking = await fetchBooking(bookingId);
  const nextStatus =
    booking && isPackageDuration(booking.durationType)
      ? BOOKING_STATUS.ONGOING
      : BOOKING_STATUS.ACCEPTED;
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    status: nextStatus,
    nursePhone: nurse.phone || '',
    nurseWhatsapp: nurse.whatsapp || nurse.phone || '',
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, NURSES, nurse.id), {
    presenceStatus: NURSE_PRESENCE.BUSY,
    updatedAt: serverTimestamp(),
  });
}

export async function nurseDeclineBooking(bookingId) {
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    status: BOOKING_STATUS.DECLINED,
    updatedAt: serverTimestamp(),
  });
}

export async function updateBookingStatus(bookingId, status, extra = {}) {
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    status,
    ...extra,
    updatedAt: serverTimestamp(),
  });
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
    if (!isValidBookingYmd(visitDateRaw)) {
      throw new Error('Visit date is required (calendar day of this visit).');
    }
    if (!booking.startDate || !booking.endDate) {
      throw new Error('This plan is missing start/end dates.');
    }
    if (visitDateRaw < booking.startDate || visitDateRaw > booking.endDate) {
      throw new Error('Visit date must fall between plan start and expected end.');
    }
    const today = localTodayYmd();
    if (today > booking.endDate) {
      booking = await maybeCloseExpiredHomeCarePackage({ ...booking, status: BOOKING_STATUS.ONGOING });
      throw new Error('Scheduled care period has ended.');
    }
  }

  const dayNum =
    isPackage && booking.startDate && report.visitDate
      ? packageInclusiveDayNumber(booking.startDate, String(report.visitDate).trim())
      : null;
  const weekOrd =
    isPackage && booking.startDate && report.visitDate
      ? packageWeekOrdinal(booking.startDate, String(report.visitDate).trim())
      : null;

  const planNotes = typeof report.planCycleNotes === 'string' ? report.planCycleNotes.trim() : '';

  await addVisitLog(bookingId, {
    vitals: report.vitals || {},
    careSummary: report.careProvided || '',
    medicationsGiven: report.medicationsGiven || '',
    concerns: report.concerns || '',
    incidentFlag: !!report.incidentFlag,
    incidentDescription: report.incidentDescription || '',
    ...(isPackage
      ? {
          visitDate: String(report.visitDate).trim(),
          durationTypeSnapshot: booking.durationType,
          packageDayNumber: dayNum,
          weekOrdinal: weekOrd,
          ...(planNotes ? { planCycleNotes: planNotes } : {}),
        }
      : {}),
  });

  const summary = {
    vitals: report.vitals || {},
    careSummary: report.careProvided || '',
    medicationsGiven: report.medicationsGiven || '',
    concerns: report.concerns || '',
    incidentsFlagged: !!report.incidentFlag,
  };

  if (isPackage) {
    const span = packageSpanDaysInclusive(booking.startDate, booking.endDate);
    const patch = {
      visitReport: report,
      patientVisitSummary: summary,
      loggedVisitDates: arrayUnion(String(report.visitDate).trim()),
      lastVisitReportDate: String(report.visitDate).trim(),
      status: BOOKING_STATUS.ONGOING,
      updatedAt: serverTimestamp(),
    };
    if (!booking.plannedSpanDays && span != null) patch.plannedSpanDays = span;
    await updateDoc(doc(db, BOOKINGS, bookingId), patch);
    return;
  }

  await updateDoc(doc(db, BOOKINGS, bookingId), {
    visitReport: report,
    patientVisitSummary: summary,
    status: BOOKING_STATUS.COMPLETED,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (booking?.nurseId) {
    const nurseRef = doc(db, NURSES, booking.nurseId);
    const n = await getDoc(nurseRef);
    const count = (n.exists() ? n.data().completedVisits || 0 : 0) + 1;
    await updateDoc(nurseRef, {
      completedVisits: count,
      presenceStatus: NURSE_PRESENCE.ONLINE,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function uploadComplaintEvidence(uri) {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in required.');
  const res = await fetch(uri);
  const blob = await res.blob();
  const path = `homeCare/complaints/${user.uid}_${Date.now()}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}

export async function submitComplaint({ bookingId, nurseId, nature, description, evidenceUrls = [] }) {
  const user = auth.currentUser;
  await addDoc(collection(db, COMPLAINTS), {
    bookingId,
    nurseId,
    patientId: user?.uid || '',
    nature,
    description,
    evidenceUrls,
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export async function cancelBooking(bookingId, { cancelledBy, reason = '' }) {
  const booking = await fetchBooking(bookingId);
  if (!booking) throw new Error('Booking not found.');
  const terminal = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED];
  if (terminal.includes(booking.status)) throw new Error('Cannot cancel this booking.');
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    status: BOOKING_STATUS.CANCELLED,
    cancelledBy,
    cancelReason: reason,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  if (booking.nurseId) {
    await updateDoc(doc(db, NURSES, booking.nurseId), {
      presenceStatus: NURSE_PRESENCE.ONLINE,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function updateNurseAvailability(uid, availability) {
  await updateDoc(doc(db, NURSES, uid), {
    availability,
    updatedAt: serverTimestamp(),
  });
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

export async function createEmergencyBooking(payload) {
  const user = await getHomeCareAuthUser();
  if (!user) throw new Error('Your session expired. Please sign in again.');

  const { patientPhone: payloadPhone, ...restPayload } = payload;
  const patientSnap = await getDoc(doc(db, 'auth', user.uid));
  const patientData = patientSnap.exists() ? patientSnap.data() : {};

  const fromForm = String(payloadPhone ?? '').trim();
  const fromProfile = String(patientData.phone || patientData.phoneNumber || '').trim();
  const patientPhone = fromForm || fromProfile;

  if (!fromForm) {
    throw new Error('Phone number is required for emergency requests so the nurse can reach you.');
  }
  if (!isValidEmergencyPhone(patientPhone)) {
    throw new Error('Enter a valid phone number (at least 8 digits).');
  }

  const ref = await addDoc(collection(db, BOOKINGS), {
    ...restPayload,
    patientId: user.uid,
    patientName: patientData.name || patientData.displayName || 'Patient',
    patientPhone,
    bookingType: 'emergency',
    isEmergency: true,
    nurseId: restPayload.nurseId || null,
    nurseName: restPayload.nurseName || null,
    status: BOOKING_STATUS.PENDING,
    urgency: restPayload.urgency || 'high',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(
    doc(db, 'auth', user.uid),
    { phone: patientPhone, phoneNumber: patientPhone, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});
  await setDoc(
    doc(db, 'clients', user.uid),
    { phone: patientPhone, phoneNumber: patientPhone, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  return ref.id;
}

export async function fetchOpenEmergencyRequests(nurseAnchor = null, radiusKm = EMERGENCY_RADIUS_KM) {
  const snap = await getDocs(
    query(
      collection(db, BOOKINGS),
      where('bookingType', '==', 'emergency'),
      where('status', '==', BOOKING_STATUS.PENDING),
      limit(40),
    ),
  );
  let list = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => !b.nurseId);
  if (nurseAnchor) {
    list = list.filter((b) => withinRadiusKm(b, nurseAnchor, radiusKm));
    list = attachDistance(list, nurseAnchor);
  }
  return list;
}

export async function claimEmergencyBooking(bookingId, nurse) {
  const snap = await getDoc(doc(db, BOOKINGS, bookingId));
  if (!snap.exists()) throw new Error('Request not found.');
  const data = snap.data();
  if (data.nurseId) throw new Error('Already claimed by another nurse.');
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    nurseId: nurse.id,
    nurseName: nurse.fullName,
    nursePhone: nurse.phone || '',
    status: BOOKING_STATUS.ACCEPTED,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, NURSES, nurse.id), {
    presenceStatus: NURSE_PRESENCE.BUSY,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchOngoingEngagements(nurseId) {
  const list = await fetchNurseBookings(nurseId);
  return list.filter(
    (b) =>
      b.status === BOOKING_STATUS.ONGOING ||
      (['accepted', 'in_progress'].includes(b.status) && isPackageDuration(b.durationType)),
  );
}

export async function markBookingOngoing(bookingId) {
  await updateBookingStatus(bookingId, BOOKING_STATUS.ONGOING);
}

export async function submitPatientFeedback(bookingId, feedback) {
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    patientFeedback: feedback,
    updatedAt: serverTimestamp(),
  });
  const booking = await fetchBooking(bookingId);
  if (!booking?.nurseId || !feedback?.rating) return;

  const nurseRef = doc(db, NURSES, booking.nurseId);
  const n = await getDoc(nurseRef);
  if (!n.exists()) return;
  const prev = n.data();
  const count = (prev.ratingCount || 0) + 1;
  const avg = ((prev.ratingAvg || 0) * (prev.ratingCount || 0) + Number(feedback.rating)) / count;
  await updateDoc(nurseRef, {
    ratingAvg: Math.round(avg * 10) / 10,
    ratingCount: count,
    updatedAt: serverTimestamp(),
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────
export async function fetchAllNursesAdmin() {
  const snap = await getDocs(query(collection(db, NURSES), limit(200)));
  return snap.docs
    .map((d) => mapNurseDoc(d.id, d.data()))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function updateNurseAccountStatus(nurseId, accountStatus) {
  await updateDoc(doc(db, NURSES, nurseId), {
    accountStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function updateNurseFeesAdmin(nurseId, fees) {
  await updateDoc(doc(db, NURSES, nurseId), {
    fees,
    updatedAt: serverTimestamp(),
  });
}

export async function fetchAllBookingsAdmin(limitCount = 100) {
  const snap = await getDocs(query(collection(db, BOOKINGS), limit(limitCount)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function fetchAllComplaintsAdmin() {
  const snap = await getDocs(query(collection(db, COMPLAINTS), limit(100)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function updateComplaintStatus(complaintId, status, adminNote = '') {
  await updateDoc(doc(db, COMPLAINTS, complaintId), {
    status,
    adminNote,
    updatedAt: serverTimestamp(),
  });
}

// ── Visit logs (weekly/monthly) ─────────────────────────────────────────────
export async function addVisitLog(bookingId, log) {
  const user = auth.currentUser;
  await addDoc(collection(db, BOOKINGS, bookingId, 'visitLogs'), {
    ...log,
    createdBy: user?.uid || null,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, BOOKINGS, bookingId), {
    visitLogCount: increment(1),
    lastVisitAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function fetchVisitLogs(bookingId) {
  const snap = await getDocs(
    query(collection(db, BOOKINGS, bookingId, 'visitLogs'), orderBy('createdAt', 'desc'), limit(50)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchPatientOngoingBookings(patientId) {
  const all = await fetchPatientBookings(patientId);
  const synced = [];
  for (const b of all) {
    let row = b;
    if (
      row.status === BOOKING_STATUS.ONGOING &&
      isPackageDuration(row.durationType) &&
      row.endDate
    ) {
      row = await maybeCloseExpiredHomeCarePackage(row);
    }
    synced.push(row);
  }
  return synced.filter(
    (b) =>
      b.status === BOOKING_STATUS.ONGOING ||
      (isPackageDuration(b.durationType) &&
        ['accepted', 'in_progress', 'ongoing', 'en_route', 'arrived'].includes(b.status)),
  );
}

const extendHcPackageCallable = httpsCallable(functions, 'extendHomeCarePackage');

export async function extendHomeCarePackage(bookingId, newEndDate, durationTypeOpt) {
  const res = await extendHcPackageCallable({
    bookingId,
    newEndDate,
    durationType: durationTypeOpt ?? null,
  });
  return res.data;
}

const ACTIVE_PATIENT_STATUSES = [
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.EN_ROUTE,
  BOOKING_STATUS.ARRIVED,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.ONGOING,
];

export async function fetchPatientActiveBookings(patientId) {
  const all = await fetchPatientBookings(patientId);
  const synced = await Promise.all(
    all.map(async (b) =>
      b.status === BOOKING_STATUS.ONGOING && isPackageDuration(b.durationType) && b.endDate
        ? maybeCloseExpiredHomeCarePackage(b)
        : b,
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
      nursePhotoURL: nurseById[b.nurseId]?.photoURL || b.nursePhotoURL || null,
    })),
  );
}

export async function fetchHomeCarePatientProfile(uid) {
  const [authSnap, clientSnap] = await Promise.all([
    getDoc(doc(db, 'auth', uid)),
    getDoc(doc(db, 'clients', uid)),
  ]);
  const authData = authSnap.exists() ? authSnap.data() : null;
  const clientData = clientSnap.exists() ? clientSnap.data() : null;
  const name = resolvePatientDisplayName(authData, clientData, auth.currentUser);
  const location = formatProfileLocation(authData) || formatProfileLocation(clientData);
  const phone =
    String(authData?.phone || authData?.phoneNumber || clientData?.phone || clientData?.phoneNumber || '').trim();
  return { name, location, phone };
}

// ── Nurse profile & documents ───────────────────────────────────────────────
export async function updateNurseProfile(uid, patch) {
  await updateDoc(doc(db, NURSES, uid), { ...patch, updatedAt: serverTimestamp() });
}

export async function uploadNursePhoto(uid, fileOrUri, mimeType = 'image/jpeg') {
  const nurseId = auth.currentUser?.uid || uid;
  if (!nurseId) throw new Error('You must be signed in to upload a photo.');
  if (uid && auth.currentUser?.uid && uid !== auth.currentUser.uid) {
    throw new Error('You can only update your own profile photo.');
  }
  let blob;
  let contentType = mimeType;
  if (fileOrUri instanceof Blob) {
    blob = fileOrUri;
    contentType = fileOrUri.type || mimeType;
  } else {
    const res = await fetch(fileOrUri);
    blob = await res.blob();
  }
  const path = `homeCare/nurses/${nurseId}/profile_${Date.now()}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType });
  const photoURL = await getDownloadURL(storageRef);
  await updateDoc(doc(db, NURSES, nurseId), { photoURL, updatedAt: serverTimestamp() });
  return photoURL;
}

export async function uploadNurseDocument(uid, type, uri, mimeType = 'image/jpeg') {
  const res = await fetch(uri);
  const blob = await res.blob();
  const path = `homeCare/nurses/${uid}/${type}_${Date.now()}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const url = await getDownloadURL(storageRef);
  const field = type === 'license' ? 'licenseDocUrl' : 'idDocUrl';
  await updateDoc(doc(db, NURSES, uid), {
    [field]: url,
    documentsStatus: 'pending_review',
    updatedAt: serverTimestamp(),
  });
  return url;
}

export async function verifyNurseDocumentsAdmin(nurseId, { licenseVerified, documentsStatus, adminNote }) {
  await updateDoc(doc(db, NURSES, nurseId), {
    licenseVerified: !!licenseVerified,
    documentsStatus: documentsStatus || 'verified',
    documentAdminNote: adminNote || '',
    updatedAt: serverTimestamp(),
  });
}

// ── Earnings log (manual) ───────────────────────────────────────────────────
export async function addNurseEarning(nurseId, { amount, note, bookingId }) {
  await addDoc(collection(db, EARNINGS), {
    nurseId,
    amount: Number(amount) || 0,
    note: note || '',
    bookingId: bookingId || null,
    createdAt: serverTimestamp(),
  });
}

export async function fetchNurseEarnings(nurseId, limitCount = 50) {
  const snap = await getDocs(
    query(collection(db, EARNINGS), where('nurseId', '==', nurseId), limit(limitCount)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ── Notifications inbox ───────────────────────────────────────────────────────
export async function fetchUserNotifications(targetId, limitCount = 40) {
  const snap = await getDocs(
    query(collection(db, NOTIFICATIONS), where('targetId', '==', targetId), limit(limitCount)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function markNotificationRead(notifId) {
  await updateDoc(doc(db, NOTIFICATIONS, notifId), { read: true });
}

export async function registerPushToken(uid, token, collectionName = 'homeCareNurses') {
  if (!uid || !token) return;
  await updateDoc(doc(db, collectionName, uid), {
    pushTokens: arrayUnion(token),
    updatedAt: serverTimestamp(),
  });
}

export async function fetchHomeCareAnalyticsAdmin() {
  const [nursesSnap, bookingsSnap, complaintsSnap] = await Promise.all([
    getDocs(query(collection(db, NURSES), limit(300))),
    getDocs(query(collection(db, BOOKINGS), limit(300))),
    getDocs(query(collection(db, COMPLAINTS), limit(100))),
  ]);
  const nurses = nursesSnap.docs.map((d) => d.data());
  const bookings = bookingsSnap.docs.map((d) => d.data());
  const complaints = complaintsSnap.docs.map((d) => d.data());
  const completed = bookings.filter((b) => b.status === BOOKING_STATUS.COMPLETED).length;
  const cancelled = bookings.filter((b) => b.status === BOOKING_STATUS.CANCELLED).length;
  const emergency = bookings.filter((b) => b.bookingType === 'emergency').length;
  const approvedNurses = nurses.filter((n) => n.accountStatus === 'approved').length;
  return {
    totalNurses: nurses.length,
    approvedNurses,
    totalBookings: bookings.length,
    completed,
    cancelled,
    emergencyBookings: emergency,
    openComplaints: complaints.filter((c) => c.status === 'open' || c.status === 'reviewing').length,
    avgRating:
      nurses.reduce((s, n) => s + (n.ratingAvg || 0), 0) / (nurses.filter((n) => n.ratingCount).length || 1),
  };
}
