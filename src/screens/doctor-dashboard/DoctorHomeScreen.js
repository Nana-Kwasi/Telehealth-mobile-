import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const TODAY = new Date().toISOString().split('T')[0];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const SCREEN_W = Dimensions.get('window').width;

const STATUS_COLORS = {
  pending:   { bg: '#fffbeb', text: '#c2410c', icon: 'time-outline',           dot: '#f59e0b' },
  confirmed: { bg: '#f0fdf4', text: '#15803d', icon: 'checkmark-circle-outline', dot: '#22c55e' },
  completed: { bg: '#f1f5f9', text: '#475569', icon: 'star-outline',            dot: '#6366f1' },
  cancelled: { bg: '#fff1f2', text: '#be123c', icon: 'close-circle-outline',    dot: '#ef4444' },
};

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export default function DoctorHomeScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [allAppts, setAllAppts] = useState([]);
  const [stats, setStats] = useState({ patients: 0, todayAppts: 0, pending: 0, completed: 0, revenue: 0, weekAppts: 0 });
  const [todaySchedule, setTodaySchedule] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [recentPatients, setRecentPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Calendar
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      if (dSnap.exists()) setProfile({ id: cu.uid, ...dSnap.data() });

      const apptSnap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const appts = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const todayAppts = appts.filter(a => a.date === TODAY).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const pending = appts.filter(a => a.status === 'pending');
      const completed = appts.filter(a => a.status === 'completed');

      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split('T')[0];
      const weekAppts = appts.filter(a => a.date >= TODAY && a.date <= weekEndStr && a.status !== 'cancelled');

      const revenue = completed.reduce((s, a) => s + (Number(a.consultationFee) || 0), 0);

      const patMap = new Map();
      appts.forEach(a => {
        if (!a.clientId) return;
        const prev = patMap.get(a.clientId);
        if (!prev || (a.date || '') > (prev.lastDate || '')) {
          patMap.set(a.clientId, { id: a.clientId, name: a.clientName || 'Patient', lastDate: a.date || '' });
        }
      });

      const activity = [...appts]
        .filter(a => a.createdAt)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 6);

      setStats({
        patients: patMap.size,
        todayAppts: todayAppts.length,
        pending: pending.length,
        completed: completed.length,
        revenue,
        weekAppts: weekAppts.length,
      });
      setAllAppts(appts);
      setTodaySchedule(todayAppts);
      setRecentActivity(activity);
      setRecentPatients(Array.from(patMap.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate)).slice(0, 5));
    } catch (err) {
      console.error('DoctorHome load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning 👨‍⚕️';
    if (h < 17) return 'Good Afternoon 👨‍⚕️';
    return 'Good Evening 👨‍⚕️';
  };

  // Build calendar grid
  const apptsByDate = {};
  allAppts.forEach(a => {
    if (!a.date) return;
    if (!apptsByDate[a.date]) apptsByDate[a.date] = [];
    apptsByDate[a.date].push(a);
  });

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const nextMonth = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };

  const activityMessage = (appt) => {
    if (appt.status === 'pending') return `${appt.clientName || 'Patient'} booked an appointment`;
    if (appt.status === 'confirmed') return `Appointment confirmed with ${appt.clientName || 'Patient'}`;
    if (appt.status === 'completed') return `Session completed with ${appt.clientName || 'Patient'}`;
    return `Appointment cancelled — ${appt.clientName || 'Patient'}`;
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={DoctorColors.primary} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.doctorName}>Dr. {profile?.name || 'Doctor'}</Text>
          <Text style={styles.specialty}>{profile?.specialty || profile?.specialization || 'General Practice'}</Text>
        </View>
        <View style={styles.verifiedPill}>
          <Ionicons name="shield-checkmark" size={13} color="#10b981" />
          <Text style={styles.verifiedText}>Verified</Text>
        </View>
      </View>

      {/* Badges */}
      <View style={styles.badgesRow}>
        <View style={styles.badge}>
          <Ionicons name="today-outline" size={13} color={DoctorColors.primary} />
          <Text style={styles.badgeText}>{stats.todayAppts} today</Text>
        </View>
        {stats.pending > 0 && (
          <View style={[styles.badge, { backgroundColor: '#fff7ed' }]}>
            <Ionicons name="time-outline" size={13} color="#c2410c" />
            <Text style={[styles.badgeText, { color: '#c2410c' }]}>{stats.pending} pending</Text>
          </View>
        )}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        {[
          { label: 'Total Patients', value: stats.patients,   icon: 'people-outline',            color: '#2563eb', bg: '#eff6ff' },
          { label: "Today's Appts",  value: stats.todayAppts, icon: 'calendar-outline',           color: '#16a34a', bg: '#dcfce7' },
          { label: 'Pending',        value: stats.pending,    icon: 'time-outline',               color: '#d97706', bg: '#fef9c3' },
          { label: 'Completed',      value: stats.completed,  icon: 'checkmark-circle-outline',   color: '#7c3aed', bg: '#f3e8ff' },
          { label: 'Est. Revenue',   value: `₵${stats.revenue.toLocaleString()}`, icon: 'trending-up-outline', color: '#059669', bg: '#d1fae5' },
          { label: 'This Week',      value: stats.weekAppts,  icon: 'pulse-outline',              color: '#0284c7', bg: '#e0f2fe' },
        ].map((s, i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: s.bg }]}>
            <View style={[styles.statIcon, { backgroundColor: s.color + '22' }]}>
              <Ionicons name={s.icon} size={20} color={s.color} />
            </View>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickRow}>
          {[
            { label: 'Patients',      icon: 'people',       screen: 'DoctorPatients' },
            { label: 'Appointments',  icon: 'calendar',     screen: 'DoctorAppointments' },
            { label: 'Video Calls',   icon: 'videocam',     screen: 'DoctorVideo' },
            { label: 'Prescriptions', icon: 'medkit',       screen: 'DoctorPrescriptions' },
          ].map((a, i) => (
            <TouchableOpacity key={i} style={styles.quickBtn} onPress={() => navigation.navigate(a.screen)}>
              <View style={styles.quickIcon}>
                <Ionicons name={`${a.icon}-outline`} size={22} color={DoctorColors.primary} />
              </View>
              <Text style={styles.quickLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Mini Calendar */}
      <View style={styles.section}>
        <View style={styles.calHeader}>
          <TouchableOpacity onPress={prevMonth} style={styles.calNav}>
            <Ionicons name="chevron-back" size={18} color={DoctorColors.text} />
          </TouchableOpacity>
          <Text style={styles.calTitle}>{MONTHS[calMonth]} {calYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.calNav}>
            <Ionicons name="chevron-forward" size={18} color={DoctorColors.text} />
          </TouchableOpacity>
        </View>

        {/* Day headers */}
        <View style={styles.calDayRow}>
          {DAYS_SHORT.map(d => <Text key={d} style={styles.calDayHeader}>{d}</Text>)}
        </View>

        {/* Grid */}
        <View style={styles.calGrid}>
          {cells.map((day, idx) => {
            if (!day) return <View key={idx} style={styles.calCell} />;
            const dateStr = toDateStr(calYear, calMonth, day);
            const dayAppts = apptsByDate[dateStr] || [];
            const isToday = dateStr === TODAY;
            const hasPending = dayAppts.some(a => a.status === 'pending');
            const hasConfirmed = dayAppts.some(a => a.status === 'confirmed');

            let cellBg = 'transparent';
            let cellBorder = 'transparent';
            if (isToday) { cellBg = '#eff6ff'; cellBorder = '#2563eb'; }
            else if (hasConfirmed) { cellBg = '#f0fdf4'; cellBorder = '#86efac'; }
            else if (hasPending) { cellBg = '#fffbeb'; cellBorder = '#fde68a'; }
            else if (dayAppts.length > 0) { cellBg = '#f8fafc'; cellBorder = '#e2e8f0'; }

            return (
              <TouchableOpacity
                key={idx}
                style={[styles.calCell, { backgroundColor: cellBg, borderColor: cellBorder, borderWidth: cellBorder !== 'transparent' ? 1 : 0 }]}
                onPress={() => dayAppts.length > 0 && navigation.navigate('DoctorAppointments')}
                activeOpacity={dayAppts.length > 0 ? 0.7 : 1}
              >
                <Text style={[styles.calDayNum, isToday && styles.calDayNumToday]}>{day}</Text>
                {dayAppts.slice(0, 1).map((a, i) => {
                  const sc = STATUS_COLORS[a.status] || STATUS_COLORS.pending;
                  return (
                    <View key={i} style={[styles.calApptPill, { backgroundColor: sc.dot + '22' }]}>
                      <Text style={[styles.calApptText, { color: sc.dot }]} numberOfLines={1}>
                        {(a.time || '').slice(0, 5)} {(a.clientName || '').slice(0, 5)}
                      </Text>
                    </View>
                  );
                })}
                {dayAppts.length > 1 && (
                  <Text style={styles.calMore}>+{dayAppts.length - 1}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Today's Schedule */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today's Schedule</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DoctorAppointments')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {todaySchedule.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={32} color="#cbd5e1" />
            <Text style={styles.emptyText}>No appointments today</Text>
          </View>
        ) : (
          todaySchedule.map(appt => {
            const sc = STATUS_COLORS[appt.status] || STATUS_COLORS.pending;
            return (
              <View key={appt.id} style={styles.scheduleCard}>
                <View style={[styles.timeBox, { backgroundColor: DoctorColors.primaryLight }]}>
                  <Text style={styles.timeBoxText}>{(appt.time || '--:--').slice(0, 5)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.schedPatient}>{appt.clientName || 'Patient'}</Text>
                  <Text style={styles.schedMeta}>{appt.consultationType || 'Consultation'}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.badgeText, { color: sc.text }]}>{appt.status}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Recent Activity */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {recentActivity.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Activity will appear as appointments are booked.</Text>
          </View>
        ) : (
          recentActivity.map(appt => {
            const sc = STATUS_COLORS[appt.status] || STATUS_COLORS.pending;
            return (
              <View key={appt.id} style={[styles.activityRow, { backgroundColor: sc.bg }]}>
                <View style={[styles.activityIcon, { backgroundColor: sc.dot + '22' }]}>
                  <Ionicons name={sc.icon} size={18} color={sc.dot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityMsg}>{activityMessage(appt)}</Text>
                  <Text style={styles.activityTime}>{appt.date} {appt.time ? `· ${appt.time}` : ''}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Recent Patients */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Patients</Text>
          <TouchableOpacity onPress={() => navigation.navigate('DoctorPatients')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {recentPatients.map(p => (
          <TouchableOpacity
            key={p.id}
            style={styles.patientRow}
            onPress={() => navigation.getParent()?.navigate('DoctorPatientDetail', { patientId: p.id, patientName: p.name })}
          >
            <View style={styles.patientAvatar}>
              <Text style={styles.patientAvatarText}>{(p.name || 'P')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{p.name}</Text>
              <Text style={styles.patientMeta}>Last visit: {p.lastDate || '—'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: DoctorColors.primaryDark, padding: 20, paddingTop: 20,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 3 },
  doctorName: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 2 },
  specialty: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  verifiedPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  verifiedText: { fontSize: 11, color: '#10b981', fontWeight: '700', marginLeft: 2 },
  badgesRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: DoctorColors.primaryDark, paddingTop: 0 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DoctorColors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: DoctorColors.primary },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  statCard: {
    flex: 1, minWidth: '44%', borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statIcon: { width: 42, height: 42, borderRadius: 11, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 10, color: '#64748b', textAlign: 'center' },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: DoctorColors.text, marginBottom: 12 },
  seeAll: { fontSize: 13, color: DoctorColors.primary, fontWeight: '600' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickBtn: { alignItems: 'center', flex: 1 },
  quickIcon: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  quickLabel: { fontSize: 11, color: DoctorColors.textSecondary, fontWeight: '500', textAlign: 'center' },
  // Calendar
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calNav: { padding: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  calTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text },
  calDayRow: { flexDirection: 'row', marginBottom: 4 },
  calDayHeader: { flex: 1, textAlign: 'center', fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`, minHeight: 52, padding: 3, borderRadius: 6,
    alignItems: 'flex-start',
  },
  calDayNum: { fontSize: 12, fontWeight: '600', color: DoctorColors.text, marginBottom: 2, paddingLeft: 2 },
  calDayNumToday: {
    backgroundColor: '#2563eb', color: '#fff',
    width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20, paddingLeft: 0,
  },
  calApptPill: { borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginBottom: 1, width: '100%' },
  calApptText: { fontSize: 8, fontWeight: '600' },
  calMore: { fontSize: 8, color: '#94a3b8', paddingLeft: 2 },
  // Schedule
  scheduleCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  timeBox: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8,
  },
  timeBoxText: { fontSize: 13, fontWeight: '700', color: DoctorColors.primary },
  schedPatient: { fontSize: 14, fontWeight: '600', color: DoctorColors.text },
  schedMeta: { fontSize: 12, color: DoctorColors.textSecondary },
  // Activity
  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, padding: 12, marginBottom: 6,
  },
  activityIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  activityMsg: { fontSize: 13, fontWeight: '600', color: DoctorColors.text },
  activityTime: { fontSize: 11, color: DoctorColors.textSecondary, marginTop: 2 },
  // Patients
  patientRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 6,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  patientAvatar: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  patientAvatarText: { fontSize: 14, fontWeight: '700', color: DoctorColors.primary },
  patientName: { fontSize: 14, fontWeight: '600', color: DoctorColors.text },
  patientMeta: { fontSize: 11, color: DoctorColors.textSecondary },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 24, alignItems: 'center', gap: 8,
  },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
});
