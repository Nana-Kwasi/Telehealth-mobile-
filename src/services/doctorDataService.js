import { db } from './firebaseConfig';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Fetch all verified doctors ──
export async function fetchDoctors(filters = {}) {
  try {
    let q = query(collection(db, 'doctors'), where('verified', '==', true));

    const snapshot = await getDocs(q);
    let doctors = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Client-side filtering (Firestore limits compound queries)
    if (filters.specialization) {
      doctors = doctors.filter(
        (d) =>
          d.specialization &&
          d.specialization.toLowerCase().includes(filters.specialization.toLowerCase())
      );
    }
    if (filters.location) {
      doctors = doctors.filter(
        (d) =>
          d.location &&
          d.location.toLowerCase().includes(filters.location.toLowerCase())
      );
    }
    if (filters.minRating) {
      doctors = doctors.filter(
        (d) => (d.averageRating || 0) >= filters.minRating
      );
    }
    if (filters.maxFee) {
      doctors = doctors.filter(
        (d) => (d.consultationFee || 0) <= filters.maxFee
      );
    }
    if (filters.gender) {
      doctors = doctors.filter(
        (d) => d.gender && d.gender.toLowerCase() === filters.gender.toLowerCase()
      );
    }

    return doctors;
  } catch (error) {
    console.error('Error fetching doctors:', error);
    return [];
  }
}

// ── Fetch a single doctor profile ──
export async function fetchDoctorProfile(doctorId) {
  try {
    const docRef = doc(db, 'doctors', doctorId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('Error fetching doctor profile:', error);
    return null;
  }
}

// ── Fetch doctor availability slots ──
export async function fetchDoctorAvailability(doctorId, startDate = null) {
  try {
    const today = startDate || new Date().toISOString().split('T')[0];
    const q = query(
      collection(db, 'doctorAvailability'),
      where('doctorId', '==', doctorId),
      where('date', '>=', today),
      orderBy('date', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error fetching doctor availability:', error);
    return [];
  }
}

// ── Fetch reviews for a doctor ──
export async function fetchDoctorReviews(doctorId) {
  try {
    const q = query(
      collection(db, 'doctorReviews'),
      where('doctorId', '==', doctorId),
      orderBy('date', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Error fetching doctor reviews:', error);
    return [];
  }
}

// ── Create a new appointment ──
export async function createAppointment(appointmentData) {
  try {
    const docRef = await addDoc(collection(db, 'doctorAppointments'), {
      ...appointmentData,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return { id: docRef.id, ...appointmentData, status: 'pending' };
  } catch (error) {
    console.error('Error creating appointment:', error);
    throw error;
  }
}

// ── Fetch appointments for a client ──
// NOTE: No orderBy to avoid composite index requirements — sort in JS instead
export async function fetchClientAppointments(clientId) {
  if (!clientId) return [];
  try {
    const q = query(
      collection(db, 'doctorAppointments'),
      where('clientId', '==', clientId)
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return results.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  } catch (error) {
    console.error('Error fetching client appointments:', error);
    return [];
  }
}

// ── Submit a review ──
export async function submitDoctorReview(reviewData) {
  try {
    const docRef = await addDoc(collection(db, 'doctorReviews'), {
      ...reviewData,
      date: new Date().toISOString(),
      timestamp: serverTimestamp(),
    });
    return { id: docRef.id, ...reviewData };
  } catch (error) {
    console.error('Error submitting review:', error);
    throw error;
  }
}

// ── Fetch prescriptions for a client ──
// NOTE: No orderBy to avoid composite index requirements — sort in JS instead
export async function fetchClientPrescriptions(clientId) {
  if (!clientId) return [];
  try {
    // Simple equality query — never needs a composite index
    const q = query(
      collection(db, 'doctorPrescriptions'),
      where('patientId', '==', clientId)
    );
    const snapshot = await getDocs(q);
    const results = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Sort newest-first in JS
    return results.sort((a, b) => (b.date || b.createdAt?.seconds?.toString() || '').localeCompare(a.date || a.createdAt?.seconds?.toString() || ''));
  } catch (error) {
    console.error('Error fetching client prescriptions:', error);
    return [];
  }
}

// ── Listen to appointments in real-time ──
export function listenToAppointments(clientId, callback) {
  const q = query(
    collection(db, 'doctorAppointments'),
    where('clientId', '==', clientId)
  );
  return onSnapshot(q, (snapshot) => {
    const appointments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    appointments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    callback(appointments);
  });
}

// ── Get specialization options ──
export function getSpecializations() {
  return [
    'General Practitioner',
    'Cardiologist',
    'Dermatologist',
    'Endocrinologist',
    'Gastroenterologist',
    'Neurologist',
    'Obstetrician/Gynecologist',
    'Ophthalmologist',
    'Orthopedic Surgeon',
    'Pediatrician',
    'Psychiatrist',
    'Pulmonologist',
    'Urologist',
    'ENT Specialist',
    'Allergist',
    'Oncologist',
    'Rheumatologist',
  ];
}
