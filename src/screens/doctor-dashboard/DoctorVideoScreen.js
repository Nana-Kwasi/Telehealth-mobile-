import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';
import { getCallWindow } from '../../utils/callWindow';

/** Consultation types this screen can place a call for. */
const CALL_TYPES = ['video', 'audio'];

/**
 * Today, in local time and recomputed on demand. toISOString() is UTC, and a
 * module-level constant never rolls over on an app left open past midnight.
 */
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const FILTERS = ['Today', 'Upcoming', 'Past', 'All'];

const CALL_STATUS = {
  ready:       { label: 'Ready',       bg: '#f0fdf4', text: '#0f5628' },
  in_progress: { label: 'In Progress', bg: '#eff6ff', text: '#1d4ed8' },
  completed:   { label: 'Completed',   bg: '#f8fafc', text: '#475569' },
};

export default function DoctorVideoScreen() {
  const navigation = useNavigation();
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
      const uid = await getStoredUserId();
      if (!uid) return;

      const rawAll = await api(`/api/v1/medical/appointments/doctor/${uid}`).catch(() => []) || [];
      // Enrich patient names
      const patMap = new Map();
      rawAll.forEach(a => { if (a.clientId) patMap.set(a.clientId, { id: a.clientId, name: a.clientName || '' }); });
      const enrichedPats = await enrichPatientNames(patMap);
      const nameMap = {};
      for (const [id, p] of enrichedPats.entries()) nameMap[id] = p.name;
      const all = rawAll.map(a => ({
        ...a,
        clientName: (a.clientId && nameMap[a.clientId]) ? nameMap[a.clientId] : (a.clientName || 'Patient'),
      }));
      // Audio consults belong here too — this is the only screen a doctor can
      // place a call from, so filtering to `video` alone hid them entirely and
      // "Today" read empty while an appointment sat in the calendar. An untyped
      // row defaults to video rather than being dropped, which is what the
      // strict equality above did to every appointment with no type recorded.
      const video = all.filter(a => CALL_TYPES.includes((a.consultationType || a.type || 'video').toLowerCase()));

      const todayCount = video.filter(a => a.date === todayLocal()).length;
      const inProg = video.filter(a => a.callStatus === 'in_progress').length;
      // "Upcoming" counts today onward, not strictly-future. With `>` an
      // appointment scheduled for later today was in neither Today's count nor
      // Upcoming on the tab, so the tab read empty while the calendar had one.
      const upcoming = video.filter(a => a.date >= todayLocal() && !['cancelled', 'completed'].includes(a.status)).length;

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
      const uid = await getStoredUserId();
      const roomName = `dr-${appt.id}`;

      await api(`/api/v1/medical/appointments/${appt.id}`, {
        method: 'PATCH',
        body: { callStatus: 'in_progress', callRoomName: roomName },
      });

      await api('/api/v1/notifications/events', {
        method: 'POST',
        body: {
          targetUserId: appt.clientId,
          type: 'VIDEO_CALL_STARTED',
          title: 'Video Call',
          body: `Dr. ${appt.doctorName || 'Doctor'} is calling you`,
          data: { appointmentId: appt.id, roomName, doctorId: uid },
        },
      }).catch(() => {});

      setAppointments(prev =>
        prev.map(a => a.id === appt.id ? { ...a, callStatus: 'in_progress', callRoomName: roomName } : a)
      );

      // Ring the patient on every device they have open (and push to their
      // phone), then open the call. Before this the doctor saw an alert and
      // never actually entered the call.
      await api('/api/v1/calls', { method: 'POST', body: { calleeId: appt.clientId, roomName } })
        .catch((e) => Alert.alert('Could not ring', e?.message || 'The patient was not notified, but the call is open.'));
      openCall(appt, roomName);
    } catch (err) {
      Alert.alert('Error', 'Could not start call. Please try again.');
    } finally {
      setStarting(null);
    }
  };

  /** Open the shared call screen (signed in, current HTTPS address). */
  const openCall = async (appt, roomName) => {
    let me = 'Doctor';
    try {
      const p = JSON.parse((await AsyncStorage.getItem('userProfile')) || '{}');
      me = p.fullName || p.name || p.email || me;
    } catch { /* default name */ }
    navigation.navigate('VideoCallSession', {
      roomName: roomName || appt.callRoomName || `dr-${appt.id}`,
      participantName: me,
      callInfo: { targetPerson: appt.clientName, displayNames: appt.clientId ? { [appt.clientId]: appt.clientName } : {} },
    });
  };

  const endCall = async (appt) => {
    try {
      await api(`/api/v1/medical/appointments/${appt.id}`, {
        method: 'PATCH',
        body: { callStatus: 'completed', status: 'completed' },
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
    if (filter === 'Today') list = list.filter(a => a.date === todayLocal());
    else if (filter === 'Upcoming') list = list.filter(a => a.date >= todayLocal() && !['cancelled', 'completed'].includes(a.status));
    else if (filter === 'Past') list = list.filter(a => a.date < todayLocal() || a.status === 'completed');

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
    // A consultation cannot be started before its scheduled time — same 15-min
    // early / 30-min grace window therapy already uses.
    const callWindow = getCallWindow(item);
    const isAudio = (item.consultationType || item.type || 'video').toLowerCase() === 'audio';
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
                  <TouchableOpacity style={[styles.callBtn, styles.rejoinBtn]} onPress={() => openCall(item)}>
                    <Ionicons name="videocam-outline" size={14} color="#1d4ed8" />
                    <Text style={[styles.callBtnText, { color: '#1d4ed8' }]}>Rejoin</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.callBtn, styles.endBtn]} onPress={() => endCall(item)}>
                    <Text style={[styles.callBtnText, { color: '#be123c' }]}>End</Text>
                  </TouchableOpacity>
                </>
              ) : callWindow.canStart ? (
                <TouchableOpacity
                  style={[styles.callBtn, styles.startBtn, isStarting && { opacity: 0.6 }]}
                  onPress={() => startCall(item)}
                  disabled={isStarting}
                >
                  {isStarting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <>
                        <Ionicons name={isAudio ? 'call-outline' : 'videocam-outline'} size={14} color="#fff" />
                        <Text style={[styles.callBtnText, { color: '#fff' }]}>{isAudio ? 'Start Audio' : 'Start'}</Text>
                      </>
                  }
                </TouchableOpacity>
              ) : (
                /* Before the window opens there is nothing to start — show when
                   it will open instead of a button that must not be pressed. */
                <View style={[styles.callBtn, styles.callBtnWaiting]}>
                  <Ionicons name="time-outline" size={14} color="#64748b" />
                  <Text style={[styles.callBtnText, { color: '#64748b' }]}>
                    {callWindow.state === 'ended' ? 'Ended' : `Opens ${callWindow.waitLabel}`}
                  </Text>
                </View>
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
          // #64748b, not #94a3b8: the placeholder measured 2.56:1 on this white
          // field, and it is the only instruction on what to type. 4.76:1.
          placeholderTextColor="#64748b"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          // A FlatList defaults to keyboardShouldPersistTaps="never", so with the
          // search keyboard open the first tap on a result was swallowed
          // dismissing it — you had to tap every result twice. "handled" lets the
          // row take the tap. The insets keep the last rows off the keyboard, and
          // dragging the list puts it away.
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          data={getFiltered()}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadVideoAppts(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="videocam-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>No consultations {filter !== 'All' ? `for ${filter.toLowerCase()}` : ''}</Text>
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
  callBtnWaiting: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
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
