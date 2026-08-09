import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';

/**
 * Mobile counterpart of the web BranchActivity screen — the pharmacy event feed.
 *
 * `isBranch` scopes to this branch's own actions; the parent sees the whole
 * organisation's feed.
 */

function eventLabel(action) {
  if (!action) return 'Activity';
  return String(action)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase());
}

export default function PharmacyActivityScreen({ profile, isBranch = false }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const id = profile?.id;
    if (!id) { setLoading(false); setRefreshing(false); return; }
    try {
      const qs = isBranch
        ? `branchId=${id}`
        : `organizationId=${profile?.organizationId || id}`;
      const data = await api(`/api/v1/entity-operations/pharmacy/events?${qs}`).catch(() => []);
      const list = (Array.isArray(data) ? data : [])
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setEvents(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.organizationId, isBranch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.action}>{eventLabel(item.action || item.eventType)}</Text>
        <Text style={styles.time}>
          {item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}
        </Text>
      </View>
      {(item.fromStatus || item.toStatus) ? (
        <Text style={styles.meta}>{item.fromStatus || '—'} → {item.toStatus || '—'}</Text>
      ) : null}
      {item.actorName ? <Text style={styles.meta}>By {item.actorName}</Text> : null}
      {item.rxId ? <Text style={styles.rx}>Rx {item.rxId}</Text> : null}
      {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
    </View>
  );

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={events}
      keyExtractor={e => String(e.id)}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.title}>Activity</Text>
          <Text style={styles.sub}>
            {isBranch ? 'Latest branch actions on prescriptions' : 'Latest actions across your pharmacy'}
          </Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.muted}>No activity yet.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b' },
  muted: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 30 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  action: { fontSize: 14, fontWeight: '800', color: '#0f172a', flex: 1 },
  time: { fontSize: 11, color: '#94a3b8' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 3 },
  rx: { fontSize: 11, color: '#94a3b8', marginTop: 3 },
  note: { fontSize: 13, color: '#334155', marginTop: 5 },
});
