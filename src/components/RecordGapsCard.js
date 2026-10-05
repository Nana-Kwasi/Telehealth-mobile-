import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * What is missing from this record, by rule — mobile counterpart of web's
 * RecordGapsPanel. No model: every line is checkably true. Renders nothing
 * when the record is complete.
 */
export default function RecordGapsCard({ patientId }) {
  const [gaps, setGaps] = useState(null);

  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    api(`/api/v1/ai/records/gaps?patientId=${patientId}`)
      .then((d) => { if (!cancelled) setGaps(d?.gaps || []); })
      .catch(() => { if (!cancelled) setGaps([]); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (!gaps || gaps.length === 0) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}><Ionicons name="list-outline" size={16} color="#8a4b09" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Gaps in this record</Text>
          <Text style={styles.sub}>Checked against the record — each is actually missing.</Text>
        </View>
      </View>
      {gaps.map((g) => (
        <View key={g.key} style={styles.row}>
          <View style={[styles.dot, { backgroundColor: LEVEL[g.level] || LEVEL.low }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.gapTitle}>{g.title}</Text>
            <Text style={styles.sub}>{g.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const LEVEL = { high: '#b42318', medium: '#b54708', low: '#667085' };

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 18, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 6 },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#fff4e5', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 1 },
  row: { flexDirection: 'row', gap: 9, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  gapTitle: { fontSize: 13.5, fontWeight: '700', color: '#15173a' },
});
