import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, ScrollView,
  RefreshControl, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, getDoc, onSnapshot,
} from 'firebase/firestore';

function generatePrescriptionRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'RX-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';

const TODAY = new Date().toISOString().split('T')[0];

const FREQUENCY_OPTIONS = [
  'Single Dose', 'Once per Day', 'BID (2x/day)', 'TID (3x/day)',
  'Q4H (every 4h)', 'Q6H (every 6h)', 'Q8H (every 8h)', 'Q12H (every 12h)', 'Q24H (every 24h)',
];

const DIRECTION_OPTIONS = ['Scheduled', 'As Needed (PRN)', 'As Directed'];
const DRUG_FORMS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Inhaler', 'Patch', 'Suppository', 'Other'];
const RX_STATUSES = ['active', 'completed', 'cancelled', 'expired'];

const INJECTION_ROUTES = ['IV (Intravenous)', 'IM (Intramuscular)', 'SC (Subcutaneous)', 'ID (Intradermal)'];
const SUPPOSITORY_ROUTES = ['Rectal', 'Vaginal'];
const DROP_SITES = ['Left Eye', 'Right Eye', 'Both Eyes', 'Left Ear', 'Right Ear', 'Both Ears', 'Nose'];
const PATCH_INTERVALS = ['Every 24 Hours', 'Every 48 Hours', 'Every 72 Hours', 'Weekly (7 Days)'];

const DURATION_OPTIONS = [
  // Days
  { label: '1 Day',       group: 'Days' },
  { label: '1–2 Days',    group: 'Days' },
  { label: '2–3 Days',    group: 'Days' },
  { label: '3–4 Days',    group: 'Days' },
  { label: '4–5 Days',    group: 'Days' },
  { label: '5–6 Days',    group: 'Days' },
  { label: '6–7 Days',    group: 'Days' },
  // Weeks
  { label: '1 Week',      group: 'Weeks' },
  { label: '1–2 Weeks',   group: 'Weeks' },
  { label: '2–3 Weeks',   group: 'Weeks' },
  { label: '3–4 Weeks',   group: 'Weeks' },
  // Months
  { label: '1 Month',     group: 'Months' },
  { label: '1–2 Months',  group: 'Months' },
  { label: '2–3 Months',  group: 'Months' },
  { label: '3–4 Months',  group: 'Months' },
  { label: '4–6 Months',  group: 'Months' },
  { label: '6–9 Months',  group: 'Months' },
  { label: '9–12 Months', group: 'Months' },
  // Years
  { label: '1 Year',      group: 'Years' },
  { label: '1–2 Years',   group: 'Years' },
  { label: '2–3 Years',   group: 'Years' },
  { label: '3+ Years',    group: 'Years' },
];

const EMPTY_MED = {
  name: '', strength: '', drugForm: 'Tablet', dosage: '', frequency: 'Once per Day',
  direction: 'Scheduled', duration: '', specialInstructions: '',
  prn: { indication: '', maxPerDay: '', interval: '' },
  refill: { allowed: false, count: '0', expiryDate: '' },
  schedule: [],
  // Form-specific extras
  route: '', injectionSite: '', applicationSite: '', dropSite: '',
  volumeUnit: 'ml', shakeWell: false,
  spacerRequired: false, rinseAfter: false,
  changeInterval: '', rotationRequired: false,
};

function getDosagePlaceholder(drugForm) {
  switch (drugForm) {
    case 'Syrup':       return 'Volume (e.g. 5ml, 10ml, 2 tsp)';
    case 'Injection':   return 'Dose (e.g. 1ml, 0.5ml, 2ml)';
    case 'Cream':       return 'Amount (e.g. thin layer, pea-sized)';
    case 'Drops':       return 'Number of drops (e.g. 2 drops)';
    case 'Inhaler':     return 'Puffs (e.g. 1 puff, 2 puffs)';
    case 'Patch':       return 'Patch count (e.g. 1 patch)';
    case 'Suppository': return 'Dose (e.g. 1 suppository)';
    case 'Capsule':     return 'Dosage (e.g. 1 capsule)';
    default:            return 'Dosage (e.g. 1 tablet)';
  }
}

function autoSchedule(frequency) {
  switch (frequency) {
    case 'BID (2x/day)':  return ['Morning', 'Evening'];
    case 'TID (3x/day)':  return ['Morning', 'Afternoon', 'Night'];
    case 'Q4H (every 4h)': return ['6:00', '10:00', '14:00', '18:00', '22:00', '02:00'];
    case 'Q6H (every 6h)': return ['6:00', '12:00', '18:00', '00:00'];
    case 'Q8H (every 8h)': return ['8:00', '16:00', '00:00'];
    case 'Q12H (every 12h)': return ['8:00', '20:00'];
    case 'Once per Day': return ['Morning'];
    default: return [];
  }
}

