import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { normalizeDiagnosticOrderStatus } from '../../utils/diagnosticOrderStatus';

/**
 * Mobile counterpart of the web BranchOrderDetail screen — the full diagnostic order
 * record for a lab/scan branch, with a route through to result upload while the
 * order is still open.
 *
 * `type` is 'lab' or 'scan'; `uploadRoute` is the screen that handles the upload so
 * this component stays shared between both modules.
 */

const CLOSED = ['COMPLETED', 'REJECTED', 'CANCELLED'];

function fmt(ts) {
  if (!ts) return '—';
  const d = new Date(ts.seconds ? ts.seconds * 1000 : ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function DiagnosticOrderDetailScreen({ profile, type = 'lab', uploadRoute, accent = '#1e6bb8' }) {
  const route = useRoute();
  const navigation = useNavigation();
  const orderId = route.params?.orderId;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) { setLoading(false); return; }
    try {
      const data = await api(`/api/v1/diagnostics/operations/orders/${orderId}`).catch(() => null);
      setOrder(data);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.centered}><ActivityIndicator color={accent} size="large" /></View>;
  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Order not found, or it is not assigned to this branch.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={16} color={accent} />
          <Text style={[styles.backText, { color: accent }]}>Back to queue</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const normalized = normalizeDiagnosticOrderStatus(order.status);
  const canUpload = !CLOSED.includes(String(order.status || '').toUpperCase());

  const rows = [
    ['Order reference', order.orderId || order.id],
    ['Patient', order.patientName || '—'],
    ['Patient ID', order.patientId || '—'],
    ['Doctor', order.doctorName || '—'],
    [type === 'lab' ? 'Test type' : 'Scan type', order.testType || order.diagnosticType || '—'],
    ['Center (org)', order.centerName || '—'],
    ['Branch', order.branchName || '—'],
    ['Clinical notes (from doctor)', order.notes || '—'],
    ['Status', normalized || order.status || 'pending'],
    ['Created', fmt(order.createdAt)],
    ['Updated', fmt(order.updatedAt)],
    ...(order.rejectReason ? [['Reject reason', order.rejectReason]] : []),
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>Order detail</Text>
      <Text style={styles.sub}>Full diagnostic order record for this branch.</Text>

      <View style={styles.card}>
        {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={styles.key}>{k}</Text>
            <Text style={styles.value}>{String(v)}</Text>
          </View>
        ))}
      </View>

      {canUpload && uploadRoute ? (
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: accent }]}
          onPress={() => navigation.navigate(uploadRoute, { orderId: order.id })}>
          <Text style={styles.primaryText}>Upload result</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.muted}>This order is closed. Use the queue for other actions.</Text>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={16} color={accent} />
        <Text style={[styles.backText, { color: accent }]}>Back to queue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  row: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  key: { fontSize: 11, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 },
  value: { fontSize: 14, color: '#0f172a', marginTop: 3 },
  primaryBtn: { borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  muted: { fontSize: 13, color: '#94a3b8', marginTop: 16, textAlign: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  backText: { fontWeight: '700', fontSize: 13 },
});
