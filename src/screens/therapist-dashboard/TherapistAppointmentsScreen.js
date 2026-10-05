// ─── TherapistAppointmentsScreen ─────────────────────────────────────────────
// The therapist's side of scheduled calls, mirroring the medical patient's
// appointments screen: requests waiting for an answer, the confirmed agenda, and
// past sessions — with accept, decline, reschedule and cancel.
//
// Everything here writes through the same /scheduled-calls endpoints the calendar
// and video screens read, so confirming a session on this screen updates those
// too; no screen keeps its own copy of the state.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { TherapistColors } from '../../constants/colors';
import {
  loadTherapistScheduledCalls,
  updateScheduledCall,
  deleteScheduledCall,
  acceptScheduledCall,
  declineScheduledCall,
  isPendingRequest,
  callDate,
} from '../../services/therapistCalendarService';
import AppointmentRiskCard from '../../components/AppointmentRiskCard';

const FILTERS = [
  { id: 'requests', label: 'Requests' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'all', label: 'All' },
];

function fmtWhen(call) {
  const d = callDate(call);
  if (!d) return 'Date not set';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return { bg: '#fef3c7', color: '#734e12' };
  if (s === 'declined' || s === 'cancelled') return { bg: '#fee2e2', color: '#8c322d' };
  if (s === 'completed') return { bg: '#dcfce7', color: '#2f7d5f' };
  return { bg: '#dbeafe', color: '#2f5d7d' };
}

