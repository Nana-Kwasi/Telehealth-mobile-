import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';

export default function PharmacyBranchesScreen({ profile }) {
  const navigation = useNavigation();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadBranches(); }, []);

  const loadBranches = async () => {
    try {
      const data = await api(`/api/v1/pharmacy-branches?pharmacyId=${profile?.id}`).catch(() => []);
      setBranches(data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const renderBranch = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() => navigation.navigate('PharmacyBranchDetail', { branchId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.iconWrap}>
          <Ionicons name="storefront" size={22} color={C.primary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.branchName}>{item.branchName || item.name || 'Branch'}</Text>
          <View style={[styles.statusDot, { backgroundColor: item.status === 'active' ? '#16a34a' : '#dc2626' }]}>
            <Text style={styles.statusDotText}>{item.status || 'active'}</Text>
          </View>
        </View>
      </View>
      {item.address && <Text style={styles.detail}><Ionicons name="location-outline" size={13} /> {item.address}</Text>}
      {item.phone && <Text style={styles.detail}><Ionicons name="call-outline" size={13} /> {item.phone}</Text>}
      {item.email && <Text style={styles.detail}><Ionicons name="mail-outline" size={13} /> {item.email}</Text>}
      {item.username && (
        <View style={styles.credRow}>
          <Text style={styles.credLabel}>Username</Text>
          <Text style={styles.credValue}>{item.username}</Text>
        </View>
      )}
      <View style={styles.openRow}>
        <Text style={styles.openText}>Manage branch</Text>
        <Ionicons name="chevron-forward" size={15} color={C.primary} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={branches}
          keyExtractor={b => b.id}
          renderItem={renderBranch}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListHeaderComponent={
            <Text style={styles.header}>Branches ({branches.length})</Text>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>🏪</Text>
              <Text style={styles.emptyTitle}>No branches yet</Text>
              <Text style={styles.emptySub}>Create branches from the web admin portal.</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadBranches(); }} tintColor={C.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  openRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 10 },
  openText: { fontSize: 12, fontWeight: '700', color: C.primary },
  container: { flex: 1, backgroundColor: C.background },
  header: { fontSize: 14, fontWeight: '700', color: C.textSecondary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  branchName: { fontSize: 16, fontWeight: '700', color: C.text },
  statusDot: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  statusDotText: { color: '#fff', fontSize: 10, fontWeight: '700', textTransform: 'capitalize' },
  detail: { fontSize: 13, color: C.textSecondary, marginBottom: 3 },
  credRow: { flexDirection: 'row', gap: 8, marginTop: 8, backgroundColor: C.primaryLight, borderRadius: 8, padding: 8 },
  credLabel: { fontSize: 11, fontWeight: '700', color: C.info, textTransform: 'uppercase' },
  credValue: { fontSize: 13, fontWeight: '700', color: C.primary, fontFamily: 'monospace' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
});
