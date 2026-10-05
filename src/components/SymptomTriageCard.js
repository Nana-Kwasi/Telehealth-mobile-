import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * "I'm not sure where to start" — a level-of-care suggestion before booking.
 *
 * The server decides the level, and its pattern-based safety layer outranks the
 * model there, so an emergency cannot be talked down into a routine
 * appointment. This card's job is to not undo that: when the answer says
 * `canBookOnline: false` it shows the emergency guidance and does NOT offer a
 * booking button.
 *
 * It recommends a level of care and a specialty. It never names a condition,
 * and the disclaimer from the server is always shown.
 */
export default function SymptomTriageCard({ onBook, accent = '#2a3ea8' }) {
  const [text, setText]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');

  const assess = async () => {
    if (!text.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api('/api/v1/ai/triage', { method: 'POST', body: { complaint: text } });
      if (!res?.ok) { setError(res?.message || 'That could not be assessed.'); return; }
      setResult(res);
    } catch (e) {
      setError(e?.message || 'That could not be assessed.');
    } finally {
      setBusy(false);
    }
  };

  const tone = result ? (TONES[result.tone] || TONES.neutral) : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="medkit-outline" size={16} color={accent} />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Not sure where to start?</Text>
          <Text style={styles.sub}>
            Describe what is going on and we will suggest how soon to be seen and
            by whom. This is not a diagnosis.
          </Text>
        </View>
      </View>

      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        multiline
        textAlignVertical="top"
        placeholder="For example: I've had a sore throat and a mild fever since Tuesday."
        placeholderTextColor="#8a8f9e"
      />

      <TouchableOpacity
        style={[styles.go, (busy || !text.trim()) && styles.off]}
        onPress={assess}
        disabled={busy || !text.trim()}
      >
        {busy ? <ActivityIndicator size="small" color="#ffffff" /> : null}
        <Text style={styles.goText}>{busy ? 'Checking…' : 'Check where to start'}</Text>
      </TouchableOpacity>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={[styles.result, { backgroundColor: tone.bg, borderColor: tone.border }]}>
          <View style={styles.resultHead}>
            {result.tone === 'critical'
              ? <Ionicons name="warning-outline" size={15} color={tone.text} /> : null}
            <Text style={[styles.resultTitle, { color: tone.text }]}>{result.headline}</Text>
          </View>
          <Text style={styles.resultBody}>{result.reason}</Text>
          <Text style={styles.resultAction}>{result.action}</Text>

          {/* The safety layer's own wording whenever it fired. */}
          {result.safetyMessage ? <Text style={styles.safety}>{result.safetyMessage}</Text> : null}

          {/* No booking button when the answer is "go now". Offering an
              appointment beside "seek emergency care" would undo the triage. */}
          {result.canBookOnline ? (
            onBook ? (
              <TouchableOpacity style={styles.book} onPress={onBook}>
                <Text style={styles.bookText}>Book a consultation</Text>
                <Ionicons name="arrow-forward" size={13} color="#ffffff" />
              </TouchableOpacity>
            ) : null
          ) : (
            <Text style={styles.emergency}>
              Emergency number: <Text style={styles.bold}>{result.emergencyNumber}</Text>
            </Text>
          )}

          <Text style={styles.disclaimer}>{result.disclaimer}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* Same tones as web, measured against each block's own background. */
const TONES = {
  critical:  { bg: '#fdeceb', border: '#f3c7c3', text: '#8f1d17' },
  attention: { bg: '#fff4e5', border: '#f6e2bd', text: '#8a4b09' },
  neutral:   { bg: '#eef2ff', border: '#dbe2fb', text: '#2a3ea8' },
  good:      { bg: '#e6f6ec', border: '#c9e9d5', text: '#12602f' },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16, marginHorizontal: 4, marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef2ff',
    alignItems: 'center', justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 2 },

  input: {
    minHeight: 76, marginTop: 12, padding: 11, borderRadius: 12,
    borderWidth: 1, borderColor: '#d8dce6', fontSize: 13.5, color: '#2c3040',
  },
  go: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 11, borderRadius: 999, backgroundColor: '#2b5ce6',
  },
  goText: { fontSize: 13.5, fontWeight: '700', color: '#ffffff' },
  off: { opacity: 0.5 },
  error: { fontSize: 12, color: '#8f1d17', marginTop: 8 },

  result: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12, gap: 5 },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultTitle: { flex: 1, fontSize: 14, fontWeight: '800' },
  resultBody: { fontSize: 12.5, lineHeight: 18, color: '#2c3040' },
  resultAction: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: '#2c3040' },
  safety: { fontSize: 12.5, lineHeight: 18, color: '#7c2d12' },
  book: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    marginTop: 4, paddingVertical: 8, paddingHorizontal: 13, borderRadius: 999,
    backgroundColor: '#15173a',
  },
  bookText: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' },
  emergency: { fontSize: 12.5, color: '#2c3040' },
  bold: { fontWeight: '800' },
  disclaimer: { fontSize: 11, lineHeight: 15, color: '#565c6e', marginTop: 2 },
});
