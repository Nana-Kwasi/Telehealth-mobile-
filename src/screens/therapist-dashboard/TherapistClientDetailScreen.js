import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { TherapistColors, DoctorColors } from '../../constants/colors';
import { patientPharmacyKey, removePatientPharmacyByKey } from '../../utils/patientPharmacyDedupe';
import { toDateSafe } from '../../utils/dateDisplay';
import WeeklyCheckInCard from '../../components/WeeklyCheckInCard';
import RecordGapsCard from '../../components/RecordGapsCard';
import CodingAssistCard from '../../components/CodingAssistCard';
import { PatientTranscriptsMobile } from '../../components/SessionTranscriptsMobile';
import {
  getClientDisplayName,
  getClientPhone,
  getClientRelationshipStatus,
  fetchClientSessions,
  getLastSessionRecord,
  resolveTherapistIdForClient,
  fetchAuthProfileForClient,
  getQuestionnaireGroupedSections,
  formatFieldValue,
  formatSessionDateLabel,
  formatSessionTimeLabel,
  sessionTimestamp,
  toFirestoreDate,
} from '../../utils/clientTherapyMetrics';
import { getNoteSections, getNotePreview, getNoteTitle } from '../../utils/noteDisplayUtils';
import { GlassScrim, GlassSheetSurface } from '../../components/GlassSheet';

const MOOD_EMOJI = { 1: '😞', 2: '😟', 3: '😕', 4: '🙁', 5: '😐', 6: '🙂', 7: '😊', 8: '😄', 9: '😁', 10: '🤩' };
const MOOD_LABEL = { 1: 'Very Low', 2: 'Low', 3: 'Below Avg', 4: 'Slightly Low', 5: 'Neutral', 6: 'Okay', 7: 'Good', 8: 'Great', 9: 'Excellent', 10: 'Outstanding' };
const TABS = ['overview', 'sessions', 'notes', 'mood', 'goals'];
// Psychiatry: the doctor screen's Prescriptions and E-Pharmacy tabs.
const PSYCHIATRY_TABS = ['prescriptions', 'epharmacy'];
const TAB_LABELS = { epharmacy: 'E-Pharmacy' };

const PHARMACY_STATUS_META = {
  sent: { label: 'Sent to Pharmacy', color: '#1d4ed8', bg: '#eff6ff' },
  accepted: { label: 'Processing', color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partially Filled', color: '#d97706', bg: '#fffbeb' },
  ready: { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
  delivered: { label: 'Delivered', color: '#475569', bg: '#f8fafc' },
};

function RestrictedBanner({ section }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center', marginBottom: 16, borderWidth: 1.5, borderColor: '#fecaca' }}>
        <Ionicons name="lock-closed" size={28} color="#dc2626" />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 8 }}>Access Restricted</Text>
      <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 20 }}>
        This client has restricted clinician access to their {section}.{'\n'}This data is hidden based on their privacy settings.
      </Text>
    </View>
  );
}


function fmtDate(ts) {
  const d = toFirestoreDate(ts);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusColor(s) {
  const map = {
    active: { bg: '#dcfce7', color: '#2f7d5f' },
    inactive: { bg: '#f1f5f9', color: '#ffffff' },
    on_hold: { bg: '#fef9c3', color: '#b45309' },
    discharged: { bg: '#fee2e2', color: '#8c322d' },
  };
  return map[s] || { bg: '#e0e7ff', color: '#4f46e5' };
}

function sessionStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return { bg: '#dcfce7', color: '#2f7d5f' };
  if (s === 'upcoming' || s === 'scheduled') return { bg: '#dbeafe', color: '#2f5d7d' };
  if (s === 'cancelled') return { bg: '#fee2e2', color: '#8c322d' };
  return { bg: '#f1f5f9', color: '#ffffff' };
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value ?? '—'}</Text>
    </View>
  );
}

function NoteListCard({ note, kind, onOpen }) {
  const preview = getNotePreview(note);
  const title = getNoteTitle(note, kind);
  return (
    <TouchableOpacity style={styles.noteCard} onPress={() => onOpen(note, kind)} activeOpacity={0.85}>
      <View style={styles.noteCardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.noteCardTitle}>{title}</Text>
          <Text style={styles.noteCardDate}>{fmtDate(note.createdAt || note.sessionDate)}</Text>
        </View>
        <View style={styles.readBadge}>
          <Ionicons name="eye-outline" size={14} color={TherapistColors.primary} />
          <Text style={styles.readBadgeText}>Read</Text>
        </View>
      </View>
      <Text style={styles.notePreview} numberOfLines={3}>{preview}</Text>
    </TouchableOpacity>
  );
}

