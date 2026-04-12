import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, deleteDoc,
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const TODAY = new Date().toISOString().split('T')[0];
const TABS = ['Overview', 'Appointments', 'Notes', 'Prescriptions', 'Patient Info', 'Daily Feeling'];

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
  confirmed: { bg: '#f0fdf4', border: '#86efac', text: '#15803d' },
  completed: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  cancelled: { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },
};

function getTypeMeta(type) { return NOTE_TYPES.find(t => t.value === type) || NOTE_TYPES[5]; }
function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length-1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default function DoctorPatientDetailScreen({ route, navigation }) {
  const { patientId, patientName } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Overview');

  const [patient, setPatient] = useState({ id: patientId, name: patientName || 'Patient' });
  const [patientProfile, setPatientProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);
  const [dailyFeelings, setDailyFeelings] = useState([]);
  const [intakeData, setIntakeData] = useState(null);
  const [doctorProfile, setDoctorProfile] = useState(null);

  // Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ type: 'consultation', title: '', content: '' });
  const [savingNote, setSavingNote] = useState(false);

  // Prescription form
  const [showRxForm, setShowRxForm] = useState(false);
  const [rxForm, setRxForm] = useState({ medication: '', dosage: '', frequency: '', duration: '', instructions: '' });
  const [savingRx, setSavingRx] = useState(false);

  // Note reading popup
  const [viewingNote, setViewingNote] = useState(null);

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

  useEffect(() => { loadAll(); }, [patientId]);

  const loadAll = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu || !patientId) return;

      // Doctor profile
      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      const dp = dSnap.exists() ? { id: cu.uid, ...dSnap.data() } : { id: cu.uid, name: 'Doctor' };
      setDoctorProfile(dp);

      // Patient auth data
      try {
        const authSnap = await getDoc(doc(db, 'auth', patientId));
        if (authSnap.exists()) {
          const d = authSnap.data();
          setPatient({
            id: patientId,
            name: d.name || d.displayName || patientName || 'Patient',
            email: d.email || '',
            bloodType: d.bloodType || '',
            allergies: d.allergies || '',
            dob: d.dob || '',
            phone: d.phone || '',
          });
        }
      } catch {}

      // Patient profile (insurance, emergency, health records)
      try {
        const ppSnap = await getDoc(doc(db, 'patientProfiles', patientId));
        if (ppSnap.exists()) {
          const ppData = ppSnap.data();
          setPatientProfile(ppData);
          setHealthRecords(ppData.healthRecords || []);
        }
      } catch {}

      // Intake / questionnaire data
      try {
        const intakeSnap = await getDoc(doc(db, 'patientIntake', patientId));
        if (intakeSnap.exists()) setIntakeData(intakeSnap.data());
      } catch {}

      // Daily feelings
      try {
        const feelSnap = await getDocs(query(
          collection(db, 'patientDailyFeelings'),
          where('patientId', '==', patientId)
        ));
        const feelings = feelSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setDailyFeelings(feelings);
      } catch {}

      // Appointments
      const apptSnap = await getDocs(query(
        collection(db, 'doctorAppointments'),
        where('doctorId', '==', cu.uid),
        where('clientId', '==', patientId)
      ));
      setAppointments(apptSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.date || '').localeCompare(a.date || '')));

      // Notes
      const notesSnap = await getDocs(query(
        collection(db, 'doctorNotes'),
        where('doctorId', '==', cu.uid),
        where('patientId', '==', patientId)
      ));
      setNotes(notesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));

      // Prescriptions
      const rxSnap = await getDocs(query(
        collection(db, 'doctorPrescriptions'),
        where('doctorId', '==', cu.uid),
        where('patientId', '==', patientId)
      ));
      setPrescriptions(rxSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
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
      const cu = auth.currentUser;
      const newNote = await addDoc(collection(db, 'doctorNotes'), {
        doctorId: cu.uid,
        doctorName: doctorProfile?.name || 'Doctor',
        patientId,
        patientName: patient.name,
        title: noteForm.title.trim(),
        content: noteForm.content.trim(),
        type: noteForm.type,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNotes(prev => [{ id: newNote.id, ...noteForm, patientName: patient.name, patientId }, ...prev]);
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
          await deleteDoc(doc(db, 'doctorNotes', noteId));
          setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch { Alert.alert('Error', 'Could not delete note.'); }
      }},
    ]);
  };

  // Save Prescription
  const saveRx = async () => {
    if (!rxForm.medication.trim()) { Alert.alert('Validation', 'Medication name is required.'); return; }
    setSavingRx(true);
    try {
      const cu = auth.currentUser;
      const rxPayload = {
        doctorId: cu.uid,
        doctorName: doctorProfile?.name || 'Doctor',
        patientId,
        patientName: patient.name,
        diagnosis: rxForm.instructions.trim() || 'See instructions',
        instructions: rxForm.instructions.trim(),
        medications: [{
          name: rxForm.medication.trim(),
          dosage: rxForm.dosage.trim(),
          frequency: rxForm.frequency.trim(),
          duration: rxForm.duration.trim(),
        }],
        date: new Date().toISOString().split('T')[0],
        status: 'active',
        createdAt: serverTimestamp(),
      };
      const newRx = await addDoc(collection(db, 'doctorPrescriptions'), rxPayload);
      setPrescriptions(prev => [{ id: newRx.id, ...rxPayload }, ...prev]);
      setShowRxForm(false);
      setRxForm({ medication: '', dosage: '', frequency: '', duration: '', instructions: '' });
    } catch {
      Alert.alert('Error', 'Could not save prescription.');
    } finally {
      setSavingRx(false);
    }
  };

  // Discharge
  const confirmDischarge = async () => {
    if (!dischargeReason.trim()) { Alert.alert('Validation', 'Discharge reason is required.'); return; }
    setDischarging(true);
    try {
      const cu = auth.currentUser;
      // Write discharge note
      await addDoc(collection(db, 'doctorNotes'), {
        doctorId: cu.uid, doctorName: doctorProfile?.name || 'Doctor',
        patientId, patientName: patient.name,
        type: 'discharge', title: 'Patient Discharged',
        content: dischargeReason.trim(),
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      // Update doctor's patient subcollection
      await setDoc(doc(db, 'doctors', cu.uid, 'patients', patientId), {
        status: 'discharged', dischargedAt: serverTimestamp(), dischargeReason: dischargeReason.trim(),
      }, { merge: true });
      // Cancel pending/confirmed appointments
      for (const appt of appointments) {
        if (appt.status === 'pending' || appt.status === 'confirmed') {
          await updateDoc(doc(db, 'doctorAppointments', appt.id), { status: 'cancelled' });
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
      await updateDoc(doc(db, 'doctorAppointments', apptId), { status: newStatus, updatedAt: serverTimestamp() });
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
      await updateDoc(doc(db, 'doctorAppointments', rescheduleAppt.id), {
        date: rescheduleDate.trim(),
        time: rescheduleTime.trim() || rescheduleAppt.time,
        status: 'confirmed',
        rescheduledAt: serverTimestamp(),
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
        </View>
        <TouchableOpacity style={styles.dischargeBtn} onPress={() => setShowDischarge(true)}>
          <Ionicons name="exit-outline" size={14} color="#be123c" />
          <Text style={styles.dischargeBtnText}>Discharge</Text>
        </TouchableOpacity>
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
            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.qBtn} onPress={() => { setActiveTab('Notes'); setShowNoteForm(true); }}>
                <Ionicons name="document-text-outline" size={16} color={DoctorColors.primary} />
                <Text style={styles.qBtnText}>Add Note</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.qBtn} onPress={() => { setActiveTab('Prescriptions'); setShowRxForm(true); }}>
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
          <>
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
                          <Text style={{ color: '#15803d', fontSize: 12, fontWeight: '700' }}>Accept</Text>
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
          <>
            <TouchableOpacity style={styles.addRowBtn} onPress={() => setShowRxForm(v => !v)}>
              <Ionicons name={showRxForm ? 'chevron-up-outline' : 'add-circle-outline'} size={18} color={DoctorColors.primary} />
              <Text style={styles.addRowBtnText}>{showRxForm ? 'Close Form' : 'Issue Prescription'}</Text>
            </TouchableOpacity>

            {showRxForm && (
              <View style={styles.formCard}>
                {[
                  { label: 'Medication / Drug Name *', field: 'medication', placeholder: 'e.g. Amoxicillin' },
                  { label: 'Dosage',                   field: 'dosage',    placeholder: 'e.g. 500mg' },
                  { label: 'Frequency',                field: 'frequency', placeholder: 'e.g. Twice daily' },
                  { label: 'Duration',                 field: 'duration',  placeholder: 'e.g. 7 days' },
                ].map(f => (
                  <View key={f.field}>
                    <Text style={styles.formLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder={f.placeholder}
                      placeholderTextColor="#94a3b8"
                      value={rxForm[f.field]}
                      onChangeText={v => setRxForm(p => ({ ...p, [f.field]: v }))}
                    />
                  </View>
                ))}
                <Text style={styles.formLabel}>Special Instructions</Text>
                <TextInput
                  style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                  placeholder="Additional instructions..."
                  placeholderTextColor="#94a3b8"
                  value={rxForm.instructions}
                  onChangeText={v => setRxForm(p => ({ ...p, instructions: v }))}
                  multiline numberOfLines={3}
                />
                <TouchableOpacity style={[styles.saveBtn, savingRx && { opacity: 0.6 }]} onPress={saveRx} disabled={savingRx}>
                  {savingRx ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Issue Prescription</Text>}
                </TouchableOpacity>
              </View>
            )}

            {prescriptions.length === 0 && <Text style={styles.emptyText}>No prescriptions issued yet</Text>}
            {prescriptions.map(rx => (
              <View key={rx.id} style={styles.rxCard}>
                <Text style={styles.rxMed}>{rx.medication || rx.medications?.[0]?.name || 'Medication'}</Text>
                <Text style={styles.rxMeta}>
                  {[rx.dosage, rx.frequency, rx.duration].filter(Boolean).join(' · ')}
                </Text>
                {rx.instructions ? <Text style={styles.rxInstructions}>{rx.instructions}</Text> : null}
                {rx.createdAt?.seconds && (
                  <Text style={styles.rxDate}>
                    {new Date(rx.createdAt.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── PATIENT INFO ── */}
        {activeTab === 'Patient Info' && (
          <>
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
            {healthRecords.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Health Records & Medical Files</Text>
                {healthRecords.map((rec, i) => (
                  <View key={i} style={[styles.infoCard, { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }]}>
                    <View style={{ width: 38, height: 38, borderRadius: 8, backgroundColor: DoctorColors.primaryLight, justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="document-outline" size={18} color={DoctorColors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: DoctorColors.text }}>{rec.name || rec.type || 'Record'}</Text>
                      <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{rec.type}{rec.date ? '  ·  ' + rec.date : ''}</Text>
                      {rec.notes ? <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }} numberOfLines={1}>{rec.notes}</Text> : null}
                    </View>
                    {rec.fileUrl ? (
                      <TouchableOpacity
                        style={{ padding: 8, backgroundColor: DoctorColors.primaryLight, borderRadius: 8 }}
                        onPress={() => Linking.openURL(rec.fileUrl)}
                      >
                        <Ionicons name="download-outline" size={18} color={DoctorColors.primary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </>
            )}

            {!patient.bloodType && !patientProfile && healthRecords.length === 0 && !intakeData && (
              <Text style={styles.emptyText}>No additional patient information available</Text>
            )}
          </>
        )}
        {/* ── DAILY FEELING ── */}
        {activeTab === 'Daily Feeling' && (
          <>
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
                const moodColors = { great: '#22c55e', good: '#84cc16', okay: '#f59e0b', poor: '#ef4444', bad: '#dc2626' };
                const moodColor = moodColors[f.mood?.toLowerCase()] || '#64748b';
                const dateStr = f.createdAt?.seconds ? new Date(f.createdAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
                return (
                  <View key={f.id} style={[styles.miniCard, { flexDirection: 'column', gap: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: moodColor + '20', justifyContent: 'center', alignItems: 'center' }}>
                          <Ionicons name="happy-outline" size={20} color={moodColor} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: DoctorColors.text, textTransform: 'capitalize' }}>{f.mood || 'Check-in'}</Text>
                          <Text style={{ fontSize: 11, color: '#94a3b8' }}>{dateStr}</Text>
                        </View>
                      </View>
                      {f.painLevel != null && (
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ fontSize: 11, color: '#64748b' }}>Pain</Text>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: f.painLevel >= 7 ? '#ef4444' : f.painLevel >= 4 ? '#f59e0b' : '#22c55e' }}>{f.painLevel}/10</Text>
                        </View>
                      )}
                    </View>
                    {f.symptoms?.length > 0 && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {(Array.isArray(f.symptoms) ? f.symptoms : [f.symptoms]).map((s, i) => (
                          <View key={i} style={{ backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                            <Text style={{ fontSize: 11, color: '#475569' }}>{s}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {f.notes ? <Text style={{ fontSize: 13, color: '#475569', lineHeight: 18 }}>{f.notes}</Text> : null}
                    {f.medications?.length > 0 && (
                      <Text style={{ fontSize: 12, color: '#94a3b8' }}>Medications taken: {Array.isArray(f.medications) ? f.medications.join(', ') : f.medications}</Text>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}

      </ScrollView>

      {/* Note Reading Modal */}
      {viewingNote && (() => {
        const tm = getTypeMeta(viewingNote.type);
        return (
          <Modal visible={!!viewingNote} transparent animationType="fade" onRequestClose={() => setViewingNote(null)}>
            <View style={styles.modalOverlay}>
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
            </View>
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
