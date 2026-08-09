import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import { buildTransferRows } from '../../utils/pharmacyTransfers';

/**
 * Branch transfer ledger — every drug transfer this branch is party to.
 *
 * The previous version listed only lines where a transfer had FAILED and this branch
 * was the one that failed to receive it, so in normal operation it was permanently
 * empty. It now shows both directions and each transfer's stage, with the ones
 * needing this branch to act pulled to the top.
 */

const TONE = {
  ok:   { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
  bad:  { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' },
  warn: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  info: { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'incoming', label: 'Incoming' },
  { key: 'outgoing', label: 'Outgoing' },
  { key: 'action', label: 'Needs action' },
];

export default function BranchTransfersScreen({ profile }) {
  const navigation = useNavigation();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    const branchId = profile?.id;
    const parentOrgId = profile?.organizationId || profile?.pharmacyId;
    if (!branchId || !parentOrgId) { setLoading(false); setRefreshing(false); return; }
    try {
      const list = await api(`/api/v1/medical/prescriptions/pharmacy/${parentOrgId}`).catch(() => []) || [];
      setRows(buildTransferRows(list, branchId));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile?.id, profile?.organizationId, profile?.pharmacyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const visible = useMemo(() => {
    if (filter === 'action') return rows.filter(r => r.actionable);
    if (filter === 'all') return rows;
    return rows.filter(r => r.direction === filter);
  }, [rows, filter]);

  const actionCount = rows.filter(r => r.actionable).length;

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  return (
    <FlatList
      style={styles.container}
      data={visible}
      keyExtractor={r => r.key}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />
      }
      ListHeaderComponent={
        <View style={{ marginBottom: 12 }}>
          <Text style={styles.title}>Transfers</Text>
          <Text style={styles.sub}>Drugs moving to or from this branch</Text>
          {actionCount > 0 && (
            <View style={styles.actionBanner}>
              <Text style={styles.actionBannerText}>
                {actionCount} transfer{actionCount === 1 ? '' : 's'} waiting for you to confirm receipt.
              </Text>
            </View>
          )}
          <View style={styles.filterRow}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, filter === f.key && styles.chipActive]}>
                <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>
                  {f.label}{f.key === 'action' && actionCount ? ` (${actionCount})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>
          {filter === 'all'
            ? 'No drug transfers involve this branch yet.'
            : 'Nothing matches this filter.'}
        </Text>
      }
      renderItem={({ item }) => {
        const tone = TONE[item.stage.tone] || TONE.info;
        return (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('BranchRxOps', { rxId: item.rxId })}
          >
            <View style={styles.head}>
              <Ionicons
                name={item.direction === 'incoming' ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
                size={18}
                color={item.direction === 'incoming' ? '#1e40af' : '#0f766e'}
              />
              <Text style={styles.drug}>{item.drug}{item.strength ? ` (${item.strength})` : ''}</Text>
              <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                <Text style={[styles.badgeText, { color: tone.text }]}>{item.stage.label}</Text>
              </View>
            </View>
            <Text style={styles.meta}>
              {item.direction === 'incoming' ? 'From' : 'To'} {item.counterparty}
            </Text>
            <Text style={styles.meta}>{item.patientName} · Ref {item.ref}</Text>
            {item.at ? (
              <Text style={styles.time}>{new Date(item.at).toLocaleString()}</Text>
            ) : null}
            {item.actionable && (
              <Text style={styles.cta}>Tap to confirm whether you have this drug →</Text>
            )}
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b' },
  muted: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginTop: 30 },
  actionBanner: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, padding: 10, marginTop: 10 },
  actionBannerText: { fontSize: 12, color: '#1e40af', fontWeight: '700' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipActive: { borderColor: C.primary, backgroundColor: '#eff6ff' },
  chipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: C.primary, fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  drug: { fontSize: 15, fontWeight: '800', color: '#0f172a', flex: 1 },
  badge: { borderRadius: 20, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 9 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 12, color: '#64748b', marginTop: 4 },
  time: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
  cta: { fontSize: 12, color: C.primary, fontWeight: '700', marginTop: 8 },
});
