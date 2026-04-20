import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { PharmacyColors as C } from '../../constants/colors';

export default function PharmacyBranchesScreen({ profile }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadBranches(); }, []);

  const loadBranches = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, 'pharmacyBranches'),
        where('pharmacyId', '==', profile.id)
      ));
      setBranches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const renderBranch = ({ item }) => (
    <View style={styles.card}>
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
    </View>
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
