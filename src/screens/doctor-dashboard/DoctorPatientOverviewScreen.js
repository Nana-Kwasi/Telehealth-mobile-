import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, getDoc, doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { DoctorColors as C } from '../../constants/colors';

function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

function fmt(ts) {
  if (!ts?.seconds) return '—';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Firestore stores `patientProfiles.vitals.latest`; tolerate legacy flat shapes */
function pickLatestVitals(pd) {
  if (!pd || typeof pd !== 'object') return null;
  const nested = pd.vitals?.latest;
  if (nested && typeof nested === 'object') return nested;
  const legacy = pd.latestVitals;
  if (legacy && typeof legacy === 'object') {
    if (legacy.latest && typeof legacy.latest === 'object') return legacy.latest;
    if (legacy.bpSystolic != null || legacy.heartRate != null || legacy.temperature != null || legacy.spo2 != null || legacy.respiratoryRate != null) {
      return legacy;
    }
  }
  return null;
}

export default function DoctorPatientOverviewScreen({ route, navigation }) {
  const { patientId, patientName } = route.params || {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [patient, setPatient] = useState({ name: patientName || 'Patient', email: '' });
  const [profile, setProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [notes, setNotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [vitals, setVitals] = useState(null);
  const [status, setStatus] = useState('active');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !patientId) {
      setLoading(false);
      return;
    }
    try {
      const [
        authSnap, profSnap, apptSnap, rxSnap, notesSnap, ordSnap, tlSnap,
      ] = await Promise.all([
        getDoc(doc(db, 'auth', patientId)).catch(() => null),
        getDoc(doc(db, 'patientProfiles', patientId)).catch(() => null),
        getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', uid), where('clientId', '==', patientId))),
        getDocs(query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', uid), where('patientId', '==', patientId))),
        getDocs(query(collection(db, 'doctorNotes'), where('doctorId', '==', uid), where('patientId', '==', patientId))),
        getDocs(query(collection(db, 'diagnosticOrders'), where('patientId', '==', patientId))),
        getDocs(query(collection(db, 'patientTimeline'), where('patientId', '==', patientId))),
      ]);

      const authData = authSnap?.exists() ? authSnap.data() : {};
      const displayName = authData.name || authData.displayName || patientName || 'Patient';
      const email = authData.email || '';
      setPatient({ name: displayName, email });

      if (profSnap?.exists()) {
        const pd = profSnap.data();
        setProfile(pd);
        setStatus(pd.status || 'active');
        setVitals(pickLatestVitals(pd));
      }

      const appts = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setAppointments(appts);

      const rx = rxSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(rx);

      const n = notesSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotes(n);

      const o = ordSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(x => x.doctorId === uid)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(o);

      const tl = tlSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 40);
      setTimeline(tl);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [patientId]));

  const setPatientStatus = async (next) => {
    setBusy(true);
    try {
      await setDoc(doc(db, 'patientProfiles', patientId), {
        status: next,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid,
      }, { merge: true });
      setStatus(next);
    } catch {
      Alert.alert('Error', 'Could not update status.');
    } finally {
      setBusy(false);
    }
  };

  const pharmacies = Array.isArray(profile?.pharmacies) ? profile.pharmacies : [];

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.heroAvatar}><Text style={styles.heroAvatarText}>{initials(patient.name)}</Text></View>
        <Text style={styles.heroName}>{patient.name}</Text>
        {patient.email ? <Text style={styles.heroEmail}>{patient.email}</Text> : null}
        <View style={[styles.statusPill, { borderColor: status === 'active' ? '#86efac' : status === 'inactive' ? '#fdba74' : '#fca5a5' }]}>
          <Text style={styles.statusPillText}>{status}</Text>
        </View>
        <View style={styles.heroActions}>
          {status === 'active' && (
            <TouchableOpacity style={[styles.hBtn, styles.hBtnWarn]} onPress={() => Alert.alert('Set inactive?', '', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Confirm', onPress: () => setPatientStatus('inactive') },
            ])} disabled={busy}>
              <Text style={styles.hBtnText}>Inactive</Text>
            </TouchableOpacity>
          )}
          {status === 'inactive' && (
            <TouchableOpacity style={[styles.hBtn, styles.hBtnOk]} onPress={() => setPatientStatus('active')} disabled={busy}>
              <Text style={styles.hBtnText}>Activate</Text>
            </TouchableOpacity>
          )}
          {status !== 'discharged' && (
            <TouchableOpacity style={[styles.hBtn, styles.hBtnDanger]} onPress={() => Alert.alert('Discharge patient?', 'They can still message you depending on settings.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Discharge', style: 'destructive', onPress: () => setPatientStatus('discharged') },
            ])} disabled={busy}>
              <Text style={styles.hBtnText}>Discharge</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 36 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}
      >
        <View style={styles.statsRow}>
          {[
            { icon: 'calendar-outline', label: 'Visits', value: appointments.length },
            { icon: 'medkit-outline', label: 'Rx', value: prescriptions.length },
            { icon: 'flask-outline', label: 'Lab/Scan', value: orders.length },
            { icon: 'document-text-outline', label: 'Notes', value: notes.length },
          ].map(s => (
            <View key={s.label} style={styles.statCard}>
              <Ionicons name={s.icon} size={18} color={C.primary} />
              <Text style={styles.statVal}>{s.value}</Text>
              <Text style={styles.statLbl}>{s.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.linkCard} onPress={() => navigation.getParent()?.navigate('DoctorPatientDetail', { patientId, patientName: patient.name })}>
          <Ionicons name="reader-outline" size={22} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Full clinical record</Text>
            <Text style={styles.linkSub}>Notes, vitals detail, prescriptions, E‑Pharmacy, intake &amp; more</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </TouchableOpacity>

        <Section title="Appointments" icon="calendar">
          {appointments.length === 0 ? <Empty text="No appointments yet" /> : appointments.slice(0, 12).map(a => (
            <Row key={a.id} title={a.date || '—'} subtitle={`${a.status || 'pending'} · ${a.reason || a.consultationType || ''}`} />
          ))}
        </Section>

        <Section title="Prescriptions" icon="medkit">
          {prescriptions.length === 0 ? <Empty text="No prescriptions" /> : prescriptions.slice(0, 10).map(rx => (
            <Row key={rx.id} title={rx.medication || rx.medications?.[0]?.name || 'Prescription'} subtitle={fmt(rx.createdAt)} />
          ))}
        </Section>

        <Section title="Lab & scan orders" icon="flask">
          {orders.length === 0 ? <Empty text="No diagnostic orders" /> : orders.slice(0, 12).map(o => (
            <Row key={o.id} title={o.testType || 'Order'} subtitle={`${o.centerName || 'Center'} · ${o.status || ''}`} />
          ))}
        </Section>

        <Section title="Clinical notes" icon="document-text">
          {notes.length === 0 ? <Empty text="No notes" /> : notes.slice(0, 8).map(n => (
            <Row key={n.id} title={n.title || n.type || 'Note'} subtitle={(n.content || '').slice(0, 80) + ((n.content || '').length > 80 ? '…' : '')} />
          ))}
        </Section>

        {pharmacies.length > 0 && (
          <Section title="Patient pharmacies" icon="storefront">
            {pharmacies.slice(0, 8).map((ph, i) => (
              <Row key={i} title={ph.name || 'Pharmacy'} subtitle={ph.address || ph.phone || ''} />
            ))}
          </Section>
        )}

        <Section title="Latest vitals (profile)" icon="pulse-outline">
          {vitals ? (
            <View style={styles.vitalsCard}>
              {vitals.recordedAt?.seconds ? (
                <View style={styles.vitalsRow}>
                  <Text style={styles.vitalsLabel}>Recorded</Text>
                  <Text style={styles.vitalsValueMuted}>
                    {new Date(vitals.recordedAt.seconds * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              ) : null}
              {(vitals.bpSystolic || vitals.bpDiastolic) ? (
                <View style={styles.vitalsRow}>
                  <Text style={styles.vitalsLabel}>Blood pressure</Text>
                  <Text style={styles.vitalsValue}>{vitals.bpSystolic || '—'} / {vitals.bpDiastolic || '—'} mmHg</Text>
                </View>
              ) : null}
              {vitals.heartRate ? (
                <View style={styles.vitalsRow}>
                  <Text style={styles.vitalsLabel}>Heart rate</Text>
                  <Text style={styles.vitalsValue}>{vitals.heartRate} bpm</Text>
                </View>
              ) : null}
              {vitals.respiratoryRate ? (
                <View style={styles.vitalsRow}>
                  <Text style={styles.vitalsLabel}>Respiratory rate</Text>
                  <Text style={styles.vitalsValue}>{vitals.respiratoryRate} /min</Text>
                </View>
              ) : null}
              {vitals.spo2 ? (
                <View style={styles.vitalsRow}>
                  <Text style={styles.vitalsLabel}>SpO₂</Text>
                  <Text style={styles.vitalsValue}>{vitals.spo2}%</Text>
                </View>
              ) : null}
              {vitals.temperature ? (
                <View style={[styles.vitalsRow, { borderBottomWidth: 0 }]}>
                  <Text style={styles.vitalsLabel}>Temperature</Text>
                  <Text style={styles.vitalsValue}>{vitals.temperature} °{vitals.tempUnit || 'C'}</Text>
                </View>
              ) : null}
              {!vitals.recordedAt?.seconds && !(vitals.bpSystolic || vitals.bpDiastolic || vitals.heartRate || vitals.respiratoryRate || vitals.spo2 || vitals.temperature) ? (
                <Text style={styles.empty}>Vitals object present but no numeric fields — ask patient to re-save vitals.</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.empty}>No vitals logged yet. Patient can record vitals from their home screen.</Text>
          )}
        </Section>

        <Section title="Timeline" icon="time-outline">
          {timeline.length === 0 ? <Empty text="No timeline events" /> : timeline.slice(0, 15).map(t => (
            <Row key={t.id} title={t.title || t.type || 'Event'} subtitle={fmt(t.createdAt)} />
          ))}
        </Section>

        <View style={styles.quickLinks}>
          <TouchableOpacity style={styles.ql} onPress={() => navigation.navigate('DoctorMain', { screen: 'DoctorMessages', params: { patientId, patientName: patient.name } })}>
            <Ionicons name="chatbubbles-outline" size={20} color="#0369a1" />
            <Text style={styles.qlText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ql} onPress={() => navigation.navigate('DoctorDiagnosticOrder')}>
            <Ionicons name="flask-outline" size={20} color="#065f46" />
            <Text style={styles.qlText}>Order lab/scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ql} onPress={() => navigation.navigate('DoctorPatientTimeline', { patientId, patientName: patient.name })}>
            <Ionicons name="git-branch-outline" size={20} color="#7c3aed" />
            <Text style={styles.qlText}>Timeline view</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      )}
    </View>
  );
}

function Section({ title, icon, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Ionicons name={icon} size={18} color={C.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({ title, subtitle }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function Empty({ text }) {
  return <Text style={styles.empty}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  hero: {
    backgroundColor: C.primaryDark,
    paddingTop: 52,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: { position: 'absolute', left: 12, top: 48, padding: 6, zIndex: 2 },
  heroAvatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)',
  },
  heroAvatarText: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  statusPill: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  statusPillText: { color: '#fff', fontWeight: '700', fontSize: 12, textTransform: 'capitalize' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, justifyContent: 'center' },
  hBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  hBtnWarn: { backgroundColor: 'rgba(251,191,36,0.25)' },
  hBtnOk: { backgroundColor: 'rgba(52,211,153,0.25)' },
  hBtnDanger: { backgroundColor: 'rgba(248,113,113,0.25)' },
  hBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scroll: { flex: 1 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16 },
  statCard: {
    flexGrow: 1,
    minWidth: '22%',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  statVal: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 4 },
  statLbl: { fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: '600' },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  linkTitle: { fontSize: 15, fontWeight: '800', color: C.text },
  linkSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  section: { marginHorizontal: 16, marginBottom: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  sectionBody: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  row: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 3 },
  empty: { padding: 16, color: '#94a3b8', fontSize: 13 },
  vitalsCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  vitalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  vitalsLabel: { fontSize: 13, color: '#64748b', fontWeight: '600', flexShrink: 0 },
  vitalsValue: { fontSize: 14, fontWeight: '700', color: C.text, textAlign: 'right', flex: 1 },
  vitalsValueMuted: { fontSize: 12, color: '#94a3b8', textAlign: 'right', flex: 1 },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 8 },
  ql: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  qlText: { fontSize: 13, fontWeight: '700', color: C.text },
  loading: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
});
