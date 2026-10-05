import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import RecordGapsCard from '../../components/RecordGapsCard';
import SmartDocumentCard from '../../components/SmartDocumentCard';
import CodingAssistCard from '../../components/CodingAssistCard';
import { DoctorColors } from '../../constants/colors';
import { patientPharmacyKey, removePatientPharmacyByKey } from '../../utils/patientPharmacyDedupe';
import { formatDate, formatDateTime, toDateSafe } from '../../utils/dateDisplay';

const TODAY = new Date().toISOString().split('T')[0];
const TABS = ['Overview', 'Appointments', 'Notes', 'Prescriptions', 'E-Pharmacy', 'Patient Info', 'Daily Feeling'];

const NOTE_TYPES = [
  { value: 'consultation', label: 'Consultation', color: '#1e6bb8', bg: '#dbeafe' },
  { value: 'followup',     label: 'Follow-up',    color: '#7c3aed', bg: '#ede9fe' },
  { value: 'prescription', label: 'Prescription', color: '#059669', bg: '#d1fae5' },
  { value: 'referral',     label: 'Referral',     color: '#d97706', bg: '#fef3c7' },
  { value: 'discharge',    label: 'Discharge',    color: '#dc2626', bg: '#fee2e2' },
  { value: 'general',      label: 'General',      color: '#64748b', bg: '#f1f5f9' },
];

const STATUS_COLORS = {
  pending:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  confirmed: { bg: '#f0fdf4', border: '#86efac', text: '#0f5628' },
  completed: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  cancelled: { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },
};

const PHARMACY_STATUS_META = {
  sent: { label: 'Sent to Pharmacy', color: '#1d4ed8', bg: '#eff6ff' },
  accepted: { label: 'Processing', color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partially Filled', color: '#d97706', bg: '#fffbeb' },
  ready: { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
  delivered: { label: 'Delivered', color: '#475569', bg: '#f8fafc' },
};

function getTypeMeta(type) { return NOTE_TYPES.find(t => t.value === type) || NOTE_TYPES[5]; }
function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function RestrictedBanner({ section }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: '#fecaca' }}>
        <Ionicons name="lock-closed" size={28} color="#dc2626" />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 8 }}>Access Restricted</Text>
      <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 }}>
        This patient has restricted doctor access to their {section}.{'\n'}This data is hidden based on their privacy settings.
      </Text>
    </View>
  );
}


// A health record's attachments are NOT a single `fileUrl`. The patient's Health
// Records form uploads one file per selected document type and stores them under
// `radiologyFiles: { "MRI": {fileUrl, fileName}, … }`, leaving the flat `fileUrl` an
// empty string — which is why the doctor had no way to download them here.
function recordFiles(rec) {
  if (!rec) return [];
  const out = [];
  const push = (label, url, name) => {
    if (!url || typeof url !== 'string' || !url.trim()) return;
    if (out.some(f => f.url === url)) return;
    out.push({ label: label || name || 'Attachment', url, name: name || label || 'file' });
  };
  const bag = rec.radiologyFiles && typeof rec.radiologyFiles === 'object' ? rec.radiologyFiles : {};
  Object.entries(bag).forEach(([label, v]) => {
    if (!v) return;
    if (typeof v === 'string') push(label, v, label);
    else push(label, v.fileUrl || v.url, v.fileName || v.name);
  });
  push(rec.fileName || 'Attachment', rec.fileUrl || rec.url, rec.fileName);
  return out;
}

// The form stores the selected document types as `types` (an array); the singular
// `type` the row rendered does not exist on the record.
function recordTypes(rec) {
  if (!rec) return [];
  if (Array.isArray(rec.types)) return rec.types.filter(Boolean);
  if (typeof rec.types === 'string' && rec.types.trim()) return [rec.types.trim()];
  if (rec.type) return [rec.type];
  return [];
}

/** Latest vitals live in `vitalsLatestJson` (JSON string); tolerate legacy shapes. */
function pickLatestVitals(pd) {
  if (!pd || typeof pd !== 'object') return null;
  if (typeof pd.vitalsLatestJson === 'string' && pd.vitalsLatestJson.trim()) {
    try {
      const parsed = JSON.parse(pd.vitalsLatestJson);
      if (parsed && typeof parsed === 'object') return parsed.latest || parsed;
    } catch { /* fall through */ }
  }
  const nested = pd.vitals?.latest;
  if (nested && typeof nested === 'object') return nested;
  const legacy = pd.latestVitals;
  if (legacy && typeof legacy === 'object') return legacy.latest || legacy;
  return null;
}

