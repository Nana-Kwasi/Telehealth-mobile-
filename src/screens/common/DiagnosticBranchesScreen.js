import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';

/**
 * Mobile counterpart of the web DiagnosticParentDashboard "Branches" screen — the
 * parent lab / scan centre's list of its branches, each opening a detail screen.
 *
 * `type` is 'lab' or 'scan' and selects the branch endpoint.
 */
export default function DiagnosticBranchesScreen({ profile, type = 'lab', detailRoute, accent = '#1e6bb8' }) {
  const navigation = useNavigation();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const path = type === 'lab' ? 'lab-branches' : 'scan-branches';
  const parentParam = type === 'lab' ? 'labId' : 'scanId';

  const load = useCallback(async () => {
    const orgId = profile?.organizationId || profile?.id;
    if (!orgId) { setLoading(false); setRefreshing(false); return; }
    try {
      const data = await api(`/api/v1/${path}?${parentParam}=${orgId}`).catch(() => []);
      setBranches(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.organizationId, profile?.id, path, parentParam]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.centered}><ActivityIndicator color={accent} size="large" /></View>;

  return (
    <FlatList
      style={styles.container}
      data={branches}
      keyExtractor={b => String(b.id)}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.title}>Branches ({branches.length})</Text>
          <Text style={styles.sub}>
            {type === 'lab' ? 'Laboratory' : 'Scan centre'} branches under this account
          </Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>No branches linked to this account yet.</Text>}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => detailRoute && navigation.navigate(detailRoute, { branchId: item.id })}
        >
          <View style={styles.head}>
            <Ionicons name="business-outline" size={20} color={accent} />
            <Text style={styles.name}>{item.branchName || item.name || 'Branch'}</Text>
            <Text style={[styles.status, (item.status || 'active') === 'active' ? styles.ok : styles.off]}>
              {item.status || 'active'}
            </Text>
          </View>
          {item.email ? <Text style={styles.detail}>✉ {item.email}</Text> : null}
          {(item.address || item.city) ? (
            <Text style={styles.detail}>📍 {[item.address, item.city].filter(Boolean).join(', ')}</Text>
          ) : null}
          <View style={styles.openRow}>
            <Text style={[styles.openText, { color: accent }]}>Manage branch</Text>
            <Ionicons name="chevron-forward" size={15} color={accent} />
          </View>
        </TouchableOpacity>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b' },
  muted: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 30 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '800', color: '#0f172a', flex: 1 },
  status: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  ok: { color: '#16a34a' },
  off: { color: '#dc2626' },
  detail: { fontSize: 12, color: '#64748b', marginTop: 5 },
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 10 },
  openText: { fontSize: 12, fontWeight: '700' },
});
