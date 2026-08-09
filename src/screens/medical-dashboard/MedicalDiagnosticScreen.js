import React, { useState, useCallback,useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, ScrollView, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { MedicalColors as C } from '../../constants/colors';
import { normalizeDiagnosticOrderStatus, patientMobileStatusStyleKey } from '../../utils/diagnosticOrderStatus';
import { formatDate } from '../../utils/dateDisplay';

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     bg: '#fef3c7', text: '#92400e', icon: 'time-outline' },
  in_progress: { label: 'In Progress', bg: '#dbeafe', text: '#1e40af', icon: 'hourglass-outline' },
  completed:   { label: 'Completed',   bg: '#dcfce7', text: '#14532d', icon: 'checkmark-circle-outline' },
  rejected:    { label: 'Cancelled',     bg: '#fee2e2', text: '#991b1b', icon: 'close-circle-outline' },
};

const TYPE_CONFIG = {
  lab:  { label: 'Lab Test',  icon: 'flask-outline',  color: '#065f46', bg: '#d1fae5' },
  scan: { label: 'Scan',      icon: 'scan-outline',   color: '#4c1d95', bg: '#ede9fe' },
};

export default function MedicalDiagnosticScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('All');

  const [patientId, setPatientId] = useState(null);
  useEffect(() => { getStoredUserId().then(setPatientId); }, []);

  useFocusEffect(useCallback(() => { if (patientId) loadOrders(); }, [patientId]));

  const loadOrders = async () => {
    try {
      const list = await api(`/api/v1/diagnostics/operations/orders?patientId=${patientId}`).catch(() => []) || [];
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setOrders(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const rowKind = (o) => String(o.type || o.centerType || o.diagnosticType || '').toLowerCase();
  const filteredOrders =
    filter === 'All' ? orders
      // "Ready" = the centre has finished and released the result.
      : filter === 'Ready' ? orders.filter(o => normalizeDiagnosticOrderStatus(o.status) === 'COMPLETED')
        : orders.filter(o => rowKind(o) === filter.toLowerCase());

  const renderItem = ({ item }) => {
    const sk = patientMobileStatusStyleKey(item.status);
    const sc = STATUS_CONFIG[sk] || STATUS_CONFIG.pending;
    const tc = TYPE_CONFIG[item.type] || TYPE_CONFIG.lab;
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
        <View style={styles.cardHeader}>
          <View style={[styles.typeChip, { backgroundColor: tc.bg }]}>
            <Ionicons name={tc.icon} size={13} color={tc.color} />
            <Text style={[styles.typeChipText, { color: tc.color }]}>{tc.label}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Ionicons name={sc.icon} size={12} color={sc.text} />
            <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>
        <Text style={styles.testType}>{item.testType}</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={14} color={C.textSecondary} />
          <Text style={styles.locationText}>{item.branchName || item.centerName || '—'}</Text>
        </View>
        {item.address && (
          <Text style={styles.addressText}>{item.address}</Text>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.orderId}>Order: {item.orderId || item.id.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.dateText}>
            {formatDate(item.createdAt, 'Recently')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {['All', 'Ready', 'Lab', 'Scan'].map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="flask-outline" size={48} color="#e2e8f0" />
              <Text style={styles.emptyText}>No lab or scan orders yet</Text>
              <Text style={styles.emptySub}>Your doctor will order tests when needed</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        />
      )}

      <Modal visible={!!selected} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {selected && ['PENDING', 'IN_PROGRESS'].includes(normalizeDiagnosticOrderStatus(selected.status)) && (
              <View style={styles.idCard}>
                <Ionicons name="id-card-outline" size={28} color={C.primary} />
                <View style={{ marginLeft: 12 }}>
                  <Text style={styles.idTitle}>Present Your National ID</Text>
                  <Text style={styles.idSub}>Show your National ID at {selected?.branchName || selected?.centerName} so staff can verify your name matches this order.</Text>
                </View>
              </View>
              )}
              {selected && normalizeDiagnosticOrderStatus(selected.status) === 'COMPLETED' && (
              <View style={[styles.idCard, { backgroundColor: '#ecfdf5', borderColor: '#86efac' }]}>
                <Ionicons name="checkmark-circle-outline" size={28} color="#15803d" />
                <View style={{ marginLeft: 12 }}>
                  <Text style={[styles.idTitle, { color: '#166534' }]}>Results are with your doctor</Text>
                  <Text style={[styles.idSub, { color: '#15803d' }]}>Your lab or imaging center has completed this order. Ask your doctor for results and what they mean for your care.</Text>
                </View>
              </View>
              )}

              <View style={styles.detailRow}><Text style={styles.detailLabel}>Type</Text><Text style={styles.detailValue}>{selected?.type?.toUpperCase()}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Test</Text><Text style={styles.detailValue}>{selected?.testType}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Status</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[patientMobileStatusStyleKey(selected?.status)]?.bg || '#fef3c7' }]}>
                  <Text style={[styles.statusText, { color: STATUS_CONFIG[patientMobileStatusStyleKey(selected?.status)]?.text || '#92400e' }]}>
                    {STATUS_CONFIG[patientMobileStatusStyleKey(selected?.status)]?.label || 'Pending'}
                  </Text>
                </View>
              </View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Center</Text><Text style={styles.detailValue}>{selected?.branchName || selected?.centerName || '—'}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Doctor</Text><Text style={styles.detailValue}>Dr. {selected?.doctorName || 'Your Doctor'}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Ordered</Text>
                <Text style={styles.detailValue}>
                  {selected?.createdAt ? formatDate(selected.createdAt) : 'Recently'}
                </Text>
              </View>
              {selected?.notes ? (
                <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                  <Text style={styles.detailLabel}>Instructions</Text>
                  <Text style={[styles.detailValue, { flex: 1, lineHeight: 18, textAlign: 'left' }]}>{selected.notes}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  filterRow: { flexDirection: 'row', padding: 16, paddingBottom: 8, gap: 10, flexWrap: 'wrap' },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  testType: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 6 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  locationText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  addressText: { fontSize: 12, color: C.textLight, marginLeft: 18, marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  orderId: { fontSize: 11, color: C.textSecondary },
  dateText: { fontSize: 11, color: C.textLight },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 12 },
  emptySub: { fontSize: 13, color: C.textSecondary, marginTop: 6, textAlign: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  idCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  idTitle: { fontSize: 15, fontWeight: '800', color: C.primary, marginBottom: 2 },
  idSub: { fontSize: 12, color: '#1e40af', lineHeight: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  detailLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600', width: 90 },
  detailValue: { fontSize: 14, color: C.text, fontWeight: '600', textAlign: 'right' },
});
