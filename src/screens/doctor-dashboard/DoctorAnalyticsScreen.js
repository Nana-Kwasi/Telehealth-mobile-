import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const SCREEN_WIDTH = Dimensions.get('window').width;
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getLast12Months() {
  const result = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

function StatCard({ icon, value, label, color, bg }) {
  return (
    <View style={[cardStyles.card, { backgroundColor: bg }]}>
      <View style={[cardStyles.icon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[cardStyles.value, { color }]}>{value}</Text>
      <Text style={cardStyles.label}>{label}</Text>
    </View>
  );
}
const cardStyles = StyleSheet.create({
  card: {
    flex: 1, minWidth: '44%', borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  icon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 11, color: '#64748b', textAlign: 'center' },
});

function SimpleBarChart({ data, labels, color, height = 120 }) {
  const max = Math.max(...data, 1);
  return (
    <View style={chartStyles.container}>
      <View style={[chartStyles.bars, { height }]}>
        {data.map((v, i) => (
          <View key={i} style={chartStyles.barWrap}>
            <View style={[chartStyles.bar, { height: `${(v / max) * 100}%`, backgroundColor: color }]} />
            {v > 0 && <Text style={chartStyles.barVal}>{v}</Text>}
          </View>
        ))}
      </View>
      <View style={chartStyles.labels}>
        {labels.map((l, i) => <Text key={i} style={chartStyles.label}>{l}</Text>)}
      </View>
    </View>
  );
}
const chartStyles = StyleSheet.create({
  container: { marginTop: 8 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, paddingHorizontal: 4 },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 4, minHeight: 2 },
  barVal: { fontSize: 8, color: '#64748b', marginTop: 2 },
  labels: { flexDirection: 'row', gap: 4, paddingHorizontal: 4, marginTop: 6 },
  label: { flex: 1, fontSize: 8, color: '#94a3b8', textAlign: 'center' },
});

function DonutItem({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={donutStyles.row}>
      <View style={[donutStyles.dot, { backgroundColor: color }]} />
      <Text style={donutStyles.label}>{label}</Text>
      <View style={donutStyles.track}>
        <View style={[donutStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={donutStyles.pct}>{pct}%</Text>
      <Text style={donutStyles.count}>{count}</Text>
    </View>
  );
}
const donutStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { width: 80, fontSize: 12, color: '#475569' },
  track: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  pct: { width: 36, fontSize: 12, color: '#64748b', textAlign: 'right' },
  count: { width: 24, fontSize: 12, fontWeight: '700', color: '#1e293b', textAlign: 'right' },
});

export default function DoctorAnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({ earnings: 0, appointments: 0, patients: 0, avgRating: 0 });
  const [apptByMonth, setApptByMonth] = useState(Array(12).fill(0));
  const [earningsByMonth, setEarningsByMonth] = useState(Array(12).fill(0));
  const [statusDist, setStatusDist] = useState({ completed: 0, cancelled: 0, pending: 0 });
  const [typeDist, setTypeDist] = useState({ video: 0, chat: 0, inPerson: 0 });

  useEffect(() => { loadAnalytics(); }, []);

  const loadAnalytics = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const months = getLast12Months();

      // Appointments
      const apptSnap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const appts = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Month buckets
      const apptM = Array(12).fill(0);
      const earnM = Array(12).fill(0);
      let totalEarnings = 0;
      const status = { completed: 0, cancelled: 0, pending: 0 };
      const type = { video: 0, chat: 0, inPerson: 0 };
      const patientIds = new Set();

      appts.forEach(a => {
        if (a.clientId) patientIds.add(a.clientId);

        const monthKey = (a.date || '').slice(0, 7);
        const idx = months.indexOf(monthKey);
        if (idx >= 0) {
          apptM[idx] += 1;
          if (a.status === 'completed') {
            earnM[idx] += Number(a.consultationFee) || 0;
          }
        }

        if (a.status === 'completed') { status.completed += 1; totalEarnings += Number(a.consultationFee) || 0; }
        else if (a.status === 'cancelled') status.cancelled += 1;
        else status.pending += 1;

        const t = (a.consultationType || a.type || '').toLowerCase();
        if (t === 'video') type.video += 1;
        else if (t === 'chat') type.chat += 1;
        else type.inPerson += 1;
      });

      // Patients subcollection
      let patientCount = patientIds.size;
      try {
        const patSnap = await getDocs(collection(db, 'doctors', cu.uid, 'patients'));
        if (patSnap.size > patientCount) patientCount = patSnap.size;
      } catch {}

      // Average rating
      let avgRating = 0;
      try {
        const revSnap = await getDocs(
          query(collection(db, 'doctorReviews'), where('doctorId', '==', cu.uid))
        );
        const ratings = revSnap.docs.map(d => d.data().rating || 0);
        if (ratings.length > 0) avgRating = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
      } catch {}

      setStats({ earnings: totalEarnings, appointments: appts.length, patients: patientCount, avgRating });
      setApptByMonth(apptM);
      setEarningsByMonth(earnM);
      setStatusDist(status);
      setTypeDist(type);
    } catch (err) {
      console.error('DoctorAnalytics error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const months12Labels = getLast12Months().map(m => MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>;
  }

  const totalStatusCount = statusDist.completed + statusDist.cancelled + statusDist.pending;
  const totalTypeCount = typeDist.video + typeDist.chat + typeDist.inPerson;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnalytics(); }} />}
    >
      {/* KPI Cards */}
      <View style={styles.kpiGrid}>
        <StatCard icon="cash-outline" value={`GHS ${stats.earnings.toLocaleString()}`} label="Total Earnings" color="#10b981" bg="#f0fdf4" />
        <StatCard icon="calendar-outline" value={stats.appointments} label="Total Appointments" color="#6366f1" bg="#f0f0ff" />
        <StatCard icon="people-outline" value={stats.patients} label="Total Patients" color={DoctorColors.primary} bg={DoctorColors.primaryLight} />
        <StatCard icon="star-outline" value={stats.avgRating || '—'} label="Avg Rating" color="#f59e0b" bg="#fffbeb" />
      </View>

      {/* Appointments by Month */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Appointments by Month (Last 12)</Text>
        <SimpleBarChart data={apptByMonth} labels={months12Labels} color="#6366f1" height={110} />
      </View>

      {/* Earnings by Month */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Earnings by Month (GHS)</Text>
        <SimpleBarChart data={earningsByMonth} labels={months12Labels} color="#10b981" height={110} />
      </View>

      {/* Status Breakdown */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Appointment Status</Text>
        <DonutItem label="Completed" count={statusDist.completed} total={totalStatusCount} color="#10b981" />
        <DonutItem label="Cancelled" count={statusDist.cancelled} total={totalStatusCount} color="#ef4444" />
        <DonutItem label="Pending/Confirmed" count={statusDist.pending} total={totalStatusCount} color="#f59e0b" />
      </View>

      {/* Consultation Types */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Consultation Types</Text>
        <DonutItem label="Video" count={typeDist.video} total={totalTypeCount} color="#6366f1" />
        <DonutItem label="Chat" count={typeDist.chat} total={totalTypeCount} color="#0ea5e9" />
        <DonutItem label="In-Person" count={typeDist.inPerson} total={totalTypeCount} color={DoctorColors.primary} />
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  chartCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: DoctorColors.text, marginBottom: 4 },
});
