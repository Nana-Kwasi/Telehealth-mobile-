import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TherapistColors } from '../../constants/colors';
import {
  loadTherapistCalendarClients,
  scheduleTherapistCalendarCall,
} from '../../services/therapistCalendarService';

const DURATIONS = ['15', '30', '45', '60', '90'];

export default function TherapistScheduleCallModal({
  visible,
  initialDate,
  onClose,
  onScheduled,
  cachedClients = null,
}) {
  const [clients, setClients] = useState([]);
  const [scheduleClient, setScheduleClient] = useState(null);
  const [scheduleDateTime, setScheduleDateTime] = useState(new Date());
  const [scheduleDuration, setScheduleDuration] = useState('30');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [schedulePicker, setSchedulePicker] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);

  useEffect(() => {
    if (!visible) return;
    (async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let base = initialDate ? new Date(initialDate) : new Date();
    if (base < todayStart) {
      base = new Date();
    }
    base.setHours(base.getHours() + 1, 0, 0, 0);
    if (base <= new Date()) {
      setScheduleDateTime(new Date(Date.now() + 3600000));
    } else {
      setScheduleDateTime(base);
    }
    setScheduleDuration('30');
    setScheduleNotes('');
    setSchedulePicker(null);

    if (cachedClients?.length) {
      setClients(cachedClients);
      setScheduleClient(cachedClients[0]);
      setLoadingClients(false);
      return;
    }

    const uid = await AsyncStorage.getItem('th.userId');
    if (!uid) {
      setLoadingClients(false);
      return;
    }
    setLoadingClients(true);
    loadTherapistCalendarClients(uid, { lite: true })
      .then((list) => {
        setClients(list);
        setScheduleClient(list[0] || null);
      })
      .catch(() => {
        setClients([]);
        setScheduleClient(null);
      })
      .finally(() => setLoadingClients(false));
    })();
  }, [visible, initialDate, cachedClients]);

  const mergeDatePart = (picked) => {
    const next = new Date(scheduleDateTime);
    next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    return next;
  };

  const mergeTimePart = (picked) => {
    const next = new Date(scheduleDateTime);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    return next;
  };

  const timeMinimumDate = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(scheduleDateTime);
    selected.setHours(0, 0, 0, 0);
    return selected.getTime() === today.getTime() ? new Date() : undefined;
  };

  const submit = async () => {
    if (!scheduleClient) {
      Alert.alert('Select client', 'Choose a client for this session.');
      return;
    }
    setSaving(true);
    try {
      const dateStr = scheduleDateTime.toISOString().split('T')[0];
      const timeStr = scheduleDateTime.toTimeString().slice(0, 5);
      await scheduleTherapistCalendarCall({
        client: scheduleClient,
        date: dateStr,
        time: timeStr,
        duration: scheduleDuration,
        notes: scheduleNotes,
      });
      onClose();
      onScheduled?.();
      Alert.alert('Scheduled', 'Call scheduled successfully.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to schedule call.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            {schedulePicker ? (
              <InlineDateTimePicker
                title={schedulePicker === 'date' ? 'Session date' : 'Session time'}
                value={scheduleDateTime}
                mode={schedulePicker}
                minimumDate={schedulePicker === 'date' ? new Date() : timeMinimumDate()}
                onConfirm={(picked) => {
                  setScheduleDateTime(
                    schedulePicker === 'date' ? mergeDatePart(picked) : mergeTimePart(picked),
                  );
                  setSchedulePicker(null);
                }}
                onCancel={() => setSchedulePicker(null)}
              />
            ) : (
              <>
            <Text style={styles.title}>Schedule call</Text>
            {loadingClients ? (
              <ActivityIndicator color={TherapistColors.primary} style={{ marginVertical: 16 }} />
            ) : clients.length === 0 ? (
              <Text style={styles.emptyClients}>No clients assigned. Add a client first.</Text>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Client</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {clients.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.clientChip, scheduleClient?.id === c.id && styles.clientChipActive]}
                      onPress={() => setScheduleClient(c)}
                    >
                      <Text
                        style={[
                          styles.clientChipText,
                          scheduleClient?.id === c.id && styles.clientChipTextActive,
                        ]}
                      >
                        {c.displayName}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity style={styles.dateRow} onPress={() => setSchedulePicker('date')}>
                  <View style={styles.dateRowLeft}>
                    <Ionicons name="calendar-outline" size={18} color={TherapistColors.primary} />
                    <Text style={styles.dateRowLabel}>Date</Text>
                  </View>
                  <Text style={styles.dateRowValue}>{scheduleDateTime.toLocaleDateString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dateRow} onPress={() => setSchedulePicker('time')}>
                  <View style={styles.dateRowLeft}>
                    <Ionicons name="time-outline" size={18} color={TherapistColors.primary} />
                    <Text style={styles.dateRowLabel}>Time</Text>
                  </View>
                  <Text style={styles.dateRowValue}>
                    {scheduleDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Duration (minutes)</Text>
                <View style={styles.durationRow}>
                  {DURATIONS.map((d) => (
                    <TouchableOpacity
                      key={d}
                      style={[styles.durationChip, scheduleDuration === String(d) && styles.durationChipActive]}
                      onPress={() => setScheduleDuration(String(d))}
                    >
                      <Text
                        style={[
                          styles.durationChipText,
                          scheduleDuration === String(d) && styles.durationChipTextActive,
                        ]}
                      >
                        {d}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  style={styles.notesInput}
                  value={scheduleNotes}
                  onChangeText={setScheduleNotes}
                  placeholder="Optional notes…"
                  placeholderTextColor="#94a3b8"
                  multiline
                />
              </>
            )}

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.btnDisabled]} onPress={submit} disabled={saving}>
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Schedule'}</Text>
              </TouchableOpacity>
            </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {Platform.OS === 'android' && schedulePicker ? (
        <DateTimePicker
          value={scheduleDateTime}
          mode={schedulePicker}
          display="default"
          minimumDate={schedulePicker === 'date' ? new Date() : timeMinimumDate()}
          onChange={(event, date) => {
            const mode = schedulePicker;
            setSchedulePicker(null);
            if (event.type !== 'dismissed' && date) {
              setScheduleDateTime(mode === 'date' ? mergeDatePart(date) : mergeTimePart(date));
            }
          }}
        />
      ) : null}
    </>
  );
}

function InlineDateTimePicker({ title, value, mode, minimumDate, onConfirm, onCancel }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value, mode]);

  const applyPick = (date) => {
    if (mode === 'time') {
      const next = new Date(value);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      return next;
    }
    const next = new Date(value);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    return next;
  };

  return (
    <View style={pickerStyles.inlineWrap}>
      <View style={pickerStyles.header}>
        <TouchableOpacity onPress={onCancel} hitSlop={8}>
          <Text style={pickerStyles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={pickerStyles.title}>{title}</Text>
        <TouchableOpacity onPress={() => onConfirm(draft)} hitSlop={8}>
          <Text style={pickerStyles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
      <DateTimePicker
        value={draft}
        mode={mode}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        minimumDate={minimumDate}
        onChange={(_, date) => {
          if (date) setDraft(applyPick(date));
        }}
        style={pickerStyles.picker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, marginTop: 4 },
  clientChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  clientChipActive: { backgroundColor: TherapistColors.primary },
  clientChipText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  clientChipTextActive: { color: '#fff' },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dateRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateRowLabel: { fontSize: 14, fontWeight: '600', color: '#334155' },
  dateRowValue: { fontSize: 14, color: '#64748b' },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  durationChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  durationChipActive: { backgroundColor: TherapistColors.primary },
  durationChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  durationChipTextActive: { color: '#fff' },
  notesInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    minHeight: 72,
    fontSize: 14,
    color: '#0f172a',
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
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
  btnDisabled: { opacity: 0.6 },
  emptyClients: { textAlign: 'center', color: '#64748b', marginVertical: 20, fontSize: 14 },
});

const pickerStyles = StyleSheet.create({
  inlineWrap: { paddingBottom: Platform.OS === 'ios' ? 12 : 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  doneText: { fontSize: 15, color: TherapistColors.primary, fontWeight: '700' },
  picker: { height: 216 },
});
