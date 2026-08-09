import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './apiClient';

// ── Fetch all doctors ──────────────────────────────────────────────────────────
export async function fetchDoctors(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.specialization) params.set('specialization', filters.specialization);
    if (filters.location) params.set('location', filters.location);
    const qs = params.toString();
    const doctors = await api(`/api/v1/care/doctors/search${qs ? `?${qs}` : ''}`) || [];

    const raw = Array.isArray(doctors) ? doctors : (doctors.doctors || []);

    // The search endpoint returns { userId, fullName, ... } with the rich fields
    // (experience, fee, rating, languages, photo) packed in metadataJson. Normalise
    // to the flat shape the cards read: `id`, `name` (without the "Dr" honorific so
    // the UI's "Dr. {name}" doesn't double up), plus the metadata fields.
    let list = raw.map((d) => {
      let meta = {};
      try { meta = d.metadataJson ? JSON.parse(d.metadataJson) : {}; } catch { /* ignore */ }
      const rawName = d.fullName || d.name || meta.name || '';
      const name = rawName.replace(/^\s*[Dd][Rr]\.?\s+/, '').trim();
      return {
        ...meta,
        ...d,
        id: d.id || d.userId,
        name,
        fullName: rawName,
        specialization: d.specialization || meta.specialization || '',
        location: d.location || meta.location || '',
        phone: d.phone || meta.phone || '',
        experience: d.experience ?? meta.experience ?? meta.yearsExperience ?? null,
        consultationFee: d.consultationFee ?? meta.consultationFee ?? null,
        averageRating: d.averageRating ?? d.ratingAvg ?? meta.averageRating ?? 0,
        totalReviews: d.totalReviews ?? meta.totalReviews ?? 0,
        languages: Array.isArray(d.languages) ? d.languages : (Array.isArray(meta.languages) ? meta.languages : []),
        gender: d.gender || meta.gender || null,
        photoURL: d.photoURL || meta.photoURL || null,
        verified: d.verified ?? meta.verified ?? false,
      };
    }).filter((d) => d.id);

    if (filters.minRating) {
      list = list.filter((d) => (d.averageRating || d.ratingAvg || 0) >= filters.minRating);
    }
    if (filters.maxFee) {
      list = list.filter((d) => (d.consultationFee || 0) <= filters.maxFee);
    }
    if (filters.gender) {
      list = list.filter((d) => d.gender && d.gender.toLowerCase() === filters.gender.toLowerCase());
    }
    return list;
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return [];
  }
}

// ── Fetch a single doctor ──────────────────────────────────────────────────────
export async function fetchDoctorProfile(doctorId) {
  try {
    return await api(`/api/v1/doctors/${doctorId}`);
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    return null;
  }
}

// ── Doctor availability ────────────────────────────────────────────────────────
export async function fetchDoctorAvailability(doctorId, startDate = null) {
  try {
    const qs = startDate ? `?from=${startDate}` : '';
    const data = await api(`/api/v1/care/doctors/${doctorId}/availability${qs}`);
    return Array.isArray(data) ? data : (data?.slots || []);
  } catch (error) {
    console.error('Error fetching doctor availability:', error);
    return [];
  }
}

