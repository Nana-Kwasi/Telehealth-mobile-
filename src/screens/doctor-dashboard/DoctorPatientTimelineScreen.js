import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SectionList, ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { DoctorColors as C } from '../../constants/colors';

const EVENT_CONFIG = {
  APPOINTMENT:    { icon: 'calendar', color: '#1e6bb8', bg: '#e8f1fb', label: 'Appointment' },
  PRESCRIPTION:   { icon: 'medkit', color: '#7c3aed', bg: '#ede9fe', label: 'Prescription' },
  LAB_ORDER:      { icon: 'flask', color: '#065f46', bg: '#d1fae5', label: 'Lab Order' },
  LAB_RESULT:     { icon: 'document-text', color: '#059669', bg: '#d1fae5', label: 'Lab Result' },
  SCAN_ORDER:     { icon: 'scan', color: '#4c1d95', bg: '#ede9fe', label: 'Scan Order' },
  SCAN_RESULT:    { icon: 'radio', color: '#6d28d9', bg: '#ede9fe', label: 'Scan Report' },
  PHARMACY_UPDATE:{ icon: 'bag', color: '#0c4a6e', bg: '#e0f2fe', label: 'Pharmacy' },
};

const STATUS_COLORS = {
  PENDING:     { bg: '#fef3c7', text: '#92400e' },
  IN_PROGRESS: { bg: '#dbeafe', text: '#1e40af' },
  COMPLETED:   { bg: '#dcfce7', text: '#14532d' },
};

function groupByDate(items) {
  const groups = {};
  items.forEach(item => {
    const key = item.createdAt
      ? new Date(item.createdAt.seconds * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
      : 'Unknown Date';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return Object.entries(groups).map(([title, data]) => ({ title, data }));
}

export default function DoctorPatientTimelineScreen({ route }) {
  const { patientId, patientName } = route?.params || {};
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { if (patientId) loadTimeline(); }, [patientId]);

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

  const renderItem = ({ item }) => {
    const cfg = EVENT_CONFIG[item.type] || EVENT_CONFIG.APPOINTMENT;
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.PENDING;
    return (
      <View style={styles.timelineItem}>
        <View style={styles.timelineLine}>
          <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={16} color={cfg.color} />
          </View>
          <View style={styles.vertLine} />
        </View>
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={[styles.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
              <Text style={[styles.statusText, { color: sc.text }]}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.title}>{item.title}</Text>
          {item.actor?.name && <Text style={styles.actor}>by {item.actor.name}</Text>}
          <Text style={styles.time}>
            {item.createdAt ? new Date(item.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {patientName && (
        <View style={styles.patientBanner}>
          <Ionicons name="person-circle-outline" size={20} color={C.primary} />
          <Text style={styles.patientBannerText}>{patientName}'s Health Timeline</Text>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTimeline(); }} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={48} color="#e2e8f0" />
              <Text style={styles.emptyText}>No timeline events yet</Text>
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
  patientBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.primaryLight, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  patientBannerText: { fontSize: 14, fontWeight: '700', color: C.primary },
  sectionHeader: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.background },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.5 },
  timelineItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 3 },
  timelineLine: { alignItems: 'center', width: 40 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  vertLine: { flex: 1, width: 2, backgroundColor: '#e2e8f0', marginTop: 2 },
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginLeft: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  typeLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusPill: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 9, fontWeight: '700' },
  title: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 3 },
  actor: { fontSize: 11, color: C.textSecondary, marginBottom: 2 },
  time: { fontSize: 10, color: '#94a3b8' },
  empty: { alignItems: 'center', padding: 48 },
  emptyText: { fontSize: 15, color: C.textSecondary, marginTop: 12, fontWeight: '600' },
});
