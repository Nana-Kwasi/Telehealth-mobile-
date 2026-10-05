import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import {
  RX_STATUSES, toMillis, parseRangeBounds, buildMetrics,
} from '../../utils/pharmacyReportMetrics';

/**
 * Mobile counterpart of the web PharmacyReports / BranchReports screens. Uses the
 * same `pharmacyReportMetrics` helpers as the web build so both report identical
 * numbers for the same date range. (PDF export stays web-only.)
 */

const pct = (v) => `${Math.round(Number(v) || 0)}%`;

function todayISO() { return new Date().toISOString().split('T')[0]; }
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

export default function PharmacyReportsScreen({ profile, isBranch = false }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => daysAgoISO(30));
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [appliedFrom, setAppliedFrom] = useState(() => daysAgoISO(30));
  const [appliedTo, setAppliedTo] = useState(() => todayISO());

  const load = useCallback(async () => {
    const id = profile?.id;
    if (!id) { setLoading(false); return; }
    try {
      if (isBranch) {
        const list = await api(`/api/v1/medical/prescriptions/branch/${id}`).catch(() => []) || [];
        setPrescriptions(list);
        setBranches([{ id, branchName: profile?.branchName || 'This branch', status: 'active' }]);
      } else {
        const orgId = profile?.organizationId || id;
        const [list, brs] = await Promise.all([
          api(`/api/v1/medical/prescriptions/pharmacy/${orgId}`).catch(() => []),
          api(`/api/v1/pharmacy-branches?pharmacyId=${orgId}`).catch(() => []),
        ]);
        setPrescriptions(list || []);
        setBranches(brs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.organizationId, profile?.branchName, isBranch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredRx = useMemo(() => {
    const { startMs, endMs } = parseRangeBounds(appliedFrom, appliedTo);
    return prescriptions.filter(rx => {
      const ms = toMillis(rx.createdAt);
      if (!ms) return false;
      if (startMs && ms < startMs) return false;
      if (endMs && ms > endMs) return false;
      return true;
    });
  }, [prescriptions, appliedFrom, appliedTo]);

  const metrics = useMemo(() => buildMetrics(branches, filteredRx), [branches, filteredRx]);

  const applyRange = () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      Alert.alert('Invalid range', 'The start date must be on or before the end date.');
      return;
    }
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator color={C.primary} size="large" /></View>;
  }

  const rxCounts = metrics?.rxCounts || {};

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>Reports</Text>
      <Text style={styles.sub}>
        {isBranch ? 'This branch’s dispensing activity' : 'Dispensing activity across your pharmacy'}
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Date range</Text>
        <View style={styles.rangeRow}>
          <TextInput style={[styles.input, { flex: 1 }]} value={dateFrom} onChangeText={setDateFrom}
            placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
          <Text style={styles.muted}>to</Text>
          <TextInput style={[styles.input, { flex: 1 }]} value={dateTo} onChangeText={setDateTo}
            placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" />
        </View>
        <TouchableOpacity onPress={applyRange} style={styles.applyBtn}>
          <Text style={styles.applyText}>Apply range</Text>
        </TouchableOpacity>
        <Text style={styles.muted}>
          Showing {filteredRx.length} prescription{filteredRx.length === 1 ? '' : 's'} from {appliedFrom} to {appliedTo}
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Prescriptions by status</Text>
      <View style={styles.tileWrap}>
        {RX_STATUSES.map(s => (
          <View key={s} style={styles.tile}>
            <Text style={styles.tileNum}>{rxCounts[s] || 0}</Text>
            <Text style={styles.tileLabel}>{s.replace(/_/g, ' ')}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Dispensing performance</Text>
      <View style={styles.tileWrap}>
        <View style={styles.tile}><Text style={styles.tileNum}>{metrics.totalRx || 0}</Text><Text style={styles.tileLabel}>prescriptions</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{metrics.medsTotal || 0}</Text><Text style={styles.tileLabel}>drug lines</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{pct(metrics.completionRate)}</Text><Text style={styles.tileLabel}>completed</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{pct(metrics.availabilityRate)}</Text><Text style={styles.tileLabel}>availability</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{pct(metrics.stockoutRate)}</Text><Text style={styles.tileLabel}>stock-outs</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{pct(metrics.altRate)}</Text><Text style={styles.tileLabel}>alt suggested</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{pct(metrics.altApprovalRate)}</Text><Text style={styles.tileLabel}>alt approved</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{metrics.readyBacklog || 0}</Text><Text style={styles.tileLabel}>ready backlog</Text></View>
        {!isBranch && (
          <View style={styles.tile}><Text style={styles.tileNum}>{metrics.unassigned || 0}</Text><Text style={styles.tileLabel}>unassigned</Text></View>
        )}
      </View>

      {!isBranch && (metrics.branchRows || []).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>By branch</Text>
          {metrics.branchRows.map((b, i) => (
            <View key={i} style={styles.card}>
              <Text style={styles.branchName}>{b.branchName}</Text>
              <Text style={styles.muted}>
                {b.total} total · {b.delivered} delivered · {b.ready} ready · {b.active} active
              </Text>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 8 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#0f172a' },
  applyBtn: { marginTop: 10, backgroundColor: C.primary, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  applyText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  muted: { fontSize: 12, color: '#94a3b8', marginTop: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 10, marginBottom: 8 },
  tileWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  tile: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    paddingVertical: 14, paddingHorizontal: 16, minWidth: 100, flexGrow: 1, alignItems: 'center',
  },
  tileNum: { fontSize: 22, fontWeight: '800', color: C.primary },
  tileLabel: { fontSize: 11, color: '#64748b', marginTop: 3, textTransform: 'capitalize' },
  branchName: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
});
