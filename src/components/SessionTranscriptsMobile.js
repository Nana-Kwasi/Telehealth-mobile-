import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * Transcribed sessions on mobile — twin of web Common/SessionsToReview,
 * PatientTranscripts and SessionRecordReview. A clinician can review the
 * drafted record, add allergies / medicines / a follow-up to the patient's
 * record (consultations) or homework (therapy), save, and re-read saved ones.
 */
const T = '/api/v1/ai/sessions';
const CONSULT_FIELDS = [
  ['chiefComplaint', 'Chief complaint'], ['symptoms', 'Symptoms'], ['duration', 'Duration'], ['severity', 'Severity'],
  ['medicalHistory', 'Medical history'], ['medications', 'Medications'], ['allergies', 'Allergies'],
  ['examinationFindings', 'Examination findings'], ['assessment', 'Assessment'], ['plan', 'Plan'], ['followUp', 'Follow-up'],
];
const val = (v) => (Array.isArray(v) ? v.join(', ') : (v || ''));
const list = (v) => (Array.isArray(v) ? v : (v ? String(v).split(/[,;]/) : [])).map((x) => String(x).trim()).filter(Boolean).join(', ');
const split = (t) => String(t || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);

function toNote(kind, d) {
  if (!d) return '';
  if (kind === 'therapy') {
    return [
      d.summary ? `Summary: ${d.summary}` : '', d.progressNote ? `Progress note: ${d.progressNote}` : '',
      d.themes?.length ? `Themes: ${val(d.themes)}` : '', d.clientGoals?.length ? `Client goals: ${val(d.clientGoals)}` : '',
      d.followUpPlan ? `Follow-up plan: ${d.followUpPlan}` : '', d.riskNotes ? `Risk notes: ${d.riskNotes}` : '',
    ].filter(Boolean).join('\n\n');
  }
  return CONSULT_FIELDS.map(([k, l]) => (val(d[k]) ? `${l}: ${val(d[k])}` : '')).filter(Boolean).join('\n');
}

const inFlight = new Map();
function finishOnce(id) {
  if (!inFlight.has(id)) {
    const p = api(`${T}/${id}/finish`, { method: 'POST', body: {} }).finally(() => setTimeout(() => inFlight.delete(id), 1000));
    inFlight.set(id, p);
  }
  return inFlight.get(id);
}

