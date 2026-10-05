import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * Inside the doctor's prescription form on mobile — counterpart of web's
 * PrescriptionAssistant. Drafts orders from the doctor's words, and checks
 * whatever is in the form against the pharmacist's formulary: interactions
 * (including the patient's CURRENT medicines), duplicates and allergies.
 * Unknown medicines read "not checked"; unreviewed starter rules say so.
 * Nothing here saves a prescription.
 */
const TONE = {
  contraindicated: { bg: '#fdeceb', border: '#f3c7c3', text: '#8f1d17', label: 'Do not combine' },
  major:           { bg: '#fff1e6', border: '#f6d3b5', text: '#8a3b09', label: 'Major' },
  moderate:        { bg: '#fff8e6', border: '#f6e6bd', text: '#7a5b06', label: 'Moderate' },
};

export default function PrescriptionAssistCard({ patientId, medications = [], allergies = [], onAddOrders, accent = '#1e6bb8' }) {
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checks, setChecks] = useState(null);
  const timer = useRef(null);

  const names = medications.map((m) => [m.name, m.strength].filter(Boolean).join(' ').trim()).filter(Boolean);
  const key = `${patientId}|${names.join('|')}`;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!names.length) { setChecks(null); return undefined; }
    timer.current = setTimeout(async () => {
      const res = await api('/api/v1/ai/prescriptions/check', {
        method: 'POST', body: { patientId: patientId || null, medications: names, allergies },
      }).catch(() => null);
      setChecks(res);
    }, 700);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const assist = async () => {
    setBusy(true); setError(''); setDraft(null);
    try {
      const res = await api('/api/v1/ai/prescriptions/assist', {
        method: 'POST', body: { patientId: patientId || null, instructions, allergies },
      });
      if (!res?.ok) { setError(res?.message || 'The orders could not be prepared.'); return; }
      setDraft(res);
    } catch (e) { setError(e?.message || 'The orders could not be prepared.'); } finally { setBusy(false); }
  };

  const add = () => {
    onAddOrders?.(draft.orders, draft.patientInstructions);
    setDraft(null); setInstructions('');
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Ionicons name="medkit-outline" size={15} color={accent} />
        <Text style={styles.title}>Prescription assistant</Text>
      </View>
      <Text style={styles.muted}>Drafts from your words; checks against the pharmacy formulary.</Text>
      {!patientId ? <Text style={styles.muted}>Choose the patient first so their medicines and allergies are checked.</Text> : null}
      <TextInput style={styles.input} multiline textAlignVertical="top" value={instructions} onChangeText={setInstructions}
        placeholder="e.g. Amoxicillin 500mg 1 cap TDS x 5 days" placeholderTextColor="#8a8f9e" />
      <TouchableOpacity style={[styles.btn, { backgroundColor: accent }, (busy || instructions.trim().length < 4) && styles.off]}
        onPress={assist} disabled={busy || instructions.trim().length < 4}>
        {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={15} color="#fff" />}
        <Text style={styles.btnText}>{busy ? 'Drafting…' : 'Draft orders'}</Text>
      </TouchableOpacity>
      {error ? <Text style={styles.err}>{error}</Text> : null}

      {draft ? (
        <View style={styles.draft}>
          {draft.orders.map((o, i) => (
            <Text key={i} style={styles.order}>
              <Text style={{ fontWeight: '800' }}>{o.name} {o.strength}</Text> · {o.drugForm} · {o.dosage || '—'} · {o.frequency || '—'} · {o.direction}{o.duration ? ` · ${o.duration}` : ''}
            </Text>
          ))}
          {draft.missing.length ? <Text style={styles.missing}>Not stated: {draft.missing.join('; ')}</Text> : null}
          <Flags data={draft} />
          {draft.patientInstructions ? (
            <Text style={styles.patient}><Text style={{ fontWeight: '800' }}>For the patient: </Text>{draft.patientInstructions}</Text>
          ) : null}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: accent }]} onPress={add}>
              <Text style={styles.btnText}>Add to prescription</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={() => setDraft(null)}><Text style={styles.ghostText}>Discard</Text></TouchableOpacity>
          </View>
          <Text style={styles.muted}>{draft.note}</Text>
        </View>
      ) : null}

      {checks && !draft ? <Flags data={checks} live /> : null}
    </View>
  );
}

