import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { fetchClientAppointments, fetchClientPrescriptions } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const C = MedicalColors;

const TABS = [
  { key: 'consultations', label: 'Consultations',  icon: 'document-text-outline' },
  { key: 'prescriptions', label: 'Prescriptions',  icon: 'medkit-outline' },
  { key: 'records',       label: 'Health Records', icon: 'folder-open-outline' },
];

const TYPE_ICONS = {
  'Lab Result': 'flask-outline', 'X-Ray': 'scan-outline', 'MRI / CT Scan': 'body-outline',
  'Vaccination': 'medical-outline', 'Surgery Report': 'cut-outline', 'Allergy Test': 'alert-circle-outline',
  'Blood Test': 'water-outline', 'Ultrasound': 'pulse-outline', 'Prescription': 'document-text-outline', 'Other': 'folder-open-outline',
};

const MedicalHistoryScreen = () => {
  const [activeTab, setActiveTab] = useState('consultations');
  const [pastAppointments, setPastAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [healthRecords, setHealthRecords] = useState([]);
  const [allergies, setAllergies] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const cu = auth.currentUser;
      if (!cu) return;
      const uid = cu.uid;

      const [appts, rxs] = await Promise.all([
        fetchClientAppointments(uid),
        fetchClientPrescriptions(uid),
      ]);

      setPastAppointments(appts.filter(a => a.status === 'completed'));
      setPrescriptions(rxs);

      // Load health records and allergies from patientProfiles
      try {
        const profSnap = await getDoc(doc(db, 'patientProfiles', uid));
        if (profSnap.exists()) {
          const pd = profSnap.data();
          setHealthRecords(pd.healthRecords || []);
        }
      } catch (_) {}

      // Load allergies from auth doc
      try {
        const authSnap = await getDoc(doc(db, 'auth', uid));
        if (authSnap.exists()) setAllergies(authSnap.data().allergies || '');
      } catch (_) {}
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Ionicons name={t.icon} size={15} color={activeTab === t.key ? '#fff' : C.textSecondary} />
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        {/* ── CONSULTATIONS ── */}
        {activeTab === 'consultations' && (
          pastAppointments.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={56} color={C.textLight} />
              <Text style={styles.emptyTitle}>No past consultations</Text>
              <Text style={styles.emptySubtitle}>Your completed appointments will appear here.</Text>
            </View>
          ) : (
            pastAppointments.map(appt => (
              <View key={appt.id} style={styles.historyCard}>
                <View style={styles.cardRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(appt.doctorName || 'D')[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.doctorName}>Dr. {appt.doctorName}</Text>
                    <Text style={styles.specialty}>{appt.doctorSpecialization || 'Doctor'}</Text>
                  </View>
                  <View style={styles.completedBadge}>
                    <Text style={styles.completedBadgeText}>Completed</Text>
                  </View>
                </View>
                <View style={styles.cardMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={C.textSecondary} />
                    <Text style={styles.metaText}>{appt.date}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={C.textSecondary} />
                    <Text style={styles.metaText}>{appt.time}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name={appt.consultationType === 'video' ? 'videocam-outline' : 'chatbubble-outline'} size={13} color={C.textSecondary} />
                    <Text style={styles.metaText}>{(appt.consultationType || 'video').charAt(0).toUpperCase() + (appt.consultationType || 'video').slice(1)}</Text>
                  </View>
                </View>
                {appt.notes ? (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesLabel}>Notes</Text>
                    <Text style={styles.notesText}>{appt.notes}</Text>
                  </View>
                ) : null}
              </View>
            ))
          )
        )}

        {/* ── PRESCRIPTIONS ── */}
        {activeTab === 'prescriptions' && (
          prescriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="medical-outline" size={56} color={C.textLight} />
              <Text style={styles.emptyTitle}>No prescriptions</Text>
              <Text style={styles.emptySubtitle}>Prescriptions from your doctors will appear here.</Text>
            </View>
          ) : (
            prescriptions.map(rx => {
              const meds = Array.isArray(rx.medications) && rx.medications.length > 0
                ? rx.medications
                : [{ name: rx.medication || rx.medicationName || 'Medication', dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }];
              const isCompleted = rx.status === 'completed';
              return (
                <View key={rx.id} style={[styles.rxCard, isCompleted && styles.rxCardDone]}>
                  <View style={styles.rxHeader}>
                    <Ionicons name="document-text" size={18} color={isCompleted ? '#22c55e' : C.primary} />
                    <Text style={styles.rxTitle}>{meds[0]?.name || 'Prescription'}</Text>
                    <View style={[styles.rxBadge, isCompleted ? styles.rxBadgeDone : styles.rxBadgeActive]}>
                      <Text style={[styles.rxBadgeText, isCompleted ? { color: '#16a34a' } : { color: C.primary }]}>
                        {isCompleted ? 'Completed' : 'Active'}
                      </Text>
                    </View>
                  </View>
                  {meds.map((m, i) => (
                    <View key={i}>
                      {m.dosage && <View style={styles.rxRow}><Text style={styles.rxLabel}>Dosage</Text><Text style={styles.rxValue}>{m.dosage}</Text></View>}
                      {m.frequency && <View style={styles.rxRow}><Text style={styles.rxLabel}>Frequency</Text><Text style={styles.rxValue}>{m.frequency}</Text></View>}
                      {m.duration && <View style={styles.rxRow}><Text style={styles.rxLabel}>Duration</Text><Text style={styles.rxValue}>{m.duration}</Text></View>}
                    </View>
                  ))}
                  {rx.doctorName && <View style={styles.rxRow}><Text style={styles.rxLabel}>Prescribed by</Text><Text style={styles.rxValue}>Dr. {rx.doctorName}</Text></View>}
                  {rx.date && <View style={styles.rxRow}><Text style={styles.rxLabel}>Date</Text><Text style={styles.rxValue}>{rx.date}</Text></View>}
                  {rx.instructions ? <View style={styles.rxNotes}><Text style={styles.rxNotesText}>{rx.instructions}</Text></View> : null}
                </View>
              );
            })
          )
        )}

        {/* ── HEALTH RECORDS ── */}
        {activeTab === 'records' && (
          <>
            {/* Allergies */}
            {allergies ? (
              <View style={styles.allergyCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Ionicons name="alert-circle" size={18} color="#dc2626" />
                  <Text style={styles.allergyTitle}>Known Allergies</Text>
                </View>
                <Text style={styles.allergyText}>{allergies}</Text>
              </View>
            ) : null}

            {/* Health Records */}
            {healthRecords.length === 0 && !allergies ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={56} color={C.textLight} />
                <Text style={styles.emptyTitle}>No health records</Text>
                <Text style={styles.emptySubtitle}>Add your health records from the Health Records section in My Profile.</Text>
              </View>
            ) : (
              <>
                {healthRecords.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>Medical Files & Records</Text>
                    {healthRecords.map((rec, i) => {
                      const icon = TYPE_ICONS[rec.type] || 'folder-open-outline';
                      return (
                        <View key={i} style={styles.recCard}>
                          <View style={styles.recIconWrap}>
                            <Ionicons name={icon} size={20} color={C.primary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recName}>{rec.name || rec.type || 'Record'}</Text>
                            <Text style={styles.recType}>{rec.type}{rec.date ? '  ·  ' + rec.date : ''}</Text>
                            {rec.notes ? <Text style={styles.recNotes} numberOfLines={2}>{rec.notes}</Text> : null}
                          </View>
                          {rec.fileUrl ? (
                            <TouchableOpacity onPress={() => Linking.openURL(rec.fileUrl)} style={styles.recDownload}>
                              <Ionicons name="download-outline" size={18} color={C.primary} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
  tabBar: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: C.border },
  tabBarContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  tabActive: { backgroundColor: C.primary, borderColor: C.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  tabTextActive: { color: '#fff' },
  content: { padding: 16, paddingTop: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.text, marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: C.textSecondary, marginTop: 6, textAlign: 'center' },
  historyCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16, fontWeight: '700', color: C.primary },
  doctorName: { fontSize: 15, fontWeight: '700', color: C.text },
  specialty: { fontSize: 12, color: C.textSecondary },
  completedBadge: { backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  completedBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: C.textSecondary },
  notesSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  notesLabel: { fontSize: 12, fontWeight: '600', color: C.textSecondary, marginBottom: 4 },
  notesText: { fontSize: 13, color: C.text, lineHeight: 19 },
  rxCard: { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  rxCardDone: { opacity: 0.75 },
  rxHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  rxTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
  rxBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rxBadgeActive: { backgroundColor: C.primaryLight },
  rxBadgeDone: { backgroundColor: '#dcfce7' },
  rxBadgeText: { fontSize: 11, fontWeight: '700' },
  rxRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  rxLabel: { fontSize: 13, color: C.textSecondary },
  rxValue: { fontSize: 13, color: C.text, fontWeight: '500' },
  rxNotes: { marginTop: 10, padding: 10, backgroundColor: C.background, borderRadius: 8 },
  rxNotesText: { fontSize: 13, color: C.textSecondary, lineHeight: 18 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.5, marginBottom: 10, marginTop: 4 },
  allergyCard: {
    backgroundColor: '#fff1f2', borderRadius: 12, padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: '#fecdd3',
  },
  allergyTitle: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  allergyText: { fontSize: 14, color: '#9f1239', lineHeight: 20 },
  recCard: {
    backgroundColor: C.surface, borderRadius: 12, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: C.border,
  },
  recIconWrap: { width: 42, height: 42, borderRadius: 10, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  recName: { fontSize: 14, fontWeight: '700', color: C.text },
  recType: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  recNotes: { fontSize: 12, color: C.textSecondary, marginTop: 3 },
  recDownload: { width: 36, height: 36, borderRadius: 8, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
});

export default MedicalHistoryScreen;
