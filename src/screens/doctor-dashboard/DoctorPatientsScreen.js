import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, serverTimestamp,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const STATUS_COLORS = {
  active:     { bg: '#f0fdf4', text: '#15803d' },
  discharged: { bg: '#fef2f2', text: '#b91c1c' },
  pending:    { bg: '#fff7ed', text: '#c2410c' },
};

export default function DoctorPatientsScreen({ navigation }) {
  const [patients, setPatients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dischargeTarget, setDischargeTarget] = useState(null);
  const [discharging, setDischarging] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState(null);

  useEffect(() => { loadPatients(); }, []);

  useEffect(() => {
    if (!search.trim()) { setFiltered(patients); return; }
    const q = search.toLowerCase();
    setFiltered(patients.filter(p => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q)));
  }, [search, patients]);

  const loadPatients = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      const profile = dSnap.exists() ? { id: cu.uid, ...dSnap.data() } : { id: cu.uid, name: 'Doctor' };
      setDoctorProfile(profile);

      const apptSnap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );

      const patMap = new Map();
      apptSnap.docs.forEach(d => {
        const data = d.data();
        if (!data.clientId) return;
        const prev = patMap.get(data.clientId);
        if (!prev) {
          patMap.set(data.clientId, {
            id: data.clientId,
            name: data.clientName || 'Patient',
            email: data.clientEmail || '',
            lastVisit: data.date || '',
            visitCount: 1,
            completedCount: data.status === 'completed' ? 1 : 0,
          });
        } else {
          prev.visitCount += 1;
          if (data.status === 'completed') prev.completedCount += 1;
          if ((data.date || '') > prev.lastVisit) prev.lastVisit = data.date;
        }
      });

      // Load patient statuses from patientProfiles
      const list = Array.from(patMap.values());
      for (const p of list) {
        try {
          const ppSnap = await getDoc(doc(db, 'patientProfiles', p.id));
          if (ppSnap.exists()) p.status = ppSnap.data().status || 'active';
          else p.status = 'active';
        } catch { p.status = 'active'; }
      }

      const sorted = list.sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
      setPatients(sorted);
      setFiltered(sorted);
    } catch (err) {
      console.error('DoctorPatients load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const confirmDischarge = async () => {
    if (!dischargeTarget) return;
    setDischarging(true);
    try {
      const cu = auth.currentUser;
      await setDoc(doc(db, 'patientProfiles', dischargeTarget.id), {
        status: 'discharged',
        dischargedBy: cu.uid,
        dischargedByName: `Dr. ${doctorProfile?.name || 'Doctor'}`,
        dischargedAt: serverTimestamp(),
      }, { merge: true });
      setPatients(prev => prev.map(p => p.id === dischargeTarget.id ? { ...p, status: 'discharged' } : p));
      setDischargeTarget(null);
    } catch {
      Alert.alert('Error', 'Could not discharge patient.');
    } finally {
      setDischarging(false);
    }
  };

  const renderItem = ({ item }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.active;
    return (
      <View style={styles.patientCard}>
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
          </View>
          <View style={styles.patientInfo}>
            <Text style={styles.patientName}>{item.name}</Text>
            {item.email ? <Text style={styles.patientEmail}>{item.email}</Text> : null}
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{item.visitCount} appointment{item.visitCount !== 1 ? 's' : ''}</Text>
              {item.lastVisit ? <Text style={styles.meta}>· Last: {item.lastVisit}</Text> : null}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusText, { color: sc.text }]}>{item.status || 'active'}</Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('DoctorAppointments')}
          >
            <Ionicons name="calendar-outline" size={14} color={DoctorColors.primary} />
            <Text style={styles.actionText}>Appointments</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('DoctorMessages')}
          >
            <Ionicons name="chatbubble-outline" size={14} color={DoctorColors.primary} />
            <Text style={styles.actionText}>Message</Text>
          </TouchableOpacity>
          {item.status !== 'discharged' && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.dischargeBtn]}
              onPress={() => setDischargeTarget(item)}
            >
              <Ionicons name="exit-outline" size={14} color="#b91c1c" />
              <Text style={[styles.actionText, { color: '#b91c1c' }]}>Discharge</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patients..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
        <Text style={styles.count}>{filtered.length}</Text>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPatients(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No patients found</Text>
            </View>
          }
        />
      )}

      {/* Discharge Confirmation Modal */}
      <Modal visible={!!dischargeTarget} transparent animationType="fade" onRequestClose={() => setDischargeTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="warning-outline" size={32} color="#f59e0b" />
            </View>
            <Text style={styles.modalTitle}>Discharge Patient?</Text>
            <Text style={styles.modalBody}>
              Are you sure you want to discharge{'\n'}
              <Text style={{ fontWeight: '700' }}>{dischargeTarget?.name}</Text>?{'\n\n'}
              This will mark the patient as discharged from your care.
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setDischargeTarget(null)} disabled={discharging}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, discharging && { opacity: 0.6 }]}
                onPress={confirmDischarge}
                disabled={discharging}
              >
                {discharging
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>Discharge</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  count: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  patientCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: DoctorColors.primary },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 15, fontWeight: '700', color: DoctorColors.text },
  patientEmail: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 1 },
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  meta: { fontSize: 11, color: '#94a3b8' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: DoctorColors.primaryLight,
  },
  dischargeBtn: { backgroundColor: '#fff1f2' },
  actionText: { fontSize: 12, color: DoctorColors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
  },
  modalIcon: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#fffbeb',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text, marginBottom: 10 },
  modalBody: { fontSize: 14, color: DoctorColors.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  modalFooter: { flexDirection: 'row', gap: 12, width: '100%' },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  cancelBtnText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  confirmBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#ef4444',
  },
  confirmBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