// ── Appointments ───────────────────────────────────────────────────────────────
export async function fetchDoctorAppointments(doctorId) {
  try {
    const data = await api(`/api/v1/medical/appointments/doctor/${doctorId}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching doctor appointments:', error);
    return [];
  }
}

export async function fetchPatientAppointments(patientId) {
  try {
    const data = await api(`/api/v1/medical/appointments/patient/${patientId}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    return [];
  }
}

export async function bookAppointment(payload) {
  return api('/api/v1/medical/appointments', { method: 'POST', body: payload });
}

/**
 * Book from the Firestore-shaped payload the booking screens build
 * ({ doctorId, clientId, date, time, consultationType, consultationFee, vitals … }).
 * The endpoint takes { doctorId, patientId, scheduledAt, notes, status }, so the
 * shape has to be mapped — BookAppointmentScreen imported this name and it did not
 * exist at all, so the screen crashed the moment you tried to confirm a booking.
 */
export async function createAppointment(data = {}) {
  const patientId = data.patientId || data.clientId;
  if (!data.doctorId || !patientId) throw new Error('Missing doctor or patient');

  const scheduledAt = data.scheduledAt
    || (data.date ? new Date(`${data.date}T${data.time || '09:00'}:00`).toISOString() : new Date().toISOString());

  // Consultation type rides as a "[type] reason" prefix in notes (the backend
  // parses it back out into `type`).
  const type = data.consultationType || data.type;
  const notes = [type ? `[${type}]` : '', data.reason || data.notes || '']
    .filter(Boolean).join(' ').trim();

  const appt = await api('/api/v1/medical/appointments', {
    method: 'POST',
    body: {
      doctorId: data.doctorId,
      patientId,
      scheduledAt,
      notes,
      status: data.status || 'pending',
    },
  });

  // Pre-visit vitals captured during booking belong on the patient record, where
  // the doctor's patient screens read them from `vitalsLatestJson`.
  if (data.vitals && typeof data.vitals === 'object') {
    await api(`/api/v1/patients/${patientId}`, {
      method: 'PATCH',
      body: { vitalsLatestJson: JSON.stringify(data.vitals) },
    }).catch(() => {});
  }
  return appt;
}

// ── Prescriptions ──────────────────────────────────────────────────────────────
export async function fetchPatientPrescriptions(patientId) {
  try {
    const data = await api(`/api/v1/medical/prescriptions/patient/${patientId}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    return [];
  }
}

export async function fetchDoctorPrescriptions(doctorId) {
  try {
    const data = await api(`/api/v1/medical/prescriptions/doctor/${doctorId}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching doctor prescriptions:', error);
    return [];
  }
}

// ── Doctor reviews ─────────────────────────────────────────────────────────────
export async function fetchDoctorReviews(doctorId) {
  try {
    return await api(`/api/v1/doctors/${doctorId}/reviews`);
  } catch (error) {
    console.error('Error fetching doctor reviews:', error);
    return { reviews: [], totalCount: 0, averageRating: 0 };
  }
}

export async function submitDoctorReview(doctorId, { patientId, rating, comment }) {
  return api(`/api/v1/doctors/${doctorId}/reviews`, {
    method: 'POST',
    body: { patientId, rating, comment },
  });
}

// ── Doctor notes ───────────────────────────────────────────────────────────────
export async function fetchDoctorNotes(doctorId, patientId = null) {
  try {
    const qs = patientId ? `?patientId=${patientId}` : '';
    const data = await api(`/api/v1/doctor-notes${qs}`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching doctor notes:', error);
    return [];
  }
}

export async function createDoctorNote(payload) {
  return api('/api/v1/doctor-notes', { method: 'POST', body: payload });
}

export async function updateDoctorNote(noteId, payload) {
  return api(`/api/v1/doctor-notes/${noteId}`, { method: 'PATCH', body: payload });
}

// ── Patient diagnostics ────────────────────────────────────────────────────────
export async function fetchDiagnosticOrders(patientId) {
  try {
    const data = await api(`/api/v1/diagnostics/operations/orders?patientId=${patientId}`);
    return Array.isArray(data) ? data : (data?.orders || []);
  } catch (error) {
    console.error('Error fetching diagnostics:', error);
    return [];
  }
}

// ── Specializations (matches web OnboardDoctor list) ──────────────────────────
export function getSpecializations() {
  return [
    'General Practice',
    'Cardiology',
    'Dermatology',
    'Endocrinology',
    'Gastroenterology',
    'Neurology',
    'Oncology',
    'Orthopedics',
    'Pediatrics',
    'Psychiatry',
    'Pulmonology',
    'Radiology',
    'Surgery',
    'Urology',
    'Other',
  ];
}

// ── Subscribe pattern (polling) ────────────────────────────────────────────────
export function subscribeDoctorAppointments(doctorId, onData) {
  if (!doctorId) return () => {};
  let cancelled = false;
  const poll = async () => {
    if (cancelled) return;
    try { onData(await fetchDoctorAppointments(doctorId)); } catch { onData([]); }
  };
  poll();
  const id = setInterval(poll, 30_000);
  return () => { cancelled = true; clearInterval(id); };
}

export const fetchClientAppointments = fetchPatientAppointments;
export const fetchClientPrescriptions = fetchPatientPrescriptions;

export function listenToAppointments(patientId, onData) {
  if (!patientId) return () => {};
  let cancelled = false;
  const poll = async () => {
    if (cancelled) return;
    try { onData(await fetchPatientAppointments(patientId)); } catch { onData([]); }
  };
  poll();
  const id = setInterval(poll, 30_000);
  return () => { cancelled = true; clearInterval(id); };
}
