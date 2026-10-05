import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * My practice figures, this period against the last.
 *
 * Every number is counted by the server in SQL. The paragraph is the only
 * model-written part and is fetched separately, so the figures render at SQL
 * speed and a slow or absent model costs the paragraph, never a number.
 *
 * Direction is neutral on purpose: "up" is good for consultations and bad for
 * cancellations, and colouring it would be the screen making a judgement the
 * figures do not. An unavailable figure reads "Not recorded", never 0.
 */
const PERIODS = [7, 30, 90];

export default function PracticeAnalyticsCard({ accent = '#3b3f8f' }) {
  const [days, setDays]       = useState(30);
  const [data, setData]       = useState(null);
  const [summary, setSummary] = useState(null);
  const [writing, setWriting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const base = `/api/v1/ops/analytics/me?days=${days}`;
    setLoading(true);
    setSummary(null);
    (async () => {
      try {
        const d = await api(`${base}&narrative=false`);
        if (cancelled) return;
        setData(d?.ok ? d : null);
        if (!d?.ok) return;
        setWriting(true);
        const n = await api(`${base}&narrative=true`);
        if (!cancelled) setSummary(n?.summary || null);
      } catch {
        /* figures already shown stay; a first-load failure renders nothing */
      } finally {
        if (!cancelled) { setLoading(false); setWriting(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [days]);

  if (!data) return null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="bar-chart-outline" size={16} color={accent} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Your practice</Text>
          <Text style={styles.sub}>
            Last {data.days} days, compared with the {data.days} before.
          </Text>
        </View>
      </View>

      <View style={styles.periods}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setDays(p)}
            style={[styles.period, days === p && styles.periodOn]}
            accessibilityState={{ selected: days === p }}
          >
            <Text style={[styles.periodText, days === p && styles.periodTextOn]}>{p}d</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.grid, loading && styles.dim]}>
        {(data.metrics || []).map((m) => <Tile key={m.key} m={m} />)}
      </View>

      {summary ? (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>{summary}</Text>
          <Text style={styles.summaryNote}>AI-written from the figures above. The figures are the record.</Text>
        </View>
      ) : writing ? (
        <Text style={styles.summaryNote}>Writing a summary…</Text>
      ) : null}
    </View>
  );
}

function Tile({ m }) {
  if (!m.available) {
    return (
      <View style={styles.tile}>
        <Text style={styles.label}>{m.label}</Text>
        <Text style={styles.missing}>Not recorded</Text>
      </View>
    );
  }
  const arrow = m.direction === 'up' ? 'arrow-up' : m.direction === 'down' ? 'arrow-down' : 'remove';
  return (
    <View style={styles.tile}>
      <Text style={styles.label} numberOfLines={1}>{m.label}</Text>
      <Text style={styles.value}>{Number(m.value).toLocaleString()}</Text>
      {m.previous != null ? (
        <View style={styles.prevRow}>
          <Ionicons name={arrow} size={10} color="#565c6e" />
          <Text style={styles.prev}>from {Number(m.previous).toLocaleString()}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16, marginHorizontal: 4, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef0ff',
    alignItems: 'center', justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11, lineHeight: 16, color: '#565c6e', marginTop: 2 },

  periods: { flexDirection: 'row', gap: 6, marginTop: 10 },
  period: {
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
  },
  periodOn: { backgroundColor: '#15173a', borderColor: '#15173a' },
  periodText: { fontSize: 11, fontWeight: '650', color: '#565c6e' },
  periodTextOn: { color: '#ffffff' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  dim: { opacity: 0.55 },
  tile: {
    flexBasis: '47%', flexGrow: 1, padding: 10, borderRadius: 12,
    backgroundColor: '#f7f8fa', borderWidth: 1, borderColor: '#e9ebf1',
  },
  label: { fontSize: 11, fontWeight: '650', color: '#565c6e' },
  value: { fontSize: 20, fontWeight: '800', color: '#15173a', marginTop: 2 },
  missing: { fontSize: 13, fontWeight: '750', color: '#3d4257', marginTop: 4 },
  prevRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  prev: { fontSize: 11, color: '#565c6e' },

  summary: { marginTop: 12, padding: 11, borderRadius: 12, backgroundColor: '#f4f5fb' },
  summaryText: { fontSize: 12.5, lineHeight: 19, color: '#2c3040' },
  summaryNote: { fontSize: 11, color: '#565c6e', marginTop: 6 },
});
