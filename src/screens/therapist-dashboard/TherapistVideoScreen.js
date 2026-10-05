import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { resolveFileUrl } from '../../utils/mediaUrl';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { callState, callTimeLabel, CALL_STATE_COLORS } from '../../utils/callState';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TherapistColors } from '../../constants/colors';
import { api } from '../../services/apiClient';
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

  // The shared call screen: it signs the call page in as this user and uses
  // the current HTTPS address, so in-call features (ring status, transcription)
  // work on the phone too.
  const openVideoSession = (session) => {
    navigation.navigate('VideoCallSession', session);
  };

  const handleCallNow = async (client) => {
    setStartingClientId(client.id);
    try {
      const session = await startInstantTherapistCall({ profile, client });
      // Ring the client on every device they have open (and push to their phone).
      // Before this nothing told them anyone was calling.
      await api('/api/v1/calls', {
        method: 'POST', body: { calleeId: client.id, roomName: session.roomName },
      }).catch((e) => Alert.alert('Could not ring', e?.message || 'The client was not notified, but the call is open.'));
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
              {resolveFileUrl(client.photoURL || client.avatarUrl) ? (
                <Image
                  source={{ uri: resolveFileUrl(client.photoURL || client.avatarUrl) }}
                  style={styles.clientAvatarImg}
                />
              ) : (
                <View style={styles.clientAvatar}>
                  {/* Two initials, not one: a column of "N"s tells a therapist
                      nothing when several clients share a first letter. */}
                  <Text style={styles.clientAvatarText}>
                    {String(client.displayName || '?')
                      .split(/\s+/).filter(Boolean).slice(0, 2)
                      .map((w) => w[0]).join('').toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.clientText}>
                <Text style={styles.clientName} numberOfLines={1}>{client.displayName}</Text>
                {client.clientEmail || client.email ? (
                  <Text style={styles.clientEmail} numberOfLines={1}>
                    {client.clientEmail || client.email}
                  </Text>
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
                      <Text style={styles.callBtnText}>Call</Text>
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
            // getTimeUntilCall returns 'Now' for anything in the past, so a
            // call from last week read "Starts in Now". The shared state knows
            // the difference between imminent and missed.
            const st = callState(call.scheduledTime, call.status);
            const canJoin = st.joinable;
            const tone = CALL_STATE_COLORS[st.tone];
            const canManage = canManageScheduledCall(call, therapistUid);

            return (
              <View key={call.id} style={[styles.callCard, canJoin && styles.callCardReady, st.past && styles.callCardPast]}>
                <View style={styles.callCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.callWith}>Call with {call.clientName || 'Client'}</Text>
                    <Text style={styles.callWhen}>
                      <Ionicons name="time-outline" size={13} color="#64748b" /> {formatCallDateTime(call.scheduledTime)}
                    </Text>
                    <Text style={styles.callMeta}>{call.duration || 30} min</Text>
                    {call.notes ? <Text style={styles.callNotes} numberOfLines={2}>{call.notes}</Text> : null}
                    <View style={[styles.callStateBadge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.callStateText, { color: tone.fg }]}>
                        {st.label} · {callTimeLabel(call.scheduledTime)}
                      </Text>
                    </View>
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
                      <Text style={[styles.dropdownText, { color: '#8c322d' }]}>Delete</Text>
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
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
        </KeyboardAvoidingView>
      </Modal>

      {showDatePicker && (
        <DateTimePicker
        // Pinned, not left to the OS: the picker follows the SYSTEM appearance,
        // so on a device in dark mode it drew light text on this light sheet and
        // was invisible. The simulator was in light mode, which is why it only
        // showed up on real hardware.
        themeVariant="light"
        accentColor="#5046bd"
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
        // Pinned, not left to the OS: the picker follows the SYSTEM appearance,
        // so on a device in dark mode it drew light text on this light sheet and
        // was invisible. The simulator was in light mode, which is why it only
        // showed up on real hardware.
        themeVariant="light"
        accentColor="#5046bd"
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
  container: { flex: 1, backgroundColor: 'rgba(255,255,255,0.72)' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.72)' },
  loadingText: { color: '#0d0d0d' },
  scroll: { padding: 16, paddingBottom: 32 },
  hero: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#0d0d0d' },
  heroSub: { fontSize: 13, color: '#0d0d0d', marginTop: 4, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#0d0d0d', marginBottom: 10 },
  refreshLink: { fontSize: 13, fontWeight: '600', color: TherapistColors.primary },
  emptyCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    marginBottom: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#0d0d0d' },
  emptySub: { fontSize: 13, color: '#3d3d3d', textAlign: 'center' },
  // A row, like the web roster: avatar, name, email, actions. The card used to
  // wrap its buttons onto a second full-width line under every client, which
  // made ten clients ten tall blocks.
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 13,
    paddingVertical: 10,
    paddingHorizontal: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e4e7ee',
  },
  clientAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e4ecfb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientAvatarImg: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#e4ecfb' },
  clientAvatarText: { color: '#1a3ea8', fontSize: 14, fontWeight: '800' },  /* 7.70:1 */
  // flex:1 on the text only — never on the row, or it stretches the avatar.
  clientText: { flex: 1, minWidth: 0 },
  clientName: { fontSize: 14.5, fontWeight: '700', color: '#0f1424' },
  clientEmail: { fontSize: 11.5, color: '#6b7283', marginTop: 1 },
  clientActions: { flexDirection: 'row', gap: 6 },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#15803d',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  // White on #15803d is 5.02:1. The old pairing was near-black on a lighter
  // green with a violet border that belonged to a different component.
  callBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12.5 },
  scheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#eff4ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#c7d2fe',
  },
  scheduleBtnText: { color: TherapistColors.primary, fontWeight: '700', fontSize: 13 },
  callCardPast: { opacity: 0.68 },
  callStateBadge: {
    alignSelf: 'flex-start', borderRadius: 999,
    paddingHorizontal: 9, paddingVertical: 3, marginTop: 6,
  },
  callStateText: { fontSize: 11, fontWeight: '800' },
  callCard: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  callCardReady: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  callCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  callWith: { fontSize: 15, fontWeight: '700', color: '#0d0d0d' },
  callWhen: { fontSize: 13, color: '#0d0d0d', marginTop: 6 },
  callMeta: { fontSize: 12, color: '#3d3d3d', marginTop: 4 },
  callNotes: { fontSize: 12, color: '#0d0d0d', marginTop: 6, fontStyle: 'italic' },
  callCountdown: { fontSize: 12, fontWeight: '600', color: '#3d3d3d', marginTop: 8 },
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
  requestBadgeText: { color: '#0d0d0d', fontSize: 12, fontWeight: '700' },
  requestCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  requestWho: { fontSize: 15, fontWeight: '700', color: '#0d0d0d', marginBottom: 4 },
  requestActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  acceptBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#059669',
    borderWidth: 1,
    borderColor: 'rgba(95,84,214,0.35)',
  },
  acceptText: { color: '#0d0d0d', fontSize: 14, fontWeight: '700' },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  declineText: { color: '#8c322d', fontSize: 14, fontWeight: '700' },
  btnBusy: { opacity: 0.7 },
  callCountdownReady: { color: '#2f7d5f' },
  menuBtn: { padding: 6 },
  dropdown: {
    marginTop: 8,
    backgroundColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  dropdownText: { fontSize: 14, fontWeight: '600', color: '#0d0d0d' },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: TherapistColors.primary,
    paddingVertical: 12,
    borderRadius: 999,
  },
  joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0d0d0d' },
  modalSub: { fontSize: 13, color: '#0d0d0d', marginTop: 4, marginBottom: 16 },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerLabel: { fontSize: 14, color: '#0d0d0d' },
  pickerValue: { fontSize: 14, fontWeight: '600', color: '#0d0d0d' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#3d3d3d', marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  durationChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  durationChipText: { fontSize: 13, fontWeight: '600', color: '#0d0d0d' },
  durationChipTextActive: { color: '#fff' },
  notesInput: {
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    fontSize: 14,
    color: '#0d0d0d',
    textAlignVertical: 'top',
    backgroundColor: '#ffffff',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelBtnText: { fontWeight: '700', color: '#0d0d0d' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '700', color: '#fff' },
});
