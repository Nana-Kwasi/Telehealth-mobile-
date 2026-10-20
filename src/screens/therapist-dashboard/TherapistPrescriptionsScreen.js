// Psychiatry prescribing — a copy of doctor-dashboard/DoctorPrescriptionsScreen.js
// for therapists. A psychiatrist (therapist account) prescribes for clients on the
// PSYCHIATRY care track through exactly the doctor's flow: same form, pharmacy
// routing, safety checks and approvals. Differences are marked "Psychiatry:".
// Keep fixes to the shared flow in step with DoctorPrescriptionsScreen.js.
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { RxAdviceMobile, RxInsurancePickerMobile, attachRxCardMobile } from '../../components/ProviderInsuranceMobile';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';

function generatePrescriptionRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'RX-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}
import { DoctorColors } from '../../constants/colors';
import PrescriptionAssistCard from '../../components/PrescriptionAssistCard';
import PrescriptionCodeCardMobile from '../../components/PrescriptionCodeCardMobile';
import { enrichPatientNames } from '../../utils/doctorUtils';
import { hasPendingDoctorNote, isRxDelivered } from '../../utils/pharmacyRxNotes';
import * as Print from 'expo-print';
import { parseCoords, attachDistance, formatDistanceKm } from '../../utils/homeCareGeo';
import * as Sharing from 'expo-sharing';

// Same status filters as web DoctorPrescriptions.js.
const STATUS_FILTERS = ['all', 'active', 'completed', 'cancelled', 'expired'];
const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
  // How much to supply (e.g. 30 tablets). Lets pharmacies record partial dispensing.
  quantity: '', quantityUnit: '',
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

