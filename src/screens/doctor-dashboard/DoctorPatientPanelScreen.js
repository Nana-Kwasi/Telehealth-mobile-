import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Alert, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, doc, getDoc,
  setDoc, serverTimestamp,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';

function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const STATUS_COLORS = {
  active:     { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  inactive:   { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  discharged: { bg: '#fef2f2', text: '#b91c1c', border: '#fecdd3' },
};

const PANEL_TABS = ['All', 'Active', 'Inactive', 'Discharged'];

const TAB_COLORS = {
  All:        DoctorColors.primary,
  Active:     '#15803d',
  Inactive:   '#c2410c',
  Discharged: '#b91c1c',
};

export default function DoctorPatientPanelScreen({ navigation }) {
  const [patients, setPatients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusChangeTarget, setStatusChangeTarget] = useState(null); // { patient, newStatus }
  const [changingStatus, setChangingStatus] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState(null);

  useEffect(() => { loadPatients(); }, []);

  useEffect(() => {
    let list = patients;
    if (activeTab !== 'All') {
      const statusKey = activeTab.toLowerCase();
      list = patients.filter(p => (p.status || 'active') === statusKey);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q));
    }
    setFiltered(list);
  }, [search, patients, activeTab]);

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
            name: data.clientName || '',
            email: data.clientEmail || '',
            lastVisit: data.date || '',
            visitCount: 1,
            completedCount: data.status === 'completed' ? 1 : 0,
          });
        } else {
          prev.visitCount += 1;
          if (data.status === 'completed') prev.completedCount += 1;
          if ((data.date || '') > prev.lastVisit) prev.lastVisit = data.date;
          if (!prev.name && data.clientName) prev.name = data.clientName;
        }
      });

      const enriched = await enrichPatientNames(patMap);
      const list = Array.from(enriched.values());
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
      console.error('DoctorPatientPanel load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const confirmStatusChange = async () => {
    if (!statusChangeTarget) return;
    setChangingStatus(true);
    try {
      const { patient, newStatus } = statusChangeTarget;
      await setDoc(doc(db, 'patientProfiles', patient.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid,
        updatedByName: `Dr. ${doctorProfile?.name || 'Doctor'}`,
        ...(newStatus === 'discharged' ? { dischargedAt: serverTimestamp() } : {}),
      }, { merge: true });
      setPatients(prev => prev.map(p => p.id === patient.id ? { ...p, status: newStatus } : p));
      setStatusChangeTarget(null);
    } catch {
      Alert.alert('Error', 'Could not update patient status.');
    } finally {
      setChangingStatus(false);
    }
  };

  const tabCount = (tab) => {
    if (tab === 'All') return patients.length;
    return patients.filter(p => (p.status || 'active') === tab.toLowerCase()).length;
  };

  const renderItem = ({ item }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.active;
    return (
      <View style={styles.patientCard}>
        <TouchableOpacity
          style={styles.cardTop}
          onPress={() => navigation.getParent()?.navigate('DoctorPatientDetail', { patientId: item.id, patientName: item.name })}
          activeOpacity={0.7}
        >
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
          <View style={styles.cardTopRight}>
            <View style={[styles.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>{(item.status || 'active').charAt(0).toUpperCase() + (item.status || 'active').slice(1)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={{ marginTop: 6 }} />
          </View>
        </TouchableOpacity>

        {/* Status management actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.getParent()?.navigate('DoctorPatientDetail', { patientId: item.id, patientName: item.name })}
          >
            <Ionicons name="person-outline" size={14} color={DoctorColors.primary} />
            <Text style={styles.actionText}>View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('DoctorMessages', { patientId: item.id, patientName: item.name })}
          >
            <Ionicons name="chatbubble-outline" size={14} color={DoctorColors.primary} />
            <Text style={styles.actionText}>Message</Text>
          </TouchableOpacity>

          {item.status === 'active' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}
              onPress={() => setStatusChangeTarget({ patient: item, newStatus: 'inactive' })}
            >
              <Ionicons name="pause-circle-outline" size={14} color="#c2410c" />
              <Text style={[styles.actionText, { color: '#c2410c' }]}>Inactive</Text>
            </TouchableOpacity>
          )}
          {item.status === 'inactive' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
              onPress={() => setStatusChangeTarget({ patient: item, newStatus: 'active' })}
            >
              <Ionicons name="play-circle-outline" size={14} color="#15803d" />
              <Text style={[styles.actionText, { color: '#15803d' }]}>Activate</Text>
            </TouchableOpacity>
          )}
          {item.status !== 'discharged' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#fef2f2', borderColor: '#fecdd3' }]}
              onPress={() => setStatusChangeTarget({ patient: item, newStatus: 'discharged' })}
            >
              <Ionicons name="exit-outline" size={14} color="#b91c1c" />
              <Text style={[styles.actionText, { color: '#b91c1c' }]}>Discharge</Text>
            </TouchableOpacity>
          )}
          {item.status === 'discharged' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}
              onPress={() => setStatusChangeTarget({ patient: item, newStatus: 'active' })}
            >
              <Ionicons name="refresh-circle-outline" size={14} color="#15803d" />
              <Text style={[styles.actionText, { color: '#15803d' }]}>Reactivate</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Summary row */}
      <View style={styles.summaryRow}>
        {[
          { label: 'All', count: patients.length, color: DoctorColors.primary, bg: '#eff6ff' },
          { label: 'Active', count: tabCount('Active'), color: '#15803d', bg: '#f0fdf4' },
          { label: 'Inactive', count: tabCount('Inactive'), color: '#c2410c', bg: '#fff7ed' },
          { label: 'Discharged', count: tabCount('Discharged'), color: '#b91c1c', bg: '#fef2f2' },
        ].map(({ label, count, color, bg }) => (
          <TouchableOpacity key={label} style={[styles.summaryCard, { backgroundColor: bg }]}
            onPress={() => setActiveTab(label)}>
            <Text style={[styles.summaryCount, { color }]}>{count}</Text>
            <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

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

      {/* Status Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {PANEL_TABS.map(tab => {
          const count = tabCount(tab);
          const tabColor = TAB_COLORS[tab] || DoctorColors.primary;
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, isActive && { backgroundColor: tabColor, borderColor: tabColor }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab}</Text>
              <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Context hint */}
      {activeTab !== 'All' && (
        <View style={[styles.contextHint, { backgroundColor: STATUS_COLORS[activeTab.toLowerCase()]?.bg || '#f1f5f9' }]}>
          <Text style={[styles.contextHintText, { color: STATUS_COLORS[activeTab.toLowerCase()]?.text || '#64748b' }]}>
            {activeTab === 'Active' && 'Active patients under your care. Tap a patient to view or change status.'}
            {activeTab === 'Inactive' && 'Temporarily inactive patients. Reactivate or discharge from here.'}
            {activeTab === 'Discharged' && 'Discharged patients. You can reactivate them if needed.'}
          </Text>
        </View>
      )}

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
              <Text style={styles.emptyText}>No {activeTab.toLowerCase()} patients</Text>
            </View>
          }
        />
      )}

      {/* Status Change Confirmation Modal */}
      <Modal visible={!!statusChangeTarget} transparent animationType="fade" onRequestClose={() => setStatusChangeTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={[styles.modalIcon, { backgroundColor: statusChangeTarget?.newStatus === 'discharged' ? '#fef2f2' : statusChangeTarget?.newStatus === 'inactive' ? '#fff7ed' : '#f0fdf4' }]}>
              <Ionicons
                name={statusChangeTarget?.newStatus === 'discharged' ? 'exit-outline' : statusChangeTarget?.newStatus === 'inactive' ? 'pause-circle-outline' : 'play-circle-outline'}
                size={32}
                color={statusChangeTarget?.newStatus === 'discharged' ? '#b91c1c' : statusChangeTarget?.newStatus === 'inactive' ? '#c2410c' : '#15803d'}
              />
            </View>
            <Text style={styles.modalTitle}>
              {statusChangeTarget?.newStatus === 'discharged' ? 'Discharge Patient?' : statusChangeTarget?.newStatus === 'inactive' ? 'Set Inactive?' : 'Reactivate Patient?'}
            </Text>
            <Text style={styles.modalBody}>
              {statusChangeTarget?.newStatus === 'discharged'
                ? `Discharge ${statusChangeTarget?.patient?.name}? This will mark them as no longer under active care.`
                : statusChangeTarget?.newStatus === 'inactive'
                ? `Set ${statusChangeTarget?.patient?.name} to Inactive? You can reactivate them at any time.`
                : `Reactivate ${statusChangeTarget?.patient?.name} as an Active patient?`}
            </Text>
            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStatusChangeTarget(null)} disabled={changingStatus}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, changingStatus && { opacity: 0.6 },
                  { backgroundColor: statusChangeTarget?.newStatus === 'discharged' ? '#b91c1c' : statusChangeTarget?.newStatus === 'inactive' ? '#c2410c' : '#15803d' }]}
                onPress={confirmStatusChange}
                disabled={changingStatus}
              >
                {changingStatus
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>
                    {statusChangeTarget?.newStatus === 'discharged' ? 'Discharge' : statusChangeTarget?.newStatus === 'inactive' ? 'Set Inactive' : 'Reactivate'}
                  </Text>
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

  summaryRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4 },
  summaryCard: { flex: 1, borderRadius: 10, padding: 8, alignItems: 'center' },
  summaryCount: { fontSize: 20, fontWeight: '800', lineHeight: 24 },
  summaryLabel: { fontSize: 10, fontWeight: '600', marginTop: 2 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  count: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },

  tabScroll: { maxHeight: 50 },
  tabContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: DoctorColors.border,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: DoctorColors.textSecondary },
  tabTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: DoctorColors.textSecondary },
  tabBadgeTextActive: { color: '#fff' },

  contextHint: { marginHorizontal: 12, marginBottom: 4, padding: 10, borderRadius: 8 },
  contextHintText: { fontSize: 12, fontWeight: '500' },

  patientCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardTopRight: { alignItems: 'flex-end' },
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
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: DoctorColors.primaryLight, borderWidth: 1, borderColor: DoctorColors.primaryLight,
  },
  actionText: { fontSize: 12, color: DoctorColors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 10,
  },
  modalIcon: {
    width: 60, height: 60, borderRadius: 30,
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
  },
  confirmBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
