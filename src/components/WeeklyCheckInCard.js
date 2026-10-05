import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * Weekly check-ins for one client — the switch, and this week against last.
 * Mobile counterpart of web's WeeklyCheckInPanel.
 *
 * Off until the therapist turns it on. Figures are the client's own 0-10
 * self-ratings averaged over the week; the paragraph is written over them and
 * labelled as such. Arrows are neutral: anxiety up is bad, mood up is good.
 */
export default function WeeklyCheckInCard({ clientId, accent = '#5b21b6' }) {
  const [enabled, setEnabled] = useState(null);
  const [data, setData]       = useState(null);
  const [busy, setBusy]       = useState(false);
  const [note, setNote]       = useState('');

  const load = useCallback(async () => {
    if (!clientId) return;
    const s = await api(`/api/v1/care/weekly-checkins/${clientId}`).catch(() => null);
    setEnabled(Boolean(s?.enabled));
    setData(await api(`/api/v1/care/weekly-checkins/${clientId}/summary`).catch(() => null));
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    setBusy(true); setNote('');
    try {
      const res = await api(`/api/v1/care/weekly-checkins/${clientId}`, {
        method: 'PUT', body: { enabled: !enabled },
      });
      setEnabled(Boolean(res?.enabled));
      setNote(res?.message || '');
    } catch (e) {
      setNote(e?.message || 'That could not be changed.');
    } finally { setBusy(false); }
  };

  if (enabled === null) return null;
  const answered = data?.answeredThisWeek || 0;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}><Ionicons name="heart-circle-outline" size={17} color={accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Weekly check-ins</Text>
          <Text style={styles.sub}>Mood, anxiety, stress, sleep, energy, medication, events.</Text>
        </View>
        <TouchableOpacity onPress={toggle} disabled={busy}
          style={[styles.toggle, enabled && { backgroundColor: accent, borderColor: accent }]}>
          <Text style={[styles.toggleText, enabled && { color: '#ffffff' }]}>{enabled ? 'On' : 'Off'}</Text>
        </TouchableOpacity>
      </View>
      {note ? <Text style={styles.sub}>{note}</Text> : null}
      {data?.flagged ? (
        <Text style={styles.flag}>A check-in this week was flagged — see Check-ins.</Text>
      ) : null}

      {answered > 0 ? (
        <>
          <View style={styles.grid}>
            {(data.measures || []).filter((m) => m.value != null).map((m) => (
              <View key={m.key} style={styles.tile}>
                <Text style={styles.label}>{m.label}</Text>
                <Text style={styles.value}>{m.value}</Text>
                <Text style={styles.prev}>
                  {m.previous != null
                    ? `${m.direction === 'up' ? '↑' : m.direction === 'down' ? '↓' : '–'} from ${m.previous}`
                    : 'no answer last week'}
                </Text>
              </View>
            ))}
          </View>
          <Text style={styles.line}>
            Medication: {data.medication?.taken || 0} taken · {data.medication?.missed || 0} missed
          </Text>
          {(data.events || []).map((e, i) => <Text key={i} style={styles.quote}>“{e}”</Text>)}
          {data.summary ? (
            <View style={styles.summary}>
              <Text style={styles.summaryText}>{data.summary}</Text>
              <Text style={styles.sub}>AI-written from the figures and words above.</Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text style={[styles.sub, { marginTop: 6 }]}>
          {enabled ? 'No answer yet this week.' : 'Turn this on to send a short check-in each week.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#f3efff',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 2 },
  toggle: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
  },
  toggleText: { fontSize: 12, fontWeight: '800', color: '#565c6e' },
  flag: { fontSize: 12.5, fontWeight: '700', color: '#8f1d17', marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tile: {
    flexBasis: '30%', flexGrow: 1, padding: 9, borderRadius: 11,
    backgroundColor: '#f7f8fa', borderWidth: 1, borderColor: '#e9ebf1',
  },
  label: { fontSize: 11, fontWeight: '650', color: '#565c6e' },
  value: { fontSize: 18, fontWeight: '800', color: '#15173a', marginTop: 2 },
  prev: { fontSize: 10.5, color: '#565c6e', marginTop: 1 },
  line: { fontSize: 12.5, color: '#2c3040', marginTop: 8 },
  quote: { fontSize: 13, lineHeight: 19, color: '#2c3040', fontStyle: 'italic', marginTop: 4 },
  summary: { marginTop: 10, padding: 11, borderRadius: 12, backgroundColor: '#f6f3ff' },
  summaryText: { fontSize: 12.5, lineHeight: 19, color: '#2c3040' },
});
