import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * How a patient has actually been taking their medication.
 *
 * Doses were being logged and nobody was reading them. This shows the pattern
 * to the clinician who can act on it.
 *
 * It reports; it does not advise. What to do about missed doses is a
 * prescribing decision, and there is deliberately no suggestion here.
 */
export default function AdherenceCard({ patientId, days = 30 }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!patientId) { setLoading(false); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const res = await api(`/api/v1/ops/adherence/${patientId}?days=${days}`);
        if (!cancelled) setRows(res?.medications || []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, days]);

  // Nothing logged is not the same as perfect adherence, so the card stays away
  // rather than showing an encouraging empty state.
  if (loading || rows.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="medkit-outline" size={15} color="#2a3ea8" />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Medication, last {days} days</Text>
          <Text style={styles.sub}>What they recorded themselves.</Text>
        </View>
      </View>

      {rows.map((m) => {
        const total = (m.taken || 0) + (m.missed || 0) + (m.skipped || 0);
        const pct = total ? Math.round(((m.taken || 0) / total) * 100) : 0;
        const concerning = (m.missed || 0) >= 3;
        return (
          <View key={m.medication} style={styles.row}>
            <View style={styles.rowTop}>
              <Text style={styles.med} numberOfLines={1}>{m.medication}</Text>
              <Text style={[styles.pct, { color: concerning ? '#8a4b09' : '#12602f' }]}>
                {pct}% taken
              </Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, {
                width: `${pct}%`, backgroundColor: concerning ? '#b45309' : '#1f8a4c',
              }]} />
            </View>
            <Text style={styles.counts}>
              {m.taken || 0} taken · {m.missed || 0} missed
              {m.skipped ? ` · ${m.skipped} skipped` : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 16, padding: 14, marginHorizontal: 4, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: '#eef2ff',
    alignItems: 'center', justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11, color: '#565c6e', marginTop: 1 },

  row: { marginTop: 11 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  med: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2c3040' },
  pct: { fontSize: 12, fontWeight: '800' },
  bar: { height: 6, borderRadius: 999, backgroundColor: '#eef0f5', overflow: 'hidden', marginTop: 5 },
  barFill: { height: '100%', borderRadius: 999 },
  counts: { fontSize: 11, color: '#565c6e', marginTop: 4 },
});
