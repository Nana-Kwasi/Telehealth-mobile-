import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, FlatList, Alert, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { ScanColors as C } from '../../constants/colors';

function generateResultRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'SCAN-';
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

const SCAN_ICONS = { 'X-Ray': 'body-outline', 'MRI': 'radio-outline', 'CT Scan': 'scan-outline', 'Ultrasound': 'pulse-outline' };

export default function ScanVerifyScreen({ profile }) {
  const [searchName, setSearchName] = useState('');
  const [searching, setSearching] = useState(false);
  const [foundOrders, setFoundOrders] = useState([]);
  const [searched, setSearched] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [resultNotes, setResultNotes] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);

  const handleSearch = async () => {
    if (!searchName.trim()) return;
    setSearching(true);
    setSearched(false);
    try {
      const pid = profile?.id;
      const isBranch = profile?.role === 'scan_branch';
      const rawOrders = isBranch
        ? await api(`/api/v1/diagnostics/operations/orders?branchId=${pid}`).catch(() => [])
        : await api(`/api/v1/diagnostics/operations/orders?centerId=${pid}&centerType=scan`).catch(() => []);
      let list = (rawOrders || []).filter(o => o.patientName?.toLowerCase().includes(searchName.toLowerCase()));
      if (isBranch) list = list.filter(o => o.centerType === 'scan');
      setFoundOrders(list);
      setSearched(true);
    } catch (e) { console.error(e); } finally { setSearching(false); }
  };

  const handleMarkInProgress = async (order) => {
    try {
      await api(`/api/v1/diagnostics/operations/orders/${order.id}/status`, { method: 'PATCH', body: { status: 'in_progress' } });
      api('/api/v1/patient-timeline', { method: 'POST', body: { patientId: order.patientId, type: 'SCAN_ORDER', title: `Scan in progress: ${order.testType}`, status: 'IN_PROGRESS', relatedId: order.id, actor: { role: 'SCAN', name: profile?.centerName || 'Scan Center' } } }).catch(() => {});
      setFoundOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: 'in_progress' } : o));
      Alert.alert('Updated', 'Order marked as In Progress');
    } catch (e) { Alert.alert('Error', 'Failed to update order'); }
  };

  const handleSubmitResult = async () => {
    if (!resultNotes.trim()) { Alert.alert('Required', 'Please add result notes.'); return; }
    setSubmitting(true);
    try {
      const resultRef = generateResultRef();
      await api(`/api/v1/diagnostics/operations/orders/${selectedOrder.id}/status`, { method: 'PATCH', body: { status: 'completed' } });
      await api(`/api/v1/diagnostics/operations/orders/${selectedOrder.id}/results`, {
        method: 'POST',
        body: { orderId: selectedOrder.id, patientId: selectedOrder.patientId, doctorId: selectedOrder.doctorId, type: 'scan', testType: selectedOrder.testType, notes: resultNotes.trim(), fileName: fileName.trim() || null, resultRef, uploadedBy: profile?.id, uploaderName: profile?.centerName || 'Scan Center' },
      });
      api('/api/v1/notifications/events', { method: 'POST', body: { targetUserId: selectedOrder.doctorId, type: 'SCAN_RESULT', title: 'Scan Report Ready', body: `Report for ${selectedOrder.patientName} (${selectedOrder.testType}) is ready.` } }).catch(() => {});
      api('/api/v1/notifications/events', { method: 'POST', body: { targetUserId: selectedOrder.patientId, type: 'SCAN_RESULT', title: 'Scan Report Ready', body: `Your ${selectedOrder.testType} report is available.` } }).catch(() => {});
      api('/api/v1/patient-timeline', { method: 'POST', body: { patientId: selectedOrder.patientId, type: 'SCAN_RESULT', title: `Scan report ready: ${selectedOrder.testType}`, status: 'COMPLETED', relatedId: selectedOrder.id, actor: { role: 'SCAN', name: profile?.centerName || 'Scan Center' } } }).catch(() => {});
      setFoundOrders(prev => prev.map(o => o.id === selectedOrder.id ? { ...o, status: 'completed' } : o));
      setShowResultModal(false);
      Alert.alert('Done', 'Report submitted. Doctor and patient have been notified.');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to submit report.');
    } finally { setSubmitting(false); }
  };

  const renderOrder = ({ item }) => {
    const isCompleted = item.status === 'completed';
    const isInProgress = item.status === 'in_progress';
    const iconName = SCAN_ICONS[item.testType] || 'scan-outline';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.patientName}>{item.patientName}</Text>
          <View style={[styles.statusBadge, { backgroundColor: isCompleted ? '#dcfce7' : isInProgress ? '#ede9fe' : '#fef3c7' }]}>
            <Text style={[styles.statusText, { color: isCompleted ? '#14532d' : isInProgress ? '#5b21b6' : '#92400e' }]}>
              {isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Pending'}
            </Text>
          </View>
        </View>
        <View style={styles.scanTypeRow}>
          <Ionicons name={iconName} size={16} color={C.primary} />
          <Text style={styles.scanType}>{item.testType}</Text>
        </View>
        <Text style={styles.orderId}>Order: {item.orderId || item.id.slice(0, 8).toUpperCase()}</Text>
        {item.notes ? <Text style={styles.notesText} numberOfLines={2}>{item.notes}</Text> : null}
        <Text style={styles.doctorText}>Ordered by: Dr. {item.doctorName || 'Doctor'}</Text>
        {!isCompleted && (
          <View style={styles.actionRow}>
            {!isInProgress && (
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#ede9fe' }]} onPress={() => handleMarkInProgress(item)}>
                <Ionicons name="play-circle-outline" size={16} color="#5b21b6" />
                <Text style={[styles.actionBtnText, { color: '#5b21b6' }]}>Start Scan</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.primaryLight }]} onPress={() => { setSelectedOrder(item); setResultNotes(''); setFileName(''); setShowResultModal(true); }}>
              <Ionicons name="cloud-upload-outline" size={16} color={C.primary} />
              <Text style={[styles.actionBtnText, { color: C.primary }]}>Upload Report</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchCard}>
        <Text style={styles.sectionTitle}>Patient Verification</Text>
        <Text style={styles.sectionSub}>Patient presents National ID — search by name to retrieve imaging orders</Text>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Enter patient name…"
            value={searchName}
            onChangeText={setSearchName}
            onSubmitEditing={handleSearch}
            placeholderTextColor={C.textLight}
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
            {searching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
      </View>

      {searched && (
        <FlatList
          data={foundOrders}
          keyExtractor={i => i.id}
          renderItem={renderOrder}
          contentContainerStyle={{ padding: 16, paddingTop: 8, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="person-outline" size={48} color={C.border} />
              <Text style={styles.emptyText}>No orders found for this patient</Text>
            </View>
          }
        />
      )}

      <Modal visible={showResultModal} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Upload Scan Report</Text>
            <Text style={styles.modalSub}>{selectedOrder?.testType} — {selectedOrder?.patientName}</Text>
            <Text style={styles.fieldLabel}>File Name / Reference (optional)</Text>
            <TextInput style={styles.fieldInput} placeholder="e.g. MRI_Brain_Report.pdf" value={fileName} onChangeText={setFileName} />
            <Text style={styles.fieldLabel}>Radiologist Notes / Findings *</Text>
            <TextInput
              style={[styles.fieldInput, styles.textArea]}
              placeholder="Enter imaging findings, observations, recommendations…"
              value={resultNotes}
              onChangeText={setResultNotes}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowResultModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={handleSubmitResult} disabled={submitting}>
                <Text style={styles.submitBtnText}>{submitting ? 'Submitting…' : 'Submit Report'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  searchCard: { backgroundColor: '#fff', margin: 16, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 4 },
  sectionSub: { fontSize: 13, color: C.textSecondary, marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 10 },
  searchInput: { flex: 1, backgroundColor: C.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border },
  searchBtn: { backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  patientName: { fontSize: 16, fontWeight: '700', color: C.text },
  statusBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  scanTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  scanType: { fontSize: 14, fontWeight: '600', color: C.primary },
  orderId: { fontSize: 12, color: C.textSecondary },
  notesText: { fontSize: 13, color: C.textSecondary, fontStyle: 'italic', marginTop: 4 },
  doctorText: { fontSize: 12, color: C.textSecondary, marginTop: 4, marginBottom: 10 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, fontWeight: '700', color: C.text, marginTop: 12 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 4 },
  modalSub: { fontSize: 14, color: C.textSecondary, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 6 },
  fieldInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, marginBottom: 14 },
  textArea: { height: 100 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelBtnText: { fontWeight: '700', color: C.textSecondary },
  submitBtn: { flex: 2, padding: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center' },
  submitBtnText: { fontWeight: '800', color: '#fff', fontSize: 15 },
});