function Flags({ data, live }) {
  const flags = data.flags || [];
  return (
    <View style={{ marginTop: 6 }}>
      {live ? (
        <Text style={styles.sub}>Formulary check{data.currentMedicines?.length ? ` · current medicines: ${data.currentMedicines.join(', ')}` : ''}</Text>
      ) : null}
      {data.allergyWarning ? <Text style={[styles.flag, tone('moderate')]}>⚠ {data.allergyWarning}</Text> : null}
      {flags.map((f, i) => (
        <View key={i} style={[styles.flagBox, { backgroundColor: (TONE[f.severity] || TONE.moderate).bg, borderColor: (TONE[f.severity] || TONE.moderate).border }]}>
          <Text style={[styles.flagText, { color: (TONE[f.severity] || TONE.moderate).text }]}>
            <Text style={{ fontWeight: '800' }}>{(TONE[f.severity] || {}).label || f.severity}: </Text>{f.message}
          </Text>
          {f.advice ? <Text style={[styles.flagText, { color: (TONE[f.severity] || TONE.moderate).text }]}>{f.advice}</Text> : null}
          {f.source ? <Text style={styles.source}>{f.source}</Text> : null}
        </View>
      ))}
      {data.notChecked?.length ? <Text style={styles.notChecked}>Not checked — not in the formulary: {data.notChecked.join(', ')}</Text> : null}
      {live && !flags.length && !data.notChecked?.length && !data.allergyWarning
        ? <Text style={styles.sub}>No interactions, duplicates or allergy conflicts found in the formulary.</Text> : null}
      {(data.reference || []).map((r) => (
        <Text key={r.drug} style={styles.ref}><Text style={{ fontWeight: '800' }}>{r.drug}</Text> (pharmacist reference{r.reviewed ? '' : ', unreviewed'}): {r.text}</Text>
      ))}
    </View>
  );
}

function tone(sev) {
  const t = TONE[sev] || TONE.moderate;
  return { backgroundColor: t.bg, borderColor: t.border, color: t.text };
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderColor: '#dbe2fb', backgroundColor: '#f7f9ff', borderRadius: 12, padding: 12, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '800', color: '#1e3a8a' },
  muted: { fontSize: 11.5, color: '#64748b', marginTop: 3 },
  sub: { fontSize: 12, color: '#475569', fontWeight: '600', marginVertical: 3 },
  input: { minHeight: 60, marginTop: 8, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 8, padding: 9, fontSize: 13, color: '#0f172a', backgroundColor: '#fff' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  ghost: { marginTop: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  ghostText: { fontWeight: '600', fontSize: 13, color: '#334155' },
  off: { opacity: 0.5 },
  err: { color: '#991b1b', fontSize: 12, marginTop: 6 },
  draft: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#dbe2fb', paddingTop: 8 },
  order: { fontSize: 12.5, color: '#0f172a', marginVertical: 2 },
  missing: { fontSize: 12, color: '#7a5b06', marginVertical: 4 },
  patient: { fontSize: 12.5, color: '#334155', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 8, marginTop: 6 },
  row: { flexDirection: 'row', gap: 8 },
  flag: { fontSize: 12, borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 5, overflow: 'hidden' },
  flagBox: { borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 5 },
  flagText: { fontSize: 12, lineHeight: 17 },
  source: { fontSize: 11, color: '#64748b', marginTop: 2 },
  notChecked: { fontSize: 12, color: '#475569', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 8, marginTop: 5, overflow: 'hidden' },
  ref: { fontSize: 12, color: '#334155', marginTop: 4 },
});
