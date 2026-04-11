import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const STATUS_CONFIG = {
  pending:   { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c', label: 'Pending' },
  confirmed: { bg: '#f0fdf4', border: '#86efac', text: '#15803d', label: 'Confirmed' },
  completed: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', label: 'Completed' },
  cancelled: { bg: '#fff1f2', border: '#fecdd3', text: '#be123c', label: 'Cancelled' },
};

const FILTERS = ['all', 'pending', 'confirmed', 'completed', 'cancelled'];

export default function DoctorAppointmentsScreen() {
  const [appointments, setAppointments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { loadAppointments(); }, []);

  const loadAppointments = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      const q = query(
        collection(db, 'doctorAppointments'),
        where('doctorId', '==', currentUser.uid)
      );
      const snap = await getDocs(q);
      const appts = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      setAppointments(appts);
    } catch (err) {
      console.error('DoctorAppointments load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateStatus = async (apptId, newStatus) => {
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'doctorAppointments', apptId), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      setAppointments(prev =>
        prev.map(a => a.id === apptId ? { ...a, status: newStatus } : a)
      );
      setSelected(null);
    } catch (err) {
      Alert.alert('Error', 'Could not update appointment. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const filtered = filter === 'all' ? appointments : appointments.filter(a => a.status === filter);

  const renderItem = ({ item }) => {
    const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
    return (
      <TouchableOpacity style={styles.apptCard} onPress={() => setSelected(item)}>
        <View style={styles.apptHeader}>
          <Text style={styles.patientName}>{item.clientName || 'Patient'}</Text>
          <View style={[styles.badge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
            <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
          </View>
        </View>
        <View style={styles.apptMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={13} color={DoctorColors.textSecondary} />
            <Text style={styles.metaText}>{item.date || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={DoctorColors.textSecondary} />
            <Text style={styles.metaText}>{item.time || '—'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="videocam-outline" size={13} color={DoctorColors.textSecondary} />
            <Text style={styles.metaText}>{item.type || 'Consultation'}</Text>
          </View>
        </View>
        {item.reason ? <Text style={styles.reason} numberOfLines={1}>{item.reason}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={DoctorColors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAppointments(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No {filter === 'all' ? '' : filter} appointments</Text>
            </View>
          }
        />
      )}

      {/* Detail Modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Appointment Details</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {selected && (() => {
              const sc = STATUS_CONFIG[selected.status] || STATUS_CONFIG.pending;
              return (
                <>
                  <Text style={styles.modalPatient}>{selected.clientName || 'Patient'}</Text>
                  <View style={styles.modalMeta}>
                    <Text style={styles.modalMetaText}>📅 {selected.date} · {selected.time}</Text>
                    <Text style={styles.modalMetaText}>🎥 {selected.type || 'Consultation'}</Text>
                    {selected.reason ? <Text style={styles.modalMetaText}>📝 {selected.reason}</Text> : null}
                    {selected.consultationFee ? <Text style={styles.modalMetaText}>💰 GHS {selected.consultationFee}</Text> : null}
                  </View>

                  <View style={[styles.badge, { backgroundColor: sc.bg, borderColor: sc.border, alignSelf: 'flex-start', marginBottom: 16 }]}>
                    <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
                  </View>

                  {/* Action buttons */}
                  {selected.status === 'pending' && (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}
                        onPress={() => updateStatus(selected.id, 'confirmed')}
                        disabled={updating}
                      >
                        <Text style={[styles.actionBtnText, { color: '#15803d' }]}>Confirm</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}
                        onPress={() => updateStatus(selected.id, 'cancelled')}
                        disabled={updating}
                      >
                        <Text style={[styles.actionBtnText, { color: '#be123c' }]}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {selected.status === 'confirmed' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', width: '100%' }]}
                      onPress={() => updateStatus(selected.id, 'completed')}
                      disabled={updating}
                    >
                      <Text style={[styles.actionBtnText, { color: '#475569' }]}>Mark as Completed</Text>
                    </TouchableOpacity>
                  )}
                  {updating && <ActivityIndicator style={{ marginTop: 8 }} color={DoctorColors.primary} />}
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12,
    gap: 8, flexWrap: 'wrap',
  },
  filterTab: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: DoctorColors.border,
  },
  filterTabActive: { backgroundColor: DoctorColors.primary, borderColor: DoctorColors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: DoctorColors.textSecondary },
  filterTextActive: { color: '#fff' },
  apptCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  apptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  patientName: { fontSize: 15, fontWeight: '700', color: DoctorColors.text },
  badge: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
  apptMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: DoctorColors.textSecondary },
  reason: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },
  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 36,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: DoctorColors.text },
  modalPatient: { fontSize: 20, fontWeight: '800', color: DoctorColors.text, marginBottom: 12 },
  modalMeta: { gap: 6, marginBottom: 14 },
  modalMetaText: { fontSize: 14, color: DoctorColors.textSecondary },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, alignItems: 'center',
  },
  actionBtnText: { fontSize: 14, fontWeight: '700' },
});
