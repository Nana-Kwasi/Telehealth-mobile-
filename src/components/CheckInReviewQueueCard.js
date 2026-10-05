import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * Unread check-in answers (safety flags first) and planned follow-ups — the
 * mobile counterpart of web's CheckInReviewQueue.
 *
 * A flag is set by the server's pattern screen when the answer arrives, and the
 * clinician is notified then; if still unread after two hours the
 * administrators are told as well. "Mark as read" is what stops that.
 */
export default function CheckInReviewQueueCard({ people = [], nameOf = (p) => p.name }) {
  const [queue, setQueue]     = useState([]);
  const [plans, setPlans]     = useState([]);
  const [planFor, setPlanFor] = useState('');
  const [inDays, setInDays]   = useState(14);
  const [reason, setReason]   = useState('');
  const [note, setNote]       = useState('');

  const load = useCallback(async () => {
    const [q, p] = await Promise.all([
      api('/api/v1/care/review-queue').catch(() => ({ items: [] })),
      api('/api/v1/care/followup-plans').catch(() => []),
    ]);
    setQueue(q?.items || []);
    setPlans(Array.isArray(p) ? p : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    await api(`/api/v1/care/review-queue/${id}/reviewed`, { method: 'POST' }).catch(() => null);
    load();
  };

  const createPlan = async () => {
    if (!planFor) { setNote('Choose a patient first.'); return; }
    setNote('');
    try {
      const res = await api('/api/v1/care/followup-plans', {
        method: 'POST', body: { patientId: planFor, inDays, reason: reason.trim() || null },
      });
      setNote(`Follow-up ${res.updated ? 'moved to' : 'planned for'} ${fmtDay(res.dueOn)}. Reminders are automatic.`);
      setPlanFor(''); setReason('');
      load();
    } catch (e) { setNote(e?.message || 'Could not plan that.'); }
  };

  const cancelPlan = async (id) => {
    await api(`/api/v1/care/followup-plans/${id}`, { method: 'DELETE' }).catch(() => null);
    load();
  };

  return (
    <>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.icon}><Ionicons name="file-tray-outline" size={16} color="#2a3ea8" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>To review{queue.length ? ` (${queue.length})` : ''}</Text>
            <Text style={styles.sub}>Answered check-ins you have not read. Safety flags first.</Text>
          </View>
        </View>
        {queue.length === 0 ? (
          <Text style={styles.sub}>Nothing waiting — you are up to date.</Text>
        ) : queue.map((f) => (
          <View key={f.id} style={[styles.item, f.escalated && styles.flagged]}>
            {f.escalated ? (
              <View style={styles.flagRow}>
                <Ionicons name="warning-outline" size={13} color="#8f1d17" />
                <Text style={styles.flag}>Safety concern</Text>
              </View>
            ) : null}
            <Text style={styles.who}>{f.patient_name || 'Patient'} · <Text style={styles.kind}>{KIND[f.kind] || 'Check-in'}</Text></Text>
            <Text style={styles.prompt}>{f.prompt}</Text>
            <Answers raw={f.answers} />
            {f.severity != null ? <Text style={styles.line}>Rating: {f.severity}/10</Text> : null}
            {f.response ? <Text style={styles.quote}>“{f.response}”</Text> : null}
            <TouchableOpacity style={styles.read} onPress={() => markRead(f.id)}>
              <Text style={styles.readText}>Mark as read</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.icon}><Ionicons name="calendar-outline" size={16} color="#2a3ea8" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Planned follow-ups</Text>
            <Text style={styles.sub}>Reminder 4 days before, confirmation the day before, check-in on the day.</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          {people.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => setPlanFor(p.id)}
              style={[styles.chip, planFor === p.id && styles.chipOn]}>
              <Text style={[styles.chipText, planFor === p.id && styles.chipTextOn]}>{nameOf(p)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
          {[3, 7, 10, 14, 21, 28, 42, 90].map((d) => (
            <TouchableOpacity key={d} onPress={() => setInDays(d)}
              style={[styles.chip, inDays === d && styles.chipOn]}>
              <Text style={[styles.chipText, inDays === d && styles.chipTextOn]}>{d} days</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TextInput style={styles.input} value={reason} onChangeText={setReason}
          placeholder="Reason (optional)" placeholderTextColor="#8a8f9e" />
        <TouchableOpacity style={styles.go} onPress={createPlan}>
          <Text style={styles.goText}>Plan follow-up</Text>
        </TouchableOpacity>
        {note ? <Text style={styles.sub}>{note}</Text> : null}
        {plans.map((p) => (
          <View key={p.id} style={styles.planRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.who}>{p.patient_name} · {fmtDay(p.due_on)}</Text>
              <Text style={styles.sub}>
                {p.attending === true ? 'Confirmed' : p.attending === false ? "Can't attend" : 'Not confirmed yet'}
                {p.reason ? ` · ${p.reason}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => cancelPlan(p.id)} hitSlop={10}>
              <Ionicons name="close-circle-outline" size={20} color="#565c6e" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </>
  );
}

const KIND = { weekly_checkin: 'Weekly check-in', consult_followup: 'After consultation', checkin: 'Check-in' };
const LABELS = { mood: 'Mood', anxiety: 'Anxiety', stress: 'Stress', energy: 'Energy' };
const MED = { yes: 'taken', no: 'missed some', na: 'not on any' };

function Answers({ raw }) {
  let a = null;
  try { a = raw ? JSON.parse(raw) : null; } catch { a = null; }
  if (!a) return null;
  const figures = Object.keys(LABELS).filter((k) => a[k] != null).map((k) => `${LABELS[k]} ${a[k]}/10`);
  if (a.sleepHours != null) figures.push(`Sleep ${a.sleepHours}h`);
  if (a.medication) figures.push(`Medication ${MED[a.medication] || a.medication}`);
  return (
    <>
      {figures.length ? <Text style={styles.line}>{figures.join(' · ')}</Text> : null}
      {a.events ? <Text style={styles.quote}>“{a.events}”</Text> : null}
    </>
  );
}

function fmtDay(day) {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString(undefined,
    { weekday: 'short', day: 'numeric', month: 'short' });
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 6 },
  icon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef2ff',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 2 },
  item: { borderWidth: 1, borderColor: '#e9ebf1', backgroundColor: '#f9fafc', borderRadius: 12, padding: 11, marginTop: 8 },
  flagged: { borderWidth: 2, borderColor: '#f3c7c3', backgroundColor: '#fdf3f2' },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  flag: { fontSize: 11.5, fontWeight: '800', color: '#8f1d17' },
  who: { fontSize: 13, fontWeight: '750', color: '#15173a' },
  kind: { fontSize: 11.5, fontWeight: '600', color: '#565c6e' },
  prompt: { fontSize: 12, color: '#565c6e', marginTop: 3 },
  line: { fontSize: 12.5, color: '#2c3040', marginTop: 4 },
  quote: { fontSize: 13, lineHeight: 19, color: '#2c3040', fontStyle: 'italic', marginTop: 4 },
  read: {
    alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
  },
  readText: { fontSize: 11.5, fontWeight: '700', color: '#2c3040' },
  chip: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, marginRight: 6,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
  },
  chipOn: { backgroundColor: '#15173a', borderColor: '#15173a' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#565c6e' },
  chipTextOn: { color: '#ffffff' },
  input: {
    marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d8dce6',
    fontSize: 13, color: '#2c3040',
  },
  go: { marginTop: 8, paddingVertical: 11, borderRadius: 999, backgroundColor: '#2b5ce6', alignItems: 'center' },
  goText: { fontSize: 13.5, fontWeight: '700', color: '#ffffff' },
  planRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eef0f4', marginTop: 6,
  },
});