export function SessionReviewSheet({ id, visible, onClose, onSaved, accent = '#2b5ce6' }) {
  const [data, setData] = useState(null);
  const [note, setNote] = useState('');
  const [homework, setHomework] = useState([]);
  const [rec, setRec] = useState({ allergies: '', medications: '', followUpDate: '', followUpPrompt: '' });
  const [showTx, setShowTx] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [updated, setUpdated] = useState([]);

  useEffect(() => {
    if (!visible || !id) return undefined;
    let cancelled = false;
    setBusy('loading'); setMsg(''); setUpdated([]); setData(null);
    (async () => {
      try {
        let d = await api(`${T}/${id}`);
        if (!d.draft && !d.savedAt) {
          const f = await finishOnce(id);
          if (!f.ok) setMsg(f.message || 'The record could not be drafted.');
          d = { ...d, transcript: f.transcript || d.transcript, draft: f.draft || null, flags: f.flags };
        }
        if (cancelled) return;
        setData(d);
        setNote(toNote(d.kind, d.draft));
        setHomework((d.draft?.homework || []).map((h) => ({ title: h.title || '', instructions: h.instructions || '', dueDate: '' })));
        setRec({ allergies: list(d.draft?.allergies), medications: list(d.draft?.medications), followUpDate: '',
          followUpPrompt: d.draft?.followUp ? `Your doctor asked to check in: ${d.draft.followUp}. How are you doing?` : '' });
      } catch (e) { if (!cancelled) setMsg(e?.message || 'This session could not be loaded.'); }
      finally { if (!cancelled) setBusy(''); }
    })();
    return () => { cancelled = true; };
  }, [id, visible]);

  const save = async () => {
    if (rec.followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(rec.followUpDate)) { Alert.alert('Follow-up date', 'Use the form YYYY-MM-DD.'); return; }
    setBusy('saving'); setMsg('');
    try {
      const therapy = data.kind === 'therapy';
      const res = await api(`${T}/${id}/save`, { method: 'POST', body: {
        noteText: note, homework: homework.filter((h) => h.title.trim()),
        ...(therapy ? {} : { allergies: split(rec.allergies), currentMedications: split(rec.medications), followUpDate: rec.followUpDate || null, followUpPrompt: rec.followUpPrompt || null }),
      } });
      setMsg(res.message); setUpdated(res.updated || []);
      setData((d) => ({ ...d, savedAt: new Date().toISOString() }));
      onSaved?.();
    } catch (e) { setMsg(e?.message || 'Could not save.'); } finally { setBusy(''); }
  };

  const therapy = data?.kind === 'therapy';
  const locked = !!data?.savedAt;
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}><View style={s.sheet}>
        <View style={s.headRow}>
          <Text style={[s.title, { flex: 1 }]}>{therapy ? 'Session notes' : 'Consultation record'}</Text>
          <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
        </View>
        {busy === 'loading' ? (
          <View style={{ padding: 24, alignItems: 'center', gap: 10 }}><ActivityIndicator color={accent} /><Text style={s.muted}>Drafting the notes from the transcript… this can take 1–2 minutes.</Text></View>
        ) : !data ? <Text style={s.muted}>{msg}</Text> : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
            <Text style={s.muted}>{locked ? 'Saved to the record. You can re-read the transcript below.' : 'Drafted from the transcript only. Nothing is in the record until you save.'}</Text>
            {(data.flags || []).length ? <Text style={s.crisis}>Safety-related words were said: {data.flags.map((f) => `“${f.text}”`).join(' ')}</Text> : null}
            {!therapy && data.draft ? CONSULT_FIELDS.map(([k, l]) => (val(data.draft[k]) ? <Text key={k} style={s.field}><Text style={s.fieldLabel}>{l}: </Text>{val(data.draft[k])}</Text> : null)) : null}
            <Text style={s.label}>Note {locked ? '' : '(edit freely)'}</Text>
            <TextInput style={[s.input, { minHeight: 140, textAlignVertical: 'top' }]} multiline value={note} onChangeText={setNote} editable={!locked} />
            {!therapy && !locked ? (
              <View style={s.record}>
                <Text style={s.label}>Also add to the patient's record</Text>
                <Text style={s.muted}>Allergies feed the prescribing safety check; a follow-up date sends the patient a check-in that day.</Text>
                <Text style={s.small}>Allergies mentioned</Text>
                <TextInput style={s.input} value={rec.allergies} onChangeText={(v) => setRec({ ...rec, allergies: v })} placeholder="e.g. penicillin, peanuts" placeholderTextColor="#94a3b8" />
                <Text style={s.small}>Medicines the patient is taking</Text>
                <TextInput style={s.input} value={rec.medications} onChangeText={(v) => setRec({ ...rec, medications: v })} placeholder="e.g. amlodipine 5mg" placeholderTextColor="#94a3b8" />
                <Text style={s.small}>Follow-up date (YYYY-MM-DD)</Text>
                <TextInput style={s.input} value={rec.followUpDate} onChangeText={(v) => setRec({ ...rec, followUpDate: v })} placeholder="2026-10-26" placeholderTextColor="#94a3b8" />
                {rec.followUpDate ? <TextInput style={s.input} value={rec.followUpPrompt} onChangeText={(v) => setRec({ ...rec, followUpPrompt: v })} placeholder="Check-in question for the patient" placeholderTextColor="#94a3b8" /> : null}
              </View>
            ) : null}
            {therapy && !locked ? (
              <View style={{ gap: 6 }}>
                <Text style={s.label}>Homework (sent to the client)</Text>
                {homework.map((h, i) => (
                  <View key={i} style={s.hw}>
                    <TextInput style={s.input} value={h.title} placeholder="Title" placeholderTextColor="#94a3b8" onChangeText={(v) => setHomework(homework.map((x, j) => (j === i ? { ...x, title: v } : x)))} />
                    <TextInput style={s.input} value={h.instructions} placeholder="Instructions" placeholderTextColor="#94a3b8" onChangeText={(v) => setHomework(homework.map((x, j) => (j === i ? { ...x, instructions: v } : x)))} />
                    <TouchableOpacity onPress={() => setHomework(homework.filter((_, j) => j !== i))}><Text style={{ color: '#b91c1c', fontWeight: '700' }}>Remove</Text></TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity onPress={() => setHomework([...homework, { title: '', instructions: '', dueDate: '' }])}><Text style={[s.link, { color: accent }]}>+ Add homework</Text></TouchableOpacity>
              </View>
            ) : null}
            <TouchableOpacity onPress={() => setShowTx(!showTx)}><Text style={[s.link, { color: accent }]}>{showTx ? 'Hide transcript' : 'Show transcript'}</Text></TouchableOpacity>
            {showTx ? <Text style={s.transcript}>{data.transcript || 'No transcript.'}</Text> : null}
            {msg ? <Text style={s.msg}>{msg}</Text> : null}
            {updated.map((u) => <Text key={u} style={s.msg}>✓ {u}</Text>)}
            {!locked ? (
              <TouchableOpacity disabled={busy === 'saving' || !note.trim()} onPress={save} style={[s.btn, { backgroundColor: accent }, (busy === 'saving' || !note.trim()) && { opacity: 0.5 }]}>
                <Text style={s.btnText}>{busy === 'saving' ? 'Saving…' : 'Save to record'}</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        )}
      </View></View>
    </Modal>
  );
}

/** Home screen: sessions transcribed but not saved yet. Hidden when none. */
export function SessionsToReviewMobile({ accent = '#2b5ce6' }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => { api(`${T}/unsaved`).then((r) => setRows(Array.isArray(r) ? r : [])).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!rows.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>🎙️ Sessions to review ({rows.length})</Text>
      <Text style={s.muted}>Transcribed with consent. Review the drafted notes and save them to the record.</Text>
      {rows.map((r) => (
        <TouchableOpacity key={r.id} style={s.row} onPress={() => setOpen(r.id)}>
          <View style={{ flex: 1 }}><Text style={s.rowTitle}>{r.patient}</Text><Text style={s.muted}>{r.kind === 'therapy' ? 'Therapy session' : 'Consultation'} · {new Date(r.created_at).toLocaleString()}</Text></View>
          <Text style={[s.link, { color: accent }]}>Review</Text>
        </TouchableOpacity>
      ))}
      <SessionReviewSheet id={open} visible={!!open} accent={accent} onClose={() => setOpen(null)} onSaved={load} />
    </View>
  );
}

/** Patient / client page: every transcribed session with this person. Hidden when none. */
export function PatientTranscriptsMobile({ patientId, accent = '#2b5ce6' }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const load = useCallback(() => {
    if (!patientId) return;
    api(`${T}/patient/${patientId}`).then((r) => { if (mounted.current) setRows(Array.isArray(r) ? r : []); }).catch(() => {});
  }, [patientId]);
  useEffect(() => { load(); }, [load]);
  if (!rows.length) return null;
  const toReview = rows.filter((r) => !r.savedAt).length;
  return (
    <View style={s.card}>
      <Text style={s.title}>🎙️ Transcribed sessions ({rows.length}){toReview ? ` · ${toReview} to review` : ''}</Text>
      <Text style={s.muted}>Recorded as text with consent. Open any to re-read what was said.</Text>
      {rows.map((r) => (
        <TouchableOpacity key={r.id} style={s.row} onPress={() => setOpen(r.id)}>
          <View style={{ flex: 1 }}>
            <Text style={s.rowTitle}>{r.kind === 'therapy' ? 'Therapy session' : 'Consultation'}</Text>
            <Text style={s.muted}>{new Date(r.visitAt || r.createdAt).toLocaleString()} · {r.savedAt ? 'saved' : 'not saved'}</Text>
          </View>
          <Text style={[s.link, { color: accent }]}>{r.savedAt ? 'View' : 'Review'}</Text>
        </TouchableOpacity>
      ))}
      <SessionReviewSheet id={open} visible={!!open} accent={accent} onClose={() => setOpen(null)} onSaved={load} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e4e7ee', padding: 14, marginBottom: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  muted: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  link: { fontWeight: '800', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, maxHeight: '92%' },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  close: { fontSize: 20, fontWeight: '800', color: '#475569', paddingHorizontal: 6 },
  crisis: { backgroundColor: '#fdeceb', color: '#8f1d17', borderRadius: 10, padding: 8, fontSize: 13 },
  field: { fontSize: 13, color: '#0f172a' },
  fieldLabel: { fontWeight: '800', color: '#64748b' },
  label: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 4 },
  small: { fontSize: 12, fontWeight: '700', color: '#475569' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#0f172a', backgroundColor: '#fff' },
  record: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, padding: 10, gap: 6 },
  hw: { gap: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 8 },
  transcript: { fontSize: 13, color: '#334155', backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, lineHeight: 19 },
  msg: { fontSize: 13, color: '#166534', fontWeight: '700' },
  btn: { borderRadius: 999, paddingVertical: 12, alignItems: 'center', marginTop: 6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