export default function DoctorPatientDetailScreen({ route, navigation }) {
  // patientEmail is carried from the list so the header still shows it when the
  // patient has no profile row (GET /api/v1/patients/{id} answers 400 for those).
  const { patientId, patientName, patientEmail } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');

  const [patient, setPatient] = useState({ id: patientId, name: patientName || 'Patient' });
  const [patientProfile, setPatientProfile] = useState(null);
  const [latestVitals, setLatestVitals] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [removingPharmacyKey, setRemovingPharmacyKey] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);
  const [viewingRecord, setViewingRecord] = useState(null);
  const [dailyFeelings, setDailyFeelings] = useState([]);
  const [intakeData, setIntakeData] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);

  // Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ type: 'consultation', title: '', content: '' });
  const [savingNote, setSavingNote] = useState(false);

  // Note reading popup
  const [viewingNote, setViewingNote] = useState(null);
  const [viewingRx, setViewingRx] = useState(null);

  // Daily feeling detail popup
  const [viewingFeeling, setViewingFeeling] = useState(null);

  // Reschedule
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleAppt, setRescheduleAppt] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduling, setRescheduling] = useState(false);

  // Discharge
  const [showDischarge, setShowDischarge] = useState(false);
  const [dischargeReason, setDischargeReason] = useState('');
  const [discharging, setDischarging] = useState(false);

  // Patient status management
  const [patientStatus, setPatientStatus] = useState('active');
  const [changingStatus, setChangingStatus] = useState(false);

  // Data sharing permissions (from patient's privacy settings)
  const [dataSharing, setDataSharing] = useState({});

  // Self-discharge requests submitted by the patient
  const [selfDischargeRequest, setSelfDischargeRequest] = useState(null);

  useEffect(() => { loadAll(); }, [patientId]);

  const fetchPrescriptions = async (uid) => {
    const doctorId = uid || await getStoredUserId();
    if (!doctorId || !patientId) return;
    api(`/api/v1/medical/prescriptions/doctor/${doctorId}`).then(rxRaw => {
      const list = (rxRaw || []).filter(r => r.patientId === patientId || r.clientId === patientId);
      setPrescriptions(list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    }).catch(() => {});
  };

  useEffect(() => {
    if (activeTab !== 'Prescriptions' || !patientId) return;
    fetchPrescriptions();
  }, [activeTab, patientId]);

  useFocusEffect(useCallback(() => {
    if (!patientId) return;
    fetchPrescriptions();
  }, [patientId]));

  const loadAll = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid || !patientId) return;

      const dp = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      setDoctorProfile(dp ? { id: uid, ...dp } : { id: uid, name: 'Doctor' });

      const patData = await api(`/api/v1/patients/${patientId}`).catch(() => null);
      if (patData) {
        setPatient({
          id: patientId,
          name: patData.name || patData.displayName || patientName || 'Patient',
          email: patData.email || patientEmail || '',
          bloodType: patData.bloodType || '',
          allergies: patData.allergies || '',
          dob: patData.dob || '',
          phone: patData.phone || '',
        });
        setPatientProfile(patData);
        setHealthRecords(patData.healthRecords || []);
        // Latest reading lives in `vitalsLatestJson` (a JSON string); reading
        // `vitals.latest` alone always yielded null, so the vitals card showed
        // "No vitals recorded yet" for patients who had them.
        setLatestVitals(pickLatestVitals(patData));
        setPharmacies(patData.pharmacies || []);
        setPatientStatus(patData.status || 'active');
        setDataSharing(patData.privacy?.dataSharing || {});
      }

      // The endpoint returns { patientId, intakeJson: "<json string>", updatedAt } —
      // the answers live inside intakeJson. Reading complaint/duration/severity/
      // symptoms straight off the response meant the intake panel was always blank.
      const intakeRaw = await api(`/api/v1/patients/${patientId}/medical-intake`).catch(() => null);
      if (intakeRaw) {
        let parsed = {};
        if (typeof intakeRaw.intakeJson === 'string' && intakeRaw.intakeJson.trim()) {
          try { parsed = JSON.parse(intakeRaw.intakeJson) || {}; } catch { parsed = {}; }
        } else if (intakeRaw.intakeJson && typeof intakeRaw.intakeJson === 'object') {
          parsed = intakeRaw.intakeJson;
        }
        // `submittedAt` is rendered as a Firestore-style { seconds } value.
        const stamp = parsed.submittedAt || intakeRaw.updatedAt;
        const submittedAt = stamp && !stamp.seconds
          ? { seconds: Math.floor(new Date(stamp).getTime() / 1000) }
          : stamp;
        setIntakeData({ ...intakeRaw, ...parsed, submittedAt });
      }

      const disRequests = await api(`/api/v1/patients/${patientId}/discharge-requests`).catch(() => []) || [];
      if (disRequests.length > 0) {
        setSelfDischargeRequest(disRequests.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0))[0]);
      }

      const feelings = await api(`/api/v1/patients/${patientId}/daily-feelings`).catch(() => []) || [];
      setDailyFeelings(feelings.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));

      const allAppts = await api(`/api/v1/medical/appointments/doctor/${uid}`).catch(() => []) || [];
      setAppointments(allAppts.filter(a => a.clientId === patientId).sort((a, b) => (b.date || '').localeCompare(a.date || '')));

      const notesList = await api(`/api/v1/doctor-notes?doctorId=${uid}&patientId=${patientId}`).catch(() => []) || [];
      setNotes(notesList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));

      await fetchPrescriptions(uid);
    } catch (err) {
      console.error('DoctorPatientDetail load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const totalVisits = appointments.length;
  const completedCount = appointments.filter(a => a.status === 'completed').length;
  const upcomingCount = appointments.filter(a => a.date >= TODAY && a.status !== 'cancelled').length;

  // Save Note
  const saveNote = async () => {
    if (!noteForm.title.trim()) { Alert.alert('Validation', 'Title is required.'); return; }
    if (!noteForm.content.trim()) { Alert.alert('Validation', 'Content is required.'); return; }
    setSavingNote(true);
    try {
      const uid = await getStoredUserId();
      const newNote = await api('/api/v1/doctor-notes', {
        method: 'POST',
        body: { doctorId: uid, doctorName: doctorProfile?.name || 'Doctor', patientId, patientName: patient.name, title: noteForm.title.trim(), content: noteForm.content.trim(), type: noteForm.type },
      });
      setNotes(prev => [{ id: newNote?.id, ...noteForm, patientName: patient.name, patientId }, ...prev]);
      setShowNoteForm(false);
      setNoteForm({ type: 'consultation', title: '', content: '' });
    } catch {
      Alert.alert('Error', 'Could not save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const deleteNote = (noteId) => {
    Alert.alert('Delete Note', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api(`/api/v1/doctor-notes/${noteId}`, { method: 'DELETE' });
          setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch { Alert.alert('Error', 'Could not delete note.'); }
      }},
    ]);
  };

  const removePatientPharmacyEntry = async (ph) => {
    const rk = patientPharmacyKey(ph) || ph.id || ph.name || '';
    setRemovingPharmacyKey(rk);
    try {
      const updated = removePatientPharmacyByKey(pharmacies, ph);
      await api(`/api/v1/patients/${patientId}`, { method: 'PATCH', body: { pharmacies: updated } });
      setPharmacies(updated);
    } catch {
      Alert.alert('Error', 'Could not remove pharmacy.');
    } finally {
      setRemovingPharmacyKey(null);
    }
  };

  const openFullPrescriptionForm = () => {
    navigation.navigate('DoctorMain', {
      screen: 'DoctorPrescriptions',
      params: {
        openRxForm: true,
        presetPatientId: patientId,
        presetPatientName: patient.name,
      },
    });
  };

  // Discharge
  const confirmDischarge = async () => {
    if (!dischargeReason.trim()) { Alert.alert('Validation', 'Discharge reason is required.'); return; }
    setDischarging(true);
    try {
      const uid = await getStoredUserId();
      await api('/api/v1/doctor-notes', {
        method: 'POST',
        body: { doctorId: uid, doctorName: doctorProfile?.name || 'Doctor', patientId, patientName: patient.name, type: 'discharge', title: 'Patient Discharged', content: dischargeReason.trim() },
      });
      for (const appt of appointments) {
        if (appt.status === 'pending' || appt.status === 'confirmed') {
          await api(`/api/v1/medical/appointments/${appt.id}`, { method: 'PATCH', body: { status: 'cancelled' } }).catch(() => {});
        }
      }
      Alert.alert('Done', `${patient.name} has been discharged.`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch {
      Alert.alert('Error', 'Could not complete discharge.');
    } finally {
      setDischarging(false);
      setShowDischarge(false);
    }
  };

  // Appointment status update
  const updateApptStatus = async (apptId, newStatus) => {
    try {
      await api(`/api/v1/medical/appointments/${apptId}`, { method: 'PATCH', body: { status: newStatus } });
      setAppointments(prev => prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a));
    } catch { Alert.alert('Error', 'Could not update appointment.'); }
  };

  const openReschedule = (appt) => {
    setRescheduleAppt(appt);
    setRescheduleDate(appt.date || '');
    setRescheduleTime(appt.time || '');
    setShowReschedule(true);
  };

  const doReschedule = async () => {
    if (!rescheduleDate.trim()) { Alert.alert('Validation', 'Please enter a date (YYYY-MM-DD).'); return; }
    setRescheduling(true);
    try {
      await api(`/api/v1/care/appointments/${rescheduleAppt.id}/reschedule`, {
        method: 'PATCH',
        body: { newDate: rescheduleDate.trim(), newTime: rescheduleTime.trim() || rescheduleAppt.time },
      });
      setAppointments(prev => prev.map(a =>
        a.id === rescheduleAppt.id
          ? { ...a, date: rescheduleDate.trim(), time: rescheduleTime.trim() || a.time, status: 'confirmed' }
          : a
      ));
      setShowReschedule(false);
      Alert.alert('Rescheduled', 'Appointment has been rescheduled and confirmed.');
    } catch { Alert.alert('Error', 'Could not reschedule appointment.'); }
    finally { setRescheduling(false); }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>;

  return (
    <View style={styles.container}>
      {/* Patient Header */}
      <View style={styles.patientHeader}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{getInitials(patient.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.patientName}>{patient.name}</Text>
          {patient.email ? <Text style={styles.patientEmail}>{patient.email}</Text> : null}
          {/* Patient Panel status badge */}
          <View style={{ flexDirection: 'row', marginTop: 4, gap: 6 }}>
            {(() => {
              const smap = { active: ['#f0fdf4','#0f5628'], inactive: ['#fff7ed','#c2410c'], discharged: ['#fef2f2','#b91c1c'] };
              const [bg, color] = smap[patientStatus] || smap.active;
              const label = patientStatus.charAt(0).toUpperCase() + patientStatus.slice(1);
              return <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}><Text style={{ fontSize: 11, fontWeight: '700', color }}>{label}</Text></View>;
            })()}
          </View>
        </View>
        {/* Status + Discharge buttons */}
        <View style={{ gap: 6, alignItems: 'flex-end' }}>
          <TouchableOpacity
            style={[styles.dischargeBtn, { backgroundColor: '#d1fae5', borderColor: '#6ee7b7' }]}
            onPress={() => navigation.navigate('DoctorPatientTimeline', { patientId, patientName: patient?.name })}
          >
            <Ionicons name="time-outline" size={14} color="#065f46" />
            <Text style={[styles.dischargeBtnText, { color: '#065f46' }]}>Timeline</Text>
          </TouchableOpacity>
          {patientStatus === 'active' && (
            <TouchableOpacity
              style={[styles.dischargeBtn, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
              disabled={changingStatus}
              onPress={() => {
                Alert.alert('Set Inactive', `Set ${patient.name} to Inactive?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Set Inactive', onPress: async () => {
                    setChangingStatus(true);
                    try {
                      await api(`/api/v1/patients/${patientId}`, { method: 'PATCH', body: { status: 'inactive' } });
                      setPatientStatus('inactive');
                    } catch { Alert.alert('Error', 'Could not update status.'); }
                    finally { setChangingStatus(false); }
                  }},
                ]);
              }}
            >
              <Ionicons name="pause-circle-outline" size={14} color="#c2410c" />
              <Text style={[styles.dischargeBtnText, { color: '#c2410c' }]}>{changingStatus ? '…' : 'Inactive'}</Text>
            </TouchableOpacity>
          )}
          {patientStatus === 'inactive' && (
            <TouchableOpacity
              style={[styles.dischargeBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
              disabled={changingStatus}
              onPress={() => {
                Alert.alert('Reactivate', `Set ${patient.name} back to Active?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Activate', onPress: async () => {
                    setChangingStatus(true);
                    try {
                      await api(`/api/v1/patients/${patientId}`, { method: 'PATCH', body: { status: 'active' } });
                      setPatientStatus('active');
                    } catch { Alert.alert('Error', 'Could not update status.'); }
                    finally { setChangingStatus(false); }
                  }},
                ]);
              }}
            >
              <Ionicons name="play-circle-outline" size={14} color="#15803d" />
              <Text style={[styles.dischargeBtnText, { color: '#0f5628' }]}>{changingStatus ? '…' : 'Activate'}</Text>
            </TouchableOpacity>
          )}
          {patientStatus === 'discharged' && (
            <TouchableOpacity
              style={[styles.dischargeBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
              disabled={changingStatus}
              onPress={() => {
                Alert.alert('Reactivate', `Reactivate ${patient.name} as Active?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reactivate', onPress: async () => {
                    setChangingStatus(true);
                    try {
                      await api(`/api/v1/patients/${patientId}`, { method: 'PATCH', body: { status: 'active' } });
                      setPatientStatus('active');
                    } catch { Alert.alert('Error', 'Could not update status.'); }
                    finally { setChangingStatus(false); }
                  }},
                ]);
              }}
            >
              <Ionicons name="refresh-circle-outline" size={14} color="#15803d" />
              <Text style={[styles.dischargeBtnText, { color: '#0f5628' }]}>{changingStatus ? '…' : 'Reactivate'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.dischargeBtn} onPress={() => setShowDischarge(true)}>
            <Ionicons name="exit-outline" size={14} color="#be123c" />
            <Text style={styles.dischargeBtnText}>Discharge</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { label: 'Total Visits',  value: totalVisits },
          { label: 'Completed',     value: completedCount },
          { label: 'Upcoming',      value: upcomingCount },
          { label: 'Notes',         value: notes.length },
          { label: 'Prescriptions', value: prescriptions.length },
        ].map((s, i) => (
          <View key={i} style={styles.statItem}>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tabItem, activeTab === t && styles.tabItemActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      <ScrollView style={styles.tabContent} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {/* ── OVERVIEW ── */}
        {activeTab === 'Overview' && (
          <>
            {/* What is missing, by rule; and a document to read, name-check and file. */}
            <RecordGapsCard patientId={patientId} />
            <SmartDocumentCard patientId={patientId} accent={DoctorColors.primary} />
            <CodingAssistCard patientId={patientId} accent={DoctorColors.primary} />
            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.qBtn} onPress={() => { setActiveTab('Notes'); setShowNoteForm(true); }}>
                <Ionicons name="document-text-outline" size={16} color={DoctorColors.primary} />
                <Text style={styles.qBtnText}>Add Note</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qBtn} onPress={openFullPrescriptionForm}>
                <Ionicons name="medkit-outline" size={16} color={DoctorColors.primary} />
                <Text style={styles.qBtnText}>Add Prescription</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Recent Appointments</Text>
            {appointments.slice(0, 4).map(a => {
              const sc = STATUS_COLORS[a.status] || STATUS_COLORS.pending;
              return (
                <View key={a.id} style={styles.miniCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniCardTitle}>{a.date} · {a.time || '—'}</Text>
                    <Text style={styles.miniCardSub}>{a.consultationType || 'Consultation'}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.badgeText, { color: sc.text }]}>{a.status}</Text>
                  </View>
                </View>
              );
            })}
            {appointments.length === 0 && <Text style={styles.emptyText}>No appointments yet</Text>}

            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Latest Notes</Text>
            {notes.slice(0, 3).map(n => {
              const tm = getTypeMeta(n.type);
              return (
                <TouchableOpacity key={n.id} style={[styles.miniCard, { borderLeftWidth: 3, borderLeftColor: tm.color }]} onPress={() => setViewingNote(n)} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.noteMetaRow}>
                      <View style={[styles.typeBadge, { backgroundColor: tm.bg }]}>
                        <Text style={[styles.typeText, { color: tm.color }]}>{tm.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.miniCardTitle}>{n.title}</Text>
                    <Text style={styles.miniCardSub} numberOfLines={2}>{n.content}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                </TouchableOpacity>
              );
            })}
            {notes.length === 0 && (
              <TouchableOpacity style={styles.emptyAction} onPress={() => { setActiveTab('Notes'); setShowNoteForm(true); }}>
                <Ionicons name="add-circle-outline" size={16} color={DoctorColors.primary} />
                <Text style={styles.emptyActionText}>Add First Note</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ── APPOINTMENTS ── */}
        {activeTab === 'Appointments' && (
          dataSharing.appointments === false ? <RestrictedBanner section="appointment history" /> : <>
            {appointments.length === 0 && <Text style={styles.emptyText}>No appointments with this patient yet</Text>}
            {appointments.map(appt => {
              const sc = STATUS_COLORS[appt.status] || STATUS_COLORS.pending;
              return (
                <View key={appt.id} style={styles.apptCard}>
                  <View style={styles.apptRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.apptDate}>{appt.date}  {appt.time || '—'}</Text>
                      <Text style={styles.apptType}>{appt.consultationType || 'Consultation'}{appt.reason ? ` · ${appt.reason}` : ''}</Text>
                    </View>
                    <View style={[styles.badge, { backgroundColor: sc.bg, borderColor: sc.border, borderWidth: 1 }]}>
                      <Text style={[styles.badgeText, { color: sc.text }]}>{appt.status}</Text>
                    </View>
                  </View>
                  <View style={styles.apptActions}>
                    {appt.status === 'pending' && (
                      <>
                        <TouchableOpacity style={[styles.apptBtn, { backgroundColor: '#f0fdf4' }]} onPress={() => updateApptStatus(appt.id, 'confirmed')}>
                          <Text style={{ color: '#0f5628', fontSize: 12, fontWeight: '700' }}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.apptBtn, { backgroundColor: '#fff1f2' }]} onPress={() => updateApptStatus(appt.id, 'cancelled')}>
                          <Text style={{ color: '#be123c', fontSize: 12, fontWeight: '700' }}>Reject</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {appt.status === 'confirmed' && (
                      <TouchableOpacity style={[styles.apptBtn, { backgroundColor: '#f1f5f9' }]} onPress={() => updateApptStatus(appt.id, 'completed')}>
                        <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700' }}>Mark Completed</Text>
                      </TouchableOpacity>
                    )}
                    {(appt.status === 'pending' || appt.status === 'confirmed') && (
                      <TouchableOpacity style={[styles.apptBtn, { backgroundColor: '#eff6ff' }]} onPress={() => openReschedule(appt)}>
                        <Text style={{ color: '#1e6bb8', fontSize: 12, fontWeight: '700' }}>Reschedule</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* ── NOTES ── */}
        {activeTab === 'Notes' && (
          <>
            <TouchableOpacity style={styles.addRowBtn} onPress={() => setShowNoteForm(v => !v)}>
              <Ionicons name={showNoteForm ? 'chevron-up-outline' : 'add-circle-outline'} size={18} color={DoctorColors.primary} />
              <Text style={styles.addRowBtnText}>{showNoteForm ? 'Close Form' : 'Add Note'}</Text>
            </TouchableOpacity>

            {showNoteForm && (
              <View style={styles.formCard}>
                <Text style={styles.formLabel}>Note Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {NOTE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.chip, noteForm.type === t.value && { backgroundColor: t.bg, borderColor: t.color }]}
                      onPress={() => setNoteForm(p => ({ ...p, type: t.value }))}
                    >
                      <Text style={[styles.chipText, noteForm.type === t.value && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <Text style={styles.formLabel}>Title *</Text>
                <TextInput style={styles.formInput} placeholder="Note title" placeholderTextColor="#94a3b8"
                  value={noteForm.title} onChangeText={v => setNoteForm(p => ({ ...p, title: v }))} />
                <Text style={styles.formLabel}>Content *</Text>
                <TextInput style={[styles.formInput, { height: 100, textAlignVertical: 'top' }]}
                  placeholder="Note content..." placeholderTextColor="#94a3b8"
                  value={noteForm.content} onChangeText={v => setNoteForm(p => ({ ...p, content: v }))}
                  multiline numberOfLines={4} />
                <TouchableOpacity style={[styles.saveBtn, savingNote && { opacity: 0.6 }]} onPress={saveNote} disabled={savingNote}>
                  {savingNote ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
                </TouchableOpacity>
              </View>
            )}

            {notes.length === 0 && <Text style={styles.emptyText}>No notes for this patient yet</Text>}
            {notes.map(n => {
              const tm = getTypeMeta(n.type);
              return (
                <TouchableOpacity key={n.id} style={[styles.noteCard, { borderLeftColor: tm.color }]} onPress={() => setViewingNote(n)} activeOpacity={0.8}>
                  <View style={styles.noteHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.typeBadge, { backgroundColor: tm.bg }]}>
                        <Text style={[styles.typeText, { color: tm.color }]}>{tm.label}</Text>
                      </View>
                      <Text style={styles.noteTitle}>{n.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => deleteNote(n.id)} style={{ padding: 4 }}>
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.noteContent} numberOfLines={3}>{n.content}</Text>
                  <Text style={styles.tapHint}>Tap to read full note</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── PRESCRIPTIONS ── */}
        {activeTab === 'Prescriptions' && (
          dataSharing.prescriptions === false ? <RestrictedBanner section="prescriptions" /> : <>
            <TouchableOpacity style={styles.addRowBtn} onPress={openFullPrescriptionForm}>
              <Ionicons name="add-circle-outline" size={18} color={DoctorColors.primary} />
              <Text style={styles.addRowBtnText}>New prescription (full form)</Text>
            </TouchableOpacity>

            {prescriptions.length === 0 && <Text style={styles.emptyText}>No prescriptions issued yet</Text>}
            {prescriptions.map(rx => {
              const isDone = rx.status === 'completed';
              const medName = rx.medication || rx.medications?.[0]?.name || 'Medication';
              const metaLine = [
                rx.dosage || rx.medications?.[0]?.dosage,
                rx.frequency || rx.medications?.[0]?.frequency,
                rx.duration || rx.medications?.[0]?.duration,
              ].filter(Boolean).join(' · ');
              const pm = rx.pharmacyStatus ? (PHARMACY_STATUS_META[rx.pharmacyStatus] || null) : null;
              const altMed = (rx.medications || []).find(m => m.alternativeSuggested);
              const transferredMed = (rx.medications || []).find(m => m.drugStatus === 'transferred' && m.transferBranchName);
              return (
                <TouchableOpacity key={rx.id} activeOpacity={0.92} onPress={() => setViewingRx(rx)} style={[styles.rxCard, isDone && { borderLeftWidth: 3, borderLeftColor: '#22c55e' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Text style={[styles.rxMed, { flex: 1 }]}>{medName}</Text>
                    {isDone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: '#bbf7d0', marginLeft: 8 }}>
                        <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>Completed</Text>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe', marginLeft: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>Active</Text>
                      </View>
                    )}
                  </View>
                  {metaLine ? <Text style={styles.rxMeta}>{metaLine}</Text> : null}
                  {pm ? (
                    <View style={[styles.pharmacyStatusPill, { backgroundColor: pm.bg }]}>
                      <Text style={[styles.pharmacyStatusPillText, { color: pm.color }]}>{pm.label}</Text>
                    </View>
                  ) : null}
                  {altMed ? (
                    <Text style={styles.rxApprovedAlt}>
                      🔁 {altMed.name || 'Original'} → {altMed.alternativeSuggested} · {altMed.drugStatus === 'approved_replacement' ? `Approved · Dr. ${altMed.approvedByDoctorName || rx.doctorName || 'Doctor'}` : 'Waiting for Approval from your Doctor'}
                      {altMed.alternativeRationale ? ` · Why: ${altMed.alternativeRationale}` : ''}
                    </Text>
                  ) : null}
                  {transferredMed ? (
                    <Text style={[styles.rxApprovedAlt, { color: '#0369a1' }]}>
                      This drug ({transferredMed.name || 'Drug'}) is transfered to branch ({transferredMed.transferBranchName}{transferredMed.transferBranchAddress ? `, ${transferredMed.transferBranchAddress}` : ''}).
                    </Text>
                  ) : null}
                  {rx.instructions ? <Text style={styles.rxInstructions}>{rx.instructions}</Text> : null}
                  {toDateSafe(rx.createdAt) ? (
                    <Text style={styles.rxDate}>
                      {toDateSafe(rx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  ) : null}
                  <Text style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>Tap card for full details</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── E-PHARMACY ── */}
        {activeTab === 'E-Pharmacy' && (
          <>
            <Text style={[styles.sectionTitle, { marginBottom: 12 }]}>Patient Pharmacies</Text>
            {pharmacies.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="storefront-outline" size={40} color="#cbd5e1" />
                <Text style={styles.emptyText}>Patient has no pharmacies added</Text>
              </View>
            ) : (
              pharmacies.map((ph, i) => {
                const phRowKey = patientPharmacyKey(ph) || ph.id || String(i);
                const addrLine = ph.address || ph.location;
                const phoneLine = ph.phone || ph.contact;
                return (
                <View key={phRowKey} style={[styles.miniCard, { borderLeftWidth: 3, borderLeftColor: '#7c3aed' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniCardTitle}>{ph.name}</Text>
                    {addrLine ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={12} color="#94a3b8" />
                        <Text style={styles.miniCardSub}>{addrLine}</Text>
                      </View>
                    ) : null}
                    {phoneLine ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="call-outline" size={12} color="#94a3b8" />
                        <Text style={styles.miniCardSub}>{phoneLine}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={{
                        backgroundColor: '#fef2f2',
                        borderRadius: 8,
                        padding: 8,
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        opacity: removingPharmacyKey === phRowKey ? 0.55 : 1,
                      }}
                      disabled={removingPharmacyKey === phRowKey}
                      onPress={() => {
                        Alert.alert('Remove pharmacy', `Remove ${ph.name || 'this pharmacy'} from this patient?`, [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Remove', style: 'destructive', onPress: () => removePatientPharmacyEntry(ph) },
                        ]);
                      }}
                    >
                      <Text style={{ color: '#dc2626', fontSize: 18, fontWeight: '800', lineHeight: 20 }}>−</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ backgroundColor: '#f5f3ff', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#ddd6fe' }}
                      onPress={() => {
                        if (prescriptions.length === 0) { Alert.alert('No Prescriptions', 'Issue a prescription first.'); return; }
                        Alert.alert('Send Prescription', `Send the latest prescription to ${ph.name}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Send', onPress: async () => {
                              const latestRx = prescriptions[0];
                              try {
                                await api(`/api/v1/medical/prescriptions/${latestRx.id}`, {
                                  method: 'PATCH',
                                  body: { pharmacy: { id: ph.name, name: ph.name, location: addrLine || '', contact: phoneLine || '' }, pharmacyStatus: 'sent' },
                                });
                                Alert.alert('Sent', `Prescription sent to ${ph.name}.`);
                              } catch { Alert.alert('Error', 'Could not send prescription.'); }
                            }
                          }
                        ]);
                      }}
                    >
                      <Ionicons name="send-outline" size={16} color="#7c3aed" />
                    </TouchableOpacity>
                  </View>
                </View>
              );})
            )}
            <View style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f3ff', borderRadius: 10, borderWidth: 1, borderColor: '#ddd6fe' }}>
              <Text style={{ fontSize: 12, color: '#7c3aed', fontWeight: '600' }}>
                Tap the send icon to forward the most recent prescription to a pharmacy.
              </Text>
            </View>
          </>
        )}

        {/* ── PATIENT INFO ── */}
        {activeTab === 'Patient Info' && (
          <>
            {/* Self-Discharge Request Alert */}
            {selfDischargeRequest && (
              <View style={{ backgroundColor: '#fff7ed', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#fed7aa' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Ionicons name="warning" size={18} color="#d97706" />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#92400e' }}>Patient Self-Discharge Request</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#78350f', marginBottom: 6, lineHeight: 19 }}>
                  <Text style={{ fontWeight: '700' }}>Reason: </Text>{selfDischargeRequest.reason || '—'}
                </Text>
                {selfDischargeRequest.message ? (
                  <Text style={{ fontSize: 12, color: '#92400e', marginBottom: 6 }}>{selfDischargeRequest.message}</Text>
                ) : null}
                {selfDischargeRequest.submittedAt?.seconds ? (
                  <Text style={{ fontSize: 11, color: '#b45309' }}>
                    Submitted: {new Date(selfDischargeRequest.submittedAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                ) : null}
              </View>
            )}

            {/* Health Info */}
            <Text style={styles.sectionTitle}>Health Information</Text>
            <View style={styles.infoCard}>
              {[
                { label: 'Blood Type', value: patient.bloodType },
                { label: 'Allergies',  value: patient.allergies },
                { label: 'Date of Birth', value: patient.dob },
                { label: 'Phone',      value: patient.phone },
              ].map((row, i) => (
                <View key={i} style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value || '—'}</Text>
                </View>
              ))}
            </View>

            {/* Latest Vitals */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Latest Vitals</Text>
            {latestVitals ? (
              <View style={[styles.infoCard, { borderLeftWidth: 3, borderLeftColor: '#dc2626' }]}>
                {latestVitals.recordedAt?.seconds && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Recorded</Text>
                    <Text style={[styles.infoValue, { fontSize: 11, color: '#94a3b8' }]}>
                      {new Date(latestVitals.recordedAt.seconds * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                )}
                {(latestVitals.bpSystolic || latestVitals.bpDiastolic) && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Blood Pressure</Text>
                    <Text style={styles.infoValue}>{latestVitals.bpSystolic || '—'} / {latestVitals.bpDiastolic || '—'} mmHg</Text>
                  </View>
                )}
                {latestVitals.heartRate && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Heart Rate</Text>
                    <Text style={styles.infoValue}>{latestVitals.heartRate} bpm</Text>
                  </View>
                )}
                {latestVitals.respiratoryRate && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Respiratory Rate</Text>
                    <Text style={styles.infoValue}>{latestVitals.respiratoryRate} breaths/min</Text>
                  </View>
                )}
                {latestVitals.spo2 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>SpO2</Text>
                    <Text style={styles.infoValue}>{latestVitals.spo2}%</Text>
                  </View>
                )}
                {latestVitals.temperature && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Temperature</Text>
                    <Text style={styles.infoValue}>{latestVitals.temperature} °{latestVitals.tempUnit || 'C'}</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.infoCard, { alignItems: 'center', paddingVertical: 20 }]}>
                <Ionicons name="pulse-outline" size={28} color="#cbd5e1" />
                <Text style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>No vitals recorded yet</Text>
              </View>
            )}

            {/* Insurance */}
            {patientProfile?.insurance && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Insurance Details</Text>
                <View style={styles.infoCard}>
                  {Object.entries(patientProfile.insurance).map(([k, v]) => (
                    <View key={k} style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</Text>
                      <Text style={styles.infoValue}>{v || '—'}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Emergency Contacts */}
            {(patientProfile?.emergencyContacts || []).length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Emergency Contacts</Text>
                {patientProfile.emergencyContacts.map((ec, i) => (
                  <View key={i} style={styles.infoCard}>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Name</Text><Text style={styles.infoValue}>{ec.name}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Relationship</Text><Text style={styles.infoValue}>{ec.relationship}</Text></View>
                    <View style={styles.infoRow}><Text style={styles.infoLabel}>Phone</Text><Text style={styles.infoValue}>{ec.phone}</Text></View>
                    {ec.email && <View style={styles.infoRow}><Text style={styles.infoLabel}>Email</Text><Text style={styles.infoValue}>{ec.email}</Text></View>}
                  </View>
                ))}
              </>
            )}

            {/* Initial complaint / intake data */}
            {intakeData && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Initial Complaint</Text>
                <View style={styles.infoCard}>
                  {intakeData.complaint && <View style={styles.infoRow}><Text style={styles.infoLabel}>Complaint</Text><Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]}>{intakeData.complaint}</Text></View>}
                  {intakeData.duration && <View style={styles.infoRow}><Text style={styles.infoLabel}>Duration</Text><Text style={styles.infoValue}>{intakeData.duration}</Text></View>}
                  {intakeData.severity && <View style={styles.infoRow}><Text style={styles.infoLabel}>Severity</Text><Text style={styles.infoValue}>{intakeData.severity}</Text></View>}
                  {intakeData.symptoms && <View style={styles.infoRow}><Text style={styles.infoLabel}>Symptoms</Text><Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }]}>{Array.isArray(intakeData.symptoms) ? intakeData.symptoms.join(', ') : intakeData.symptoms}</Text></View>}
                  {intakeData.submittedAt?.seconds && <View style={styles.infoRow}><Text style={styles.infoLabel}>Reported on</Text><Text style={styles.infoValue}>{new Date(intakeData.submittedAt.seconds * 1000).toLocaleDateString()}</Text></View>}
                </View>
              </>
            )}

            {/* Health Records / Medical Files */}
            {dataSharing.records === false ? (
              <View style={{ marginTop: 16, backgroundColor: '#fef2f2', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#fecaca', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="lock-closed" size={16} color="#dc2626" />
                <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '600', flex: 1 }}>Health records are restricted by this patient's privacy settings.</Text>
              </View>
            ) : healthRecords.length > 0 ? (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Health Records & Medical Files</Text>
                {healthRecords.map((rec, i) => {
                  const recTypes = recordTypes(rec);
                  const files = recordFiles(rec);
                  return (
                  <TouchableOpacity
                    key={i}
                    activeOpacity={0.7}
                    onPress={() => setViewingRecord(rec)}
                    style={[styles.infoCard, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }]}
                  >
                    <View style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: DoctorColors.primaryLight, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="document-outline" size={18} color={DoctorColors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DoctorColors.text }}>{rec.name || recTypes[0] || 'Record'}</Text>
                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{recTypes.join(', ')}{rec.date ? '  ·  ' + rec.date : ''}</Text>
                      {rec.notes ? <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} numberOfLines={1}>{rec.notes}</Text> : null}
                      {files.length > 0 ? (
                        <Text style={{ fontSize: 11, color: DoctorColors.primary, marginTop: 3, fontWeight: '700' }}>
                          {files.length} file{files.length > 1 ? 's' : ''} · tap to view
                        </Text>
                      ) : null}
                    </View>
                    {files.length === 1 ? (
                      <TouchableOpacity
                        style={{ padding: 8, backgroundColor: DoctorColors.primaryLight, borderRadius: 8 }}
                        onPress={() => Linking.openURL(files[0].url)}
                      >
                        <Ionicons name="download-outline" size={18} color={DoctorColors.primary} />
                      </TouchableOpacity>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                    )}
                  </TouchableOpacity>
                  );
                })}
              </>
            ) : null}

            {!patient.bloodType && !patientProfile && healthRecords.length === 0 && !intakeData && (
              <Text style={styles.emptyText}>No additional patient information available</Text>
            )}
          </>
        )}
        {/* ── DAILY FEELING ── */}
        {activeTab === 'Daily Feeling' && (
          dataSharing.labResults === false ? <RestrictedBanner section="daily health check-ins" /> : <>
            {dailyFeelings.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="happy-outline" size={52} color="#cbd5e1" />
                <Text style={[styles.emptyText, { marginTop: 12 }]}>No daily check-ins yet</Text>
                <Text style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 }}>
                  The patient has not submitted any daily feeling reports.
                </Text>
              </View>
            ) : (
              dailyFeelings.map(f => {
                const MOOD_META = {
                  great: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'happy' },
                  good:  { color: '#65a30d', bg: '#f7fee7', border: '#d9f99d', icon: 'happy-outline' },
                  okay:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'remove-circle-outline' },
                  poor:  { color: '#dc2626', bg: '#fff7ed', border: '#fed7aa', icon: 'sad-outline' },
                  bad:   { color: '#b91c1c', bg: '#fff1f2', border: '#fecdd3', icon: 'sad' },
                };
                const meta = MOOD_META[f.mood?.toLowerCase()] || { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'help-circle-outline' };
                const fD = toDateSafe(f.createdAt);
                const dateStr = fD ? fD.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
                const timeStr = fD ? fD.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
                const painColor = f.painLevel >= 7 ? '#ef4444' : f.painLevel >= 4 ? '#f59e0b' : '#22c55e';
                const symptomList = Array.isArray(f.symptoms) ? f.symptoms.filter(Boolean) : [];
                return (
                  <View key={f.id} style={[styles.feelingCard, { borderColor: meta.border, backgroundColor: meta.bg }]}>
                    {/* Header row */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: meta.color + '18', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: meta.border }}>
                          <Ionicons name={meta.icon} size={24} color={meta.color} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: meta.color, textTransform: 'capitalize' }}>{f.mood || 'Check-in'}</Text>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }}>{dateStr}{timeStr ? `  •  ${timeStr}` : ''}</Text>
                        </View>
                      </View>
                      {f.painLevel != null && (
                        <View style={{ alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                          <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '600', marginBottom: 1 }}>PAIN</Text>
                          <Text style={{ fontSize: 18, fontWeight: '900', color: painColor }}>{f.painLevel}<Text style={{ fontSize: 11, fontWeight: '600', color: '#94a3b8' }}>/10</Text></Text>
                        </View>
                      )}
                    </View>

                    {/* Symptoms chips (max 3 shown) */}
                    {symptomList.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {symptomList.slice(0, 3).map((s, i) => (
                          <View key={i} style={{ backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#e2e8f0' }}>
                            <Text style={{ fontSize: 11, color: '#475569', fontWeight: '500' }}>{s}</Text>
                          </View>
                        ))}
                        {symptomList.length > 3 && (
                          <View style={{ backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: '#e2e8f0' }}>
                            <Text style={{ fontSize: 11, color: '#94a3b8', fontWeight: '500' }}>+{symptomList.length - 3} more</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* Notes preview */}
                    {f.notes ? (
                      <Text style={{ fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 10 }} numberOfLines={2}>{f.notes}</Text>
                    ) : null}

                    {/* View full details button */}
                    <TouchableOpacity
                      style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: meta.color + '50' }}
                      onPress={() => setViewingFeeling(f)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: meta.color }}>View Details</Text>
                      <Ionicons name="chevron-forward" size={13} color={meta.color} />
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </>
        )}

      </ScrollView>

      <Modal visible={!!viewingRx} transparent animationType="slide" onRequestClose={() => setViewingRx(null)}>
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={[styles.dischargeCard, { maxHeight: '86%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.dischargeTitle}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setViewingRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {viewingRx && (
              <ScrollView>
                <Text style={styles.dischargeSub}>Patient: {viewingRx.patientName || patient?.name || 'Patient'}</Text>
                <Text style={styles.dischargeSub}>Diagnosis: {viewingRx.diagnosis || '—'}</Text>
                <Text style={styles.dischargeSub}>Date: {viewingRx.date || '—'}</Text>
                {viewingRx.prescriptionRef ? <Text style={styles.dischargeSub}>Reference: {viewingRx.prescriptionRef}</Text> : null}
                {(viewingRx.medications || []).map((m, i) => (
                  <View key={i} style={[styles.noteCard, { marginTop: 8, marginBottom: 0 }]}>
                    <Text style={styles.noteTitle}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</Text>
                    <Text style={styles.noteContent}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</Text>
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
                {viewingRx.instructions ? <Text style={[styles.noteContent, { marginTop: 10 }]}>Instructions: {viewingRx.instructions}</Text> : null}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Note Reading Modal */}
      {viewingNote && (() => {
        const tm = getTypeMeta(viewingNote.type);
        return (
          <Modal visible={!!viewingNote} transparent animationType="fade" onRequestClose={() => setViewingNote(null)}>
            <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
              <View style={[styles.dischargeCard, { padding: 0, overflow: 'hidden' }]}>
                <View style={{ padding: 20, paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <View style={[styles.typeBadge, { backgroundColor: tm.bg, alignSelf: 'flex-start', marginBottom: 8 }]}>
                        <Text style={[styles.typeText, { color: tm.color }]}>{tm.label}</Text>
                      </View>
                      <Text style={[styles.dischargeTitle, { textAlign: 'left', fontSize: 16 }]}>{viewingNote.title}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setViewingNote(null)} style={{ padding: 4, marginLeft: 8 }}>
                      <Ionicons name="close" size={22} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ height: 3, backgroundColor: tm.color + '33', borderTopWidth: 2, borderTopColor: tm.color }} />
                <ScrollView style={{ maxHeight: 260, paddingHorizontal: 20, paddingVertical: 14 }}>
                  <Text style={{ fontSize: 15, color: DoctorColors.text, lineHeight: 24 }}>{viewingNote.content}</Text>
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: DoctorColors.primaryLight }]} onPress={() => setViewingNote(null)}>
                    <Text style={[styles.saveBtnText, { color: DoctorColors.primary }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      {/* Health Record Detail Modal — the row only fits a summary, and a record's
          files are stored per document type, so show the whole thing here. */}
      {viewingRecord && (() => {
        const recTypes = recordTypes(viewingRecord);
        const files = recordFiles(viewingRecord);
        return (
          <Modal visible={!!viewingRecord} transparent animationType="slide" onRequestClose={() => setViewingRecord(null)}>
            <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
              <View style={[styles.dischargeCard, { padding: 0, overflow: 'hidden', maxHeight: '85%' }]}>
                <View style={{ backgroundColor: '#eff6ff', borderBottomWidth: 1, borderBottomColor: '#bfdbfe', padding: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e3a8a' }}>{viewingRecord.name || 'Health record'}</Text>
                    <Text style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                      {viewingRecord.date || formatDate(viewingRecord.savedAt, '')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setViewingRecord(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
                  {recTypes.length > 0 ? (
                    <View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Document types</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {recTypes.map(t => (
                          <View key={t} style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                            <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '700' }}>{t}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {viewingRecord.notes ? (
                    <View>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Patient notes</Text>
                      <View style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 10, padding: 12 }}>
                        <Text style={{ fontSize: 14, color: '#0f172a', lineHeight: 21 }}>{viewingRecord.notes}</Text>
                      </View>
                    </View>
                  ) : null}

                  <View>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
                      Attachments{files.length > 0 ? ` (${files.length})` : ''}
                    </Text>
                    {files.length === 0 ? (
                      <Text style={{ fontSize: 13, color: '#94a3b8' }}>No files attached to this record.</Text>
                    ) : files.map((f, i) => (
                      <TouchableOpacity
                        key={`${f.url}-${i}`}
                        activeOpacity={0.7}
                        onPress={() => Linking.openURL(f.url)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 }}
                      >
                        <Ionicons name="document-text-outline" size={20} color={DoctorColors.primary} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{f.label}</Text>
                          <Text style={{ fontSize: 11, color: '#64748b' }} numberOfLines={1}>{f.name}</Text>
                        </View>
                        <Ionicons name="download-outline" size={20} color={DoctorColors.primary} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      {/* Daily Feeling Detail Modal */}
      {viewingFeeling && (() => {
        const MOOD_META = {
          great: { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: 'happy' },
          good:  { color: '#65a30d', bg: '#f7fee7', border: '#d9f99d', icon: 'happy-outline' },
          okay:  { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: 'remove-circle-outline' },
          poor:  { color: '#dc2626', bg: '#fff7ed', border: '#fed7aa', icon: 'sad-outline' },
          bad:   { color: '#b91c1c', bg: '#fff1f2', border: '#fecdd3', icon: 'sad' },
        };
        const meta = MOOD_META[viewingFeeling.mood?.toLowerCase()] || { color: '#64748b', bg: '#f8fafc', border: '#e2e8f0', icon: 'help-circle-outline' };
        const feelD = toDateSafe(viewingFeeling.createdAt);
        const dateStr = feelD ? feelD.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Unknown date';
        const timeStr = feelD ? feelD.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
        const painColor = viewingFeeling.painLevel >= 7 ? '#ef4444' : viewingFeeling.painLevel >= 4 ? '#f59e0b' : '#22c55e';
        const symptomList = Array.isArray(viewingFeeling.symptoms) ? viewingFeeling.symptoms.filter(Boolean) : [];
        return (
          <Modal visible={!!viewingFeeling} transparent animationType="slide" onRequestClose={() => setViewingFeeling(null)}>
            <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
              <View style={[styles.dischargeCard, { padding: 0, overflow: 'hidden', maxHeight: '85%' }]}>
                {/* Coloured header */}
                <View style={{ backgroundColor: meta.bg, padding: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: meta.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: meta.color + '20', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: meta.border }}>
                        <Ionicons name={meta.icon} size={28} color={meta.color} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: meta.color, textTransform: 'capitalize' }}>{viewingFeeling.mood || 'Check-in'}</Text>
                        <Text style={{ fontSize: 12, color: '#64748b' }}>{dateStr}</Text>
                        {timeStr ? <Text style={{ fontSize: 11, color: '#94a3b8' }}>{timeStr}</Text> : null}
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setViewingFeeling(null)} style={{ padding: 4 }}>
                      <Ionicons name="close" size={22} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
                  {/* Pain level */}
                  {viewingFeeling.painLevel != null && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="pulse-outline" size={20} color={painColor} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: DoctorColors.text }}>Pain Level</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                        <Text style={{ fontSize: 28, fontWeight: '900', color: painColor }}>{viewingFeeling.painLevel}</Text>
                        <Text style={{ fontSize: 14, color: '#94a3b8', fontWeight: '600' }}>/10</Text>
                      </View>
                    </View>
                  )}

                  {/* Symptoms */}
                  {symptomList.length > 0 && (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Ionicons name="medical-outline" size={16} color={DoctorColors.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: DoctorColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Symptoms</Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {symptomList.map((s, i) => (
                          <View key={i} style={{ backgroundColor: '#fff0f0', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#fecaca' }}>
                            <Text style={{ fontSize: 13, color: '#b91c1c', fontWeight: '600' }}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Medications taken */}
                  {viewingFeeling.medications ? (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Ionicons name="medkit-outline" size={16} color={DoctorColors.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: DoctorColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Medications Taken</Text>
                      </View>
                      <View style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 14, color: DoctorColors.text, lineHeight: 20 }}>
                          {Array.isArray(viewingFeeling.medications) ? viewingFeeling.medications.join(', ') : viewingFeeling.medications}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Notes */}
                  {viewingFeeling.notes ? (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Ionicons name="document-text-outline" size={16} color={DoctorColors.textSecondary} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: DoctorColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Patient Notes</Text>
                      </View>
                      <View style={{ backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ fontSize: 14, color: DoctorColors.text, lineHeight: 22 }}>{viewingFeeling.notes}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Every section above is conditional, so a check-in with no
                      stored content rendered as a blank panel that looked broken. */}
                  {!viewingFeeling.mood && viewingFeeling.painLevel == null && symptomList.length === 0
                    && !viewingFeeling.medications && !viewingFeeling.notes ? (
                    <View style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 10, padding: 14 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400e' }}>No details were recorded with this check-in.</Text>
                      <Text style={{ fontSize: 13, color: '#a16207', marginTop: 4, lineHeight: 19 }}>
                        The patient logged it, but the answers were not stored. Check-ins submitted from now on capture mood, pain level, symptoms, medications and notes.
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ height: 4 }} />
                </ScrollView>

                <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                  <TouchableOpacity
                    style={[styles.saveBtn, { backgroundColor: meta.color }]}
                    onPress={() => setViewingFeeling(null)}
                  >
                    <Text style={styles.saveBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        );
      })()}

      {/* Reschedule Modal */}
      <Modal visible={showReschedule} transparent animationType="fade" onRequestClose={() => setShowReschedule(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.dischargeCard}>
            <View style={styles.dischargeIcon}>
              <Ionicons name="calendar-outline" size={28} color={DoctorColors.primary} />
            </View>
            <Text style={styles.dischargeTitle}>Reschedule Appointment</Text>
            <Text style={[styles.dischargeSub, { marginBottom: 12 }]}>
              Update the date and time for this appointment.
            </Text>
            <Text style={styles.formLabel}>New Date (YYYY-MM-DD) *</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 12 }]}
              placeholder="e.g. 2026-05-15"
              placeholderTextColor="#94a3b8"
              value={rescheduleDate}
              onChangeText={setRescheduleDate}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.formLabel}>New Time (HH:MM)</Text>
            <TextInput
              style={[styles.formInput, { marginBottom: 16 }]}
              placeholder="e.g. 10:30"
              placeholderTextColor="#94a3b8"
              value={rescheduleTime}
              onChangeText={setRescheduleTime}
              keyboardType="numbers-and-punctuation"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: '#f1f5f9' }]} onPress={() => setShowReschedule(false)}>
                <Text style={[styles.saveBtnText, { color: '#64748b' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1 }, rescheduling && { opacity: 0.6 }]} onPress={doReschedule} disabled={rescheduling}>
                {rescheduling ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Discharge Modal */}
      <Modal visible={showDischarge} transparent animationType="fade" onRequestClose={() => setShowDischarge(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.dischargeCard}>
            <View style={styles.dischargeIcon}>
              <Ionicons name="warning-outline" size={28} color="#f59e0b" />
            </View>
            <Text style={styles.dischargeTitle}>Discharge Patient</Text>
            <Text style={styles.dischargeSub}>
              Discharging <Text style={{ fontWeight: '700' }}>{patient.name}</Text> will cancel all pending appointments and mark them as discharged.
            </Text>
            <Text style={styles.formLabel}>Discharge Reason *</Text>
            <TextInput
              style={[styles.formInput, { height: 80, textAlignVertical: 'top', marginBottom: 16 }]}
              placeholder="Enter discharge reason..."
              placeholderTextColor="#94a3b8"
              value={dischargeReason}
              onChangeText={setDischargeReason}
              multiline numberOfLines={3}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: '#f1f5f9' }]} onPress={() => setShowDischarge(false)}>
                <Text style={[styles.saveBtnText, { color: '#64748b' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: '#ef4444' }, discharging && { opacity: 0.6 }]} onPress={confirmDischarge} disabled={discharging}>
                {discharging ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Discharge</Text>}
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
  patientHeader: {
    backgroundColor: DoctorColors.primaryDark, padding: 16, paddingTop: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  headerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  patientName: { fontSize: 17, fontWeight: '800', color: '#fff' },
  patientEmail: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  dischargeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(239,68,68,0.15)',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  dischargeBtnText: { fontSize: 12, color: '#fca5a5', fontWeight: '700' },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statValue: { fontSize: 18, fontWeight: '800', color: DoctorColors.primary },
  statLabel: { fontSize: 9, color: '#94a3b8', marginTop: 2, textAlign: 'center' },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexGrow: 0 },
  tabItem: { paddingHorizontal: 16, paddingVertical: 12 },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: DoctorColors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: DoctorColors.primary },
  tabContent: { flex: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text, marginBottom: 10 },
  quickActions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  qBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DoctorColors.primaryLight, borderRadius: 10, padding: 12,
  },
  qBtnText: { fontSize: 13, color: DoctorColors.primary, fontWeight: '700' },
  feelingCard: {
    borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1,
  },
  miniCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  miniCardTitle: { fontSize: 13, fontWeight: '600', color: DoctorColors.text },
  miniCardSub: { fontSize: 11, color: DoctorColors.textSecondary, marginTop: 2 },
  noteMetaRow: { flexDirection: 'row', marginBottom: 4 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 4 },
  typeText: { fontSize: 10, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 20 },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 12 },
  emptyActionText: { fontSize: 13, color: DoctorColors.primary, fontWeight: '600' },
  apptCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  apptRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  apptDate: { fontSize: 13, fontWeight: '600', color: DoctorColors.text },
  apptType: { fontSize: 11, color: DoctorColors.textSecondary, marginTop: 2 },
  apptActions: { flexDirection: 'row', gap: 8 },
  apptBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DoctorColors.primaryLight, borderRadius: 10, padding: 12, marginBottom: 12,
  },
  addRowBtnText: { fontSize: 14, color: DoctorColors.primary, fontWeight: '700' },
  formCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: DoctorColors.text, marginBottom: 6 },
  formInput: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12,
    fontSize: 14, color: DoctorColors.text, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipText: { fontSize: 12, color: DoctorColors.textSecondary, fontWeight: '500' },
  saveBtn: { backgroundColor: DoctorColors.primary, borderRadius: 10, padding: 13, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  noteCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  noteHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  noteTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text },
  noteContent: { fontSize: 13, color: DoctorColors.textSecondary, lineHeight: 19 },
  rxCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rxMed: { fontSize: 15, fontWeight: '700', color: DoctorColors.text, marginBottom: 2 },
  rxMeta: { fontSize: 12, color: DoctorColors.textSecondary },
  pharmacyStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  pharmacyStatusPillText: { fontSize: 11, fontWeight: '700' },
  rxApprovedAlt: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 4 },
  rxInstructions: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  rxDate: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  infoCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  infoLabel: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  infoValue: { fontSize: 13, color: DoctorColors.text, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dischargeCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
  },
  dischargeIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#fffbeb',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12, alignSelf: 'center',
  },
  dischargeTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text, textAlign: 'center', marginBottom: 8 },
  dischargeSub: { fontSize: 13, color: DoctorColors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  tapHint: { fontSize: 11, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' },
});
