import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, SectionList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { MedicalColors as C } from '../../constants/colors';

const EVENT_CONFIG = {
  APPOINTMENT:    { icon: 'calendar', color: '#1e6bb8', bg: '#e8f1fb', label: 'Appointment' },
  PRESCRIPTION:   { icon: 'medkit', color: '#7c3aed', bg: '#ede9fe', label: 'Prescription' },
  LAB_ORDER:      { icon: 'flask', color: '#065f46', bg: '#d1fae5', label: 'Lab Order' },
  LAB_RESULT:     { icon: 'document-text', color: '#059669', bg: '#d1fae5', label: 'Lab Result' },
  SCAN_ORDER:     { icon: 'scan', color: '#4c1d95', bg: '#ede9fe', label: 'Scan Order' },
  SCAN_RESULT:    { icon: 'radio', color: '#6d28d9', bg: '#ede9fe', label: 'Scan Report' },
  PHARMACY_UPDATE:{ icon: 'bag', color: '#0c4a6e', bg: '#e0f2fe', label: 'Pharmacy' },
};

const STATUS_CONFIG = {
  PENDING:     { bg: '#fef3c7', text: '#92400e' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af' },
  COMPLETED:   { bg: '#dcfce7', text: '#14532d' },
};

function groupByDate(items) {
  const groups = {};
  items.forEach(item => {
    const dateKey = item.createdAt
      ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'Unknown Date';
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(item);
  });
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

export default function MedicalTimelineScreen({ navigation }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('All');

  const patientId = auth.currentUser?.uid;

  useFocusEffect(useCallback(() => { loadTimeline(); }, []));

  const loadTimeline = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, 'patientTimeline'), where('patientId', '==', patientId))
      );
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const rxItems = items.filter(i => i.type === 'PRESCRIPTION' && i.relatedId);
      if (rxItems.length > 0) {
        await Promise.all(rxItems.map(async (evt) => {
          try {
            const rxSnap = await getDoc(doc(db, 'doctorPrescriptions', evt.relatedId));
            if (!rxSnap.exists()) return;
            const rx = rxSnap.data();
            const pharmacyDone = rx.pharmacyStatus === 'delivered';
            const patientDone = rx.status === 'completed';
            evt.status = patientDone ? 'COMPLETED' : (pharmacyDone ? 'IN_PROGRESS' : 'PENDING');
            evt.title = `Prescription · Pharmacy: ${pharmacyDone ? 'Delivered' : 'Not delivered'} · Patient: ${patientDone ? 'Completed' : 'Not completed'}`;
          } catch {}
        }));
      }
      items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setSections(groupByDate(items));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const FILTERS = ['All', 'Lab', 'Scan', 'Rx', 'Appt'];
  const filterMap = { Lab: ['LAB_ORDER', 'LAB_RESULT'], Scan: ['SCAN_ORDER', 'SCAN_RESULT'], Rx: ['PRESCRIPTION', 'PHARMACY_UPDATE'], Appt: ['APPOINTMENT'] };

  const filteredSections = filter === 'All' ? sections : sections.map(s => ({
    ...s,
    data: s.data.filter(item => (filterMap[filter] || []).includes(item.type)),
  })).filter(s => s.data.length > 0);

  const renderItem = ({ item }) => {
    const cfg = EVENT_CONFIG[item.type] || EVENT_CONFIG.APPOINTMENT;
    const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING;
    return (
      <TouchableOpacity
        style={styles.timelineItem}
        onPress={() => navigateToRelated(item)}
        activeOpacity={0.7}
      >
        <View style={styles.timelineLine}>
          <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={18} color={cfg.color} />
          </View>
          <View style={styles.verticalLine} />
        </View>
        <View style={styles.timelineContent}>
          <View style={styles.itemHeader}>
            <Text style={[styles.itemTypeLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusPillText, { color: sc.text }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.itemTitle}>{item.title}</Text>
          {item.actor?.name && (
            <Text style={styles.actorText}>by {item.actor.name}</Text>
          )}
          <Text style={styles.timeText}>
            {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const navigateToRelated = (item) => {
    if (['LAB_ORDER', 'LAB_RESULT', 'SCAN_ORDER', 'SCAN_RESULT'].includes(item.type)) {
      navigation.navigate('MedicalDiagnostic');
    } else if (['PRESCRIPTION', 'PHARMACY_UPDATE'].includes(item.type)) {
      navigation.navigate('MedicalPrescriptions');
    } else if (item.type === 'APPOINTMENT') {
      navigation.navigate('MedicalAppointments');
    }
  };

  const renderSectionHeader = ({ section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f} style={[styles.filterBtn, filter === f && styles.filterBtnActive]} onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
      ) : (
        <SectionList
          sections={filteredSections}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTimeline(); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={56} color="#e2e8f0" />
              <Text style={styles.emptyTitle}>No health events yet</Text>
              <Text style={styles.emptySub}>Your consultations, prescriptions, lab tests, and scans will all appear here in chronological order.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          stickySectionHeadersEnabled={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  filterRow: { flexDirection: 'row', padding: 14, paddingBottom: 6, gap: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border },
  filterBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  filterText: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.background },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.5 },
  timelineItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 4 },
  timelineLine: { alignItems: 'center', width: 44 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  verticalLine: { flex: 1, width: 2, backgroundColor: '#e2e8f0', marginTop: 2 },
  timelineContent: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginLeft: 10, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  itemTypeLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusPill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  itemTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 4 },
  actorText: { fontSize: 12, color: C.textSecondary, marginBottom: 2 },
  timeText: { fontSize: 11, color: C.textLight },
  empty: { alignItems: 'center', padding: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginTop: 16, marginBottom: 8 },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
});
