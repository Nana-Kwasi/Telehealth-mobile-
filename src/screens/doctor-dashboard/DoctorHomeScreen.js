import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_COLORS = {
  pending:   { bg: '#fff7ed', text: '#c2410c' },
  confirmed: { bg: '#f0fdf4', text: '#15803d' },
  completed: { bg: '#f1f5f9', text: '#475569' },
  cancelled: { bg: '#fff1f2', text: '#be123c' },
};

export default function DoctorHomeScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ patients: 0, todayAppts: 0, pending: 0, completed: 0 });
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      // Load doctor profile
      const docSnap = await getDoc(doc(db, 'doctors', currentUser.uid));
      if (docSnap.exists()) setProfile(docSnap.data());

      // Load appointments
      const apptQ = query(
        collection(db, 'doctorAppointments'),
        where('doctorId', '==', currentUser.uid)
      );
      const apptSnap = await getDocs(apptQ);
      const appts = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const todayAppts = appts
        .filter(a => a.date === TODAY)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

      const patientIds = new Set(appts.map(a => a.clientId).filter(Boolean));

      setStats({
        patients: patientIds.size,
        todayAppts: todayAppts.length,
        pending: appts.filter(a => a.status === 'pending').length,
        completed: appts.filter(a => a.status === 'completed').length,
      });
      setTodayAppointments(todayAppts);
    } catch (err) {
      console.error('DoctorHome load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={DoctorColors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={DoctorColors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()},</Text>
          <Text style={styles.doctorName}>Dr. {profile?.name || 'Doctor'}</Text>
          <Text style={styles.specialty}>{profile?.specialty || profile?.specialization || 'General Practice'}</Text>
        </View>
        <View style={styles.verifiedPill}>
          <Ionicons name="checkmark-circle" size={14} color="#10b981" />
          <Text style={styles.verifiedText}>Verified</Text>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        {[
          { label: 'Total Patients', value: stats.patients, icon: 'people-outline', color: DoctorColors.primary, bg: DoctorColors.primaryLight },
          { label: "Today's Appts", value: stats.todayAppts, icon: 'today-outline', color: '#6366f1', bg: '#f0f0ff' },
          { label: 'Pending', value: stats.pending, icon: 'time-outline', color: '#f59e0b', bg: '#fffbeb' },
          { label: 'Completed', value: stats.completed, icon: 'checkmark-circle-outline', color: '#10b981', bg: '#f0fdf4' },
        ].map((s, i) => (
          <View key={i} style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: s.bg }]}>
              <Ionicons name={s.icon} size={22} color={s.color} />
            </View>
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          {[
            { label: 'Patients', icon: 'people', screen: 'DoctorPatients' },
            { label: 'Appointments', icon: 'calendar', screen: 'DoctorAppointments' },
            { label: 'Messages', icon: 'chatbubbles', screen: 'DoctorMessages' },
            { label: 'Settings', icon: 'settings', screen: 'DoctorSettings' },
          ].map((a, i) => (
            <TouchableOpacity
              key={i}
              style={styles.actionBtn}
              onPress={() => navigation.navigate(a.screen)}
            >
              <View style={styles.actionIcon}>
                <Ionicons name={`${a.icon}-outline`} size={24} color={DoctorColors.primary} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Today's Appointments */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DoctorAppointments')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        {todayAppointments.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>No appointments today</Text>
          </View>
        ) : (
          todayAppointments.map(appt => {
            const sc = STATUS_COLORS[appt.status] || STATUS_COLORS.pending;
            return (
              <View key={appt.id} style={styles.apptCard}>
                <View style={styles.apptTime}>
                  <Text style={styles.apptTimeText}>{appt.time || '--:--'}</Text>
                </View>
                <View style={styles.apptInfo}>
                  <Text style={styles.apptPatient}>{appt.clientName || 'Patient'}</Text>
                  <Text style={styles.apptType}>{appt.type || 'Consultation'} · {appt.reason || ''}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.text }]}>
                    {appt.status || 'pending'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: DoctorColors.primaryDark,
    padding: 24,
    paddingTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginBottom: 2 },
  doctorName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 2 },
  specialty: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  verifiedText: { fontSize: 11, color: '#10b981', fontWeight: '700', marginLeft: 2 },
  statsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    padding: 16, gap: 12,
  },
  statCard: {
    flex: 1, minWidth: '44%',
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  statIcon: {
    width: 46, height: 46, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  statValue: { fontSize: 24, fontWeight: '800', color: DoctorColors.text, marginBottom: 2 },
  statLabel: { fontSize: 11, color: DoctorColors.textSecondary, textAlign: 'center' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DoctorColors.text, marginBottom: 12 },
  seeAll: { fontSize: 13, color: DoctorColors.primary, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionBtn: { alignItems: 'center', flex: 1 },
  actionIcon: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  actionLabel: { fontSize: 12, color: DoctorColors.textSecondary, fontWeight: '500' },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 32,
    alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  apptCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  apptTime: {
    backgroundColor: DoctorColors.primaryLight,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 12,
  },
  apptTimeText: { fontSize: 13, fontWeight: '700', color: DoctorColors.primary },
  apptInfo: { flex: 1 },
  apptPatient: { fontSize: 14, fontWeight: '600', color: DoctorColors.text },
  apptType: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
