import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * Today's medication on the home screen — the same reminders and doses My Care
 * manages (/care/reminders, /care/doses), matching the web card. A reminder set
 * in My Care shows here on the next visit to home, and a dose marked here is
 * marked there.
 *
 * Renders nothing for someone with no reminders. careRoute is the drawer screen
 * for My Care (TherapyCare / MedicalCare).
 */
const isToday = (iso) => {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const timeOf = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const STATUS = {
  taken: { label: 'Taken', bg: '#dcfce7', fg: '#15803d' },
  missed: { label: 'Missed', bg: '#fee2e2', fg: '#b91c1c' },
  skipped: { label: 'Skipped', bg: '#f1f5f9', fg: '#475569' },
};

export default function TodaysMedsCardMobile({ navigation, careRoute, accent = '#2563eb' }) {
  const [reminders, setReminders] = useState(null);
  const [doses, setDoses] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([
      api('/api/v1/care/reminders').catch(() => []),
      api('/api/v1/care/doses').catch(() => []),
    ]);
    setReminders((Array.isArray(r) ? r : []).filter((x) => x.active));
    setDoses((Array.isArray(d) ? d : []).filter((x) => isToday(x.due_at))
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at)));
  }, []);

  // Reload whenever home comes back into view (e.g. after setting a reminder).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const mark = async (id, status) => {
    setBusy(id);
    try { await api(`/api/v1/care/doses/${id}`, { method: 'POST', body: { status } }); await load(); }
    catch { /* leave as is */ }
    finally { setBusy(null); }
  };

  if (!reminders || reminders.length === 0) return null;
  const pending = doses.filter((d) => d.status === 'pending').length;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={[s.badge, { backgroundColor: `${accent}18` }]}>
          <Ionicons name="medkit-outline" size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.h3}>Today's medication</Text>
          <Text style={s.sub}>
            {doses.length === 0 ? 'Nothing due today'
              : pending ? `${pending} dose${pending > 1 ? 's' : ''} to confirm` : 'All done for today'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation?.navigate(careRoute)} hitSlop={8} style={s.link}>
          <Text style={[s.linkText, { color: accent }]}>My Care</Text>
          <Ionicons name="chevron-forward" size={15} color={accent} />
        </TouchableOpacity>
      </View>

      {doses.length ? doses.map((d) => {
        const done = STATUS[d.status];
        const upcoming = d.status === 'pending' && new Date(d.due_at) > new Date();
        return (
          <View key={d.id} style={s.row}>
            <Text style={[s.time, { color: accent }]}>{timeOf(d.due_at)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.med} numberOfLines={1}>{d.medication}</Text>
              {d.dosage ? <Text style={s.dose} numberOfLines={1}>{d.dosage}</Text> : null}
            </View>
            {done ? (
              <View style={[s.pill, { backgroundColor: done.bg }]}><Text style={[s.pillText, { color: done.fg }]}>{done.label}</Text></View>
            ) : upcoming ? (
              <View style={[s.pill, { backgroundColor: '#f1f5f9' }]}><Text style={[s.pillText, { color: '#475569' }]}>Upcoming</Text></View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <TouchableOpacity disabled={busy === d.id} style={[s.btn, { backgroundColor: accent }]} onPress={() => mark(d.id, 'taken')}>
                  <Text style={[s.btnText, { color: '#fff' }]}>Taken</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy === d.id} style={[s.btn, s.btnMissed]} onPress={() => mark(d.id, 'missed')}>
                  <Text style={[s.btnText, { color: '#b91c1c' }]}>Missed</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      }) : reminders.map((r) => (
        <View key={r.id} style={s.row}>
          <Text style={[s.time, { color: accent }]}>{(r.times_of_day || []).join(' · ')}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.med} numberOfLines={1}>{r.medication}</Text>
            {r.dosage ? <Text style={s.dose} numberOfLines={1}>{r.dosage}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 14, marginHorizontal: 16, marginBottom: 14,
    shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  badge: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  h3: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  link: { flexDirection: 'row', alignItems: 'center' },
  linkText: { fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  time: { fontWeight: '800', fontSize: 13, minWidth: 48 },
  med: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  dose: { fontSize: 12, color: '#64748b' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '700' },
  btn: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  btnMissed: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' },
  btnText: { fontSize: 12, fontWeight: '700' },
});
