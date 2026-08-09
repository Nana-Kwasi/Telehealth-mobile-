import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { DoctorColors as C } from '../../constants/colors';
import { getDoctorDisplayName } from '../../utils/doctorDisplayName';
import { formatDateTime } from '../../utils/dateDisplay';

function generateOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'ORD-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

export default function DoctorDiagnosticDraftDetailScreen({ route, navigation }) {
  const draftId = route.params?.draftId;
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [doctorId, setDoctorId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStoredUserId().then(uid => {
      setDoctorId(uid);
      if (!uid || !draftId) { setLoading(false); return; }
      api(`/api/v1/doctors/${uid}/diagnostic-drafts/${draftId}`)
        .then(data => { if (!cancelled && data) setDraft(data); })
        .catch(console.error)
        .finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [draftId]);

  const handleDelete = () => {
    Alert.alert('Delete draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/api/v1/doctors/${doctorId}/diagnostic-drafts/${draftId}`, { method: 'DELETE' });
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', 'Could not delete draft.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const handleSubmit = async () => {
    if (!draft || !doctorId) return;
    setBusy(true);
    try {
      const orderType = draft.orderType;
      const doctorName = await getDoctorDisplayName(null, doctorId, []);
      const orderId = generateOrderId();
      const newOrder = await api('/api/v1/diagnostics/operations/orders', {
        method: 'POST',
        body: {
          orderId,
          type: orderType,
          centerType: orderType,
          testType: draft.testType,
          patientId: draft.patientId,
          patientName: draft.patientName || 'Patient',
          doctorId,
          doctorName,
          branchId: draft.branchId,
          branchName: draft.branchName,
          centerId: draft.centerId,
          centerName: draft.centerName || 'Center',
          notes: (draft.notes || '').trim(),
          status: 'pending',
        },
      });
      api('/api/v1/patient-timeline', {
        method: 'POST',
        body: { patientId: draft.patientId, type: orderType === 'lab' ? 'LAB_ORDER' : 'SCAN_ORDER', title: `${orderType === 'lab' ? 'Lab test' : 'Scan'} ordered: ${draft.testType}`, status: 'PENDING', relatedId: newOrder?.id || orderId, actor: { role: 'DOCTOR', name: doctorName } },
      }).catch(() => {});
      api('/api/v1/notifications/events', {
        method: 'POST',
        body: { targetUserId: draft.patientId, type: orderType === 'lab' ? 'LAB_ORDER' : 'SCAN_ORDER', title: `${orderType === 'lab' ? 'Lab Test' : 'Scan'} Ordered`, body: `Your doctor has ordered a ${draft.testType} at ${draft.branchName}.` },
      }).catch(() => {});
      await api(`/api/v1/doctors/${doctorId}/diagnostic-drafts/${draftId}`, { method: 'DELETE' });

      Alert.alert('Order submitted', `Order ID: ${orderId}`, [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not submit order. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={styles.centered}>
        <Text style={styles.miss}>Draft not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const accent = draft.orderType === 'scan' ? '#4c1d95' : '#065f46';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <View style={[styles.badge, { borderColor: accent }]}>
        <Ionicons name="document-outline" size={20} color={accent} />
        <Text style={[styles.badgeText, { color: accent }]}>DRAFT · {draft.orderType?.toUpperCase()}</Text>
      </View>

      <Text style={styles.title}>{draft.testType}</Text>
      <Text style={styles.sub}>Patient: {draft.patientName}</Text>

      <View style={styles.card}>
        <Row label="Branch" value={draft.branchName} />
        {draft.branchAddress ? <Row label="Address" value={draft.branchAddress} /> : null}
        <Row label="Center" value={draft.centerName || '—'} />
        <Row label="Notes" value={(draft.notes || '').trim() || '—'} />
        <Row
          label="Updated"
          value={
            draft.updatedAt?.seconds
              ? formatDateTime(draft.updatedAt)
              : '—'
          }
        />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, busy && { opacity: 0.7 }]}
        onPress={handleSubmit}
        disabled={busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Submit to center</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.delBtn} onPress={handleDelete} disabled={busy}>
        <Ionicons name="trash-outline" size={18} color="#b91c1c" />
        <Text style={styles.delBtnText}>Delete draft</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  inner: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background, padding: 24 },
  miss: { fontSize: 16, color: C.textSecondary },
  linkBtn: { marginTop: 16, padding: 12 },
  linkBtnText: { color: C.primary, fontWeight: '700' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  sub: { fontSize: 15, color: C.textSecondary, marginTop: 4, marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  row: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  rowLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  rowValue: { fontSize: 15, fontWeight: '600', color: C.text },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  delBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  delBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 15 },
});