function QuestionnairePanel({ client }) {
  const sections = getQuestionnaireGroupedSections(client);
  const totalFields = sections.reduce((sum, s) => sum + s.rows.length, 0);
  if (!sections.length) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardSectionTitle}>Full questionnaire responses</Text>
        <Text style={styles.emptyHint}>No questionnaire responses on file.</Text>
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <View style={styles.qHeader}>
        <Text style={styles.cardSectionTitle}>Full questionnaire responses</Text>
        <Text style={styles.qCount}>{sections.length} sections · {totalFields} answers</Text>
      </View>
      {sections.map((section) => (
        <View key={section.id} style={styles.qSection}>
          <Text style={styles.qSectionTitle}>{section.title}</Text>
          {section.phq9Summary && (
            <View style={styles.phq9Summary}>
              <Text style={styles.phq9Score}>
                Total: <Text style={{ fontWeight: '800' }}>{section.phq9Summary.total}</Text> / {section.phq9Summary.maxScore}
              </Text>
              {section.phq9Summary.severity && (
                <Text style={styles.phq9Severity}>{section.phq9Summary.severity.label}</Text>
              )}
            </View>
          )}
          {section.rows.map((row) => (
            <View key={row.fieldKey} style={styles.qField}>
              <Text style={styles.qFieldLabel}>{row.label}</Text>
              <Text style={styles.qFieldValue}>{row.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export default function TherapistClientDetailScreen({ navigation, route }) {
  const clientId = route.params?.clientId;
  const [client, setClient] = useState(null);
  const [authProfile, setAuthProfile] = useState(null);
  const [therapistName, setTherapistName] = useState('');
  const [sessions, setSessions] = useState([]);
  const [therapyNotes, setTherapyNotes] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState([]);
  const [moodEntries, setMoodEntries] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);

  // ── Prescribing ────────────────────────────────────────────────────────────
  // Only for clients on the PSYCHIATRY track: a psychiatrist prescribes, a
  // counsellor does not, and both use this same screen. The server enforces
  // this too — hiding the button is a courtesy, not the control.
  const canPrescribe = String(client?.careTrack || '').toLowerCase() === 'psychiatry';
  // ── Prescriptions & E-Pharmacy (psychiatry track) ─────────────────────────
  // Copied from doctor-dashboard/DoctorPatientDetailScreen.js so a psychiatrist has
  // the same per-client prescription and pharmacy tools as a doctor per patient.
  const [prescriptions, setPrescriptions] = useState([]);
  const [viewingRx, setViewingRx] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [dataSharing, setDataSharing] = useState({});
  const [removingPharmacyKey, setRemovingPharmacyKey] = useState(null);

  const fetchPrescriptions = async (uid) => {
    const doctorId = uid || await getStoredUserId();
    if (!doctorId || !clientId) return;
    api(`/api/v1/medical/prescriptions/doctor/${doctorId}`).then(rxRaw => {
      const list = (rxRaw || []).filter(r => r.patientId === clientId || r.clientId === clientId);
      setPrescriptions(list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    }).catch(() => {});
  };

  useEffect(() => {
    if (!canPrescribe || !clientId) return;
    fetchPrescriptions();
    api(`/api/v1/patients/${clientId}`).then((pd) => {
      setPharmacies(pd?.pharmacies || []);
      setDataSharing(pd?.privacy?.dataSharing || {});
    }).catch(() => {});
  }, [canPrescribe, clientId]);

  const removePatientPharmacyEntry = async (ph) => {
    const rk = patientPharmacyKey(ph) || ph.id || ph.name || '';
    setRemovingPharmacyKey(rk);
    try {
      const updated = removePatientPharmacyByKey(pharmacies, ph);
      await api(`/api/v1/patients/${clientId}`, { method: 'PATCH', body: { pharmacies: updated } });
      setPharmacies(updated);
    } catch {
      Alert.alert('Error', 'Could not remove pharmacy.');
    } finally {
      setRemovingPharmacyKey(null);
    }
  };

  // Opens the full prescription form (Prescriptions screen) with this client
  // preselected — the same hand-off as DoctorPatientDetailScreen.
  const openFullPrescriptionForm = () => {
    navigation.navigate('TherapistMain', {
      screen: 'TherapistPrescriptions',
      params: {
        openRxForm: true,
        presetPatientId: client?.id || client?.clientId || clientId,
        presetPatientName: client?.name || '',
      },
    });
  };
  const [viewingNote, setViewingNote] = useState(null);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [noteForm, setNoteForm] = useState({ sessionFocus: '', progressAssessment: '', mood: '', notes: '' });
  const [savingNote, setSavingNote] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ title: '', description: '', targetDate: '', priority: 'medium', status: 'active' });
  const [savingGoal, setSavingGoal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    getStoredUserId().then(setCurrentUserId);
  }, []);

  useEffect(() => {
    if (!clientId) return;
    loadAll();
  }, [clientId]);

  useEffect(() => {
    if (!client) return;
    const name = getClientDisplayName(client, authProfile);
    navigation.setOptions({ title: name });
  }, [client, authProfile, navigation]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const raw = await api(`/api/v1/clients/${clientId}`);
      if (!raw) { setClient(null); return; }
      // The intake questionnaire (age, gender, country, employment, therapy type,
      // session frequency, sleep, exercise, …) is stored as a JSON blob in
      // preferencesJson — the table has no columns for it. This screen reads flat
      // fields, so without hoisting it every row rendered "—". Real columns win.
      let prefs = {};
      try { prefs = raw.preferencesJson ? JSON.parse(raw.preferencesJson) : {}; } catch { /* ignore */ }

      // A client's details are split across TWO records, and this screen only
      // read one:
      //
      //   client_profiles_v2.preferences_json — the intake questionnaire
      //   patient_profiles.metadata_json      — country, city, gender, dob,
      //                                          address, emergency contact
      //
      // So a client who has a country and city on file still showed "—" for
      // Country, because that value lives in the record this screen never
      // opened. Read both and merge; the questionnaire wins where they overlap,
      // since it is the client's own answer rather than a derived location.
      let patientMeta = {};
      try {
        const pat = await api(`/api/v1/patients/${clientId}`).catch(() => null);
        if (pat?.metadataJson) patientMeta = JSON.parse(pat.metadataJson) || {};
        if (pat?.phone && !patientMeta.phone) patientMeta.phone = pat.phone;
        if (pat?.fullName && !patientMeta.name) patientMeta.name = pat.fullName;
      } catch { /* the questionnaire half still renders */ }

      const cData = { ...patientMeta, ...prefs, ...raw };
      const authPro = await fetchAuthProfileForClient(cData);
      setAuthProfile(authPro);
      const therapistId = await resolveTherapistIdForClient(clientId, cData);
      if (therapistId) {
        const tSnap = await api(`/api/v1/therapists/${therapistId}`).catch(() => null);
        if (tSnap) setTherapistName(tSnap.displayName || tSnap.name || '');
      }
      setClient({ ...cData, phone: getClientPhone(cData, authPro), therapistId: therapistId || cData.therapistId });

      const meUid = currentUserId || await getStoredUserId();
      if (meUid) {
        const meSnap = await api(`/api/v1/therapists/${meUid}`).catch(() => null);
        if (meSnap && meSnap.role === 'admin') setIsAdmin(true);
      }

      setSessions(await fetchClientSessions(clientId, { authUid: cData.authUid }));

      const cnData = await api(`/api/v1/clinical-notes?clientId=${clientId}`).catch(() => []);
      setClinicalNotes(cnData || []);
      setTherapyNotes(cnData || []);

      // A therapy client logs mood through /therapy-engagement/clients/moods
      // (client_mood_journals). This screen only read /patients/{id}/daily-feelings
      // — the MEDICAL store — so a therapist never saw a single mood their client
      // recorded. Read the therapy store first and keep daily-feelings as a
      // fallback for clients who also use the medical side.
      const [therapyMoods, feelings] = await Promise.all([
        api(`/api/v1/therapy-engagement/clients/${clientId}/moods`).catch(() => []),
        api(`/api/v1/patients/${clientId}/daily-feelings`).catch(() => []),
      ]);
      const moodData = [
        ...(Array.isArray(therapyMoods) ? therapyMoods : []).map((m) => ({
          ...m,
          // Normalise to what the screen renders.
          moodValue: m.moodScore ?? m.moodValue,
          mood: m.mood || m.notes || '',
          createdAt: m.createdAt,
        })),
        ...(Array.isArray(feelings) ? feelings : []),
      ];
      setMoodEntries(moodData || []);

      const goalsData = await api(`/api/v1/therapy-management/goals?clientId=${clientId}`).catch(() => []);
      setGoals(goalsData || []);
    } catch (e) {
      console.error('Client detail load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const reloadNotes = async () => {
    const cnData = await api(`/api/v1/clinical-notes?clientId=${clientId}`).catch(() => []);
    setClinicalNotes(cnData || []);
    setTherapyNotes(cnData || []);
  };

  const handleStatusChange = async (newStatus) => {
    setShowStatusMenu(false);
    setStatusUpdating(true);
    try {
      // PATCH /clients/{id} is CLIENT-or-platform-ADMIN only and guards on
      // "self", so a therapist — including an admin therapist — was refused and
      // the change never persisted. The therapist-facing route is /status.
      const saved = await api(`/api/v1/clients/${clientId}/status`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      setClient((prev) => ({ ...prev, ...(saved || {}), status: saved?.status || newStatus }));
    } catch (e) {
      Alert.alert('Error', e?.message || 'Failed to update status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDischarge = () => {
    Alert.alert('Discharge client', `Discharge ${clientName}? Status will be set to discharged.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discharge', style: 'destructive', onPress: () => handleStatusChange('discharged') },
    ]);
  };

  const handleSaveNote = async () => {
    if (!noteForm.notes.trim()) return;
    setSavingNote(true);
    try {
      await api('/api/v1/clinical-notes', {
        method: 'POST',
        body: { ...noteForm, clientId, therapistId: currentUserId, isDraft: false },
      });
      setNoteForm({ sessionFocus: '', progressAssessment: '', mood: '', notes: '' });
      setShowNoteModal(false);
      await reloadNotes();
    } catch (_) {
      Alert.alert('Error', 'Failed to save note.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleSaveGoal = async () => {
    if (!goalForm.title.trim()) return;
    setSavingGoal(true);
    try {
      const newGoal = await api('/api/v1/therapy-management/goals', {
        method: 'POST',
        // The API requires `goalTitle`; this form (like the web one) collects it as
        // `title`, so every submission was rejected until it was mapped.
        body: { ...goalForm, goalTitle: goalForm.title.trim(), clientId, therapistId: currentUserId },
      });
      setGoals((prev) => [newGoal || { id: Date.now().toString(), ...goalForm }, ...prev]);
      setGoalForm({ title: '', description: '', targetDate: '', priority: 'medium', status: 'active' });
      setShowGoalForm(false);
    } catch (_) {
      Alert.alert('Error', 'Failed to save goal.');
    } finally {
      setSavingGoal(false);
    }
  };

  const handleToggleGoal = async (goal) => {
    const newStatus = goal.status === 'completed' ? 'active' : 'completed';
    try {
      await api(`/api/v1/therapy-management/goals/${goal.id}`, { method: 'PATCH', body: { status: newStatus } });
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status: newStatus } : g)));
    } catch (_) {}
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
        <Text style={styles.loadingText}>Loading client details…</Text>
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Client not found.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryBtnText}>Back to Clients</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const clientName = getClientDisplayName(client, authProfile);
  const clientPhone = getClientPhone(client, authProfile);
  const sc = statusColor(client.status);
  const moodFromNotes = therapyNotes.map((n) => Number(n.mood)).filter((m) => !Number.isNaN(m) && m > 0);
  const moodValues = [
    // Same trap as the cards: `mood` is the label, not the score.
    ...moodEntries
      .map((e) => Number(e.moodValue ?? e.moodScore ?? e.value ?? e.rating))
      .filter((m) => !Number.isNaN(m) && m > 0),
    ...moodFromNotes,
  ];
  const avgMood = moodValues.length ? (moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1) : null;
  const lastSession = getLastSessionRecord(sessions);
  const lastSessionLabel = lastSession ? formatSessionDateLabel(lastSession) : '—';
  const displayVal = (v) => (v != null && v !== '' ? String(v) : null);
  const genderLabel =
    client.gender === 'man' ? 'Male' : client.gender === 'woman' ? 'Female' : client.gender;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{clientName[0]?.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.clientName}>{clientName}</Text>
              <Text style={styles.clientMeta}>{client.clientEmail || client.email || 'No email'}</Text>
              {clientPhone ? <Text style={styles.clientMeta}>{clientPhone}</Text> : null}
              <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                <Text style={[styles.statusPillText, { color: sc.color }]}>
                  {(client.status || 'active').replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
              {therapistName ? (
                <Text style={styles.assigned}>Assigned to: <Text style={styles.assignedName}>{therapistName}</Text></Text>
              ) : null}
            </View>
          </View>

          <View style={styles.actionsRow}>
            {/* Go to the full Notes screen rather than a cut-down modal — that
                screen has the note types, templates and signature the small
                sheet lacked. The client is pre-selected there. */}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('TherapistNotes', {
                composeForClientId: clientId,
                composeForClientName: clientName,
              })}
            >
              <Ionicons name="document-text-outline" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Add Note</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chatBtn}
              onPress={() =>
                navigation.navigate('TherapistClientChat', { clientId, clientName })
              }
            >
              <Ionicons name="chatbubble-outline" size={16} color="#059669" />
              <Text style={styles.chatBtnText}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowStatusMenu(true)} disabled={statusUpdating}>
              <Text style={styles.outlineBtnText}>{statusUpdating ? '…' : 'Status'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dischargeBtn} onPress={handleDischarge}>
              <Text style={styles.dischargeBtnText}>Discharge</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.kpiRow}>
          {[
            { label: 'Sessions', value: sessions.length },
            { label: 'Notes', value: therapyNotes.length + clinicalNotes.length },
            { label: 'Avg Mood', value: avgMood ?? '—' },
            { label: 'Last Session', value: lastSessionLabel },
          ].map((k) => (
            <View key={k.label} style={styles.kpi}>
              <Text style={styles.kpiValue}>{k.value}</Text>
              <Text style={styles.kpiLabel}>{k.label}</Text>
            </View>
          ))}
        </View>

        {/* Opt-in weekly check-in and this week's answers against last week's. */}
        <WeeklyCheckInCard clientId={clientId} accent={TherapistColors.primary} />
        <PatientTranscriptsMobile patientId={clientId} accent={TherapistColors.primary} />
        <RecordGapsCard patientId={clientId} />
        <CodingAssistCard patientId={clientId} accent={TherapistColors.primary} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
          {[...TABS, ...(canPrescribe ? PSYCHIATRY_TABS : [])].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {TAB_LABELS[tab] || (tab.charAt(0).toUpperCase() + tab.slice(1))}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {activeTab === 'prescriptions' && (
          dataSharing.prescriptions === false ? <RestrictedBanner section="prescriptions" /> : <>
            <TouchableOpacity style={docStyles.addRowBtn} onPress={openFullPrescriptionForm}>
              <Ionicons name="add-circle-outline" size={18} color={DoctorColors.primary} />
              <Text style={docStyles.addRowBtnText}>New prescription (full form)</Text>
            </TouchableOpacity>

            {prescriptions.length === 0 && <Text style={docStyles.emptyText}>No prescriptions issued yet</Text>}
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
                <TouchableOpacity key={rx.id} activeOpacity={0.92} onPress={() => setViewingRx(rx)} style={[docStyles.rxCard, isDone && { borderLeftWidth: 3, borderLeftColor: '#22c55e' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Text style={[docStyles.rxMed, { flex: 1 }]}>{medName}</Text>
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
                  {metaLine ? <Text style={docStyles.rxMeta}>{metaLine}</Text> : null}
                  {pm ? (
                    <View style={[docStyles.pharmacyStatusPill, { backgroundColor: pm.bg }]}>
                      <Text style={[docStyles.pharmacyStatusPillText, { color: pm.color }]}>{pm.label}</Text>
                    </View>
                  ) : null}
                  {altMed ? (
                    <Text style={docStyles.rxApprovedAlt}>
                      🔁 {altMed.name || 'Original'} → {altMed.alternativeSuggested} · {altMed.drugStatus === 'approved_replacement' ? `Approved · ${altMed.approvedByDoctorName || rx.doctorName || 'Psychiatrist'}` : 'Waiting for your approval'}
                      {altMed.alternativeRationale ? ` · Why: ${altMed.alternativeRationale}` : ''}
                    </Text>
                  ) : null}
                  {transferredMed ? (
                    <Text style={[docStyles.rxApprovedAlt, { color: '#0369a1' }]}>
                      This drug ({transferredMed.name || 'Drug'}) is transfered to branch ({transferredMed.transferBranchName}{transferredMed.transferBranchAddress ? `, ${transferredMed.transferBranchAddress}` : ''}).
                    </Text>
                  ) : null}
                  {rx.instructions ? <Text style={docStyles.rxInstructions}>{rx.instructions}</Text> : null}
                  {toDateSafe(rx.createdAt) ? (
                    <Text style={docStyles.rxDate}>
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
        {activeTab === 'epharmacy' && (
          <>
            <Text style={[docStyles.sectionTitle, { marginBottom: 12 }]}>Patient Pharmacies</Text>
            {pharmacies.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="storefront-outline" size={40} color="#cbd5e1" />
                <Text style={docStyles.emptyText}>Patient has no pharmacies added</Text>
              </View>
            ) : (
              pharmacies.map((ph, i) => {
                const phRowKey = patientPharmacyKey(ph) || ph.id || String(i);
                const addrLine = ph.address || ph.location;
                const phoneLine = ph.phone || ph.contact;
                return (
                <View key={phRowKey} style={[docStyles.miniCard, { borderLeftWidth: 3, borderLeftColor: '#7c3aed' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={docStyles.miniCardTitle}>{ph.name}</Text>
                    {addrLine ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="location-outline" size={12} color="#94a3b8" />
                        <Text style={docStyles.miniCardSub}>{addrLine}</Text>
                      </View>
                    ) : null}
                    {phoneLine ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <Ionicons name="call-outline" size={12} color="#94a3b8" />
                        <Text style={docStyles.miniCardSub}>{phoneLine}</Text>
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
                        // Only a NessaHub branch can receive a prescription. A manually
                        // typed pharmacy has no account; the old write marked the Rx
                        // "sent" while no pharmacy ever saw it.
                        if (!ph.branchId) {
                          Alert.alert('Not on NessaHub', `${ph.name || 'This pharmacy'} is not on NessaHub, so the prescription cannot be sent to it. Share it with the pharmacy directly, or pick a NessaHub branch.`);
                          return;
                        }
                        const latest = prescriptions[0];
                        if (latest?.deliveredAt || latest?.pharmacyStatus === 'delivered') {
                          Alert.alert('Already delivered', 'The latest prescription has already been delivered and cannot be re-sent.');
                          return;
                        }
                        const elsewhere = latest?.branchId && latest.branchId !== ph.branchId;
                        Alert.alert('Send Prescription', elsewhere
                          ? `The latest prescription is already with ${latest.branchName || latest.pharmacyName || 'another pharmacy'}. Move it to ${ph.branchName || ph.name}?`
                          : `Send the latest prescription to ${ph.name}?`, [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Send', onPress: async () => {
                              const latestRx = prescriptions[0];
                              try {
                                await api(`/api/v1/medical/prescriptions/${latestRx.id}`, {
                                  method: 'PATCH',
                                  body: {
                                    ...(ph.pharmacyId ? { pharmacyId: ph.pharmacyId } : {}),
                                    pharmacyBranchId: ph.branchId,
                                    pharmacyStatus: 'sent',
                                  },
                                });
                                Alert.alert('Sent', `Prescription sent to ${ph.name}.`);
                              } catch (e) { Alert.alert('Error', e?.message || 'Could not send prescription.'); }
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

        {activeTab === 'overview' && (
          <>
            {/* Psychiatry: the Prescriptions section of DoctorPatientOverviewScreen. */}
            {canPrescribe ? (
              <View style={styles.card}>
                <Text style={styles.cardSectionTitle}>Prescriptions ({prescriptions.length})</Text>
                {prescriptions.length === 0 ? (
                  <Text style={{ fontSize: 13, color: '#94a3b8' }}>No prescriptions</Text>
                ) : prescriptions.slice(0, 10).map(rx => (
                  <View key={rx.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#0f172a' }}>{rx.medication || rx.medications?.[0]?.name || 'Prescription'}</Text>
                    {toDateSafe(rx.createdAt) ? (
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{toDateSafe(rx.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Personal information</Text>
              <InfoRow label="Name" value={clientName} />
              <InfoRow label="Email" value={client.clientEmail || client.email || authProfile?.email} />
              <InfoRow label="Phone" value={clientPhone} />
              <InfoRow label="Age" value={displayVal(client.age)} />
              <InfoRow label="Gender" value={displayVal(genderLabel)} />
              <InfoRow label="Country" value={displayVal(client.country)} />
              <InfoRow label="Employment" value={displayVal(client.employment)} />
              <InfoRow label="Relationship" value={displayVal(getClientRelationshipStatus(client))} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Therapy information</Text>
              {/* Say plainly when the intake was never completed. These fields
                  used to render as a column of "—" with no explanation, which
                  reads like a loading failure rather than "this client has not
                  answered yet". */}
              {/* A Second Opinion client has a CASE, not a programme. Their
                  answers are the most important thing here — the specialist is
                  reviewing one specific decision — so they come before the
                  therapy fields rather than being buried among programme
                  details that do not apply to them. */}
              {client.serviceType === 'second_opinion' ? (
                <View style={styles.caseBox}>
                  <Text style={styles.caseTitle}>Second opinion request</Text>
                  {[
                    ['Wants reviewed', client.reviewAreasLabel],
                    ['Reason', client.reason],
                    ['Current diagnosis', client.currentDiagnosis],
                    ['Current treatment', client.currentTreatment],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <View key={label} style={styles.caseRow}>
                      <Text style={styles.caseLabel}>{label}</Text>
                      <Text style={styles.caseValue}>{value}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {canPrescribe ? (
                <TouchableOpacity
                  style={styles.rxBtn}
                  onPress={openFullPrescriptionForm}
                  activeOpacity={0.85}
                >
                  <Ionicons name="medkit-outline" size={17} color="#ffffff" />
                  <Text style={styles.rxBtnText}>Prescribe medication</Text>
                </TouchableOpacity>
              ) : null}

              {client.questionnaireCompleted === false && !client.therapyType
                && client.serviceType !== 'second_opinion' ? (
                <View style={styles.intakeNotice}>
                  <Ionicons name="clipboard-outline" size={16} color="#734e12" />
                  <Text style={styles.intakeNoticeText}>
                    Intake questionnaire not completed — clinical answers are not on file for this client.
                  </Text>
                </View>
              ) : null}
              <InfoRow label="Therapy type" value={displayVal(formatFieldValue(client.therapyType || client.therapyTypes))} />
              <InfoRow label="Session frequency" value={displayVal(client.sessionFrequency)} />
              <InfoRow label="Session structure" value={displayVal(client.sessionStructure)} />
              <InfoRow label="Therapist style" value={displayVal(client.therapistStyle)} />
              <InfoRow label="Assigned therapist" value={displayVal(therapistName)} />
            </View>
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Health & wellness</Text>
              <InfoRow label="Physical health" value={displayVal(client.physicalHealth)} />
              <InfoRow label="Sleep" value={displayVal(client.sleep)} />
              <InfoRow label="Exercise" value={displayVal(client.exercise)} />
              <InfoRow label="Eating habits" value={displayVal(client.eatingHabits)} />
              <InfoRow label="Depression" value={displayVal(client.depression)} />
              <InfoRow label="Anxiety" value={displayVal(client.anxiety)} />
            </View>
            <QuestionnairePanel client={client} />
            {(client.mentalHealthHistory || client.previousTherapy || client.medications) && (
              <View style={styles.card}>
                <Text style={styles.cardSectionTitle}>Mental health history</Text>
                {client.mentalHealthHistory && <InfoRow label="History" value={client.mentalHealthHistory} />}
                {client.previousTherapy && <InfoRow label="Previous therapy" value={client.previousTherapy} />}
                {client.medications && <InfoRow label="Medications" value={client.medications} />}
              </View>
            )}
          </>
        )}

        {activeTab === 'sessions' && (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Scheduled sessions ({sessions.length})</Text>
            {sessions.length === 0 ? (
              <Text style={styles.emptyHint}>No sessions found.</Text>
            ) : (
              sessions.map((sess) => {
                const ssc = sessionStatusColor(sess.status);
                return (
                  <View key={sess.id} style={styles.sessionRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionDate}>
                        {formatSessionDateLabel(sess)}
                        {sessionTimestamp(sess) ? ` · ${formatSessionTimeLabel(sess)}` : ''}
                      </Text>
                      <Text style={styles.sessionMeta}>
                        {sess.sessionType || sess.type || 'Session'}
                        {sess.duration ? ` · ${sess.duration} min` : ''}
                      </Text>
                    </View>
                    <View style={[styles.sessionBadge, { backgroundColor: ssc.bg }]}>
                      <Text style={[styles.sessionBadgeText, { color: ssc.color }]}>
                        {(sess.status || 'scheduled').replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'notes' && (
          <>
            <View style={styles.card}>
              <View style={styles.notesHeader}>
                <Text style={styles.cardSectionTitle}>Therapy notes ({therapyNotes.length})</Text>
                <TouchableOpacity onPress={() => setShowNoteModal(true)}>
                  <Text style={styles.linkText}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {therapyNotes.length === 0 ? (
                <Text style={styles.emptyHint}>No therapy notes yet.</Text>
              ) : (
                therapyNotes.map((n) => <NoteListCard key={n.id} note={n} kind="therapy" onOpen={(note, kind) => setViewingNote({ note, kind })} />)
              )}
            </View>
            <View style={styles.card}>
              <Text style={styles.cardSectionTitle}>Clinical notes ({clinicalNotes.length})</Text>
              {clinicalNotes.length === 0 ? (
                <Text style={styles.emptyHint}>No clinical notes found.</Text>
              ) : (
                clinicalNotes.map((n) => <NoteListCard key={n.id} note={n} kind="clinical" onOpen={(note, kind) => setViewingNote({ note, kind })} />)
              )}
            </View>
          </>
        )}

        {activeTab === 'mood' && (
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Mood tracking ({moodEntries.length})</Text>
            {moodEntries.length === 0 ? (
              <Text style={styles.emptyHint}>No mood entries found.</Text>
            ) : (
              moodEntries.map((entry) => {
                // `mood` holds the LABEL ("Sad", "😔"), not a number — and it is
                // truthy, so it won this || chain and Number("Sad") gave NaN → 0.
                // Every card therefore read "Unknown" and "0/10" even though the
                // entry had a real score. Take the numeric field first.
                const moodVal = Number(
                  entry.moodValue ?? entry.moodScore ?? entry.value ?? entry.rating,
                ) || 0;
                const emoji = MOOD_EMOJI[moodVal] || '😐';
                const rawMood = typeof entry.mood === 'string' ? entry.mood.trim() : '';
                const wordMood = /[a-z]/i.test(rawMood) ? rawMood : '';
                const label = wordMood || MOOD_LABEL[moodVal] || entry.label || 'Unknown';
                const pct = Math.round((moodVal / 10) * 100);
                const barColor = moodVal >= 7 ? '#10b981' : moodVal >= 5 ? '#f59e0b' : '#ef4444';
                return (
                  <View key={entry.id} style={styles.moodRow}>
                    <Text style={styles.moodEmoji}>{emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <View style={styles.moodTop}>
                        <Text style={styles.moodLabel}>{label}</Text>
                        <Text style={[styles.moodScore, { color: barColor }]}>{moodVal}/10</Text>
                      </View>
                      <View style={styles.moodBarBg}>
                        <View style={[styles.moodBarFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                      </View>
                      <Text style={styles.moodDate}>{fmtDate(entry.createdAt || entry.date)}</Text>
                      {(entry.journal || entry.journalEntry || entry.note) && (
                        <Text style={styles.moodJournal}>{entry.journal || entry.journalEntry || entry.note}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'goals' && (
          <View style={styles.card}>
            <View style={styles.notesHeader}>
              <View>
                <Text style={styles.cardSectionTitle}>Treatment goals</Text>
                <Text style={styles.goalSub}>
                  {goals.filter((g) => g.status === 'completed').length}/{goals.length} completed
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowGoalForm((v) => !v)}>
                <Text style={styles.linkText}>+ Add goal</Text>
              </TouchableOpacity>
            </View>
            {showGoalForm && (
              <View style={styles.goalForm}>
                <TextInput style={styles.input} placeholder="Goal title *" value={goalForm.title} onChangeText={(t) => setGoalForm((p) => ({ ...p, title: t }))} />
                <TextInput style={[styles.input, styles.textArea]} placeholder="Description" multiline value={goalForm.description} onChangeText={(t) => setGoalForm((p) => ({ ...p, description: t }))} />
                {/* Target date and priority bring this form to parity with the web
                    therapist dashboard, which collected both while mobile did not. */}
                <TextInput
                  style={styles.input}
                  placeholder="Target date (YYYY-MM-DD)"
                  value={goalForm.targetDate}
                  onChangeText={(t) => setGoalForm((p) => ({ ...p, targetDate: t }))}
                  autoCapitalize="none"
                />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['high', 'medium', 'low'].map((level) => {
                    const active = (goalForm.priority || 'medium') === level;
                    return (
                      <TouchableOpacity
                        key={level}
                        onPress={() => setGoalForm((p) => ({ ...p, priority: level }))}
                        style={[styles.priorityChip, active && styles.priorityChipActive]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.priorityChipText, active && styles.priorityChipTextActive]}>
                          {level.charAt(0).toUpperCase() + level.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveGoal} disabled={savingGoal}>
                  <Text style={styles.primaryBtnText}>{savingGoal ? 'Saving…' : 'Save goal'}</Text>
                </TouchableOpacity>
              </View>
            )}
            {goals.length === 0 ? (
              <Text style={styles.emptyHint}>No treatment goals yet.</Text>
            ) : (
              goals.map((goal) => {
                const isDone = goal.status === 'completed';
                return (
                  <TouchableOpacity key={goal.id} style={[styles.goalRow, isDone && styles.goalRowDone]} onPress={() => handleToggleGoal(goal)}>
                    <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isDone ? '#16a34a' : '#cbd5e1'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.goalTitle, isDone && styles.goalTitleDone]}>{goal.title}</Text>
                      {goal.description ? <Text style={styles.goalDesc}>{goal.description}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Status menu */}
      <Modal visible={showStatusMenu} transparent animationType="fade" onRequestClose={() => setShowStatusMenu(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setShowStatusMenu(false)}>
          <View style={styles.statusMenu}>
            {['active', 'inactive', 'on_hold', 'discharged'].map((s) => {
              const c = statusColor(s);
              return (
                <TouchableOpacity key={s} style={styles.statusMenuItem} onPress={() => handleStatusChange(s)}>
                  <View style={[styles.statusDot, { backgroundColor: c.color }]} />
                  <Text style={[styles.statusMenuText, { color: c.color }]}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Simple add note modal (web ClientDetails parity) */}

      <Modal visible={!!viewingRx} transparent animationType="slide" onRequestClose={() => setViewingRx(null)}>
        <KeyboardAvoidingView
        style={docStyles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={[docStyles.dischargeCard, { maxHeight: '86%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={docStyles.dischargeTitle}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setViewingRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {viewingRx && (
              <ScrollView>
                <Text style={docStyles.dischargeSub}>Patient: {viewingRx.patientName || client?.name || 'Patient'}</Text>
                <Text style={docStyles.dischargeSub}>Diagnosis: {viewingRx.diagnosis || '—'}</Text>
                <Text style={docStyles.dischargeSub}>Date: {viewingRx.date || '—'}</Text>
                {viewingRx.prescriptionRef ? <Text style={docStyles.dischargeSub}>Reference: {viewingRx.prescriptionRef}</Text> : null}
                {(viewingRx.medications || []).map((m, i) => (
                  <View key={i} style={[docStyles.noteCard, { marginTop: 8, marginBottom: 0 }]}>
                    <Text style={docStyles.noteTitle}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</Text>
                    <Text style={docStyles.noteContent}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</Text>
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
                {viewingRx.instructions ? <Text style={[docStyles.noteContent, { marginTop: 10 }]}>Instructions: {viewingRx.instructions}</Text> : null}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={showNoteModal} transparent animationType="slide" onRequestClose={() => setShowNoteModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.menuOverlay}>
            <View style={styles.noteModal}>
              <Text style={styles.modalTitle}>Add therapy note</Text>
              <TextInput style={styles.input} placeholder="Session focus" value={noteForm.sessionFocus} onChangeText={(t) => setNoteForm((p) => ({ ...p, sessionFocus: t }))} />
              <TextInput style={styles.input} placeholder="Mood rating (1–10)" keyboardType="number-pad" value={noteForm.mood} onChangeText={(t) => setNoteForm((p) => ({ ...p, mood: t }))} />
              <TextInput style={styles.input} placeholder="Progress assessment" value={noteForm.progressAssessment} onChangeText={(t) => setNoteForm((p) => ({ ...p, progressAssessment: t }))} />
              <TextInput style={[styles.input, styles.textArea]} placeholder="Clinical notes *" multiline value={noteForm.notes} onChangeText={(t) => setNoteForm((p) => ({ ...p, notes: t }))} />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowNoteModal(false)}>
                  <Text style={styles.outlineBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={handleSaveNote} disabled={savingNote || !noteForm.notes.trim()}>
                  <Text style={styles.primaryBtnText}>{savingNote ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Note detail */}
      <Modal visible={!!viewingNote} transparent animationType="slide" onRequestClose={() => setViewingNote(null)}>
        <View style={styles.menuOverlay}>
          <View style={[styles.noteModal, { maxHeight: '85%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{getNoteTitle(viewingNote?.note, viewingNote?.kind)}</Text>
              <TouchableOpacity onPress={() => setViewingNote(null)}>
                <Ionicons name="close" size={24} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {getNoteSections(viewingNote?.note).map((s) => (
                <View key={s.key} style={styles.noteSection}>
                  <Text style={styles.noteSectionLabel}>{s.label}</Text>
                  <Text style={styles.noteSectionValue}>{s.value}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  // Bottom-sheet shell, matching the other therapy modals.
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '92%' },
  rxBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 999, marginBottom: 12,
    backgroundColor: '#5046bd',
  },
  rxBtnText: { color: '#ffffff', fontSize: 14.5, fontWeight: '800' },
  caseBox: {
    padding: 14,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(80,70,189,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(80,70,189,0.22)',
    gap: 8,
  },
  caseTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#3f3796',
  },
  caseRow: { gap: 2 },
  caseLabel: { fontSize: 12, fontWeight: '600', color: '#44474f' },
  caseValue: { fontSize: 14, color: '#101010' },
  intakeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(115,78,18,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(115,78,18,0.22)',
  },
  intakeNoticeText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#734e12', fontWeight: '600' },
  container: { flex: 1, backgroundColor: TherapistColors.background },
  scroll: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { color: TherapistColors.textSecondary, marginTop: 12 },
  profileCard: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  profileRow: { flexDirection: 'row', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 16, backgroundColor: TherapistColors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800', color: '#ffffff' },
  clientName: { fontSize: 20, fontWeight: '800', color: TherapistColors.text },
  clientMeta: { fontSize: 13, color: TherapistColors.textSecondary, marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 8 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  assigned: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 6 },
  assignedName: { color: TherapistColors.primary, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TherapistColors.primary, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  primaryBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },
  chatBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ecfdf5', borderWidth: 1.5, borderColor: '#10b981', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999 },
  chatBtnText: { color: '#2f7d5f', fontWeight: '700', fontSize: 13 },
  outlineBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
  outlineBtnText: { color: '#0d0d0d', fontWeight: '600', fontSize: 13 },
  dischargeBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  dischargeBtnText: { color: '#8c322d', fontWeight: '600', fontSize: 13 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kpi: { flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  kpiValue: { fontSize: 18, fontWeight: '800', color: TherapistColors.text },
  kpiLabel: { fontSize: 10, color: TherapistColors.textLight, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  tabScroll: { marginBottom: 12 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, marginRight: 6, backgroundColor: 'rgba(95,84,214,0.07)', borderWidth: 1, borderColor: '#e2e8f0' },
  tabActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  tabTextActive: { color: '#ffffff' },
  card: { backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  cardSectionTitle: { fontSize: 14, fontWeight: '800', color: TherapistColors.text, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  infoLabel: { fontSize: 13, color: TherapistColors.textSecondary, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: TherapistColors.text, flex: 1, textAlign: 'right' },
  emptyHint: { color: TherapistColors.textLight, fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'transparent', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  sessionDate: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  sessionMeta: { fontSize: 12, color: TherapistColors.textLight, marginTop: 2 },
  sessionBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  sessionBadgeText: { fontSize: 10, fontWeight: '700' },
  notesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  linkText: { color: TherapistColors.primary, fontWeight: '700', fontSize: 14 },
  noteCard: { padding: 14, backgroundColor: 'transparent', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  noteCardHeader: { flexDirection: 'row', marginBottom: 8 },
  noteCardTitle: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  noteCardDate: { fontSize: 12, color: TherapistColors.textLight, marginTop: 2 },
  readBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readBadgeText: { fontSize: 12, color: TherapistColors.primary, fontWeight: '600' },
  notePreview: { fontSize: 13, color: '#0d0d0d', lineHeight: 20 },
  moodRow: { flexDirection: 'row', gap: 12, padding: 14, backgroundColor: 'transparent', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  moodEmoji: { fontSize: 32 },
  moodTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  moodLabel: { fontWeight: '700', fontSize: 14 },
  moodScore: { fontWeight: '800', fontSize: 16 },
  moodBarBg: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 8, overflow: 'hidden' },
  moodBarFill: { height: 8, borderRadius: 8 },
  moodDate: { fontSize: 11, color: TherapistColors.textLight, marginTop: 6 },
  moodJournal: { fontSize: 13, color: '#0d0d0d', marginTop: 8, lineHeight: 20 },
  goalSub: { fontSize: 12, color: TherapistColors.textLight },
  goalForm: { marginBottom: 12, gap: 8 },
  priorityChip: {
    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
    borderColor: '#e2e8f0', backgroundColor: 'rgba(255,255,255,0.72)', alignItems: 'center',
  },
  priorityChipActive: { borderColor: TherapistColors.primary, backgroundColor: '#eef2ff' },
  priorityChipText: { fontSize: 13, fontWeight: '600', color: '#0d0d0d' },
  priorityChipTextActive: { color: TherapistColors.primary, fontWeight: '700' },
  input: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: 'rgba(16,16,16,0.16)', borderRadius: 10, padding: 12, fontSize: 14, color: TherapistColors.text },
  textArea: { minHeight: 90, textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  goalRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: 'transparent', borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  goalRowDone: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  goalTitle: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  goalTitleDone: { textDecorationLine: 'line-through', color: TherapistColors.textLight },
  goalDesc: { fontSize: 13, color: TherapistColors.textSecondary, marginTop: 4 },
  qHeader: { marginBottom: 12 },
  qCount: { fontSize: 12, color: TherapistColors.textLight },
  qSection: { marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  qSectionTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text, marginBottom: 8 },
  phq9Summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  phq9Score: { fontSize: 13, color: TherapistColors.text },
  phq9Severity: { fontSize: 12, fontWeight: '700', color: TherapistColors.primary },
  qField: { marginBottom: 10,
  },
  qFieldLabel: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 2 },
  qFieldValue: { fontSize: 14, color: TherapistColors.text, lineHeight: 20 },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  statusMenu: { backgroundColor: 'rgba(255,255,255,0.72)', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
  statusMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusMenuText: { fontSize: 15, fontWeight: '600' },
  noteModal: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: TherapistColors.text, marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  noteSection: { marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  noteSectionLabel: { fontSize: 11, fontWeight: '700', color: TherapistColors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  noteSectionValue: { fontSize: 14, color: TherapistColors.text, lineHeight: 22 },
});

// Styles for the Prescriptions / E-Pharmacy tabs, copied from DoctorPatientDetailScreen.
const docStyles = StyleSheet.create({
  addRowBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: DoctorColors.primaryLight, borderRadius: 10, padding: 12, marginBottom: 12,
  },
  addRowBtnText: { fontSize: 14, color: DoctorColors.primary, fontWeight: '700' },
  dischargeCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
  },
  dischargeSub: { fontSize: 13, color: DoctorColors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  dischargeTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text, textAlign: 'center', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 20 },
  miniCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  miniCardSub: { fontSize: 11, color: DoctorColors.textSecondary, marginTop: 2 },
  miniCardTitle: { fontSize: 13, fontWeight: '600', color: DoctorColors.text },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  noteCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  noteContent: { fontSize: 13, color: DoctorColors.textSecondary, lineHeight: 19 },
  noteTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text },
  pharmacyStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6,
  },
  pharmacyStatusPillText: { fontSize: 11, fontWeight: '700' },
  rxApprovedAlt: { fontSize: 12, color: '#16a34a', fontWeight: '600', marginTop: 4 },
  rxCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rxDate: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  rxInstructions: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 4, fontStyle: 'italic' },
  rxMed: { fontSize: 15, fontWeight: '700', color: DoctorColors.text, marginBottom: 2 },
  rxMeta: { fontSize: 12, color: DoctorColors.textSecondary },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text, marginBottom: 10 },
});
