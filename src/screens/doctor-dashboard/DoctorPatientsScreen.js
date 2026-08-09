import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';

function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const STATUS_COLORS = {
  active:     { bg: '#f0fdf4', text: '#15803d' },
  inactive:   { bg: '#fff7ed', text: '#c2410c' },
  discharged: { bg: '#fef2f2', text: '#b91c1c' },
  pending:    { bg: '#fff7ed', text: '#c2410c' },
};

const PANEL_TABS = ['All', 'Active'];

export default function DoctorPatientsScreen({ navigation }) {
  const [patients, setPatients] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      const doctorId = await AsyncStorage.getItem('th.userId');
      if (!doctorId) return;

      const doctorData = await api(`/api/v1/doctors/${doctorId}`).catch(() => null);
      setDoctorProfile({ id: doctorId, ...doctorData });

      const appointments = await api(`/api/v1/medical/appointments/doctor/${doctorId}`).catch(() => []);
      const apptList = Array.isArray(appointments) ? appointments : [];

      const patMap = new Map();
      apptList.forEach(data => {
        if (!data.clientId) return;
        const prev = patMap.get(data.clientId);
        if (!prev) {
          patMap.set(data.clientId, {
            id: data.clientId, name: data.clientName || data.patientName || '',
            email: data.clientEmail || '', lastVisit: data.date || data.scheduledAt?.split('T')[0] || '',
            visitCount: 1, completedCount: data.status === 'completed' ? 1 : 0,
          });
        } else {
          prev.visitCount += 1;
          if (data.status === 'completed') prev.completedCount += 1;
          const newDate = data.date || data.scheduledAt?.split('T')[0] || '';
          if (newDate > prev.lastVisit) prev.lastVisit = newDate;
          if (!prev.name && (data.clientName || data.patientName)) prev.name = data.clientName || data.patientName;
        }
      });

      const enriched = await enrichPatientNames(patMap);
      const list = Array.from(enriched.values()).map(p => ({ ...p, status: 'active' }));
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

  const renderItem = ({ item }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.active;
    return (
      <View style={styles.patientCard}>
        <TouchableOpacity
          style={styles.cardTop}
          onPress={() => navigation.getParent()?.navigate('DoctorPatientDetail', { patientId: item.id, patientName: item.name, patientEmail: item.email })}
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
            <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>{item.status || 'active'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#cbd5e1" style={{ marginTop: 6 }} />
          </View>
        </TouchableOpacity>

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
            onPress={() => navigation.navigate('DoctorMessages', { patientId: item.id, patientName: item.name })}
          >
            <Ionicons name="chatbubble-outline" size={14} color={DoctorColors.primary} />
            <Text style={styles.actionText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.getParent()?.navigate('DoctorPatientDetail', { patientId: item.id, patientName: item.name, patientEmail: item.email })}
          >
            <Ionicons name="chevron-forward-outline" size={14} color={DoctorColors.primary} />
            <Text style={styles.actionText}>View Profile</Text>
          </TouchableOpacity>
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

      {/* Status Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContent}>
        {PANEL_TABS.map(tab => {
          const count = tab === 'All' ? patients.length : patients.filter(p => (p.status || 'active') === tab.toLowerCase()).length;
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab && styles.tabBadgeTextActive]}>{count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabScroll: { maxHeight: 50 },
  tabContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: DoctorColors.border,
  },
  tabActive: { backgroundColor: DoctorColors.primary, borderColor: DoctorColors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: DoctorColors.textSecondary },
  tabTextActive: { color: '#fff' },
  tabBadge: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  tabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText: { fontSize: 11, fontWeight: '700', color: DoctorColors.textSecondary },
  tabBadgeTextActive: { color: '#fff' },
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, activeOpacity: 0.7 },
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
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: DoctorColors.primaryLight,
  },
  actionText: { fontSize: 12, color: DoctorColors.primary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },
});
