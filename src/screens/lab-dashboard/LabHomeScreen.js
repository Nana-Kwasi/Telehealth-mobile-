import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { LabColors as C } from '../../constants/colors';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';
import { normalizeDiagnosticOrderStatus } from '../../utils/diagnosticOrderStatus';

function fmtEventAction(action) {
  const map = {
    ORDER_STARTED: 'Started order',
    ORDER_STATUS_UPDATED: 'Status updated',
    ORDER_COMPLETED: 'Result uploaded',
    ORDER_REJECTED: 'Order rejected',
  };
  return map[action] || String(action || 'Activity').replace(/_/g, ' ');
}

export default function LabHomeScreen({ profile, navigation }) {
  const [stats, setStats] = useState({ branches: 0, pending: 0, inProgress: 0, completed: 0, total: 0, rejected: 0, weekCompleted: 0 });
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isBranch = profile?.role === 'lab_branch';

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const pid = profile?.id;
      if (!pid) return;
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      if (isBranch) {
        const [ordersSnap, eventsSnap] = await Promise.all([
          getDocs(query(collection(db, 'diagnosticOrders'), where('branchId', '==', pid))),
          getDocs(query(collection(db, 'diagnosticBranchEvents'), where('branchId', '==', pid))),
        ]);
        const orders = ordersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((o) => o.centerType === 'lab');

        const norm = normalizeDiagnosticOrderStatus;
        let weekCompleted = 0;
        orders.forEach((o) => {
          if (norm(o.status) !== 'COMPLETED') return;
          const ts = o.completedAt?.seconds ? o.completedAt.seconds * 1000 : (o.updatedAt?.seconds ? o.updatedAt.seconds * 1000 : 0);
          if (ts >= weekAgo) weekCompleted += 1;
        });

        setStats({
          branches: 0,
          total: orders.length,
          pending: orders.filter(o => norm(o.status) === 'PENDING').length,
          inProgress: orders.filter(o => norm(o.status) === 'IN_PROGRESS').length,
          completed: orders.filter(o => norm(o.status) === 'COMPLETED').length,
          rejected: orders.filter(o => norm(o.status) === 'REJECTED').length,
          weekCompleted,
        });

        const events = eventsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((e) => (e.centerType || 'lab') === 'lab')
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
          .slice(0, 8);
        setRecentEvents(events);
      } else {
        const [branchSnap, ordersSnap] = await Promise.all([
          getDocs(query(collection(db, 'labBranches'), where('labId', '==', pid))),
          getDocs(query(collection(db, 'diagnosticOrders'), where('centerId', '==', pid), where('centerType', '==', 'lab'))),
        ]);
        const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const norm = normalizeDiagnosticOrderStatus;
        setStats({
          branches: branchSnap.size,
          total: orders.length,
          pending: orders.filter(o => norm(o.status) === 'PENDING').length,
          inProgress: orders.filter(o => norm(o.status) === 'IN_PROGRESS').length,
          completed: orders.filter(o => norm(o.status) === 'COMPLETED').length,
          rejected: orders.filter(o => norm(o.status) === 'REJECTED').length,
          weekCompleted: 0,
        });
        setRecentEvents([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const ordersNav = isBranch ? 'LabBranchOrders' : 'LabOrders';
  const verifyNav = isBranch ? 'LabBranchVerify' : 'LabVerify';
  const resultsNav = isBranch ? 'LabBranchResults' : 'LabResults';

  const STATS_PRIMARY = isBranch
    ? [
        { label: 'Total', value: stats.total, icon: 'layers-outline', color: '#0369a1' },
        { label: 'Pending', value: stats.pending, icon: 'time', color: '#d97706' },
        { label: 'In Progress', value: stats.inProgress, icon: 'flask', color: C.primary },
        { label: 'Completed', value: stats.completed, icon: 'checkmark-circle', color: '#16a34a' },
      ]
    : [
        { label: 'Branches', value: stats.branches, icon: 'storefront', color: '#0369a1' },
        { label: 'Pending', value: stats.pending, icon: 'time', color: '#d97706' },
        { label: 'In Progress', value: stats.inProgress, icon: 'flask', color: C.primary },
        { label: 'Completed', value: stats.completed, icon: 'checkmark-circle', color: '#16a34a' },
      ];

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStats(); }} tintColor={C.primary} />}
      >
        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>Welcome, {isBranch ? (profile?.branchName || 'Branch') : (profile?.labName || 'Lab Center')}</Text>
          <Text style={styles.welcomeSub}>{isBranch ? 'Branch queue, activity, and shortcuts' : 'Laboratory network overview'}</Text>
        </View>
        <LocationSummaryCardMobile
          profile={profile}
          onEdit={() => navigation.navigate(isBranch ? 'LabBranchSettings' : 'LabSettings')}
        />

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
        ) : (
          <>
            <View style={styles.statsGrid}>
              {STATS_PRIMARY.map(s => (
                <View key={s.label} style={styles.statCard}>
                  <Ionicons name={s.icon} size={24} color={s.color} />
                  <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {isBranch ? (
              <View style={styles.insightRow}>
                <View style={[styles.insightMini, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
                  <Text style={styles.insightMiniVal}>{stats.rejected}</Text>
                  <Text style={styles.insightMiniLbl}>Rejected</Text>
                </View>
                <View style={[styles.insightMini, { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' }]}>
                  <Text style={[styles.insightMiniVal, { color: '#15803d' }]}>{stats.weekCompleted}</Text>
                  <Text style={styles.insightMiniLbl}>Done (7d)</Text>
                </View>
                <View style={[styles.insightMini, { flex: 1.4, borderColor: C.border, backgroundColor: '#fff' }]}>
                  <Text style={styles.insightMiniLbl}>Completion rate</Text>
                  <Text style={[styles.insightMiniVal, { color: C.primary }]}>
                    {stats.total ? `${Math.round((stats.completed / stats.total) * 100)}%` : '—'}
                  </Text>
                </View>
              </View>
            ) : null}

            {isBranch ? (
              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate(ordersNav)}>
                  <Ionicons name="list-outline" size={22} color={C.primary} />
                  <Text style={styles.quickBtnText}>Orders</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate(verifyNav)}>
                  <Ionicons name="id-card-outline" size={22} color={C.primary} />
                  <Text style={styles.quickBtnText}>Verify</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate(resultsNav)}>
                  <Ionicons name="document-text-outline" size={22} color={C.primary} />
                  <Text style={styles.quickBtnText}>Results</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {isBranch && recentEvents.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent activity</Text>
                {recentEvents.map(e => (
                  <View key={e.id} style={styles.activityRow}>
                    <View style={styles.activityDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityTitle}>{fmtEventAction(e.action)}</Text>
                      <Text style={styles.activityMeta} numberOfLines={1}>
                        {(e.patientName || 'Patient')} · {(e.fromStatus || '—')} → {(e.toStatus || '—')}
                      </Text>
                    </View>
                    <Text style={styles.activityTime}>
                      {e.createdAt?.seconds
                        ? new Date(e.createdAt.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                        : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {!isBranch ? (
              <View style={styles.sectionMuted}>
                <Text style={styles.sectionMutedText}>Tip: open Orders from the menu to see all lab requests across branches.</Text>
              </View>
            ) : null}
          </>
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={C.primary} />
          <Text style={styles.infoText}>
            Patients present their National ID at your branch. Use Verify Patient to match the name on the ID to the order before starting tests.
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  welcome: { padding: 20, paddingTop: 24 },
  welcomeTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  welcomeSub: { fontSize: 14, color: C.textSecondary, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  statCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, alignItems: 'center', width: '45%', flexGrow: 1, borderWidth: 1, borderColor: C.border, gap: 6 },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  insightRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 8 },
  insightMini: { flex: 1, borderRadius: 12, padding: 12, borderWidth: 1, alignItems: 'center' },
  insightMiniVal: { fontSize: 20, fontWeight: '900', color: '#991b1b' },
  insightMiniLbl: { fontSize: 11, color: C.textSecondary, fontWeight: '700', marginTop: 2 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10, marginTop: 4, marginBottom: 8 },
  quickBtn: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  quickBtnText: { fontSize: 12, fontWeight: '800', color: C.text },
  section: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 12 },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary, marginTop: 6, marginRight: 12 },
  activityTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  activityMeta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  activityTime: { fontSize: 11, color: C.textLight, fontWeight: '600', marginLeft: 8 },
  sectionMuted: { marginHorizontal: 16, marginTop: 8, padding: 12, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionMutedText: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  infoCard: { flexDirection: 'row', gap: 10, backgroundColor: C.primaryLight, margin: 16, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border },
  infoText: { flex: 1, fontSize: 13, color: C.primary, fontWeight: '500', lineHeight: 18 },
});