export default function TherapistPrescriptionsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  // Insurance card chosen for this prescription ('' = self-pay).
  const [rxCardId, setRxCardId] = useState(undefined);
  // Set when this form is approving a patient's prescription request.
  const [requestId, setRequestId] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);

  const [form, setForm] = useState({
    patientId: '', patientName: '',
    pharmacyId: '', pharmacyName: '',
    branchId: '', branchName: '',
    openToAll: false,
    diagnosis: '', instructions: '',
    followUpDate: '', status: 'active',
    medications: [{ ...EMPTY_MED }],
  });
  const [patientAllergies, setPatientAllergies] = useState([]);
  const [branchDirectory, setBranchDirectory] = useState([]);
  // The chosen patient's saved pharmacies and location: the branch list shows
  // only their pharmacies (nearest first) unless the doctor asks for all.
  const [patientPh, setPatientPh] = useState({ id: null, list: [], anchor: null });
  const [showAllBranches, setShowAllBranches] = useState(false);
  const [loadingBranchDirectory, setLoadingBranchDirectory] = useState(false);
  const [showBranchDirectoryPicker, setShowBranchDirectoryPicker] = useState(false);
  // Alternative drug approval
  const [altApprovalRx, setAltApprovalRx] = useState(null);
  const [altSaving, setAltSaving] = useState(false);
  const [viewingRx, setViewingRx] = useState(null);
  const [showRxAll, setShowRxAll] = useState(false);
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
      openToAll: false,
      diagnosis: '',
      instructions: '',
      followUpDate: '',
      status: 'active',
      // From an approved prescription request: the medicines the patient named.
      medications: p.presetMedications?.length ? p.presetMedications.map(m => ({ ...EMPTY_MED, ...m })) : [{ ...EMPTY_MED }],
    });
    setRequestId(p.requestId || null);
    setWarnings([]);
    setShowModal(true);

    navigation.setParams({
      openRxForm: undefined,
      presetPatientId: undefined,
      presetPatientName: undefined,
      presetMedications: undefined,
      requestId: undefined,
    });
  }, [route.params?.openRxForm, route.params?.presetPatientId]);

  const loadAll = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid) return;

      // Psychiatry: the prescriber is a therapist account.
      const profile = await api(`/api/v1/therapists/${uid}`).catch(() => null);
      setDoctorProfile(profile ? { id: uid, ...profile, name: profile.name || profile.fullName || profile.displayName } : { id: uid, name: 'Psychiatrist' });

      // Psychiatry: the therapist's own clients on the psychiatry care track — the
      // server refuses a prescription for anyone else (requireMayPrescribe).
      // Assignment list as in TherapistClientsScreen.loadClients.
      const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${uid}`).catch(() => []) || [];
      const patMap = new Map();
      for (const a of assignments) {
        if (!a.clientId || patMap.has(a.clientId)) continue;
        try {
          const raw = await api(`/api/v1/clients/${a.clientId}`);
          let prefs = {};
          try { prefs = raw?.preferencesJson ? JSON.parse(raw.preferencesJson) : {}; } catch { /* ignore */ }
          if (String(prefs.careTrack || '').toLowerCase() !== 'psychiatry') continue;
          patMap.set(a.clientId, { id: a.clientId, name: a.clientName || a.clientDisplayName || prefs.name || '' });
        } catch { /* skip this client */ }
      }
      const enriched = await enrichPatientNames(patMap);
      setPatients(Array.from(enriched.values()));
      const nameById = {};
      for (const [id, p] of enriched.entries()) nameById[id] = p.name;

      const rxRaw = await api(`/api/v1/medical/prescriptions/doctor/${uid}`).catch(() => []) || [];
      const rxList = rxRaw.map(data => {
        let medications = data.medications;
        if (!medications || medications.length === 0) {
          if (data.medication) {
            medications = [{ name: data.medication, dosage: data.dosage || '', frequency: data.frequency || '', duration: data.duration || '' }];
          } else {
            medications = [];
          }
        }
        const storedName = data.patientName && data.patientName !== 'Patient' ? data.patientName : null;
        const patientName = storedName || (data.patientId && nameById[data.patientId]) || 'Patient';
        const diagnosis = data.diagnosis || data.instructions || '';
        return { ...data, medications, patientName, diagnosis };
      });
      rxList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setPrescriptions(rxList);
    } catch (err) {
      console.error('TherapistPrescriptions load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadBranchDirectory = async () => {
    setLoadingBranchDirectory(true);
    try {
      const pharmacies = await api('/api/v1/pharmacies?status=active').catch(() => []) || [];
      const rows = [];
      for (const ph of pharmacies) {
        const parentName = ph.pharmacyName || ph.name || '';
        const branches = await api(`/api/v1/pharmacy-branches?pharmacyId=${ph.id}&status=active`).catch(() => []) || [];
        branches.forEach(br => {
          rows.push({
            branchId: br.id,
            branchName: br.branchName || br.name || br.id,
            pharmacyId: ph.id,
            pharmacyName: parentName,
            addressLine: [br.address, br.city].filter(Boolean).join(', '),
            latitude: br.latitude ?? ph.latitude ?? null,
            longitude: br.longitude ?? ph.longitude ?? null,
          });
        });
      }
      rows.sort((a, b) => a.branchName.localeCompare(b.branchName));
      setBranchDirectory(rows);
    } catch {}
    finally { setLoadingBranchDirectory(false); }
  };

  useEffect(() => {
    const pid = form?.patientId;
    setShowAllBranches(false);
    if (!pid) { setPatientPh({ id: null, list: [], anchor: null }); return undefined; }
    let live = true;
    api(`/api/v1/patients/${pid}`).then((pd) => {
      if (!live) return;
      setPatientPh({ id: pid, list: Array.isArray(pd?.pharmacies) ? pd.pharmacies : [], anchor: parseCoords(pd) });
    }).catch(() => { if (live) setPatientPh({ id: pid, list: [], anchor: null }); });
    return () => { live = false; };
  }, [form?.patientId]);

  const branchOptions = useMemo(() => {
    const saved = patientPh.list || [];
    let rows = branchDirectory;
    if (form?.patientId && !showAllBranches) {
      rows = rows.filter(r => saved.some(s => (s.branchId && s.branchId === r.branchId)
        || (!s.branchId && s.pharmacyId && s.pharmacyId === r.pharmacyId)));
    }
    return patientPh.anchor ? attachDistance(rows, patientPh.anchor) : rows;
  }, [branchDirectory, patientPh, showAllBranches, form?.patientId]);
  const patientFirstName = (form?.patientName || 'This patient').split(' ')[0];

  const openNew = () => {
    setRequestId(null);
    setEditing(null);
    setForm({ patientId: '', patientName: '', pharmacyId: '', pharmacyName: '', branchId: '', branchName: '', openToAll: false, diagnosis: '', instructions: '', followUpDate: '', status: 'active', medications: [{ ...EMPTY_MED }] });
    setWarnings([]);
    setShowModal(true);
  };

  const openEdit = (rx) => {
    // A delivered prescription is a closed record — it is never edited afterwards.
    if (isRxDelivered(rx)) {
      Alert.alert('Delivered', 'This prescription has been delivered by the pharmacy and can no longer be edited.');
      return;
    }
    setEditing(rx);
    setForm({
      patientId: rx.patientId || '',
      patientName: rx.patientName || '',
      pharmacyId: rx.pharmacyId || '',
      pharmacyName: rx.pharmacyName || '',
      branchId: rx.branchId || '',
      branchName: rx.branchName || '',
      openToAll: !!rx.openToAll,
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
      const data = await api(`/api/v1/patients/${patientId}`).catch(() => null);
      const al = data?.allergies || '';
      setPatientAllergies(al ? al.toLowerCase().split(/[,;]/).map(s => s.trim()) : []);
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
        w.push(`Allergy alert: Client is allergic to "${al}".`);
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

  const handleSave = async (ack) => {
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
      const uid = await getStoredUserId();
      const prescriptionRef = editing?.prescriptionRef || generatePrescriptionRef();
      const payload = {
        patientId: form.patientId,
        patientName: form.patientName,
        // Open to all pharmacies: no branch until one takes it.
        openToAll: !!form.openToAll,
        pharmacyId: form.openToAll ? null : (form.pharmacyId || null),
        pharmacyName: form.openToAll ? null : (form.pharmacyName || null),
        branchId: form.openToAll ? null : (form.branchId || null),
        pharmacyBranchId: form.openToAll ? null : (form.branchId || null),
        branchName: form.openToAll ? null : (form.branchName || null),
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
          quantity: Number(m.quantity) > 0 ? Number(m.quantity) : null,
          quantityUnit: m.quantityUnit?.trim() || '',
          ...(m.drugForm === 'Syrup' && { volumeUnit: m.volumeUnit || 'ml', shakeWell: m.shakeWell || false }),
          ...(m.drugForm === 'Injection' && { route: m.route || '', injectionSite: m.injectionSite?.trim() || '' }),
          ...(m.drugForm === 'Cream' && { applicationSite: m.applicationSite?.trim() || '' }),
          ...(m.drugForm === 'Drops' && { dropSite: m.dropSite || '' }),
          ...(m.drugForm === 'Inhaler' && { spacerRequired: m.spacerRequired || false, rinseAfter: m.rinseAfter || false }),
          ...(m.drugForm === 'Patch' && { applicationSite: m.applicationSite?.trim() || '', changeInterval: m.changeInterval || '', rotationRequired: m.rotationRequired || false }),
          ...(m.drugForm === 'Suppository' && { route: m.route || '' }),
        })),
      };
      if (editing) {
        await api(`/api/v1/medical/prescriptions/${editing.id}`, { method: 'PATCH', body: payload });
      } else {
        const newRx = await api('/api/v1/medical/prescriptions', {
          method: 'POST',
          body: { ...payload, doctorId: uid, doctorName: doctorProfile?.name || '', date: TODAY, pharmacyStatus: form.openToAll ? 'open' : (form.pharmacyId ? 'sent' : null),
            // Approving a request: the server links it and enforces the formulary check.
            ...(requestId ? { requestId, safetyAcknowledged: ack === true } : {}) },
        });
        // Insured e-prescription: link the card; the patient is sent the estimate.
        if (rxCardId && newRx?.id) attachRxCardMobile(newRx.id, rxCardId);
        api('/api/v1/patient-timeline', {
          method: 'POST',
          body: {
            patientId: form.patientId, type: 'PRESCRIPTION',
            title: `Prescription created by ${doctorProfile?.name || 'your psychiatrist'}`,
            status: 'PENDING', relatedId: newRx?.id,
            actor: { role: 'THERAPIST', name: doctorProfile?.name || 'Psychiatrist' },
          },
        }).catch(() => {});
      }
      setShowModal(false);
      await loadAll();
      if (requestId && !editing) {
        setRequestId(null);
        Alert.alert('Request approved', 'The prescription has been issued and the patient notified.');
        navigation.navigate('TherapistRxRequests');
      }
    } catch (err) {
      // The formulary found something the prescriber must acknowledge first.
      if (requestId && String(err?.message || '').startsWith('Safety check:')) {
        Alert.alert('Safety check', `${err.message}\n\nIssue the prescription anyway?`, [
          { text: 'Go back', style: 'cancel' },
          { text: 'Issue anyway', onPress: () => handleSave(true) },
        ]);
      } else {
        Alert.alert('Error', err?.message || 'Could not save prescription. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const approveAlternative = async (rx, medIndex) => {
    setAltSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'approved_replacement', approvedByDoctorName: doctorProfile?.name || 'Psychiatrist' } : m
      );
      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { medications: updatedMeds } });
      setAltApprovalRx(prev => prev ? { ...prev, medications: updatedMeds } : null);
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, medications: updatedMeds } : r));
    } catch { Alert.alert('Error', 'Could not approve. Try again.'); }
    finally { setAltSaving(false); }
  };

  // Pharmacy clinical-impact notes: the branch cannot hand the drug over, and the
  // patient never sees the note, until the prescribing doctor rules on it here.
  const setPharmacyNoteApproval = async (rx, medIndex, noteIndex, approvalStatus) => {
    setAltSaving(true);
    try {
      const updatedMeds = (rx.medications || []).map((m, i) => {
        if (i !== medIndex) return m;
        const notes = Array.isArray(m.pharmacyNotes) ? [...m.pharmacyNotes] : [];
        if (!notes[noteIndex]) return m;
        notes[noteIndex] = {
          ...notes[noteIndex],
          approvalStatus,
          approvedByDoctorName: doctorProfile?.name || 'Psychiatrist',
          approvedAt: new Date().toISOString(),
        };
        return { ...m, pharmacyNotes: notes };
      });
      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { medications: updatedMeds } });
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? { ...r, medications: updatedMeds } : r));
      setViewingRx(prev => prev && prev.id === rx.id ? { ...prev, medications: updatedMeds } : prev);
    } catch {
      Alert.alert('Error', `Could not ${approvalStatus === 'approved' ? 'approve' : 'reject'} the note.`);
    } finally {
      setAltSaving(false);
    }
  };

  const rejectAlternative = async (rx, medIndex) => {
    setAltSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'not_available', alternativeSuggested: null } : m
      );
      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { medications: updatedMeds } });
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
              transferFromBranchName: `${doctorProfile?.name || reassignRx.doctorName || 'Psychiatrist'}`,
              transferBranchId: target.branchId,
              transferBranchName: target.branchName || 'Branch',
              transferBranchAddress: target.address || '',
            }
          : m
      );
      await api(`/api/v1/medical/prescriptions/${reassignRx.id}`, { method: 'PATCH', body: { medications: updatedMeds } });
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
    const target = prescriptions.find(r => r.id === rxId);
    if (isRxDelivered(target)) {
      Alert.alert('Delivered', 'This prescription has been delivered by the pharmacy and can no longer be deleted.');
      return;
    }
    Alert.alert('Delete Prescription', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api(`/api/v1/medical/prescriptions/${rxId}`, { method: 'DELETE' });
          setPrescriptions(prev => prev.filter(r => r.id !== rxId));
        } catch {
          Alert.alert('Error', 'Could not delete prescription.');
        }
      }},
    ]);
  };

  const filtered = prescriptions.filter(r => {
    if (statusFilter !== 'all' && (r.status || 'active') !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.patientName || '').toLowerCase().includes(q) ||
           (r.diagnosis || '').toLowerCase().includes(q) ||
           (r.date || '').includes(q) ||
           (r.prescriptionRef || '').toLowerCase().includes(q) ||
           (r.branchName || '').toLowerCase().includes(q);
  });
  const altPendingCount = prescriptions.filter(r => (r.medications || []).some(m => m.drugStatus === 'alternative_suggested')).length;

  // The web "Print" button: the same prescription sheet, as a PDF the doctor
  // can print, save or send from the share sheet.
  const shareRx = async (rx) => {
    const meds = rx.medications?.length ? rx.medications : rx.medication ? [{ name: rx.medication, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }] : [];
    const e = escHtml;
    const html = `<html><head><style>body{font-family:Arial,sans-serif;padding:2rem;max-width:700px;margin:auto}h1{color:#1e6bb8;border-bottom:2px solid #1e6bb8;padding-bottom:0.5rem}table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid #ddd;padding:0.5rem;text-align:left;font-size:12px}th{background:#f0f6fc}.footer{margin-top:2rem;border-top:1px solid #ddd;padding-top:1rem;font-size:0.85rem;color:#666}.ref-box{background:#f0f9ff;border:2px solid #0ea5e9;border-radius:8px;padding:0.75rem 1rem;margin:1rem 0}.ref-label{font-size:0.75rem;color:#0369a1;font-weight:700;text-transform:uppercase}.ref-code{font-size:1.5rem;font-weight:900;color:#0c4a6e;letter-spacing:0.1em}</style></head><body>`
      + `<h1>Psychiatric Prescription</h1><p><strong>Psychiatrist:</strong> ${e(doctorProfile?.name || rx.doctorName || 'Psychiatrist')}</p><p><strong>Client:</strong> ${e(rx.patientName || 'Client')}</p><p><strong>Date:</strong> ${e(rx.date || '')}</p><p><strong>Diagnosis:</strong> ${e(rx.diagnosis || '—')}</p>`
      + `${rx.prescriptionRef ? `<div class="ref-box"><div class="ref-label">Prescription Reference</div><div class="ref-code">${e(rx.prescriptionRef)}</div></div>` : ''}${rx.branchName ? `<p><strong>Branch:</strong> ${e(rx.branchName)}</p>` : ''}`
      + `<h3>Medications</h3><table><thead><tr><th>Medication</th><th>Strength</th><th>Dosage</th><th>Frequency</th><th>Direction</th><th>Duration</th></tr></thead><tbody>${meds.map(m => `<tr><td>${e(m.name || '')}</td><td>${e(m.strength || '—')}</td><td>${e(m.dosage || '—')}</td><td>${e(m.frequency || '—')}</td><td>${e(m.direction || '—')}</td><td>${e(m.duration ? `${m.duration} ${m.durationUnit || ''}` : '—')}</td></tr>`).join('')}</tbody></table>`
      + `${rx.instructions ? `<p><strong>Instructions:</strong> ${e(rx.instructions)}</p>` : ''}${rx.followUpDate ? `<p><strong>Follow-up:</strong> ${e(rx.followUpDate)}</p>` : ''}<div class="footer"><p>Generated via NessaHub Medical Platform.</p></div></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Prescription' });
    } catch (err) { Alert.alert('Could not create the prescription PDF', err?.message || 'Please try again.'); }
  };

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
    const hasPendingNotes = (item.medications || []).some(hasPendingDoctorNote);
    const hasTransferred = (item.medications || []).some(m => m.drugStatus === 'transferred');
    const hasUnavailable = (item.medications || []).some(m => m.drugStatus === 'not_available') && !hasTransferred;
    const pm = item.pharmacyStatus ? (PHARMACY_STATUS_META[item.pharmacyStatus] || null) : null;
    return (
      <TouchableOpacity activeOpacity={0.92} onPress={() => { setShowRxAll(false); setViewingRx(item); }} style={[styles.rxCard, { borderLeftWidth: 3, borderLeftColor: sm.border }]}>
        <View style={styles.rxHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rxPatient}>{item.patientName || 'Patient'}</Text>
            <Text style={styles.rxDiagnosis}>{item.diagnosis}</Text>
            {item.branchName ? (
              <Text style={styles.rxPharmacy}>🏥 {item.branchName}</Text>
            ) : item.openToAll && !item.pharmacyId ? (
              <Text style={[styles.rxPharmacy, { color: '#0369a1' }]}>🌐 Open to all pharmacies</Text>
            ) : null}
            {item.lifecycleStatus === 'CANCELLED' ? <Text style={{ fontSize: 11, color: '#be123c', fontWeight: '700', marginTop: 2 }}>Cancelled</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <View style={[styles.statusBadgeActive, { backgroundColor: sm.bg, borderColor: sm.border }]}>
              <Text style={[styles.statusBadgeActiveText, { color: sm.text }]}>{sm.label}</Text>
            </View>
            <View style={styles.rxActions}>
              {/* Delivered prescriptions are locked, as on web. */}
              <TouchableOpacity onPress={() => openEdit(item)} style={[styles.actionIcon, isRxDelivered(item) && { opacity: 0.35 }]} disabled={isRxDelivered(item)} accessibilityLabel="Edit">
                <Ionicons name="pencil-outline" size={17} color={DoctorColors.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => shareRx(item)} style={styles.actionIcon} accessibilityLabel="Print or share">
                <Ionicons name="print-outline" size={17} color="#475569" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={[styles.actionIcon, isRxDelivered(item) && { opacity: 0.35 }]} disabled={isRxDelivered(item)} accessibilityLabel="Delete">
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

        {/* Clinical-impact note awaiting this doctor; delivery is blocked until ruled on */}
        {hasPendingNotes && (
          <TouchableOpacity style={styles.noteAlert} onPress={() => { setShowRxAll(false); setViewingRx(item); }}>
            <Text style={styles.noteAlertText}>📝 Pharmacy clinical note needs your approval — Tap to review</Text>
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
                      {m.name} → {m.alternativeSuggested} · Approved · {m.approvedByDoctorName || item.doctorName || 'Psychiatrist'}
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
        <FlatList showsVerticalScrollIndicator={false}
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRx}
          contentContainerStyle={{ padding: 16, paddingTop: 4 }}
          ListHeaderComponent={(
            <View style={{ marginBottom: 12, gap: 10 }}>
              <View>
                <Text style={styles.pageTitle}>Prescriptions</Text>
                <Text style={styles.pageSub}>Prescriptions for your psychiatry clients</Text>
              </View>
              {altPendingCount > 0 ? (
                <View style={styles.altBanner}>
                  <Text style={{ fontSize: 18 }}>🔁</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.altBannerTitle}>{altPendingCount} alternative drug suggestion{altPendingCount > 1 ? 's' : ''} awaiting your approval</Text>
                    <Text style={styles.altBannerSub}>A pharmacy has suggested replacement drugs for one or more prescriptions.</Text>
                  </View>
                  <TouchableOpacity style={styles.altBannerBtn} onPress={() => {
                    const rx = prescriptions.find(r => (r.medications || []).some(m => m.drugStatus === 'alternative_suggested'));
                    if (rx) setAltApprovalRx(rx);
                  }}>
                    <Text style={styles.altBannerBtnText}>Review now</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {STATUS_FILTERS.map(f => (
                  <TouchableOpacity key={f} onPress={() => setStatusFilter(f)} style={[styles.filterChip, statusFilter === f && styles.filterChipOn]}>
                    <Text style={[styles.filterChipText, statusFilter === f && { color: '#fff' }]}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.listCount}>Prescriptions ({filtered.length})</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="medkit-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>{search || statusFilter !== 'all' ? 'No prescriptions match' : 'No prescriptions yet'}</Text>
              {!search && statusFilter === 'all' ? <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Tap "New Rx" to create one.</Text> : null}
            </View>
          }
        />
      )}

      {/* Alternative Drug Approval Modal */}
      <Modal visible={!!altApprovalRx} animationType="slide" transparent onRequestClose={() => setAltApprovalRx(null)}>
        <KeyboardAvoidingView
        style={styles.altModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!viewingRx} animationType="slide" transparent onRequestClose={() => setViewingRx(null)}>
        <KeyboardAvoidingView
        style={styles.altModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={[styles.altModalCard, { maxHeight: '88%' }]}>
            <View style={styles.altModalHeader}>
              <Text style={styles.altModalTitle}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setViewingRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {viewingRx && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.altModalSub}>{viewingRx.patientName || 'Patient'} · {viewingRx.diagnosis || '—'}</Text>
                <Text style={[styles.altOriginalLabel, { marginBottom: 8 }]}>Date: {viewingRx.date || '—'} {viewingRx.prescriptionRef ? `· ${viewingRx.prescriptionRef}` : ''}</Text>
                {showRxAll && (
                  <View style={styles.rxAllBox}>
                    {[
                      ['Status', viewingRx.status],
                      ['Follow-up', viewingRx.followUpDate],
                      ['Pharmacy', viewingRx.pharmacyName],
                      ['Branch', viewingRx.branchName],
                      ['Reference', viewingRx.prescriptionRef],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <View key={k} style={styles.rxAllRow}>
                        <Text style={styles.rxAllKey}>{k}</Text>
                        <Text style={styles.rxAllVal}>{String(v)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {(viewingRx.medications || []).map((m, i) => (
                  <View key={i} style={styles.altMedCard}>
                    <Text style={styles.altOriginalName}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</Text>
                    <Text style={styles.altOriginalLabel}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</Text>
                    {showRxAll && (
                      <View style={{ marginTop: 6, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 6 }}>
                        {[
                          ['Strength', m.strength],
                          ['Form', m.drugForm],
                          ['Dosage', m.dosage],
                          ['Frequency', m.frequency],
                          ['Direction', m.direction],
                          ['Duration', m.duration ? `${m.duration} ${m.durationUnit || ''}`.trim() : ''],
                          ['Special instructions', m.specialInstructions],
                          ['PRN indication', m.prn?.indication],
                          ['PRN max/day', m.prn?.maxPerDay],
                          ['PRN interval', m.prn?.interval],
                          ['Refill allowed', m.refill ? (m.refill.allowed ? 'Yes' : 'No') : ''],
                          ['Refill count', m.refill?.count],
                          ['Refill expiry', m.refill?.expiryDate],
                          ['Schedule', Array.isArray(m.schedule) && m.schedule.length ? m.schedule.join(', ') : ''],
                          ['Drug status', m.drugStatus],
                        ].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '').map(([k, v]) => (
                          <View key={k} style={styles.rxAllRow}>
                            <Text style={styles.rxAllKey}>{k}</Text>
                            <Text style={styles.rxAllVal}>{String(v)}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {m.alternativeSuggested ? (
                      <Text style={{ marginTop: 4, fontSize: 12, color: m.drugStatus === 'approved_replacement' ? '#16a34a' : '#7c3aed', fontWeight: '700' }}>
                        🔁 {m.alternativeSuggested} · {m.drugStatus === 'approved_replacement'
                          ? `Approved · ${m.approvedByDoctorName || viewingRx.doctorName || 'Psychiatrist'}`
                          : 'Waiting for Approval from your Doctor'}
                        {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                      </Text>
                    ) : null}
                    {m.drugStatus === 'transferred' && m.transferBranchName ? (
                      <Text style={{ marginTop: 4, fontSize: 12, color: '#0369a1', fontWeight: '700' }}>
                        This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                      </Text>
                    ) : null}
                    {(Array.isArray(m.pharmacyNotes) ? m.pharmacyNotes : []).map((n, ni) => {
                      const pending = n?.requiresDoctorApproval && (n.approvalStatus || 'pending_doctor') === 'pending_doctor';
                      return (
                        <View key={ni} style={styles.rxNoteBox}>
                          <Text style={styles.rxNoteLabel}>{n.label || n.type || 'Pharmacy note'}</Text>
                          <Text style={styles.rxNoteText}>{n.note}</Text>
                          <Text style={[styles.rxNoteStatus, {
                            color: !n.requiresDoctorApproval ? '#64748b'
                              : n.approvalStatus === 'approved' ? '#16a34a'
                              : n.approvalStatus === 'rejected' ? '#dc2626' : '#d97706',
                          }]}>
                            {!n.requiresDoctorApproval ? 'Operational'
                              : n.approvalStatus === 'approved' ? `Approved${n.approvedByDoctorName ? ` · ${n.approvedByDoctorName}` : ''}`
                              : n.approvalStatus === 'rejected' ? `Rejected${n.approvedByDoctorName ? ` · ${n.approvedByDoctorName}` : ''}`
                              : 'Pending your approval — the pharmacy cannot deliver this drug yet'}
                          </Text>
                          {pending && (
                            <View style={styles.altActions}>
                              <TouchableOpacity
                                style={[styles.altBtn, styles.altBtnApprove, altSaving && { opacity: 0.5 }]}
                                disabled={altSaving}
                                onPress={() => setPharmacyNoteApproval(viewingRx, i, ni, 'approved')}
                              >
                                <Text style={styles.altBtnText}>{altSaving ? '…' : '✅ Approve'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.altBtn, styles.altBtnReject, altSaving && { opacity: 0.5 }]}
                                disabled={altSaving}
                                onPress={() => setPharmacyNoteApproval(viewingRx, i, ni, 'rejected')}
                              >
                                <Text style={[styles.altBtnText, { color: '#dc2626' }]}>{altSaving ? '…' : '❌ Reject'}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
                {viewingRx.instructions ? <Text style={[styles.altOriginalLabel, { marginTop: 8 }]}>Instructions: {viewingRx.instructions}</Text> : null}
                {/* QR / collection code, dispensing so far, new code, cancel. */}
                <PrescriptionCodeCardMobile prescription={viewingRx} canManage onChanged={() => { setViewingRx(null); loadAll(); }} />
              </ScrollView>
            )}
            <TouchableOpacity style={styles.rxViewAllBtn} onPress={() => setShowRxAll(v => !v)} activeOpacity={0.85}>
              <Ionicons name={showRxAll ? 'chevron-up' : 'list'} size={16} color={DoctorColors.primary} />
              <Text style={styles.rxViewAllText}>{showRxAll ? 'Hide details' : 'View all'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!reassignRx} animationType="slide" transparent onRequestClose={() => setReassignRx(null)}>
        <KeyboardAvoidingView
        style={styles.altModalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }}>
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
        </KeyboardAvoidingView>
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

            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {/* Patient */}
              {!editing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Client *</Text>
                  <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
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
                  {!form.patientId && <Text style={styles.hint}>Select a client above</Text>}
                </View>
              )}

              {/* Formulary-backed drafting and checks; added orders land in this
                  form for the doctor to edit and save. */}
              <PrescriptionAssistCard
                patientId={form.patientId}
                medications={form.medications}
                allergies={patientAllergies}
                accent={DoctorColors.primary}
                onAddOrders={(orders, patientText) => setForm((prev) => ({
                  ...prev,
                  medications: [
                    ...prev.medications.filter((m) => m.name && m.name.trim()),
                    ...orders.map((o) => ({ ...EMPTY_MED, ...o, schedule: o.frequency ? autoSchedule(o.frequency) : [] })),
                  ],
                  instructions: prev.instructions || patientText || '',
                }))}
              />

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
                <Text style={styles.fieldLabel}>E-Pharmacy</Text>
                {/* Specific pharmacy (default) or open to every onboarded NessaHub pharmacy.
                    Locked once a pharmacy has taken an open prescription. */}
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  {[[false, 'Specific pharmacy'], [true, 'Open to all pharmacies']].map(([value, label]) => {
                    const active = !!form.openToAll === value;
                    const locked = !!editing?.claimedAt;
                    return (
                      <TouchableOpacity key={label} disabled={locked}
                        onPress={() => setForm(p => ({ ...p, openToAll: value, ...(value ? { pharmacyId: '', pharmacyName: '', branchId: '', branchName: '' } : {}) }))}
                        style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', borderWidth: active ? 2 : 1.5,
                          borderColor: active ? '#0369a1' : '#bae6fd', backgroundColor: active ? '#e0f2fe' : '#fff', opacity: locked ? 0.6 : 1 }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: active ? '#0c4a6e' : '#64748b' }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {editing?.claimedAt ? (
                  <Text style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>
                    Taken by {editing.branchName || editing.pharmacyName || 'a pharmacy'} — this can no longer be changed.
                  </Text>
                ) : null}
                {form.openToAll ? (
                  <Text style={{ fontSize: 12, color: '#0369a1' }}>
                    Every approved NessaHub pharmacy will see this prescription. The first to take it prepares it; if it does not confirm in time, it is offered to the others again.
                  </Text>
                ) : (
                <>
                <Text style={[styles.fieldLabel, { fontSize: 12 }]}>Branch (optional)</Text>
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
                    {form.patientId ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#f0f9ff' }}>
                        <Text style={{ fontSize: 12, color: '#0c4a6e', flex: 1 }}>
                          {showAllBranches ? 'Showing all pharmacies' : `Showing ${patientFirstName}'s pharmacies`}{patientPh.anchor ? ' · nearest first' : ''}
                        </Text>
                        <TouchableOpacity onPress={() => setShowAllBranches(v => !v)} hitSlop={8}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: DoctorColors.primary }}>{showAllBranches ? `Only ${patientFirstName}'s` : 'Show all'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                    {branchOptions.length === 0 && !loadingBranchDirectory && (
                      <Text style={[styles.pickerItemText, { padding: 12, color: '#64748b' }]}>
                        {form.patientId && !showAllBranches
                          ? `${patientFirstName} has not saved a pharmacy yet. Choose "Open to all pharmacies" above, or tap Show all.`
                          : 'No active branches found.'}
                      </Text>
                    )}
                    {branchOptions.map(row => (
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
                        {!!(row.addressLine || row.distanceKm != null) && (
                          <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                            {[row.distanceKm != null ? formatDistanceKm(row.distanceKm) : null, row.addressLine].filter(Boolean).join(' · ')}
                          </Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                </>
                )}
              </View>

              {/* Insurance cover, cheaper same-ingredient options, diagnosis fit. */}
              {!editing && <RxInsurancePickerMobile patientId={form.patientId} value={rxCardId} onChange={setRxCardId} accent={'#5046bd'} />}
              <RxAdviceMobile patientId={form.patientId} patientName={form.patientName} medications={form.medications} diagnosis={form.diagnosis} accent={'#5046bd'}
                onSwitch={(i, name, strength) => i >= 0 && setForm(p => ({ ...p, medications: p.medications.map((m, j) => (j === i ? { ...m, name, strength: strength || m.strength } : m)) }))} />
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
                          placeholder="Instructions for client..." placeholderTextColor="#94a3b8"
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

                    {/* Quantity to supply */}
                    <View style={[styles.medFieldRow, { gap: 8 }]}>
                      <TextInput style={[styles.input, { flex: 1 }]} keyboardType="numeric" placeholder="Quantity (e.g. 30)"
                        placeholderTextColor="#94a3b8" value={String(med.quantity || '')} onChangeText={v => updateMed(i, 'quantity', v)} />
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Unit (tablets)" placeholderTextColor="#94a3b8"
                        value={med.quantityUnit || ''} onChangeText={v => updateMed(i, 'quantityUnit', v)} />
                    </View>

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
                  placeholder="Overall instructions for client..."
                  placeholderTextColor="#94a3b8"
                  value={form.instructions}
                  onChangeText={v => setForm(p => ({ ...p, instructions: v }))}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
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
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  pageSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  altBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fdf4ff', borderWidth: 1.5, borderColor: '#e9d5ff', borderRadius: 12, padding: 12 },
  altBannerTitle: { fontSize: 13, fontWeight: '800', color: '#7c3aed' },
  altBannerSub: { fontSize: 12, color: '#6d28d9', marginTop: 2 },
  altBannerBtn: { backgroundColor: '#7c3aed', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  altBannerBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  filterChip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#fff' },
  filterChipOn: { backgroundColor: DoctorColors.primary, borderColor: DoctorColors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  listCount: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 2 },
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

  // Pharmacy clinical-impact notes
  noteAlert: {
    backgroundColor: '#fffbeb', borderRadius: 8, padding: 8, marginBottom: 8,
    borderWidth: 1, borderColor: '#fde68a',
  },
  noteAlertText: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  rxNoteBox: {
    marginTop: 8, backgroundColor: '#f8fafc', borderRadius: 8,
    borderWidth: 1, borderColor: '#e2e8f0', padding: 8,
  },
  rxNoteLabel: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3 },
  rxNoteText: { fontSize: 13, color: DoctorColors.text, marginTop: 2 },
  rxNoteStatus: { fontSize: 11, fontWeight: '700', marginTop: 3 },

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
  rxAllBox: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#eef2f7', padding: 10, marginBottom: 10 },
  rxAllRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: 12 },
  rxAllKey: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', flexShrink: 0 },
  rxAllVal: { fontSize: 13, color: '#334155', flex: 1, textAlign: 'right' },
  rxViewAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: DoctorColors.primary },
  rxViewAllText: { fontSize: 14, fontWeight: '700', color: DoctorColors.primary },
  altArrow: { fontSize: 12, color: '#7c3aed', fontWeight: '700', marginVertical: 6 },
  altSuggestedName: { fontSize: 15, fontWeight: '700', color: '#7c3aed', marginBottom: 12 },
  altActions: { flexDirection: 'row', gap: 10 },
  altBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1.5 },
  altBtnApprove: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  altBtnReject: { backgroundColor: '#fff1f2', borderColor: '#fecaca' },
  altBtnText: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
});
