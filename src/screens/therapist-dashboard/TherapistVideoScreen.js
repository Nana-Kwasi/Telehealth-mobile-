import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TherapistColors } from '../../constants/colors';
import { DURATION_OPTIONS } from '../../constants/videoCallConfig';
import {
  loadTherapistVideoClients,
  loadTherapistScheduledCalls,
  startInstantTherapistCall,
  joinScheduledTherapistCall,
  scheduleTherapistCall,
  updateTherapistScheduledCall,
  deleteTherapistScheduledCall,
  isCallJoinable,
  getTimeUntilCall,
  canManageScheduledCall,
} from '../../services/therapistVideoCallService';
import {
  isPendingRequest,
  acceptScheduledCall,
  declineScheduledCall,
} from '../../services/therapistCalendarService';

function formatCallDateTime(scheduledTime) {
  const d = scheduledTime?.toDate?.() ? scheduledTime.toDate() : new Date(scheduledTime);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function TherapistVideoScreen({ navigation, profile }) {
  const [clients, setClients] = useState([]);
  const [scheduledCalls, setScheduledCalls] = useState([]);
  const [respondingCallId, setRespondingCallId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [startingClientId, setStartingClientId] = useState(null);
  const [joiningCallId, setJoiningCallId] = useState(null);
  const [menuCallId, setMenuCallId] = useState(null);

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleClient, setScheduleClient] = useState(null);
  const [editingCall, setEditingCall] = useState(null);
  const [scheduleDate, setScheduleDate] = useState(new Date(Date.now() + 3600000));
  const [scheduleDuration, setScheduleDuration] = useState('30');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [therapistUid, setTherapistUid] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(uid => setTherapistUid(uid || null));
  }, []);

  const loadAll = useCallback(async () => {
    if (!therapistUid) return;
    try {
      const [clientList, calls] = await Promise.all([
        loadTherapistVideoClients(therapistUid),
        loadTherapistScheduledCalls(therapistUid),
      ]);
      setClients(clientList);
      setScheduledCalls(calls);
    } catch (e) {
      console.error('TherapistVideo load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [therapistUid]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  // Client-booked sessions arrive as `pending` and need an answer before they
  // count as real appointments; declined ones stay out of the agenda entirely.
  const pendingRequests = scheduledCalls.filter(isPendingRequest);
  const agendaCalls = scheduledCalls.filter(
    (c) => !isPendingRequest(c) && String(c.status || '').toLowerCase() !== 'declined',
  );

  const respondToRequest = async (call, accept) => {
    setRespondingCallId(call.id);
    try {
      if (accept) await acceptScheduledCall(call.id, therapistUid);
      else await declineScheduledCall(call.id, therapistUid);
      // Reload rather than patching state locally: the same call has to move into
      // the agenda here and on every other screen reading these calls.
      await loadAll();
      Alert.alert(
        accept ? 'Session confirmed' : 'Request declined',
        accept
          ? `The session with ${call.clientName || 'your client'} is now on your calendar.`
          : `${call.clientName || 'Your client'} will see that this request was declined.`,
      );
    } catch (e) {
      Alert.alert('Could not update request', e.message || 'Please try again.');
    } finally {
      setRespondingCallId(null);
    }
  };

  const openVideoSession = (session) => {
    navigation.navigate('TherapistVideoCallSession', session);
  };

  const handleCallNow = async (client) => {
    setStartingClientId(client.id);
    try {
      const session = await startInstantTherapistCall({ profile, client });
      openVideoSession(session);
    } catch (e) {
      Alert.alert('Call failed', e.message || 'Could not start video call.');
    } finally {
      setStartingClientId(null);
    }
  };

  const handleJoinCall = async (call) => {
    setJoiningCallId(call.id);
    try {
      const session = await joinScheduledTherapistCall({ profile, call });
      openVideoSession(session);
    } catch (e) {
      Alert.alert('Join failed', e.message || 'Could not join call.');
    } finally {
      setJoiningCallId(null);
    }
  };

  const openScheduleModal = (client, callToEdit = null) => {
    setScheduleClient(client);
    setEditingCall(callToEdit);
    if (callToEdit?.scheduledTime) {
      const d = callToEdit.scheduledTime.toDate();
      setScheduleDate(d);
      setScheduleDuration(String(callToEdit.duration || 30));
      setScheduleNotes(callToEdit.notes || '');
    } else {
      setScheduleDate(new Date(Date.now() + 3600000));
      setScheduleDuration('30');
      setScheduleNotes('');
    }
    setShowScheduleModal(true);
    setMenuCallId(null);
  };

  const closeScheduleModal = () => {
    setShowScheduleModal(false);
    setScheduleClient(null);
    setEditingCall(null);
  };

  const submitSchedule = async () => {
    if (!scheduleClient) return;
    setSavingSchedule(true);
    try {
      const dateStr = scheduleDate.toISOString().split('T')[0];
      const timeStr = scheduleDate.toTimeString().slice(0, 5);
      if (editingCall) {
        await updateTherapistScheduledCall({
          callId: editingCall.id,
          date: dateStr,
          time: timeStr,
          duration: scheduleDuration,
          notes: scheduleNotes,
        });
        Alert.alert('Updated', 'Scheduled call updated.');
      } else {
        await scheduleTherapistCall({
          profile,
          client: scheduleClient,
          date: dateStr,
          time: timeStr,
          duration: scheduleDuration,
          notes: scheduleNotes,
        });
        Alert.alert('Scheduled', 'Call scheduled successfully.');
      }
      closeScheduleModal();
      loadAll();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save schedule.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const confirmDeleteCall = (call) => {
    setMenuCallId(null);
    Alert.alert('Delete call', 'Remove this scheduled call?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTherapistScheduledCall(call.id);
            loadAll();
          } catch {
            Alert.alert('Error', 'Could not delete call.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap} edges={['top']}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
        <Text style={styles.loadingText}>Loading video calls…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TherapistColors.primary]} />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Ionicons name="videocam" size={28} color={TherapistColors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>Video calls</Text>
            <Text style={styles.heroSub}>Start instant sessions or join scheduled calls with clients</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Your clients</Text>
        {clients.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No clients assigned</Text>
            <Text style={styles.emptySub}>Clients linked to you will appear here for video sessions.</Text>
          </View>
        ) : (
          clients.map((client) => (
            <View key={client.id} style={styles.clientCard}>
              <View style={styles.clientAvatar}>
                <Text style={styles.clientAvatarText}>{(client.displayName || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName} numberOfLines={1}>{client.displayName}</Text>
                {client.clientEmail ? (
                  <Text style={styles.clientEmail} numberOfLines={1}>{client.clientEmail}</Text>
                ) : null}
              </View>
              <View style={styles.clientActions}>
                <TouchableOpacity
                  style={[styles.callBtn, startingClientId === client.id && styles.btnDisabled]}
                  onPress={() => handleCallNow(client)}
                  disabled={!!startingClientId}
                >
                  {startingClientId === client.id ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="call" size={16} color="#fff" />
                      <Text style={styles.callBtnText}>Call now</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.scheduleBtn}
                  onPress={() => openScheduleModal(client)}
                >
                  <Ionicons name="calendar-outline" size={16} color={TherapistColors.primary} />
                  <Text style={styles.scheduleBtnText}>Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        {pendingRequests.length > 0 ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Session requests</Text>
              <View style={styles.requestBadge}>
                <Text style={styles.requestBadgeText}>{pendingRequests.length}</Text>
              </View>
            </View>

            {pendingRequests.map((call) => (
              <View key={call.id} style={styles.requestCard}>
                <Text style={styles.requestWho}>{call.clientName || 'Client'} requested a session</Text>
                <Text style={styles.callWhen}>
                  <Ionicons name="time-outline" size={13} color="#64748b" />{' '}
                  {formatCallDateTime(call.scheduledTime)}
                </Text>
                <Text style={styles.callMeta}>{call.durationMinutes || call.duration || 30} min</Text>
                {call.notes ? <Text style={styles.callNotes}>{call.notes}</Text> : null}

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.declineBtn, respondingCallId === call.id && styles.btnBusy]}
                    disabled={respondingCallId === call.id}
                    onPress={() => respondToRequest(call, false)}
                  >
                    {respondingCallId === call.id ? (
                      <ActivityIndicator size="small" color="#dc2626" />
                    ) : (
                      <>
                        <Ionicons name="close" size={16} color="#dc2626" />
                        <Text style={styles.declineText}>Decline</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.acceptBtn, respondingCallId === call.id && styles.btnBusy]}
                    disabled={respondingCallId === call.id}
                    onPress={() => respondToRequest(call, true)}
                  >
                    {respondingCallId === call.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={16} color="#fff" />
                        <Text style={styles.acceptText}>Accept</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming calls</Text>
          <TouchableOpacity onPress={onRefresh} hitSlop={8}>
            <Text style={styles.refreshLink}>Refresh</Text>
          </TouchableOpacity>
        </View>

        {agendaCalls.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>No upcoming calls</Text>
          </View>
        ) : (
          agendaCalls.map((call) => {
            const canJoin = isCallJoinable(call.scheduledTime);
            const timeUntil = getTimeUntilCall(call.scheduledTime);
            const canManage = canManageScheduledCall(call, therapistUid);

            return (
              <View key={call.id} style={[styles.callCard, canJoin && styles.callCardReady]}>
                <View style={styles.callCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.callWith}>Call with {call.clientName || 'Client'}</Text>
                    <Text style={styles.callWhen}>
                      <Ionicons name="time-outline" size={13} color="#64748b" /> {formatCallDateTime(call.scheduledTime)}
                    </Text>
                    <Text style={styles.callMeta}>{call.duration || 30} min · Status: {call.status || 'scheduled'}</Text>
                    {call.notes ? <Text style={styles.callNotes} numberOfLines={2}>{call.notes}</Text> : null}
                    <Text style={[styles.callCountdown, canJoin && styles.callCountdownReady]}>
                      {canJoin ? 'Ready to join' : `Starts in ${timeUntil}`}
                    </Text>
                  </View>
                  {canManage ? (
                    <TouchableOpacity
                      onPress={() => setMenuCallId(menuCallId === call.id ? null : call.id)}
                      style={styles.menuBtn}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color="#64748b" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {menuCallId === call.id ? (
                  <View style={styles.dropdown}>
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => openScheduleModal(
                      clients.find((c) => c.id === call.clientId) || { id: call.clientId, displayName: call.clientName },
                      call,
                    )}>
                      <Ionicons name="create-outline" size={16} color="#334155" />
                      <Text style={styles.dropdownText}>Edit schedule</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.dropdownItem} onPress={() => confirmDeleteCall(call)}>
                      <Ionicons name="trash-outline" size={16} color="#dc2626" />
                      <Text style={[styles.dropdownText, { color: '#dc2626' }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                {canJoin ? (
                  <TouchableOpacity
                    style={[styles.joinBtn, joiningCallId === call.id && styles.btnDisabled]}
                    onPress={() => handleJoinCall(call)}
                    disabled={!!joiningCallId}
                  >
                    {joiningCallId === call.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="videocam" size={18} color="#fff" />
                        <Text style={styles.joinBtnText}>Join call</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={showScheduleModal} animationType="slide" transparent onRequestClose={closeScheduleModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {editingCall ? 'Edit scheduled call' : 'Schedule call'}
            </Text>
            {scheduleClient ? (
              <Text style={styles.modalSub}>With {scheduleClient.displayName || scheduleClient.name}</Text>
            ) : null}

            <TouchableOpacity style={styles.pickerRow} onPress={() => setShowDatePicker(true)}>
              <Text style={styles.pickerLabel}>Date</Text>
              <Text style={styles.pickerValue}>{scheduleDate.toLocaleDateString()}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickerRow} onPress={() => setShowTimePicker(true)}>
              <Text style={styles.pickerLabel}>Time</Text>
              <Text style={styles.pickerValue}>
                {scheduleDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Duration (minutes)</Text>
            <View style={styles.durationRow}>
              {DURATION_OPTIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.durationChip, scheduleDuration === String(d) && styles.durationChipActive]}
                  onPress={() => setScheduleDuration(String(d))}
                >
                  <Text style={[styles.durationChipText, scheduleDuration === String(d) && styles.durationChipTextActive]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={scheduleNotes}
              onChangeText={setScheduleNotes}
              placeholder="Session focus, reminders…"
              placeholderTextColor="#94a3b8"
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeScheduleModal}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, savingSchedule && styles.btnDisabled]}
                onPress={submitSchedule}
                disabled={savingSchedule}
              >
                <Text style={styles.saveBtnText}>{savingSchedule ? 'Saving…' : editingCall ? 'Update' : 'Schedule'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
          value={scheduleDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={(event, d) => {
            if (Platform.OS !== 'ios') setShowDatePicker(false);
            if (event?.type !== 'dismissed' && d) setScheduleDate(d);
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={scheduleDate}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, d) => {
            if (Platform.OS !== 'ios') setShowTimePicker(false);
            if (event?.type !== 'dismissed' && d) setScheduleDate(d);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f1f5f9' },
  loadingText: { color: '#64748b' },
  scroll: { padding: 16, paddingBottom: 32 },
  hero: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  heroSub: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  refreshLink: { fontSize: 13, fontWeight: '600', color: TherapistColors.primary },
  emptyCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#64748b' },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexWrap: 'wrap',
  },
  clientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  clientName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  clientEmail: { fontSize: 12, color: '#64748b', marginTop: 2 },
  clientActions: { flexDirection: 'row', gap: 8, width: '100%', marginTop: 4 },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 10,
  },
  callBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scheduleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eef2ff',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  scheduleBtnText: { color: TherapistColors.primary, fontWeight: '700', fontSize: 13 },
  callCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  callCardReady: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  callCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  callWith: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  callWhen: { fontSize: 13, color: '#64748b', marginTop: 6 },
  callMeta: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  callNotes: { fontSize: 12, color: '#475569', marginTop: 6, fontStyle: 'italic' },
  callCountdown: { fontSize: 12, fontWeight: '600', color: '#94a3b8', marginTop: 8 },
  // Session requests — amber so they read as "needs your answer" rather than as
  // an already-booked appointment.
  requestBadge: {
    minWidth: 22,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 11,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  requestCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  requestWho: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  requestActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  acceptText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  declineText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },
  btnBusy: { opacity: 0.7 },
  callCountdownReady: { color: '#059669' },
  menuBtn: { padding: 6 },
  dropdown: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  dropdownText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: TherapistColors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 16 },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerLabel: { fontSize: 14, color: '#64748b' },
  pickerValue: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#94a3b8', marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  durationChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  durationChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  durationChipTextActive: { color: '#fff' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelBtnText: { fontWeight: '700', color: '#64748b' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '700', color: '#fff' },
});
