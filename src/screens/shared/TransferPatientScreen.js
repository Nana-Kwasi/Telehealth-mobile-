import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  careCatalog, draftTransferSummary, requestTransfer, transferReasons, transferSuggestions,
} from '../../services/careTransfers';

/**
 * Transfer a patient to another doctor (or a client to another therapist) on
 * the phone. Same form and rules as the web: reason, what the patient needs,
 * a clinical summary (AI can draft it from the record for the clinician to
 * check), and who should take over — suggested best match first. The patient
 * consents first; the receiver then has 24 hours.
 *
 * Params: patientId, patientName, role ('DOCTOR' | 'THERAPIST').
 */
export default function TransferPatientScreen({ route, navigation }) {
  const { patientId, patientName, role = 'DOCTOR' } = route.params || {};
  const isDoctor = role === 'DOCTOR';
  const accent = isDoctor ? '#1e6bb8' : '#4f46e5';
  const [catalog, setCatalog] = useState(null);
  const [reasons, setReasons] = useState({});
  const [form, setForm] = useState({
    reason: '', reasonDetails: '', urgency: 'routine',
    neededSpecialty: '', neededFormat: 'individual', neededFocus: [],
    clinicalSummary: '', currentMedications: '', activeIssues: '', handoverNotes: '',
  });
  const [toId, setToId] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [ai, setAi] = useState({ busy: false, used: false, auditId: null, message: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  useEffect(() => {
    careCatalog().then(setCatalog).catch(() => setCatalog(null));
    transferReasons().then((r) => setReasons(r || {})).catch(() => setReasons({}));
  }, []);

  useEffect(() => {
    if (!patientId) return undefined;
    if (isDoctor && !form.neededSpecialty) { setSuggestions([]); return undefined; }
    let live = true;
    setLoadingSug(true);
    const t = setTimeout(() => {
      transferSuggestions({
        patientId,
        specialty: isDoctor ? form.neededSpecialty : undefined,
        format: isDoctor ? undefined : form.neededFormat,
        focus: isDoctor ? [] : form.neededFocus,
      }).then((r) => { if (live) setSuggestions(r); })
        .catch(() => { if (live) setSuggestions([]); })
        .finally(() => { if (live) setLoadingSug(false); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [patientId, isDoctor, form.neededSpecialty, form.neededFormat, form.neededFocus]);

  const shown = useMemo(() => {
    const good = suggestions.filter((s) => s.tier !== 'other');
    return good.length ? good : suggestions;
  }, [suggestions]);

  const draft = async () => {
    if (!form.reason) { setErrors((e) => ({ ...e, reason: 'Choose the reason first — the summary is written for it.' })); return; }
    setAi((a) => ({ ...a, busy: true, message: '' }));
    try {
      const r = await draftTransferSummary({
        patientId, reason: form.reason, reasonDetails: form.reasonDetails,
        needed: isDoctor ? form.neededSpecialty : form.neededFormat,
      });
      if (!r?.ok) { setAi((a) => ({ ...a, busy: false, message: r?.message || 'Could not draft the summary.' })); return; }
      setForm((f) => ({
        ...f,
        clinicalSummary: r.draft.clinicalSummary || f.clinicalSummary,
        currentMedications: r.draft.currentMedications || f.currentMedications,
        activeIssues: r.draft.activeIssues || f.activeIssues,
      }));
      setAi({ busy: false, used: true, auditId: r.aiAuditId || null, message: 'Drafted from the record — check and edit it before sending.' });
    } catch (e) {
      setAi((a) => ({ ...a, busy: false, message: e?.message || 'Could not draft the summary.' }));
    }
  };

  const submit = async () => {
    const e = {};
    if (!form.reason) e.reason = 'Choose a reason';
    if (form.reason === 'other' && !form.reasonDetails.trim()) e.reasonDetails = 'Describe the reason';
    if (isDoctor && !form.neededSpecialty) e.neededSpecialty = 'Choose the specialty the patient needs';
    if (form.clinicalSummary.trim().length < 30) e.clinicalSummary = 'Write a clinical summary of at least a few sentences';
    if (!toId) e.toId = 'Choose who should take over';
    setErrors(e);
    setServerError('');
    if (Object.keys(e).length) return;
    setSending(true);
    try {
      await requestTransfer({
        patientId, toClinicianId: toId, ...form,
        neededSpecialty: isDoctor ? form.neededSpecialty : null,
        neededFormat: isDoctor ? null : form.neededFormat,
        neededFocus: isDoctor ? [] : form.neededFocus,
        aiAssisted: ai.used, aiAuditId: ai.auditId,
      });
      navigation.goBack();
      // The Transfers screen lists it; the patient is emailed for consent.
    } catch (err) {
      setServerError(err?.message || 'The transfer could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const Chip = ({ on, label, onPress }) => (
    <TouchableOpacity onPress={onPress} style={[s.chip, on && { backgroundColor: accent, borderColor: accent }]} accessibilityState={{ selected: on }}>
      <Text style={[s.chipText, on && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  );
  const Err = ({ k }) => (errors[k] ? <Text style={s.err}>{errors[k]}</Text> : null);
  // A plain function, not a component: a component declared in render would
  // remount the TextInput on every keystroke and drop the keyboard.
  const box = (k, label, { min = 70, required = false } = {}) => (
    <View style={s.field}>
      <Text style={s.label}>{label}{required ? ' *' : ''}</Text>
      <TextInput style={[s.input, { minHeight: min }, errors[k] && s.inputErr]} multiline value={form[k]} onChangeText={(v) => set(k, v)} />
      {errors[k] ? <Text style={s.err}>{errors[k]}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f8fafc' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.h1}>Transfer {patientName || 'patient'}</Text>
        <Text style={s.muted}>
          {patientName || 'The patient'} is asked to consent first. The {isDoctor ? 'doctor' : 'therapist'} you choose then has 24 hours to accept; after that NessaHub reassigns to the best available match.
        </Text>

        <View style={s.field}>
          <Text style={s.label}>Reason for transfer *</Text>
          <View style={s.chips}>
            {Object.entries(reasons).map(([k, v]) => <Chip key={k} on={form.reason === k} label={v} onPress={() => set('reason', k)} />)}
          </View>
          <Err k="reason" />
        </View>
        {box('reasonDetails', form.reason === 'other' ? 'Describe the reason' : 'More about the reason', { required: form.reason === 'other' })}

        <View style={s.field}>
          <Text style={s.label}>Urgency *</Text>
          <View style={s.chips}>
            {[['routine', 'Routine'], ['soon', 'Soon'], ['urgent', 'Urgent']].map(([k, v]) => <Chip key={k} on={form.urgency === k} label={v} onPress={() => set('urgency', k)} />)}
          </View>
        </View>

        {isDoctor ? (
          <View style={s.field}>
            <Text style={s.label}>Specialty the patient needs *</Text>
            <View style={s.chips}>
              {(catalog?.doctorSpecialties || []).map((sp) => <Chip key={sp} on={form.neededSpecialty === sp} label={sp} onPress={() => set('neededSpecialty', sp)} />)}
            </View>
            <Err k="neededSpecialty" />
          </View>
        ) : (
          <>
            <View style={s.field}>
              <Text style={s.label}>Kind of therapy needed *</Text>
              <View style={s.chips}>
                {(catalog?.careFormats || []).filter((f) => f.value !== 'couples').map((f) => <Chip key={f.value} on={form.neededFormat === f.value} label={f.label} onPress={() => set('neededFormat', f.value)} />)}
              </View>
            </View>
            <View style={s.field}>
              <Text style={s.label}>Areas the new therapist should cover</Text>
              <View style={s.chips}>
                {(catalog?.therapyFocus || []).map((f) => {
                  const on = form.neededFocus.includes(f.value);
                  return <Chip key={f.value} on={on} label={f.label} onPress={() => set('neededFocus', on ? form.neededFocus.filter((x) => x !== f.value) : [...form.neededFocus, f.value])} />;
                })}
              </View>
              <Text style={s.small}>Leave empty to use the client's questionnaire answers.</Text>
            </View>
          </>
        )}

        <TouchableOpacity style={[s.btn, { alignSelf: 'flex-start' }]} onPress={draft} disabled={ai.busy}>
          <Ionicons name="sparkles-outline" size={16} color={accent} />
          <Text style={[s.btnText, { color: accent }]}>{ai.busy ? 'Drafting from the record…' : 'Draft summary with AI'}</Text>
        </TouchableOpacity>
        {ai.message ? <Text style={s.small}>{ai.message}</Text> : null}

        {box('clinicalSummary', 'Clinical summary for the receiving clinician', { min: 120, required: true })}
        {box('currentMedications', 'Current medications')}
        {box('activeIssues', 'Open issues, pending results, follow-ups')}
        {box('handoverNotes', 'Anything else for the new clinician')}

        <View style={s.field}>
          <Text style={s.label}>Who should take over? *</Text>
          {isDoctor && !form.neededSpecialty ? <Text style={s.small}>Choose the specialty first to see matching doctors.</Text> : null}
          {loadingSug ? <ActivityIndicator style={{ marginVertical: 8 }} /> : shown.map((o) => (
            <TouchableOpacity key={o.id} onPress={() => { setToId(o.id); setErrors((e) => ({ ...e, toId: undefined })); }}
              style={[s.option, toId === o.id && { borderColor: accent, borderWidth: 2 }]}>
              <View style={{ flex: 1 }}>
                <Text style={s.optName}>{isDoctor ? `Dr. ${o.name}` : o.name}  <Text style={s.tier}>{o.tier === 'best' ? 'Best match' : o.tier === 'close' ? 'Close match' : ''}</Text></Text>
                <Text style={s.small}>{isDoctor ? o.specialization : (o.professionalType || 'Therapist')}{o.reasons?.length ? ` · ${o.reasons.join(' · ')}` : ''}</Text>
              </View>
              <Text style={[s.score, { color: accent }]}>{o.score}%</Text>
            </TouchableOpacity>
          ))}
          {!loadingSug && !shown.length && (!isDoctor || form.neededSpecialty) ? <Text style={s.small}>No available clinician matches yet.</Text> : null}
          <Err k="toId" />
        </View>

        {serverError ? <Text style={[s.err, s.errBox]}>{serverError}</Text> : null}

        <TouchableOpacity style={[s.submit, { backgroundColor: accent }, sending && { opacity: 0.6 }]} onPress={submit} disabled={sending}>
          <Text style={s.submitText}>{sending ? 'Sending…' : 'Send for patient consent'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48 },
  h1: { fontSize: 20, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  muted: { color: '#64748b', marginBottom: 14, lineHeight: 20 },
  field: { marginBottom: 14 },
  label: { fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, backgroundColor: '#fff', textAlignVertical: 'top', color: '#0f172a' },
  inputErr: { borderColor: '#ef4444' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipText: { color: '#334155', fontSize: 13 },
  err: { color: '#b91c1c', fontSize: 13, marginTop: 4 },
  errBox: { backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, marginBottom: 10 },
  small: { color: '#64748b', fontSize: 12, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff', marginBottom: 6 },
  btnText: { fontWeight: '600' },
  option: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, backgroundColor: '#fff', marginBottom: 8 },
  optName: { fontWeight: '700', color: '#0f172a' },
  tier: { fontSize: 12, color: '#166534', fontWeight: '600' },
  score: { fontWeight: '800', marginLeft: 8 },
  submit: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
