import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * Upcoming appointments worth chasing, and why.
 *
 * Deliberately NOT presented as a prediction. The server computes it from a
 * transparent rule over booking and attendance behaviour — no trained model,
 * no personal characteristics — and every row carries its reasons so a clinic
 * can read them and disagree.
 *
 * The reasons are always visible, not hidden behind a tap. A flag nobody can
 * interrogate is a flag nobody can push back on.
 */
export default function AppointmentRiskCard({ accent = '#8a4b09' }) {
  const [rows, setRows] = useState([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api('/api/v1/ops/appointments/risk?days=14');
      setRows(res?.appointments || []);
      setNote(res?.note || '');
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markMissed = async (id) => {
    setMarking(id);
    try {
      await api('/api/v1/ops/appointments/no-show', { method: 'POST', body: { appointmentId: id } });
      load();
    } catch { /* the row simply stays */ } finally { setMarking(''); }
  };

  if (loading) return null;

  // Only what is worth acting on. A list containing every low-risk booking is
  // the calendar, which the clinician already has.
  const worthChasing = rows.filter((r) => r.band !== 'low');
  if (worthChasing.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="alarm-outline" size={16} color={accent} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Worth a reminder</Text>
          <Text style={styles.sub}>{note}</Text>
        </View>
      </View>

      {worthChasing.map((r) => {
        const tone = TONES[r.band] || TONES.medium;
        return (
          <View key={r.appointmentId}
            style={[styles.row, { backgroundColor: tone.bg, borderColor: tone.border }]}>
            <View style={styles.rowTop}>
              <Text style={[styles.band, { color: tone.text }]}>
                {r.band === 'high' ? 'Higher risk' : 'Some risk'}
              </Text>
              <Text style={styles.who} numberOfLines={1}>{r.patientName}</Text>
            </View>
            <Text style={styles.when}>{fmt(r.scheduledAt)}</Text>
            {(r.reasons || []).map((why, i) => (
              <Text key={i} style={styles.reason}>· {why}</Text>
            ))}
            <View style={styles.actionRow}>
              <Text style={styles.action}>{r.suggestedAction}</Text>
              <TouchableOpacity
                style={[styles.mark, marking === r.appointmentId && styles.off]}
                onPress={() => markMissed(r.appointmentId)}
                disabled={marking === r.appointmentId}
              >
                <Text style={styles.markText}>Mark as missed</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function fmt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' :
    d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const TONES = {
  high:   { bg: '#fff4e5', border: '#f6e2bd', text: '#8a4b09' },  /* 6.25:1 */
  medium: { bg: '#f7f8fa', border: '#e9ebf1', text: '#3d4257' },  /* 9.1:1  */
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16, marginHorizontal: 4, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#fff4e5',
    alignItems: 'center', justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11, lineHeight: 16, color: '#565c6e', marginTop: 2 },

  row: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 9 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  band: { fontSize: 11, fontWeight: '800' },
  who: { flex: 1, fontSize: 13, fontWeight: '750', color: '#15173a' },
  when: { fontSize: 11.5, color: '#565c6e', marginTop: 2 },
  reason: { fontSize: 12, lineHeight: 18, color: '#2c3040', marginTop: 2 },

  actionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 8, flexWrap: 'wrap',
  },
  action: { flex: 1, fontSize: 12, fontWeight: '700', color: '#2c3040' },
  mark: {
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
  },
  markText: { fontSize: 11, fontWeight: '650', color: '#565c6e' },
  off: { opacity: 0.5 },
});
