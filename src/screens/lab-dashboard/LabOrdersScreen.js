import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { LabColors as C } from '../../constants/colors';
import { normalizeDiagnosticOrderStatus, patientMobileStatusStyleKey } from '../../utils/diagnosticOrderStatus';

const STATUS_COLORS = {
  pending:     { bg: '#fef3c7', text: '#92400e', label: 'Pending' },
  in_progress: { bg: '#dbeafe', text: '#1e40af', label: 'In Progress' },
  completed:   { bg: '#dcfce7', text: '#14532d', label: 'Completed' },
  rejected:    { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
};

const FILTERS = ['All', 'Pending', 'In Progress', 'Completed'];
const FILTER_TO_NORM = { Pending: 'PENDING', 'In Progress': 'IN_PROGRESS', Completed: 'COMPLETED' };

export default function LabOrdersScreen({ profile }) {
  const navigation = useNavigation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');

  useFocusEffect(useCallback(() => { loadOrders(); }, []));

  const loadOrders = async () => {
    try {
      const pid = profile?.id;
      if (!pid) return;
      const isBranch = profile?.role === 'lab_branch';
      const snap = isBranch
        ? await getDocs(query(collection(db, 'diagnosticOrders'), where('branchId', '==', pid)))
        : await getDocs(
            query(collection(db, 'diagnosticOrders'), where('centerId', '==', pid), where('centerType', '==', 'lab')),
          );
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (isBranch) list = list.filter((o) => o.centerType === 'lab');
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrders(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const filtered = orders.filter(o => {
    const n = normalizeDiagnosticOrderStatus(o.status);
    const statusMatch = filter === 'All' || n === FILTER_TO_NORM[filter];
    const searchMatch = !search || o.patientName?.toLowerCase().includes(search.toLowerCase()) || o.testType?.toLowerCase().includes(search.toLowerCase());
    return statusMatch && searchMatch;
  });

  const verifyScreen = profile?.role === 'lab_branch' ? 'LabBranchVerify' : 'LabVerify';

  const renderItem = ({ item }) => {
    const sk = patientMobileStatusStyleKey(item.status);
    const sc = STATUS_COLORS[sk] || STATUS_COLORS.pending;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.typeChip}>
            <Ionicons name="flask-outline" size={14} color={C.primary} />
            <Text style={styles.typeText}>{item.testType}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>
        <Text style={styles.patientName}>{item.patientName || 'Patient'}</Text>
        <Text style={styles.cardSub}>Order ID: {item.orderId || item.id.slice(0, 8).toUpperCase()}</Text>
        {item.notes ? <Text style={styles.notes} numberOfLines={2}>{item.notes}</Text> : null}
        <Text style={styles.dateText}>
          {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : 'Recently'}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.verifyBanner}>
        <View style={{ flex: 1 }}>
          <Text style={styles.verifyTitle}>Verify patient (National ID)</Text>
          <Text style={styles.verifySub}>
            Search by the name as printed on the patient&apos;s ID to find their order. Staff should confirm the name matches before starting the test.
          </Text>
        </View>
        <TouchableOpacity style={styles.verifyLinkBtn} onPress={() => navigation.navigate(verifyScreen)}>
          <Text style={styles.verifyLinkText}>Full verify</Text>
          <Ionicons name="chevron-forward" size={16} color={C.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={C.textSecondary} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Patient name (as on National ID) or test…"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={C.textLight}
        />
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="flask-outline" size={48} color={C.border} />
              <Text style={styles.emptyText}>No orders found</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, paddingTop: 8, flexGrow: 1 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  verifyBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  verifyTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 4 },
  verifySub: { fontSize: 12, color: C.textSecondary, lineHeight: 17 },
  verifyLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingHorizontal: 4 },
  verifyLinkText: { fontSize: 13, fontWeight: '700', color: C.primary },
  searchRow: { flexDirection: 'row', alignItems: 'center', margin: 16, marginBottom: 8, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: C.text },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 4 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  typeText: { fontSize: 12, color: C.primary, fontWeight: '700' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  patientName: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
  notes: { fontSize: 13, color: C.textSecondary, fontStyle: 'italic', marginBottom: 4 },
  dateText: { fontSize: 11, color: C.textLight },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyText: { color: C.textSecondary, fontSize: 15, marginTop: 12, fontWeight: '600' },
});
