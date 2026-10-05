import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Letters, medical certificates, discharge instructions and appointment
 * summaries, drafted from the clinician's own details — mobile counterpart of
 * web's AdminDocComposer.
 *
 * Missing facts come back as [BRACKETED] placeholders, never invented, and the
 * server refuses to file a document that still has one. Sharing and filing are
 * the clinician's acts.
 */
const KINDS = [
  { kind: 'letter', title: 'Letter', hint: 'Who it is to and what it should say.' },
  { kind: 'medical_certificate', title: 'Certificate', hint: 'The dates they are unfit and the reason to state.' },
  { kind: 'discharge_instructions', title: 'Discharge', hint: 'Home care, medicines as prescribed, warning signs, follow-up.' },
  { kind: 'appointment_summary', title: 'Summary', hint: 'What was discussed and agreed.' },
];

export default function AdminDocComposerScreen({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [kind, setKind] = useState('letter');
  const [details, setDetails] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const me = await getStoredUserId();
      const rows = role === 'DOCTOR'
        ? await api('/api/v1/doctors/me/patients').catch(() => [])
        : await api('/api/v1/therapy-management/clients').catch(() => []);
      setPatients((Array.isArray(rows) ? rows : [])
        .filter((p) => role === 'DOCTOR' || !p.therapistId || String(p.therapistId) === String(me))
        .map((p) => ({ id: p.id, name: p.fullName || p.name || p.email || 'Unnamed' })));
    })();
  }, [role]);

  const current = KINDS.find((k) => k.kind === kind);

  const draft = async () => {
    if (!patientId) { setNote('Choose a patient first.'); return; }
    if (!details.trim()) { setNote('Write the details first — the draft only uses what you write.'); return; }
    setBusy('draft'); setNote('');
    try {
      const res = await api('/api/v1/ai/admin-docs/draft', { method: 'POST', body: { kind, patientId, details } });
      if (!res?.ok) { setNote(res?.message || 'The draft could not be prepared.'); return; }
      setText(res.text);
      setNote(/\[[A-Za-z ]{3,}\]/.test(res.text)
        ? 'Fill in the [BRACKETED] parts — they were not in your details.'
        : 'Read it through and edit before sharing or filing.');
    } catch (e) {
      setNote(e?.message || 'The draft could not be prepared.');
    } finally { setBusy(''); }
  };

  const fileIt = async () => {
    setBusy('file'); setNote('');
    try {
      const res = await api('/api/v1/ai/admin-docs/file', {
        method: 'POST', body: { kind, patientId, text },
      });
      setNote(res?.message || 'Filed.');
    } catch (e) {
      setNote(e?.message || 'That could not be filed.');
    } finally { setBusy(''); }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      <Text style={styles.h1}>Documents</Text>
      <Text style={styles.lead}>Drafted from your own details. Nothing is added that you did not write.</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          {KINDS.map((k) => (
            <TouchableOpacity key={k.kind} onPress={() => setKind(k.kind)}
              style={[styles.chip, kind === k.kind && styles.chipOn]}>
              <Text style={[styles.chipText, kind === k.kind && styles.chipTextOn]}>{k.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Patient</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {patients.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => setPatientId(p.id)}
              style={[styles.chip, patientId === p.id && styles.chipOn]}>
              <Text style={[styles.chipText, patientId === p.id && styles.chipTextOn]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>Your details</Text>
        <TextInput style={[styles.input, { minHeight: 90 }]} multiline textAlignVertical="top"
          placeholder={current.hint} placeholderTextColor="#8a8f9e" value={details} onChangeText={setDetails} />
        <TouchableOpacity style={[styles.primary, busy && styles.off]} onPress={draft} disabled={!!busy}>
          {busy === 'draft' ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="sparkles-outline" size={15} color="#fff" />}
          <Text style={styles.primaryText}>Draft</Text>
        </TouchableOpacity>
      </View>

      {text ? (
        <View style={styles.card}>
          <Text style={styles.label}>Edit freely</Text>
          <TextInput style={[styles.input, { minHeight: 260 }]} multiline textAlignVertical="top"
            value={text} onChangeText={setText} />
          <View style={styles.row}>
            <TouchableOpacity style={styles.ghost} onPress={() => Share.share({ message: text })}>
              <Ionicons name="share-outline" size={15} color="#2c3040" />
              <Text style={styles.ghostText}>Share / print</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.primary, { marginTop: 0 }, busy && styles.off]} onPress={fileIt} disabled={!!busy}>
              <Text style={styles.primaryText}>File to record</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>AI-drafted from your details. You are the author — check every line.</Text>
        </View>
      ) : null}
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 40, gap: 12 },
  h1: { fontSize: 22, fontWeight: '800', color: '#15173a' },
  lead: { fontSize: 13, lineHeight: 19, color: '#565c6e' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 18, padding: 16, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  chip: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, marginRight: 6, marginTop: 4,
    borderWidth: 1, borderColor: '#d8dce6', backgroundColor: '#fff',
  },
  chipOn: { backgroundColor: '#15173a', borderColor: '#15173a' },
  chipText: { fontSize: 12.5, fontWeight: '700', color: '#565c6e' },
  chipTextOn: { color: '#fff' },
  label: { fontSize: 12, fontWeight: '700', color: '#3d4257', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#d8dce6', borderRadius: 10, padding: 10, fontSize: 13.5, color: '#2c3040' },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8,
    paddingVertical: 11, paddingHorizontal: 18, borderRadius: 999, backgroundColor: '#2b5ce6',
  },
  primaryText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  ghost: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: 999, borderWidth: 1, borderColor: '#d8dce6',
  },
  ghostText: { fontSize: 13.5, fontWeight: '700', color: '#2c3040' },
  off: { opacity: 0.5 },
  hint: { fontSize: 11.5, color: '#565c6e', marginTop: 4 },
  note: { fontSize: 13, color: '#2c3040' },
});