export default function DoctorPrescriptionsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState(null);

  const [form, setForm] = useState({
    patientId: '', patientName: '',
    pharmacyId: '', pharmacyName: '',
    branchId: '', branchName: '',
    diagnosis: '', instructions: '',
    followUpDate: '', status: 'active',
    medications: [{ ...EMPTY_MED }],
  });
  const [patientAllergies, setPatientAllergies] = useState([]);
  const [branchDirectory, setBranchDirectory] = useState([]);
  const [loadingBranchDirectory, setLoadingBranchDirectory] = useState(false);
  const [showBranchDirectoryPicker, setShowBranchDirectoryPicker] = useState(false);
  // Alternative drug approval
  const [altApprovalRx, setAltApprovalRx] = useState(null);
  const [altSaving, setAltSaving] = useState(false);
  const [viewingRx, setViewingRx] = useState(null);
  const [reassignRx, setReassignRx] = useState(null);
  const [reassignBranchId, setReassignBranchId] = useState('');
  const [reassignSaving, setReassignSaving] = useState(false);
  const [showFreqPicker, setShowFreqPicker] = useState(null); // med index
  const [showDirPicker, setShowDirPicker] = useState(null);
  const [showFormPicker, setShowFormPicker] = useState(null);
  const [showDurationPicker, setShowDurationPicker] = useState(null); // med index
  const [showRoutePicker, setShowRoutePicker] = useState(null);
  const [showDropSitePicker, setShowDropSitePicker] = useState(null);
  const [showChangeIntervalPicker, setShowChangeIntervalPicker] = useState(null);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [warnings, setWarnings] = useState([]);

  useFocusEffect(useCallback(() => {
    loadAll();
    loadBranchDirectory();
    // Real-time subscription for alt drug suggestions
    const cu = auth.currentUser;
    if (!cu) return;
    const unsub = onSnapshot(
      query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', cu.uid)),
      snap => {
        setPrescriptions(prev => {
          const updated = [...prev];
          snap.docChanges().forEach(change => {
            if (change.type === 'modified') {
              const idx = updated.findIndex(r => r.id === change.doc.id);
              if (idx !== -1) {
                const data = change.doc.data();
                updated[idx] = { ...updated[idx], ...data, id: change.doc.id };
              }
            }
          });
          return updated;
        });
      }
    );
    return unsub;
  }, []));

  useEffect(() => {
    const p = route.params;
    if (!p?.openRxForm || !p?.presetPatientId) return;

    loadPatientAllergies(p.presetPatientId);
    loadBranchDirectory();
    setEditing(null);
    setForm({
      patientId: p.presetPatientId,
      patientName: p.presetPatientName || '',
      pharmacyId: '',
      pharmacyName: '',
      branchId: '',
      branchName: '',
      diagnosis: '',
      instructions: '',
      followUpDate: '',
      status: 'active',
      medications: [{ ...EMPTY_MED }],
    });
    setWarnings([]);
    setShowModal(true);

    navigation.setParams({
      openRxForm: undefined,
      presetPatientId: undefined,
      presetPatientName: undefined,
    });
  }, [route.params?.openRxForm, route.params?.presetPatientId]);

  const loadAll = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      const profile = dSnap.exists() ? { id: cu.uid, ...dSnap.data() } : { id: cu.uid, name: 'Doctor' };
      setDoctorProfile(profile);

      const apptSnap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const patMap = new Map();
      apptSnap.docs.forEach(d => {
        const data = d.data();
        if (data.clientId && !patMap.has(data.clientId)) {
          patMap.set(data.clientId, { id: data.clientId, name: data.clientName || '' });
        }
      });
      const enriched = await enrichPatientNames(patMap);
      setPatients(Array.from(enriched.values()));

      // Build name lookup from enriched patient map
      const nameById = {};
      for (const [id, p] of enriched.entries()) nameById[id] = p.name;

      // Load prescriptions — no orderBy to avoid composite index requirement; sort in JS
      const rxSnap = await getDocs(
        query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', cu.uid))
      );
      const rxList = rxSnap.docs.map(d => {
        const data = d.data();
        // Normalize: handle both flat format (from PatientDetail) and array format
        let medications = data.medications;
        if (!medications || medications.length === 0) {
          if (data.medication) {
            medications = [{ name: data.medication, dosage: data.dosage || '', frequency: data.frequency || '', duration: data.duration || '' }];
          } else {
            medications = [];
          }
        }
        // Treat stored "Patient" as missing — it was a placeholder saved at creation time
        const storedName = data.patientName && data.patientName !== 'Patient' ? data.patientName : null;
        const patientName = storedName || (data.patientId && nameById[data.patientId]) || '';
        // Fallback diagnosis for old flat-format records that stored text in `instructions`
        const diagnosis = data.diagnosis || data.instructions || '';
        return { id: d.id, ...data, medications, patientName, diagnosis };
      });
      rxList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

      // For any prescription still missing a real name, fetch directly from auth collection
      const isNameMissing = r => !r.patientName || r.patientName === 'Patient';
      const missingIds = [...new Set(
        rxList.filter(isNameMissing).map(r => r.patientId).filter(Boolean)
      )];
      if (missingIds.length > 0) {
        await Promise.all(missingIds.map(async id => {
          try {
            const snap = await getDoc(doc(db, 'auth', id));
            if (snap.exists()) {
              const d = snap.data();
              const name = d.name || d.displayName || d.fullName || null;
              if (name) {
                rxList.forEach(r => { if (r.patientId === id && isNameMissing(r)) r.patientName = name; });
              }
            }
          } catch {}
        }));
      }
      // Final fallback label
      rxList.forEach(r => { if (!r.patientName) r.patientName = 'Patient'; });

      setPrescriptions(rxList);
    } catch (err) {
      console.error('DoctorPrescriptions load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadBranchDirectory = async () => {
    setLoadingBranchDirectory(true);
    try {
      const phSnap = await getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')));
      const rows = [];
      for (const phDoc of phSnap.docs) {
        const ph = { id: phDoc.id, ...phDoc.data() };
        const parentName = ph.pharmacyName || ph.name || '';
        const brSnap = await getDocs(query(
          collection(db, 'pharmacyBranches'),
          where('pharmacyId', '==', ph.id),
          where('status', '==', 'active'),
        ));
        brSnap.docs.forEach(d => {
          const br = d.data();
          const branchName = br.branchName || br.name || d.id;
          rows.push({
            branchId: d.id,
            branchName,
            pharmacyId: ph.id,
            pharmacyName: parentName,
            addressLine: [br.address, br.city].filter(Boolean).join(', '),
          });
        });
      }
      rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
      setBranchDirectory(rows);
    } catch {}
    finally { setLoadingBranchDirectory(false); }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ patientId: '', patientName: '', pharmacyId: '', pharmacyName: '', branchId: '', branchName: '', diagnosis: '', instructions: '', followUpDate: '', status: 'active', medications: [{ ...EMPTY_MED }] });
    setWarnings([]);
    setShowModal(true);
  };

  const openEdit = (rx) => {
    setEditing(rx);
    setForm({
      patientId: rx.patientId || '',
      patientName: rx.patientName || '',
      pharmacyId: rx.pharmacyId || '',
      pharmacyName: rx.pharmacyName || '',
      branchId: rx.branchId || '',
      branchName: rx.branchName || '',
      diagnosis: rx.diagnosis || '',
      instructions: rx.instructions || '',
      followUpDate: rx.followUpDate || '',
      status: rx.status || 'active',
      medications: rx.medications?.length ? rx.medications.map(m => ({ ...EMPTY_MED, ...m })) : [{ ...EMPTY_MED }],
    });
    setWarnings([]);
    setShowModal(true);
  };

  const loadPatientAllergies = async (patientId) => {
    try {
      const snap = await getDoc(doc(db, 'auth', patientId));
      if (snap.exists()) {
        const al = snap.data().allergies || '';
        setPatientAllergies(al ? al.toLowerCase().split(/[,;]/).map(s => s.trim()) : []);
      }
    } catch {}
  };

  const runSafetyChecks = (meds) => {
    const w = [];
    const names = meds.map(m => m.name.toLowerCase().trim()).filter(Boolean);

    // Duplicate drug check
    const seen = new Set();
    names.forEach(n => { if (seen.has(n)) w.push(`Duplicate: "${n}" appears more than once.`); seen.add(n); });

    // Allergy check
    patientAllergies.forEach(al => {
      if (names.some(n => n.includes(al) || al.includes(n))) {
        w.push(`Allergy alert: Patient is allergic to "${al}".`);
      }
    });

    // Drug interaction check (simple examples)
    const interactionPairs = [
      ['warfarin', 'aspirin'], ['metformin', 'alcohol'], ['ssri', 'maoi'],
      ['ciprofloxacin', 'antacid'], ['digoxin', 'amiodarone'],
    ];
    interactionPairs.forEach(([a, b]) => {
      if (names.some(n => n.includes(a)) && names.some(n => n.includes(b))) {
        w.push(`Interaction warning: ${a} + ${b} may interact.`);
      }
    });

    setWarnings(w);
  };

  const addMed = () => setForm(p => ({ ...p, medications: [...p.medications, { ...EMPTY_MED }] }));
  const removeMed = (i) => setForm(p => ({ ...p, medications: p.medications.filter((_, idx) => idx !== i) }));
  const updateMed = (i, field, val) => setForm(p => {
    const meds = [...p.medications];
    meds[i] = { ...meds[i], [field]: val };
    // Auto-schedule when frequency changes
    if (field === 'frequency' && !meds[i].schedule?.length) {
      meds[i].schedule = autoSchedule(val);
    }
    const updated = { ...p, medications: meds };
    runSafetyChecks(updated.medications);
    return updated;
  });
  const updateMedNested = (i, section, field, val) => setForm(p => {
    const meds = [...p.medications];
    meds[i] = { ...meds[i], [section]: { ...meds[i][section], [field]: val } };
    return { ...p, medications: meds };
  });

  const handleSave = async () => {
    if (!form.patientId) { Alert.alert('Validation', 'Please select a patient.'); return; }
    if (!form.diagnosis.trim()) { Alert.alert('Validation', 'Diagnosis is required.'); return; }
    if (!form.medications[0].name.trim()) { Alert.alert('Validation', 'At least one medication is required.'); return; }

    // Warn about safety issues but don't block
    if (warnings.length > 0) {
      const proceed = await new Promise(resolve => {
        Alert.alert(
          'Safety Warnings',
          warnings.join('\n\n') + '\n\nDo you want to proceed?',
          [{ text: 'Cancel', onPress: () => resolve(false), style: 'cancel' }, { text: 'Proceed Anyway', onPress: () => resolve(true) }]
        );
      });
      if (!proceed) return;
    }

    setSaving(true);
    try {
      const cu = auth.currentUser;
      const prescriptionRef = editing?.prescriptionRef || generatePrescriptionRef();
      const payload = {
        patientId: form.patientId,
        patientName: form.patientName,
        pharmacyId: form.pharmacyId || null,
        pharmacyName: form.pharmacyName || null,
        branchId: form.branchId || null,
        branchName: form.branchName || null,
        prescriptionRef,
        diagnosis: form.diagnosis.trim(),
        instructions: form.instructions.trim(),
        followUpDate: form.followUpDate,
        status: form.status || 'active',
        medications: form.medications.filter(m => m.name.trim()).map(m => ({
          name: m.name.trim(),
          strength: m.strength?.trim() || '',
          drugForm: m.drugForm || 'Tablet',
          dosage: m.dosage?.trim() || '',
          frequency: m.frequency || 'Once per Day',
          direction: m.direction || 'Scheduled',
          duration: m.duration?.trim() || '',
          specialInstructions: m.specialInstructions?.trim() || '',
          prn: m.direction === 'As Needed (PRN)' ? { indication: m.prn?.indication || '', maxPerDay: m.prn?.maxPerDay || '', interval: m.prn?.interval || '' } : null,
          refill: m.refill?.allowed ? { allowed: true, count: parseInt(m.refill.count) || 0, expiryDate: m.refill.expiryDate || '' } : { allowed: false },
          schedule: m.schedule || [],
          // Form-specific fields
          ...(m.drugForm === 'Syrup' && { volumeUnit: m.volumeUnit || 'ml', shakeWell: m.shakeWell || false }),
          ...(m.drugForm === 'Injection' && { route: m.route || '', injectionSite: m.injectionSite?.trim() || '' }),
          ...(m.drugForm === 'Cream' && { applicationSite: m.applicationSite?.trim() || '' }),
          ...(m.drugForm === 'Drops' && { dropSite: m.dropSite || '' }),
          ...(m.drugForm === 'Inhaler' && { spacerRequired: m.spacerRequired || false, rinseAfter: m.rinseAfter || false }),
          ...(m.drugForm === 'Patch' && { applicationSite: m.applicationSite?.trim() || '', changeInterval: m.changeInterval || '', rotationRequired: m.rotationRequired || false }),
          ...(m.drugForm === 'Suppository' && { route: m.route || '' }),
        })),
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'doctorPrescriptions', editing.id), payload);
      } else {
        const newRx = await addDoc(collection(db, 'doctorPrescriptions'), {
          ...payload,
          doctorId: cu.uid,
          doctorName: doctorProfile?.name || '',
          date: TODAY,
          pharmacyStatus: form.pharmacyId ? 'sent' : null,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, 'patientTimeline'), {
          patientId: form.patientId,
          type: 'PRESCRIPTION',
          title: `Prescription created by Dr. ${doctorProfile?.name || 'Doctor'}`,
          status: 'PENDING',
          relatedId: newRx.id,
          actor: { role: 'DOCTOR', name: doctorProfile?.name || 'Doctor' },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      setShowModal(false);
      await loadAll();
    } catch (err) {
      Alert.alert('Error', 'Could not save prescription. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const approveAlternative = async (rx, medIndex) => {
    setAltSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'approved_replacement', approvedByDoctorName: doctorProfile?.name || 'Doctor' } : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), { medications: updatedMeds, updatedAt: serverTimestamp() });
      setAltApprovalRx(prev => prev ? { ...prev, medications: updatedMeds } : null);
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, medications: updatedMeds } : r));
    } catch { Alert.alert('Error', 'Could not approve. Try again.'); }
    finally { setAltSaving(false); }
  };

  const rejectAlternative = async (rx, medIndex) => {
    setAltSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'not_available', alternativeSuggested: null } : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), { medications: updatedMeds, updatedAt: serverTimestamp() });
      setAltApprovalRx(prev => prev ? { ...prev, medications: updatedMeds } : null);
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, medications: updatedMeds } : r));
    } catch { Alert.alert('Error', 'Could not reject. Try again.'); }
    finally { setAltSaving(false); }
  };

  const reassignUnavailableDrugs = async () => {
    if (!reassignRx || !reassignBranchId) return;
    const target = branchDirectory.find(b => b.branchId === reassignBranchId && (!reassignRx.pharmacyId || b.pharmacyId === reassignRx.pharmacyId));
    if (!target) return;
    const hasUnavailable = (reassignRx.medications || []).some(m => m.drugStatus === 'not_available');
    if (!hasUnavailable) {
      Alert.alert('No unavailable drugs', 'This prescription has no drugs marked as not available.');
      return;
    }
    setReassignSaving(true);
    try {
      const updatedMeds = (reassignRx.medications || []).map(m =>
        m.drugStatus === 'not_available'
          ? {
              ...m,
              drugStatus: 'transferred',
              transferFromBranchId: null,
              transferFromBranchName: `Dr. ${doctorProfile?.name || reassignRx.doctorName || 'Doctor'}`,
              transferBranchId: target.branchId,
              transferBranchName: target.branchName || 'Branch',
              transferBranchAddress: target.address || '',
            }
          : m
      );
      await updateDoc(doc(db, 'doctorPrescriptions', reassignRx.id), { medications: updatedMeds, updatedAt: serverTimestamp() });
      setPrescriptions(prev => prev.map(r => r.id === reassignRx.id ? { ...r, medications: updatedMeds } : r));
      setReassignRx(null);
      setReassignBranchId('');
    } catch {
      Alert.alert('Error', 'Could not reassign unavailable drugs.');
    } finally {
      setReassignSaving(false);
    }
  };

  const handleDelete = (rxId) => {
    Alert.alert('Delete Prescription', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'doctorPrescriptions', rxId));
          setPrescriptions(prev => prev.filter(r => r.id !== rxId));
        } catch {
          Alert.alert('Error', 'Could not delete prescription.');
        }
      }},
    ]);
  };

  const filtered = prescriptions.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.patientName || '').toLowerCase().includes(q) ||
           (r.diagnosis || '').toLowerCase().includes(q) ||
           (r.date || '').includes(q) ||
           (r.branchName || '').toLowerCase().includes(q);
  });

  const STATUS_META = {
    active:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'Active' },
    completed: { bg: '#f0fdf4', border: '#bbf7d0', text: '#16a34a', label: 'Completed' },
    cancelled: { bg: '#fff1f2', border: '#fecdd3', text: '#be123c', label: 'Cancelled' },
    expired:   { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Expired' },
  };

  const DRUG_STATUS_META = {
    pending:               { icon: '⏳', label: 'Pending',       color: '#d97706', bg: '#fffbeb' },
    available:             { icon: '✅', label: 'Available',     color: '#16a34a', bg: '#f0fdf4' },
    not_available:         { icon: '❌', label: 'Not Available', color: '#dc2626', bg: '#fff1f2' },
    alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed', bg: '#f5f3ff' },
    approved_replacement:  { icon: '✅', label: 'Approved Alt.', color: '#16a34a', bg: '#f0fdf4' },
    transferred:           { icon: '↔️', label: 'Transferred', color: '#0369a1', bg: '#e0f2fe' },
  };
  const PHARMACY_STATUS_META = {
    sent: { label: 'Sent to Pharmacy', color: '#1d4ed8', bg: '#eff6ff' },
    accepted: { label: 'Processing', color: '#d97706', bg: '#fffbeb' },
    partially_fulfilled: { label: 'Partially Filled', color: '#d97706', bg: '#fffbeb' },
    ready: { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
    delivered: { label: 'Delivered', color: '#475569', bg: '#f8fafc' },
  };

  const renderRx = ({ item }) => {
    const sm = STATUS_META[item.status] || STATUS_META.active;
    const hasPendingAlts = (item.medications || []).some(m => m.drugStatus === 'alternative_suggested');
    const hasTransferred = (item.medications || []).some(m => m.drugStatus === 'transferred');
    const hasUnavailable = (item.medications || []).some(m => m.drugStatus === 'not_available') && !hasTransferred;
    const pm = item.pharmacyStatus ? (PHARMACY_STATUS_META[item.pharmacyStatus] || null) : null;
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={() => setViewingRx(item)} style={[styles.rxCard, { borderLeftWidth: 3, borderLeftColor: sm.border }]}>
        <View style={styles.rxHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rxPatient}>{item.patientName || 'Patient'}</Text>
            <Text style={styles.rxDiagnosis}>{item.diagnosis}</Text>
            {item.branchName ? (
              <Text style={styles.rxPharmacy}>🏥 {item.branchName}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[styles.statusBadgeActive, { backgroundColor: sm.bg, borderColor: sm.border }]}>
              <Text style={[styles.statusBadgeActiveText, { color: sm.text }]}>{sm.label}</Text>
            </View>
            <View style={styles.rxActions}>
              <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionIcon}>
                <Ionicons name="pencil-outline" size={17} color={DoctorColors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon}>
                <Ionicons name="trash-outline" size={17} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Alt-pending alert */}
        {hasPendingAlts && (
          <TouchableOpacity style={styles.altAlert} onPress={() => setAltApprovalRx(item)}>
            <Text style={styles.altAlertText}>🔁 Pharmacy suggested alternatives — Tap to review</Text>
          </TouchableOpacity>
        )}

        {/* Per-drug status pills */}
        {pm && (
          <View style={[styles.drugStatusBadge, { alignSelf: 'flex-start', backgroundColor: pm.bg, marginBottom: 8 }]}>
            <Text style={[styles.drugStatusBadgeText, { color: pm.color }]}>{pm.label}</Text>
          </View>
        )}
        <View style={{ gap: 4, marginBottom: 8 }}>
          {(item.medications || []).map((m, i) => {
            const ds = m.drugStatus ? (DRUG_STATUS_META[m.drugStatus] || DRUG_STATUS_META.pending) : null;
            return (
              <View key={i} style={styles.drugStatusRow}>
                <Text style={styles.drugStatusName} numberOfLines={1}>{m.name}{m.strength ? ` (${m.strength})` : ''}</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  {ds && (
                    <View style={[styles.drugStatusBadge, { backgroundColor: ds.bg }]}>
                      <Text style={[styles.drugStatusBadgeText, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
                    </View>
                  )}
                  {m.drugStatus === 'approved_replacement' && m.alternativeSuggested ? (
                    <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '600', marginTop: 2 }}>
                      {m.name} → {m.alternativeSuggested} · Approved · Dr. {m.approvedByDoctorName || item.doctorName || 'Doctor'}
                      {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                    </Text>
                  ) : (m.drugStatus === 'transferred' && m.transferBranchName) ? (
                    <Text style={{ fontSize: 11, color: '#0369a1', fontWeight: '600', marginTop: 2 }}>
                      This drug ({m.name}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                    </Text>
                  ) : (m.drugStatus === 'alternative_suggested' && m.alternativeSuggested) ? (
                    <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 2 }}>
                      {m.name} → {m.alternativeSuggested} · Waiting for Approval from your Doctor
                      {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.rxFooter}>
          <Text style={styles.rxDate}>📅 {item.date}</Text>
          {item.prescriptionRef && <Text style={styles.rxRef}>{item.prescriptionRef}</Text>}
          {item.followUpDate ? <Text style={styles.rxDate}>🔄 {item.followUpDate}</Text> : null}
        </View>
        {hasUnavailable && (
          <TouchableOpacity
            style={[styles.altBtn, { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#eff6ff', borderColor: '#bfdbfe', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14 }]}
            onPress={() => {
              setReassignRx(item);
              setReassignBranchId('');
            }}
          >
            <Text style={[styles.altBtnText, { color: '#1d4ed8', fontSize: 12 }]}>Reassign</Text>
          </TouchableOpacity>
        )}
        <Text style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>Tap card for full details</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search prescriptions..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>New Rx</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRx}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="medkit-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>{search ? 'No matching prescriptions' : 'No prescriptions yet'}</Text>
            </View>
          }
        />
      )}

      {/* Alternative Drug Approval Modal */}
      <Modal visible={!!altApprovalRx} animationType="slide" transparent onRequestClose={() => setAltApprovalRx(null)}>
        <View style={styles.altModalOverlay}>
          <View style={styles.altModalCard}>
            <View style={styles.altModalHeader}>
              <Text style={styles.altModalTitle}>🔁 Alternative Review</Text>
              <TouchableOpacity onPress={() => setAltApprovalRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {altApprovalRx && (
              <>
                <Text style={styles.altModalSub}>
                  {altApprovalRx.patientName} · {altApprovalRx.diagnosis}
                </Text>
                <ScrollView style={{ maxHeight: 380 }}>
                  {(altApprovalRx.medications || []).map((med, i) => {
                    if (med.drugStatus !== 'alternative_suggested') return null;
                    return (
                      <View key={i} style={styles.altMedCard}>
                        <Text style={styles.altOriginalLabel}>Original</Text>
                        <Text style={styles.altOriginalName}>{med.name}{med.strength ? ` (${med.strength})` : ''}</Text>
                        <Text style={styles.altArrow}>↓  Pharmacy suggests</Text>
                        <Text style={styles.altSuggestedName}>{med.alternativeSuggested}</Text>
                        {med.alternativeRationale ? (
                          <Text style={{ fontSize: 12, color: '#6d28d9', marginTop: 2 }}>
                            Rationale: {med.alternativeRationale}
                          </Text>
                        ) : null}
                        <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600', marginTop: 2 }}>
                          Waiting for Approval from your Doctor
                        </Text>
                        <View style={styles.altActions}>
                          <TouchableOpacity
                            style={[styles.altBtn, styles.altBtnApprove, altSaving && { opacity: 0.5 }]}
                            onPress={() => approveAlternative(altApprovalRx, i)}
                            disabled={altSaving}
                          >
                            <Text style={styles.altBtnText}>{altSaving ? '…' : '✅ Approve'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.altBtn, styles.altBtnReject, altSaving && { opacity: 0.5 }]}
                            onPress={() => rejectAlternative(altApprovalRx, i)}
                            disabled={altSaving}
                          >
                            <Text style={[styles.altBtnText, { color: '#dc2626' }]}>{altSaving ? '…' : '❌ Reject'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                  {!(altApprovalRx.medications || []).some(m => m.drugStatus === 'alternative_suggested') && (
                    <Text style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>
                      No pending alternatives.
                    </Text>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewingRx} animationType="slide" transparent onRequestClose={() => setViewingRx(null)}>
        <View style={styles.altModalOverlay}>
          <View style={[styles.altModalCard, { maxHeight: '88%' }]}>
            <View style={styles.altModalHeader}>
              <Text style={styles.altModalTitle}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setViewingRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {viewingRx && (
              <ScrollView>
                <Text style={styles.altModalSub}>{viewingRx.patientName || 'Patient'} · {viewingRx.diagnosis || '—'}</Text>
                <Text style={[styles.altOriginalLabel, { marginBottom: 8 }]}>Date: {viewingRx.date || '—'} {viewingRx.prescriptionRef ? `· ${viewingRx.prescriptionRef}` : ''}</Text>
                {(viewingRx.medications || []).map((m, i) => (
                  <View key={i} style={styles.altMedCard}>
                    <Text style={styles.altOriginalName}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</Text>
                    <Text style={styles.altOriginalLabel}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</Text>
                    {m.alternativeSuggested ? (
                      <Text style={{ marginTop: 4, fontSize: 12, color: m.drugStatus === 'approved_replacement' ? '#16a34a' : '#7c3aed', fontWeight: '700' }}>
                        🔁 {m.alternativeSuggested} · {m.drugStatus === 'approved_replacement'
                          ? `Approved · Dr. ${m.approvedByDoctorName || viewingRx.doctorName || 'Doctor'}`
                          : 'Waiting for Approval from your Doctor'}
                        {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                      </Text>
                    ) : null}
                    {m.drugStatus === 'transferred' && m.transferBranchName ? (
                      <Text style={{ marginTop: 4, fontSize: 12, color: '#0369a1', fontWeight: '700' }}>
                        This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                      </Text>
                    ) : null}
                  </View>
                ))}
                {viewingRx.instructions ? <Text style={[styles.altOriginalLabel, { marginTop: 8 }]}>Instructions: {viewingRx.instructions}</Text> : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!reassignRx} animationType="slide" transparent onRequestClose={() => setReassignRx(null)}>
        <View style={styles.altModalOverlay}>
          <View style={styles.altModalCard}>
            <View style={styles.altModalHeader}>
              <Text style={styles.altModalTitle}>Reassign Unavailable Drugs</Text>
              <TouchableOpacity onPress={() => setReassignRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {reassignRx && (
              <>
                <Text style={styles.altModalSub}>{reassignRx.patientName || 'Patient'} · {reassignRx.prescriptionRef || reassignRx.id}</Text>
                <Text style={[styles.altOriginalLabel, { marginBottom: 8 }]}>Only drugs marked as Not Available will be reassigned.</Text>
                <ScrollView style={{ maxHeight: 260 }}>
                  {branchDirectory
                    .filter(row => !reassignRx.pharmacyId || row.pharmacyId === reassignRx.pharmacyId)
                    .map(row => (
                    <TouchableOpacity
                      key={`${row.pharmacyId}-${row.branchId}`}
                      style={[styles.altMedCard, { borderColor: reassignBranchId === row.branchId ? '#93c5fd' : '#e2e8f0', backgroundColor: reassignBranchId === row.branchId ? '#eff6ff' : '#fff' }]}
                      onPress={() => setReassignBranchId(row.branchId)}
                    >
                      <Text style={styles.altOriginalName}>{row.branchName || 'Branch'}</Text>
                      <Text style={styles.altOriginalLabel}>{row.address || 'No address'}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.altActions}>
                  <TouchableOpacity style={[styles.altBtn, styles.altBtnReject]} onPress={() => setReassignRx(null)}>
                    <Text style={[styles.altBtnText, { color: '#64748b' }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.altBtn, styles.altBtnApprove, (!reassignBranchId || reassignSaving) && { opacity: 0.5 }]}
                    disabled={!reassignBranchId || reassignSaving}
                    onPress={reassignUnavailableDrugs}
                  >
                    <Text style={styles.altBtnText}>{reassignSaving ? '…' : 'Reassign'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Prescription Form Modal */}
      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Prescription' : 'New Prescription'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {/* Patient */}
              {!editing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Patient *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {patients.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.chip, form.patientId === p.id && styles.chipActive]}
                        onPress={() => {
                          setForm(prev => ({ ...prev, patientId: p.id, patientName: p.name }));
                          loadPatientAllergies(p.id);
                        }}
                      >
                        <Text style={[styles.chipText, form.patientId === p.id && styles.chipTextActive]}>{p.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {!form.patientId && <Text style={styles.hint}>Select a patient above</Text>}
                </View>
              )}

              {/* Safety Warnings */}
              {warnings.length > 0 && (
                <View style={styles.warningsBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Ionicons name="warning-outline" size={16} color="#d97706" />
                    <Text style={styles.warningsTitle}>Safety Warnings</Text>
                  </View>
                  {warnings.map((w, i) => <Text key={i} style={styles.warningItem}>• {w}</Text>)}
                </View>
              )}

              {/* Diagnosis */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Diagnosis *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter diagnosis"
                  placeholderTextColor="#94a3b8"
                  value={form.diagnosis}
                  onChangeText={v => setForm(p => ({ ...p, diagnosis: v }))}
                />
              </View>

              {/* Status */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Status</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowStatusPicker(v => !v)}>
                  <Text style={{ color: DoctorColors.text, fontSize: 15, textTransform: 'capitalize' }}>{form.status}</Text>
                </TouchableOpacity>
                {showStatusPicker && (
                  <View style={styles.pickerDropdown}>
                    {RX_STATUSES.map(s => (
                      <TouchableOpacity key={s} style={[styles.pickerItem, form.status === s && styles.pickerItemActive]} onPress={() => { setForm(p => ({ ...p, status: s })); setShowStatusPicker(false); }}>
                        <Text style={[styles.pickerItemText, form.status === s && { color: DoctorColors.primary, fontWeight: '700' }]}>{s.charAt(0).toUpperCase() + s.slice(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Medications */}
              <View style={styles.fieldGroup}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.fieldLabel}>Medications *</Text>
                  <TouchableOpacity onPress={addMed} style={styles.addMedBtn}>
                    <Ionicons name="add-circle-outline" size={18} color={DoctorColors.primary} />
                    <Text style={styles.addMedText}>Add Drug</Text>
                  </TouchableOpacity>
                </View>
                {form.medications.map((med, i) => (
                  <View key={i} style={styles.medRow}>
                    <View style={styles.medRowHeader}>
                      <Text style={styles.medRowLabel}>Drug {i + 1}</Text>
                      {form.medications.length > 1 && (
                        <TouchableOpacity onPress={() => removeMed(i)}>
                          <Ionicons name="remove-circle-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Drug Name */}
                    <TextInput style={styles.input} placeholder="Drug name *" placeholderTextColor="#94a3b8"
                      value={med.name} onChangeText={v => updateMed(i, 'name', v)} />

                    {/* Strength + Form */}
                    <View style={styles.medFieldRow}>
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Strength (e.g. 500mg)"
                        placeholderTextColor="#94a3b8" value={med.strength} onChangeText={v => updateMed(i, 'strength', v)} />
                      <TouchableOpacity style={[styles.input, { flex: 1 }]} onPress={() => setShowFormPicker(showFormPicker === i ? null : i)}>
                        <Text style={{ color: DoctorColors.text, fontSize: 13 }}>{med.drugForm || 'Tablet'}</Text>
                      </TouchableOpacity>
                    </View>
                    {showFormPicker === i && (
                      <View style={styles.pickerDropdown}>
                        {DRUG_FORMS.map(f => (
                          <TouchableOpacity key={f} style={[styles.pickerItem, med.drugForm === f && styles.pickerItemActive]} onPress={() => { updateMed(i, 'drugForm', f); setShowFormPicker(null); }}>
                            <Text style={[styles.pickerItemText, med.drugForm === f && { color: DoctorColors.primary, fontWeight: '700' }]}>{f}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Dosage */}
                    <TextInput style={styles.input} placeholder={getDosagePlaceholder(med.drugForm)}
                      placeholderTextColor="#94a3b8" value={med.dosage} onChangeText={v => updateMed(i, 'dosage', v)} />

                    {/* Frequency */}
                    <Text style={styles.subLabel}>Frequency</Text>
                    <TouchableOpacity style={styles.input} onPress={() => setShowFreqPicker(showFreqPicker === i ? null : i)}>
                      <Text style={{ color: DoctorColors.text, fontSize: 13 }}>{med.frequency}</Text>
                    </TouchableOpacity>
                    {showFreqPicker === i && (
                      <View style={styles.pickerDropdown}>
                        {FREQUENCY_OPTIONS.map(f => (
                          <TouchableOpacity key={f} style={[styles.pickerItem, med.frequency === f && styles.pickerItemActive]} onPress={() => { updateMed(i, 'frequency', f); setShowFreqPicker(null); }}>
                            <Text style={[styles.pickerItemText, med.frequency === f && { color: DoctorColors.primary, fontWeight: '700' }]}>{f}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* Direction */}
                    <Text style={styles.subLabel}>Direction</Text>
                    <TouchableOpacity style={styles.input} onPress={() => setShowDirPicker(showDirPicker === i ? null : i)}>
                      <Text style={{ color: DoctorColors.text, fontSize: 13 }}>{med.direction}</Text>
                    </TouchableOpacity>
                    {showDirPicker === i && (
                      <View style={styles.pickerDropdown}>
                        {DIRECTION_OPTIONS.map(d => (
                          <TouchableOpacity key={d} style={[styles.pickerItem, med.direction === d && styles.pickerItemActive]} onPress={() => { updateMed(i, 'direction', d); setShowDirPicker(null); }}>
                            <Text style={[styles.pickerItemText, med.direction === d && { color: DoctorColors.primary, fontWeight: '700' }]}>{d}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* PRN fields (As Needed) */}
                    {med.direction === 'As Needed (PRN)' && (
                      <View style={styles.prnBox}>
                        <Text style={styles.prnLabel}>PRN Details</Text>
                        <TextInput style={styles.input} placeholder="Indication (e.g. Pain, Fever)" placeholderTextColor="#94a3b8"
                          value={med.prn?.indication} onChangeText={v => updateMedNested(i, 'prn', 'indication', v)} />
                        <TextInput style={styles.input} placeholder="Max Dose Per Day" placeholderTextColor="#94a3b8" keyboardType="numeric"
                          value={med.prn?.maxPerDay} onChangeText={v => updateMedNested(i, 'prn', 'maxPerDay', v)} />
                        <TextInput style={styles.input} placeholder="Min Interval (e.g. 4 hours)" placeholderTextColor="#94a3b8"
                          value={med.prn?.interval} onChangeText={v => updateMedNested(i, 'prn', 'interval', v)} />
                      </View>
                    )}

                    {/* Special Instructions (As Directed or always) */}
                    {(med.direction === 'As Directed' || med.direction === 'As Needed (PRN)') && (
                      <>
                        <Text style={styles.subLabel}>Special Instructions</Text>
                        <TextInput style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                          placeholder="Instructions for patient..." placeholderTextColor="#94a3b8"
                          value={med.specialInstructions} onChangeText={v => updateMed(i, 'specialInstructions', v)} multiline />
                      </>
                    )}

                    {/* === FORM-SPECIFIC FIELDS === */}

                    {/* SYRUP */}
                    {med.drugForm === 'Syrup' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Syrup Details</Text>
                        <Text style={styles.subLabel}>Volume Unit</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                          {['ml', 'tsp', 'tbsp'].map(unit => (
                            <TouchableOpacity key={unit}
                              style={[styles.unitChip, med.volumeUnit === unit && styles.unitChipActive]}
                              onPress={() => updateMed(i, 'volumeUnit', unit)}>
                              <Text style={[styles.unitChipText, med.volumeUnit === unit && styles.unitChipTextActive]}>{unit}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={[styles.medFieldRow, { alignItems: 'center', marginTop: 4 }]}>
                          <Text style={[styles.subLabel, { flex: 1, marginTop: 0, marginBottom: 0 }]}>Shake well before use</Text>
                          <Switch value={med.shakeWell || false} onValueChange={v => updateMed(i, 'shakeWell', v)}
                            trackColor={{ false: '#e2e8f0', true: DoctorColors.primaryLight }}
                            thumbColor={med.shakeWell ? DoctorColors.primary : '#f1f5f9'} />
                        </View>
                      </View>
                    )}

                    {/* INJECTION */}
                    {med.drugForm === 'Injection' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Injection Details</Text>
                        <Text style={styles.subLabel}>Route of Administration</Text>
                        <TouchableOpacity
                          style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }]}
                          onPress={() => setShowRoutePicker(showRoutePicker === i ? null : i)}>
                          <Text style={{ fontSize: 13, color: med.route ? DoctorColors.text : '#94a3b8' }}>
                            {med.route || 'Select Route'}
                          </Text>
                          <Ionicons name={showRoutePicker === i ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                        </TouchableOpacity>
                        {showRoutePicker === i && (
                          <View style={styles.pickerDropdown}>
                            {INJECTION_ROUTES.map(r => (
                              <TouchableOpacity key={r} style={[styles.pickerItem, med.route === r && styles.pickerItemActive]}
                                onPress={() => { updateMed(i, 'route', r); setShowRoutePicker(null); }}>
                                <Text style={[styles.pickerItemText, med.route === r && { color: DoctorColors.primary, fontWeight: '700' }]}>{r}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        <Text style={styles.subLabel}>Injection Site</Text>
                        <TextInput style={styles.input} placeholder="e.g. Left arm, Abdomen, Thigh"
                          placeholderTextColor="#94a3b8" value={med.injectionSite || ''}
                          onChangeText={v => updateMed(i, 'injectionSite', v)} />
                      </View>
                    )}

                    {/* CREAM */}
                    {med.drugForm === 'Cream' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Cream Details</Text>
                        <Text style={styles.subLabel}>Application Site</Text>
                        <TextInput style={styles.input} placeholder="e.g. Affected area, Right forearm, Scalp"
                          placeholderTextColor="#94a3b8" value={med.applicationSite || ''}
                          onChangeText={v => updateMed(i, 'applicationSite', v)} />
                      </View>
                    )}

                    {/* DROPS */}
                    {med.drugForm === 'Drops' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Drops Details</Text>
                        <Text style={styles.subLabel}>Administration Site</Text>
                        <TouchableOpacity
                          style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }]}
                          onPress={() => setShowDropSitePicker(showDropSitePicker === i ? null : i)}>
                          <Text style={{ fontSize: 13, color: med.dropSite ? DoctorColors.text : '#94a3b8' }}>
                            {med.dropSite || 'Select Site'}
                          </Text>
                          <Ionicons name={showDropSitePicker === i ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                        </TouchableOpacity>
                        {showDropSitePicker === i && (
                          <View style={styles.pickerDropdown}>
                            {DROP_SITES.map(s => (
                              <TouchableOpacity key={s} style={[styles.pickerItem, med.dropSite === s && styles.pickerItemActive]}
                                onPress={() => { updateMed(i, 'dropSite', s); setShowDropSitePicker(null); }}>
                                <Text style={[styles.pickerItemText, med.dropSite === s && { color: DoctorColors.primary, fontWeight: '700' }]}>{s}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* INHALER */}
                    {med.drugForm === 'Inhaler' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Inhaler Details</Text>
                        <View style={[styles.medFieldRow, { alignItems: 'center', marginBottom: 10 }]}>
                          <Text style={[styles.subLabel, { flex: 1, marginTop: 0, marginBottom: 0 }]}>Spacer device required</Text>
                          <Switch value={med.spacerRequired || false} onValueChange={v => updateMed(i, 'spacerRequired', v)}
                            trackColor={{ false: '#e2e8f0', true: DoctorColors.primaryLight }}
                            thumbColor={med.spacerRequired ? DoctorColors.primary : '#f1f5f9'} />
                        </View>
                        <View style={[styles.medFieldRow, { alignItems: 'center' }]}>
                          <Text style={[styles.subLabel, { flex: 1, marginTop: 0, marginBottom: 0 }]}>Rinse mouth after use</Text>
                          <Switch value={med.rinseAfter || false} onValueChange={v => updateMed(i, 'rinseAfter', v)}
                            trackColor={{ false: '#e2e8f0', true: DoctorColors.primaryLight }}
                            thumbColor={med.rinseAfter ? DoctorColors.primary : '#f1f5f9'} />
                        </View>
                      </View>
                    )}

                    {/* PATCH */}
                    {med.drugForm === 'Patch' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Patch Details</Text>
                        <Text style={styles.subLabel}>Application Site</Text>
                        <TextInput style={styles.input} placeholder="e.g. Upper arm, Chest, Lower back"
                          placeholderTextColor="#94a3b8" value={med.applicationSite || ''}
                          onChangeText={v => updateMed(i, 'applicationSite', v)} />
                        <Text style={styles.subLabel}>Change Interval</Text>
                        <TouchableOpacity
                          style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }]}
                          onPress={() => setShowChangeIntervalPicker(showChangeIntervalPicker === i ? null : i)}>
                          <Text style={{ fontSize: 13, color: med.changeInterval ? DoctorColors.text : '#94a3b8' }}>
                            {med.changeInterval || 'Select Change Interval'}
                          </Text>
                          <Ionicons name={showChangeIntervalPicker === i ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                        </TouchableOpacity>
                        {showChangeIntervalPicker === i && (
                          <View style={styles.pickerDropdown}>
                            {PATCH_INTERVALS.map(p => (
                              <TouchableOpacity key={p} style={[styles.pickerItem, med.changeInterval === p && styles.pickerItemActive]}
                                onPress={() => { updateMed(i, 'changeInterval', p); setShowChangeIntervalPicker(null); }}>
                                <Text style={[styles.pickerItemText, med.changeInterval === p && { color: DoctorColors.primary, fontWeight: '700' }]}>{p}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        <View style={[styles.medFieldRow, { alignItems: 'center', marginTop: 6 }]}>
                          <Text style={[styles.subLabel, { flex: 1, marginTop: 0, marginBottom: 0 }]}>Rotate application site</Text>
                          <Switch value={med.rotationRequired || false} onValueChange={v => updateMed(i, 'rotationRequired', v)}
                            trackColor={{ false: '#e2e8f0', true: DoctorColors.primaryLight }}
                            thumbColor={med.rotationRequired ? DoctorColors.primary : '#f1f5f9'} />
                        </View>
                      </View>
                    )}

                    {/* SUPPOSITORY */}
                    {med.drugForm === 'Suppository' && (
                      <View style={styles.formSpecificBox}>
                        <Text style={styles.formSpecificTitle}>Suppository Details</Text>
                        <Text style={styles.subLabel}>Route</Text>
                        <TouchableOpacity
                          style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }]}
                          onPress={() => setShowRoutePicker(showRoutePicker === i ? null : i)}>
                          <Text style={{ fontSize: 13, color: med.route ? DoctorColors.text : '#94a3b8' }}>
                            {med.route || 'Select Route'}
                          </Text>
                          <Ionicons name={showRoutePicker === i ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                        </TouchableOpacity>
                        {showRoutePicker === i && (
                          <View style={styles.pickerDropdown}>
                            {SUPPOSITORY_ROUTES.map(r => (
                              <TouchableOpacity key={r} style={[styles.pickerItem, med.route === r && styles.pickerItemActive]}
                                onPress={() => { updateMed(i, 'route', r); setShowRoutePicker(null); }}>
                                <Text style={[styles.pickerItemText, med.route === r && { color: DoctorColors.primary, fontWeight: '700' }]}>{r}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}

                    {/* Duration — preset range picker */}
                    <TouchableOpacity
                      style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 }]}
                      onPress={() => setShowDurationPicker(showDurationPicker === i ? null : i)}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 14, color: med.duration ? DoctorColors.text : '#94a3b8' }}>
                        {med.duration || 'Select Duration'}
                      </Text>
                      <Ionicons name={showDurationPicker === i ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                    </TouchableOpacity>

                    {showDurationPicker === i && (
                      <ScrollView style={styles.durationDropdown} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        {(() => {
                          let lastGroup = null;
                          return DURATION_OPTIONS.map((opt) => {
                            const groupHeader = opt.group !== lastGroup;
                            lastGroup = opt.group;
                            return (
                              <View key={opt.label}>
                                {groupHeader && (
                                  <View style={styles.durationGroupHeader}>
                                    <Text style={styles.durationGroupLabel}>{opt.group}</Text>
                                  </View>
                                )}
                                <TouchableOpacity
                                  style={[styles.durationOption, med.duration === opt.label && styles.durationOptionActive]}
                                  onPress={() => { updateMed(i, 'duration', opt.label); setShowDurationPicker(null); }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={[styles.durationOptionText, med.duration === opt.label && styles.durationOptionTextActive]}>
                                    {opt.label}
                                  </Text>
                                  {med.duration === opt.label && <Ionicons name="checkmark" size={14} color={DoctorColors.primary} />}
                                </TouchableOpacity>
                              </View>
                            );
                          });
                        })()}
                      </ScrollView>
                    )}

                    {/* Refill */}
                    <View style={[styles.medFieldRow, { alignItems: 'center' }]}>
                      <Text style={[styles.subLabel, { flex: 1 }]}>Allow Refills</Text>
                      <Switch
                        value={med.refill?.allowed || false}
                        onValueChange={v => updateMedNested(i, 'refill', 'allowed', v)}
                        trackColor={{ false: '#e2e8f0', true: DoctorColors.primaryLight }}
                        thumbColor={med.refill?.allowed ? DoctorColors.primary : '#f1f5f9'}
                      />
                    </View>
                    {med.refill?.allowed && (
                      <View style={styles.medFieldRow}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="# Refills (0-5)" placeholderTextColor="#94a3b8" keyboardType="numeric"
                          value={med.refill?.count} onChangeText={v => updateMedNested(i, 'refill', 'count', Math.min(5, parseInt(v) || 0).toString())} />
                        <TextInput style={[styles.input, { flex: 1.5 }]} placeholder="Expiry (YYYY-MM-DD)" placeholderTextColor="#94a3b8"
                          value={med.refill?.expiryDate} onChangeText={v => updateMedNested(i, 'refill', 'expiryDate', v)} />
                      </View>
                    )}

                    {/* Schedule preview */}
                    {med.schedule?.length > 0 && (
                      <View style={styles.scheduleBox}>
                        <Text style={styles.subLabel}>Dosage Schedule</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {med.schedule.map((s, si) => (
                            <View key={si} style={styles.scheduleChip}>
                              <Text style={styles.scheduleChipText}>{s}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                ))}
              </View>

              {/* General Instructions */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>General Instructions</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Overall instructions for patient..."
                  placeholderTextColor="#94a3b8"
                  value={form.instructions}
                  onChangeText={v => setForm(p => ({ ...p, instructions: v }))}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
              </View>

              {/* Follow-up Date */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Follow-up Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  value={form.followUpDate}
                  onChangeText={v => setForm(p => ({ ...p, followUpDate: v }))}
                />
              </View>

              {/* E-pharmacy branch routing (optional); labels are branch-only */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>E-Pharmacy Branch (Optional)</Text>
                <TouchableOpacity
                  style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                  onPress={() => { if (!loadingBranchDirectory) setShowBranchDirectoryPicker(v => !v); }}
                >
                  {loadingBranchDirectory
                    ? <ActivityIndicator size="small" color={DoctorColors.primary} />
                    : <>
                        <Text style={{ color: form.branchId ? DoctorColors.text : '#94a3b8', fontSize: 14, flex: 1 }}>
                          {form.branchId ? form.branchName : 'Select branch (optional)'}
                        </Text>
                        <Ionicons name={showBranchDirectoryPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#94a3b8" />
                      </>
                  }
                </TouchableOpacity>
                {showBranchDirectoryPicker && (
                  <View style={styles.pickerDropdown}>
                    <TouchableOpacity style={styles.pickerItem} onPress={() => {
                      setForm(p => ({ ...p, pharmacyId: '', pharmacyName: '', branchId: '', branchName: '' }));
                      setShowBranchDirectoryPicker(false);
                    }}>
                      <Text style={[styles.pickerItemText, { color: '#94a3b8' }]}>— None —</Text>
                    </TouchableOpacity>
                    {branchDirectory.length === 0 && !loadingBranchDirectory && (
                      <Text style={[styles.pickerItemText, { padding: 12, color: '#94a3b8' }]}>No active branches found.</Text>
                    )}
                    {branchDirectory.map(row => (
                      <TouchableOpacity key={`${row.pharmacyId}-${row.branchId}`}
                        style={[styles.pickerItem, form.branchId === row.branchId && styles.pickerItemActive]}
                        onPress={() => {
                          setForm(p => ({
                            ...p,
                            pharmacyId: row.pharmacyId,
                            pharmacyName: row.pharmacyName,
                            branchId: row.branchId,
                            branchName: row.branchName,
                          }));
                          setShowBranchDirectoryPicker(false);
                        }}>
                        <Text style={[styles.pickerItemText, form.branchId === row.branchId && { color: DoctorColors.primary, fontWeight: '700' }]}>
                          {row.branchName}
                        </Text>
                        {!!row.addressLine && (
                          <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{row.addressLine}</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'center' },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DoctorColors.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rxCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  rxHeader: { flexDirection: 'row', marginBottom: 8 },
  rxPatient: { fontSize: 15, fontWeight: '700', color: DoctorColors.text },
  rxDiagnosis: { fontSize: 13, color: DoctorColors.textSecondary, marginTop: 2 },
  rxActions: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 4 },
  medsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  medPill: {
    backgroundColor: DoctorColors.primaryLight, paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: 20,
  },
  medPillText: { fontSize: 11, color: DoctorColors.primary, fontWeight: '600' },
  rxFooter: { flexDirection: 'row', gap: 16 },
  rxDate: { fontSize: 12, color: DoctorColors.textSecondary },
  statusBadgeActive: {
    backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe',
  },
  statusBadgeActiveText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: DoctorColors.text, marginBottom: 8 },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 13,
    fontSize: 15, color: DoctorColors.text,
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 6,
  },
  textarea: { height: 90, textAlignVertical: 'top' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: DoctorColors.primaryLight, borderColor: DoctorColors.primary },
  chipText: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: DoctorColors.primary, fontWeight: '700' },
  hint: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addMedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMedText: { fontSize: 13, color: DoctorColors.primary, fontWeight: '600' },
  medRow: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0',
  },
  medRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  medRowLabel: { fontSize: 12, fontWeight: '600', color: DoctorColors.textSecondary },
  medFieldRow: { flexDirection: 'row', gap: 8 },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: 20,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  cancelBtnText: { fontSize: 15, color: DoctorColors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: DoctorColors.primary,
  },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },

  subLabel: { fontSize: 11, fontWeight: '600', color: DoctorColors.textSecondary, marginBottom: 4, marginTop: 6 },
  pickerDropdown: {
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0',
    marginBottom: 6, overflow: 'hidden',
  },
  pickerItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerItemActive: { backgroundColor: DoctorColors.primaryLight },
  pickerItemText: { fontSize: 14, color: DoctorColors.text },
  prnBox: {
    backgroundColor: '#fff7ed', borderRadius: 10, padding: 12,
    marginVertical: 6, borderWidth: 1, borderColor: '#fed7aa',
  },
  prnLabel: { fontSize: 12, fontWeight: '700', color: '#d97706', marginBottom: 8 },
  scheduleBox: { marginTop: 8 },
  scheduleChip: {
    backgroundColor: DoctorColors.primaryLight, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: DoctorColors.primary + '40',
  },
  scheduleChipText: { fontSize: 11, fontWeight: '600', color: DoctorColors.primary },
  warningsBox: {
    backgroundColor: '#fff7ed', borderRadius: 10, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: '#fde68a',
  },
  warningsTitle: { fontSize: 13, fontWeight: '700', color: '#d97706' },
  warningItem: { fontSize: 12, color: '#92400e', marginTop: 3, lineHeight: 18 },

  // Duration picker dropdown
  durationDropdown: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    marginBottom: 8, maxHeight: 260, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 6,
  },
  durationGroupHeader: {
    backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingVertical: 5,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  durationGroupLabel: {
    fontSize: 10, fontWeight: '800', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  durationOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  durationOptionActive: { backgroundColor: DoctorColors.primaryLight },
  durationOptionText: { fontSize: 14, color: DoctorColors.text, fontWeight: '500' },
  durationOptionTextActive: { color: DoctorColors.primary, fontWeight: '700' },

  // Form-specific fields
  formSpecificBox: {
    backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12,
    marginVertical: 6, borderWidth: 1, borderColor: '#bae6fd',
  },
  formSpecificTitle: {
    fontSize: 12, fontWeight: '800', color: '#0369a1',
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  unitChip: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  unitChipActive: {
    backgroundColor: DoctorColors.primaryLight, borderColor: DoctorColors.primary,
  },
  unitChipText: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  unitChipTextActive: { color: DoctorColors.primary, fontWeight: '700' },

  // Drug status in list cards
  rxPharmacy: { fontSize: 11, color: '#0891b2', marginTop: 3, fontWeight: '600' },
  rxRef: { fontFamily: 'monospace', fontSize: 11, color: DoctorColors.primary, fontWeight: '700', letterSpacing: 1 },
  drugStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  drugStatusName: { flex: 1, fontSize: 12, color: DoctorColors.text, fontWeight: '500' },
  drugStatusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  drugStatusBadgeText: { fontSize: 11, fontWeight: '700' },

  // Alt pending alert
  altAlert: {
    backgroundColor: '#f5f3ff', borderRadius: 8, padding: 8, marginBottom: 8,
    borderWidth: 1, borderColor: '#ddd6fe',
  },
  altAlertText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },

  // Alternative approval modal
  altModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  altModalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 34,
  },
  altModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  altModalTitle: { fontSize: 17, fontWeight: '800', color: DoctorColors.text },
  altModalSub: { fontSize: 13, color: DoctorColors.textSecondary, marginBottom: 16 },
  altMedCard: {
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  altOriginalLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 },
  altOriginalName: { fontSize: 15, fontWeight: '700', color: DoctorColors.text },
  altArrow: { fontSize: 12, color: '#7c3aed', fontWeight: '700', marginVertical: 6 },
  altSuggestedName: { fontSize: 15, fontWeight: '700', color: '#7c3aed', marginBottom: 12 },
  altActions: { flexDirection: 'row', gap: 10 },
  altBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  altBtnApprove: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  altBtnReject: { backgroundColor: '#fff1f2', borderColor: '#fecaca' },
  altBtnText: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
});