export default function TherapistAppointmentsScreen({ navigation }) {
  const [therapistUid, setTherapistUid] = useState(null);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('requests');
  const [busyId, setBusyId] = useState(null);

  // Reschedule sheet
  const [rescheduleCall, setRescheduleCall] = useState(null);
  const [rescheduleAt, setRescheduleAt] = useState(new Date());
  const [reschedulePicker, setReschedulePicker] = useState(null);
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then((uid) => setTherapistUid(uid || null));
  }, []);

  const load = useCallback(async () => {
    if (!therapistUid) return;
    try {
      setCalls(await loadTherapistScheduledCalls(therapistUid));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [therapistUid]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const now = Date.now();
  const filtered = useMemo(() => {
    const list = [...calls].sort((a, b) => (callDate(b)?.getTime() || 0) - (callDate(a)?.getTime() || 0));
    const isDead = (c) => ['declined', 'cancelled'].includes(String(c.status || '').toLowerCase());
    switch (activeFilter) {
      case 'requests':
        return list.filter(isPendingRequest);
      case 'upcoming':
        return list
          .filter((c) => !isPendingRequest(c) && !isDead(c) && (callDate(c)?.getTime() || 0) >= now)
          .sort((a, b) => (callDate(a)?.getTime() || 0) - (callDate(b)?.getTime() || 0));
      case 'past':
        return list.filter((c) => !isPendingRequest(c) && (callDate(c)?.getTime() || 0) < now);
      default:
        return list;
    }
  }, [calls, activeFilter, now]);

  const pendingCount = useMemo(() => calls.filter(isPendingRequest).length, [calls]);

  const respond = async (call, accept) => {
    setBusyId(call.id);
    try {
      if (accept) await acceptScheduledCall(call.id, therapistUid);
      else await declineScheduledCall(call.id, therapistUid);
      // Re-read rather than patching locally: the same call has to move on the
      // calendar and video screens too, and they read the server.
      await load();
      Alert.alert(
        accept ? 'Session confirmed' : 'Request declined',
        accept
          ? `The session with ${call.clientName || 'your client'} is now on your calendar.`
          : `${call.clientName || 'Your client'} will see that this request was declined.`,
      );
    } catch (e) {
      Alert.alert('Could not update request', e?.message || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const openReschedule = (call) => {
    const d = callDate(call) || new Date(Date.now() + 3600000);
    setRescheduleCall(call);
    setRescheduleAt(d);
    setRescheduleNotes(call.notes || '');
    setReschedulePicker(null);
  };

  const submitReschedule = async () => {
    if (!rescheduleCall) return;
    if (rescheduleAt <= new Date()) {
      Alert.alert('Pick a future time', 'A session cannot be moved into the past.');
      return;
    }
    setSaving(true);
    try {
      await updateScheduledCall(rescheduleCall.id, {
        scheduledTime: rescheduleAt.toISOString(),
        notes: rescheduleNotes,
        // Moving a request also confirms it — the client asked for a session and
        // the therapist is offering a time, so it should leave the pending queue.
        status: 'scheduled',
        updatedBy: therapistUid,
      });
      setRescheduleCall(null);
      await load();
      Alert.alert('Session moved', 'The new time is on your calendar and the client can see it.');
    } catch (e) {
      Alert.alert('Could not reschedule', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmCancel = (call) => {
    Alert.alert('Cancel session', `Cancel the session with ${call.clientName || 'this client'}?`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel session',
        style: 'destructive',
        onPress: async () => {
          setBusyId(call.id);
          try {
            await updateScheduledCall(call.id, { status: 'cancelled', updatedBy: therapistUid });
            await load();
          } catch (e) {
            Alert.alert('Could not cancel', e?.message || 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const confirmDelete = (call) => {
    Alert.alert('Remove session', 'Remove this session from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(call.id);
          try {
            await deleteScheduledCall(call.id);
            await load();
          } catch (e) {
            Alert.alert('Could not remove', e?.message || 'Please try again.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={TherapistColors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.title}>Appointments</Text>
        <Text style={styles.subtitle}>
          Confirm session requests, reschedule, and keep your calendar accurate.
        </Text>

        {/* Which of these is worth a reminder, and why. Hides itself when
            nothing is worth chasing. */}
        <AppointmentRiskCard />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.filterChip, activeFilter === f.id && styles.filterChipActive]}
              onPress={() => setActiveFilter(f.id)}
            >
              <Text style={[styles.filterText, activeFilter === f.id && styles.filterTextActive]}>
                {f.label}
              </Text>
              {f.id === 'requests' && pendingCount > 0 ? (
                <View style={styles.badge}><Text style={styles.badgeText}>{pendingCount}</Text></View>
              ) : null}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {activeFilter === 'requests' ? 'No session requests' : 'Nothing here yet'}
            </Text>
            <Text style={styles.emptyHint}>
              {activeFilter === 'requests'
                ? 'When a client books a session it appears here for you to confirm.'
                : 'Sessions you schedule or confirm will show up here.'}
            </Text>
          </View>
        ) : (
          filtered.map((call) => {
            const pending = isPendingRequest(call);
            const tone = statusTone(call.status);
            const busy = busyId === call.id;
            return (
              <View key={call.id} style={[styles.card, pending && styles.cardPending]}>
                <View style={styles.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.client}>{call.clientName || 'Client'}</Text>
                    <Text style={styles.when}>
                      <Ionicons name="time-outline" size={13} color="#64748b" /> {fmtWhen(call)}
                    </Text>
                    <Text style={styles.meta}>{call.durationMinutes || 30} min</Text>
                    {call.notes ? <Text style={styles.notes}>{call.notes}</Text> : null}
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
                    <Text style={[styles.statusText, { color: tone.color }]}>
                      {String(call.status || 'scheduled').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.actions}>
                  {pending ? (
                    <>
                      <TouchableOpacity
                        style={[styles.btnGhost, busy && styles.btnBusy]}
                        disabled={busy}
                        onPress={() => respond(call, false)}
                      >
                        {busy ? <ActivityIndicator size="small" color="#dc2626" />
                          : <Text style={styles.btnGhostText}>Decline</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnOutline, busy && styles.btnBusy]}
                        disabled={busy}
                        onPress={() => openReschedule(call)}
                      >
                        <Text style={styles.btnOutlineText}>Propose time</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnPrimary, busy && styles.btnBusy]}
                        disabled={busy}
                        onPress={() => respond(call, true)}
                      >
                        {busy ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.btnPrimaryText}>Accept</Text>}
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.btnGhost, busy && styles.btnBusy]}
                        disabled={busy}
                        onPress={() => confirmDelete(call)}
                      >
                        <Text style={styles.btnGhostText}>Remove</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnOutline, busy && styles.btnBusy]}
                        disabled={busy}
                        onPress={() => confirmCancel(call)}
                      >
                        <Text style={styles.btnOutlineText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnPrimary, busy && styles.btnBusy]}
                        disabled={busy}
                        onPress={() => openReschedule(call)}
                      >
                        <Text style={styles.btnPrimaryText}>Reschedule</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Reschedule sheet */}
      <Modal
        visible={!!rescheduleCall}
        transparent
        animationType="slide"
        onRequestClose={() => setRescheduleCall(null)}
      >
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {isPendingRequest(rescheduleCall || {}) ? 'Propose a time' : 'Reschedule session'}
            </Text>
            <Text style={styles.modalSub}>{rescheduleCall?.clientName || 'Client'}</Text>

            <TouchableOpacity style={styles.pickRow} onPress={() => setReschedulePicker('date')}>
              <View style={styles.pickRowLeft}>
                <Ionicons name="calendar-outline" size={18} color={TherapistColors.primary} />
                <Text style={styles.pickLabel}>Date</Text>
              </View>
              <Text style={styles.pickValue}>{rescheduleAt.toLocaleDateString()}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.pickRow} onPress={() => setReschedulePicker('time')}>
              <View style={styles.pickRowLeft}>
                <Ionicons name="time-outline" size={18} color={TherapistColors.primary} />
                <Text style={styles.pickLabel}>Time</Text>
              </View>
              <Text style={styles.pickValue}>
                {rescheduleAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={rescheduleNotes}
              onChangeText={setRescheduleNotes}
              placeholder="Optional notes…"
              placeholderTextColor="#94a3b8"
              multiline
            />

            {/* Declared INSIDE this modal: iOS will not present a second Modal
                over one that is already showing, so a picker rendered as a
                sibling silently never appears. */}
            {reschedulePicker ? (
              <KeyboardAvoidingView
        style={styles.pickerOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
                <TouchableOpacity
                  style={styles.pickerBackdrop}
                  activeOpacity={1}
                  onPress={() => setReschedulePicker(null)}
                />
                <View style={styles.pickerSheet}>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity onPress={() => setReschedulePicker(null)} hitSlop={8}>
                      <Text style={styles.pickerCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.pickerTitle}>
                      {reschedulePicker === 'date' ? 'Session date' : 'Session time'}
                    </Text>
                    <TouchableOpacity onPress={() => setReschedulePicker(null)} hitSlop={8}>
                      <Text style={styles.pickerDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <DateTimePicker
        // Pinned, not left to the OS: the picker follows the SYSTEM appearance,
        // so on a device in dark mode it drew light text on this light sheet and
        // was invisible. The simulator was in light mode, which is why it only
        // showed up on real hardware.
        themeVariant="light"
        accentColor="#5046bd"
                    value={rescheduleAt}
                    mode={reschedulePicker}
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={reschedulePicker === 'date' ? new Date() : undefined}
                    onChange={(event, d) => {
                      if (Platform.OS === 'android') setReschedulePicker(null);
                      if (event.type !== 'dismissed' && d) setRescheduleAt(d);
                    }}
                    style={styles.picker}
                  />
                </View>
              </KeyboardAvoidingView>
            ) : null}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRescheduleCall(null)}>
                <Text style={styles.cancelBtnText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnBusy]}
                onPress={submitReschedule}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: TherapistColors.text },
  subtitle: { fontSize: 13, color: TherapistColors.textSecondary, marginTop: 4, marginBottom: 14 },

  filterRow: { marginBottom: 14 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: 'rgba(255,255,255,0.72)', marginRight: 8,
  },
  filterChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  filterTextActive: { color: '#fff' },
  badge: {
    minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10,
    backgroundColor: '#f59e0b', alignItems: 'center',
  },
  badgeText: { color: '#0d0d0d', fontSize: 11, fontWeight: '800' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cardPending: { backgroundColor: '#fffbeb', borderColor: '#fcd34d' },
  cardTop: { flexDirection: 'row', gap: 10 },
  client: { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  when: { fontSize: 13, color: '#0d0d0d', marginTop: 3 },
  meta: { fontSize: 12, color: '#3d3d3d', marginTop: 2 },
  notes: { fontSize: 12, color: '#0d0d0d', fontStyle: 'italic', marginTop: 6 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },
  statusText: { fontSize: 10, fontWeight: '800' },

  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btnPrimary: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, backgroundColor: TherapistColors.primary,
  },
  btnPrimaryText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  btnOutline: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1, borderColor: TherapistColors.primary,
  },
  btnOutlineText: { color: TherapistColors.primary, fontSize: 13, fontWeight: '700' },
  btnGhost: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1, borderColor: '#fca5a5',
  },
  btnGhostText: { color: '#8c322d', fontSize: 13, fontWeight: '700' },
  btnBusy: { opacity: 0.7 },

  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 28, alignItems: 'center',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text, marginTop: 10 },
  emptyHint: { fontSize: 12, color: '#3d3d3d', textAlign: 'center', marginTop: 6 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 32 : 20, maxHeight: '90%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: TherapistColors.text },
  modalSub: { fontSize: 13, color: TherapistColors.textSecondary, marginBottom: 14 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  pickRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickLabel: { fontSize: 14, color: TherapistColors.text },
  pickValue: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 6, marginTop: 6 },
  notesInput: {
    borderWidth: 1, borderColor: 'rgba(16,16,16,0.16)', borderRadius: 12, padding: 12,
    minHeight: 70, textAlignVertical: 'top', color: TherapistColors.text,
    backgroundColor: '#ffffff',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 999,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: TherapistColors.textSecondary },
  saveBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 999,
    backgroundColor: TherapistColors.primary,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  pickerOverlay: {
    position: 'absolute', top: -20, left: -20, right: -20, bottom: -20,
    justifyContent: 'flex-end', zIndex: 50, elevation: 50,
  },
  pickerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  pickerSheet: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  pickerTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  pickerCancel: { fontSize: 15, color: TherapistColors.textSecondary },
  pickerDone: { fontSize: 15, fontWeight: '700', color: TherapistColors.primary },
  picker: { height: 216 },
});
