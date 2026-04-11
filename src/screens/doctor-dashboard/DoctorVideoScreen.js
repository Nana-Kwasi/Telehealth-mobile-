import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, updateDoc, addDoc,
  doc, serverTimestamp,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const TODAY = new Date().toISOString().split('T')[0];
const FILTERS = ['Today', 'Upcoming', 'Past', 'All'];

const CALL_STATUS = {
  ready:       { label: 'Ready',       bg: '#f0fdf4', text: '#15803d' },
  in_progress: { label: 'In Progress', bg: '#eff6ff', text: '#1d4ed8' },
  completed:   { label: 'Completed',   bg: '#f8fafc', text: '#475569' },
};

export default function DoctorVideoScreen() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('Today');
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState(null);

  const [stats, setStats] = useState({ today: 0, inProgress: 0, upcoming: 0 });

  useEffect(() => { loadVideoAppts(); }, []);

  const loadVideoAppts = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const snap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const video = all.filter(a => {
        const t = (a.consultationType || a.type || '').toLowerCase();
        return t === 'video';
      });

      const todayCount = video.filter(a => a.date === TODAY).length;
      const inProg = video.filter(a => a.callStatus === 'in_progress').length;
      const upcoming = video.filter(a => a.date > TODAY && a.status !== 'cancelled').length;

      setStats({ today: todayCount, inProgress: inProg, upcoming });
      setAppointments(video.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    } catch (err) {
      console.error('DoctorVideo load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const startCall = async (appt) => {
    setStarting(appt.id);
    try {
      const cu = auth.currentUser;
      const roomName = `dr-${appt.id}`;

      // Update appointment with call status
      await updateDoc(doc(db, 'doctorAppointments', appt.id), {
        callStatus: 'in_progress',
        callRoomName: roomName,
        callStartedAt: serverTimestamp(),
      });

      // Notify patient
      await addDoc(collection(db, 'callNotifications'), {
        doctorId: cu.uid,
        doctorName: appt.doctorName || 'Doctor',
        targetId: appt.clientId,
        targetName: appt.clientName || 'Patient',
        appointmentId: appt.id,
        roomName,
        status: 'ringing',
        type: 'video',
        createdAt: serverTimestamp(),
      });

      setAppointments(prev =>
        prev.map(a => a.id === appt.id ? { ...a, callStatus: 'in_progress', callRoomName: roomName } : a)
      );

      Alert.alert(
        'Call Started',
        `Video call started with ${appt.clientName || 'patient'}. Room: ${roomName}`,
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Error', 'Could not start call. Please try again.');
    } finally {
      setStarting(null);
    }
  };

  const endCall = async (appt) => {
    try {
      await updateDoc(doc(db, 'doctorAppointments', appt.id), {
        callStatus: 'completed',
        callEndedAt: serverTimestamp(),
        status: 'completed',
      });
      setAppointments(prev =>
        prev.map(a => a.id === appt.id ? { ...a, callStatus: 'completed', status: 'completed' } : a)
      );
    } catch {
      Alert.alert('Error', 'Could not end call.');
    }
  };

  const getFiltered = () => {
    let list = appointments;
    if (filter === 'Today') list = list.filter(a => a.date === TODAY);
    else if (filter === 'Upcoming') list = list.filter(a => a.date > TODAY && a.status !== 'cancelled');
    else if (filter === 'Past') list = list.filter(a => a.date < TODAY || a.status === 'completed');

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        (a.clientName || '').toLowerCase().includes(q) ||
        (a.date || '').includes(q)
      );
    }
    return list;
  };

  const getCallStatusInfo = (appt) => {
    if (appt.callStatus === 'in_progress') return CALL_STATUS.in_progress;
    if (appt.callStatus === 'completed' || appt.status === 'completed') return CALL_STATUS.completed;
    return CALL_STATUS.ready;
  };

  const renderItem = ({ item }) => {
    const cs = getCallStatusInfo(item);
    const isStarting = starting === item.id;
    return (
      <View style={styles.apptCard}>
        <View style={styles.apptInfo}>
          <Text style={styles.patientName}>{item.clientName || 'Patient'}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={12} color="#94a3b8" />
            <Text style={styles.metaText}>{item.date}</Text>
            <Ionicons name="time-outline" size={12} color="#94a3b8" />
            <Text style={styles.metaText}>{item.time || '—'}</Text>
          </View>
          {item.reason ? <Text style={styles.reason} numberOfLines={1}>{item.reason}</Text> : null}
        </View>

        <View style={styles.apptRight}>
          <View style={[styles.statusBadge, { backgroundColor: cs.bg }]}>
            <Text style={[styles.statusText, { color: cs.text }]}>{cs.label}</Text>
          </View>

          {item.callStatus !== 'completed' && item.status !== 'completed' && item.status !== 'cancelled' && (
            <View style={styles.callActions}>
              {item.callStatus === 'in_progress' ? (
                <>
                  <TouchableOpacity style={[styles.callBtn, styles.rejoinBtn]}>
                    <Ionicons name="videocam-outline" size={14} color="#1d4ed8" />
                    <Text style={[styles.callBtnText, { color: '#1d4ed8' }]}>Rejoin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.callBtn, styles.endBtn]} onPress={() => endCall(item)}>
                    <Text style={[styles.callBtnText, { color: '#be123c' }]}>End</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.callBtn, styles.startBtn, isStarting && { opacity: 0.6 }]}
                  onPress={() => startCall(item)}
                  disabled={isStarting}
                >
                  {isStarting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name="videocam-outline" size={14} color="#fff" />
                        <Text style={[styles.callBtnText, { color: '#fff' }]}>Start</Text>
                      </>
                  }
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Stats */}
      <View style={styles.statsRow}>
        {[
          { label: "Today's", value: stats.today, color: DoctorColors.primary, bg: DoctorColors.primaryLight },
          { label: 'In Progress', value: stats.inProgress, color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'Upcoming', value: stats.upcoming, color: '#6366f1', bg: '#f0f0ff' },
        ].map((s, i) => (
          <View key={i} style={[styles.statCard, { backgroundColor: s.bg }]}>
            <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter + Search */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={15} color="#94a3b8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient or date..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={getFiltered()}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVideoAppts(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="videocam-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No video appointments {filter !== 'All' ? `for ${filter.toLowerCase()}` : ''}</Text>
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
  statsRow: { flexDirection: 'row', gap: 10, padding: 14, paddingBottom: 6 },
  statCard: {
    flex: 1, borderRadius: 12, padding: 12, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2, textAlign: 'center' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 14, gap: 8, marginBottom: 8 },
  filterTab: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#fff', borderWidth: 1, borderColor: DoctorColors.border,
  },
  filterTabActive: { backgroundColor: DoctorColors.primary, borderColor: DoctorColors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: DoctorColors.textSecondary },
  filterTextActive: { color: '#fff' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginBottom: 4,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  apptCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  apptInfo: { flex: 1 },
  patientName: { fontSize: 15, fontWeight: '700', color: DoctorColors.text, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  metaText: { fontSize: 12, color: DoctorColors.textSecondary, marginRight: 6 },
  reason: { fontSize: 12, color: DoctorColors.textSecondary, fontStyle: 'italic' },
  apptRight: { alignItems: 'flex-end', gap: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700' },
  callActions: { flexDirection: 'row', gap: 6 },
  callBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  startBtn: { backgroundColor: DoctorColors.primary },
  rejoinBtn: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  endBtn: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  callBtnText: { fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
});
