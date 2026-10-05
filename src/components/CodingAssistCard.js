import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Switch, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * ICD-10 suggestions from the clinician's own note, approved by them — mobile
 * counterpart of web's CodingAssistPanel. Each suggestion quotes its evidence;
 * unsupported or malformed ones are removed by the server; a condition code on
 * a note with no documented diagnosis carries a warning and starts unticked.
 */
export default function CodingAssistCard({ patientId, accent = '#2a3ea8' }) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState({});
  const [approved, setApproved] = useState([]);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!patientId) return;
    const rows = await api(`/api/v1/ai/coding?patientId=${patientId}`).catch(() => []);
    setApproved(Array.isArray(rows) ? rows : []);
  }, [patientId]);
  useEffect(() => { load(); }, [load]);

  const suggest = async () => {
    setBusy('suggest'); setNote(''); setSuggestions([]);
    try {
      const res = await api('/api/v1/ai/coding/suggest', { method: 'POST', body: { patientId, text } });
      if (!res?.ok) { setNote(res?.message || 'Codes could not be suggested.'); return; }
      setSuggestions(res.suggestions || []);
      setPicked(Object.fromEntries((res.suggestions || []).map((s, i) => [i, !s.warning])));
      setNote((res.suggestions || []).length ? res.note : 'Nothing in this note is codeable.');
    } catch (e) { setNote(e?.message || 'Codes could not be suggested.'); } finally { setBusy(''); }
  };

  const approve = async () => {
    const codes = suggestions.filter((_, i) => picked[i]);
    if (!codes.length) { setNote('Switch on the codes to approve.'); return; }
    setBusy('approve');
    try {
      const res = await api('/api/v1/ai/coding/approve', { method: 'POST', body: { patientId, codes } });
      setNote(res.message); setSuggestions([]); setText('');
      load();
    } catch (e) { setNote(e?.message || 'Those codes could not be saved.'); } finally { setBusy(''); }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}><Ionicons name="pricetags-outline" size={16} color={accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Diagnosis codes</Text>
          <Text style={styles.sub}>Paste your note or assessment. Codes come only from what you wrote.</Text>
        </View>
      </View>
      <TextInput style={styles.input} multiline textAlignVertical="top" value={text} onChangeText={setText}
        placeholder="e.g. Assessment: moderate depressive episode." placeholderTextColor="#8a8f9e" />
      <TouchableOpacity style={[styles.primary, { backgroundColor: accent }, (busy || text.trim().length < 20) && styles.off]}
        onPress={suggest} disabled={!!busy || text.trim().length < 20}>
        <Text style={styles.primaryText}>{busy === 'suggest' ? 'Reading…' : 'Suggest codes'}</Text>
      </TouchableOpacity>

      {suggestions.map((s, i) => (
        <View key={i} style={[styles.row, s.warning && styles.warnRow]}>
          <Switch value={!!picked[i]} onValueChange={(v) => setPicked({ ...picked, [i]: v })} />
          <View style={{ flex: 1 }}>
            <Text style={styles.code}>{s.code || '—'} <Text style={styles.desc}>{s.description}</Text></Text>
            <Text style={styles.ev}>“{s.evidence}”</Text>
            {s.warning ? <Text style={styles.warn}>⚠ {s.warning}</Text> : null}
            {s.lookupUrl ? (
              <TouchableOpacity onPress={() => Linking.openURL(s.lookupUrl)}>
                <Text style={[styles.link, { color: accent }]}>Check in ICD-10 browser</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ))}
      {suggestions.length ? (
        <TouchableOpacity style={[styles.primary, { backgroundColor: accent }, busy && styles.off]} onPress={approve} disabled={!!busy}>
          <Text style={styles.primaryText}>Approve selected codes</Text>
        </TouchableOpacity>
      ) : null}
      {note ? <Text style={styles.sub}>{note}</Text> : null}

      {approved.length ? (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.label}>On record</Text>
          {approved.slice(0, 6).map((a, i) => (
            <Text key={i} style={styles.recorded}><Text style={{ fontWeight: '800' }}>{a.code}</Text> {a.description}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 18, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 8 },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 4 },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#d8dce6', borderRadius: 10, padding: 10, fontSize: 13, color: '#2c3040' },
  primary: { marginTop: 8, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  off: { opacity: 0.5 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 10, marginTop: 8, borderRadius: 12, borderWidth: 1, borderColor: '#e9ebf1' },
  warnRow: { borderColor: '#f6e2bd', backgroundColor: '#fffaf2' },
  code: { fontSize: 13.5, fontWeight: '800', color: '#15173a' },
  desc: { fontWeight: '600', color: '#2c3040' },
  ev: { fontSize: 12, color: '#565c6e', fontStyle: 'italic', marginTop: 2 },
  warn: { fontSize: 11.5, color: '#8a4b09', marginTop: 3 },
  link: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  label: { fontSize: 12, fontWeight: '800', color: '#3d4257' },
  recorded: { fontSize: 12.5, color: '#2c3040', marginTop: 3 },
});
