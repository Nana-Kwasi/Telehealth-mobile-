import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * Unread messages, sorted by how soon they need attention.
 *
 * The sorting happens on the server, where the pattern-based safety screen
 * outranks the model — a message containing emergency language is urgent
 * whatever the model made of it.
 *
 * The message text is always shown beside its category. The category decides
 * the ORDER, never whether the clinician sees what was written.
 *
 * Sorted on request, not on mount: it costs a model call per message, and
 * running on every dashboard open would spend the hourly allowance on a refresh.
 */
export default function InboxTriageCard({ accent = '#5046bd', onOpen }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ran, setRan] = useState(false);

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const res = await api('/api/v1/ops/inbox/triage');
      if (!res?.ok) { setError(res?.message || 'Your inbox could not be sorted.'); return; }
      setData(res); setRan(true);
    } catch (e) {
      setError(e?.message || 'Your inbox could not be sorted.');
    } finally {
      setBusy(false);
    }
  }, []);

  const order = data?.order || ['URGENT', 'CLINICAL', 'ADMIN'];
  const sorted = [...(data?.results || [])]
    .sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: `${accent}1a` }]}>
          <Ionicons name="mail-unread-outline" size={16} color={accent} />
        </View>
        {/* flex on the text only — never the row, or the icon stretches. */}
        <View style={styles.headText}>
          <Text style={styles.title}>Sort my unread messages</Text>
          <Text style={styles.sub}>
            Puts what needs you now at the top. It sorts only — nothing is
            answered, read or closed for you.
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.go, busy && styles.off]}
          onPress={load}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#2c3040" />
          ) : (
            <Text style={styles.goText}>{ran ? 'Again' : 'Sort'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {ran && sorted.length === 0 && !error ? (
        <Text style={styles.empty}>Nothing unread. Your inbox is clear.</Text>
      ) : null}

      {sorted.map((m) => {
        const tone = TONES[m.tone] || TONES.neutral;
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.row, { backgroundColor: tone.bg, borderColor: tone.border }]}
            activeOpacity={onOpen ? 0.75 : 1}
            onPress={() => onOpen?.(m)}
          >
            <View style={styles.rowTop}>
              <Text style={[styles.band, { color: tone.text }]}>{m.label}</Text>
              <Text style={styles.from} numberOfLines={1}>{m.from || 'Unknown sender'}</Text>
            </View>
            <Text style={styles.preview} numberOfLines={3}>{m.preview}</Text>
            <Text style={styles.why} numberOfLines={2}>{m.reason}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* Measured against each row's own background. */
const TONES = {
  critical:  { bg: '#fdeceb', border: '#f3c7c3', text: '#8f1d17' },  /* 7.59:1 */
  attention: { bg: '#fff4e5', border: '#f6e2bd', text: '#8a4b09' },  /* 6.25:1 */
  neutral:   { bg: '#f7f8fa', border: '#e9ebf1', text: '#3d4257' },  /* 9.1:1  */
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16, marginHorizontal: 4, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16.5, color: '#565c6e', marginTop: 2 },
  go: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#ffffff',
    minWidth: 58, alignItems: 'center',
  },
  goText: { fontSize: 12, fontWeight: '700', color: '#2c3040' },
  off: { opacity: 0.5 },

  row: { borderWidth: 1, borderRadius: 12, padding: 11, marginTop: 9, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  band: { fontSize: 11, fontWeight: '800' },
  from: { flex: 1, fontSize: 12, fontWeight: '700', color: '#15173a' },
  preview: { fontSize: 12.5, lineHeight: 18, color: '#2c3040' },
  why: { fontSize: 11, lineHeight: 15.5, color: '#565c6e', fontStyle: 'italic' },

  error: { fontSize: 12, color: '#8f1d17', marginTop: 10 },
  empty: { fontSize: 12.5, color: '#565c6e', marginTop: 10 },
});
