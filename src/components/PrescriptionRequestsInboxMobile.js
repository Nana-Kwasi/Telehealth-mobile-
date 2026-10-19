import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * Prescription Requests for doctors and psychiatrists (mobile). Twin of web
 * Common/PrescriptionRequestsInbox.js — keep in step. Approving opens the
 * normal prescription form pre-filled; nothing is issued from here.
 *
 * Props: rxRoute — the prescriptions screen in this drawer
 * ('DoctorPrescriptions' or 'TherapistPrescriptions').
 */
const FILTERS = [['open', 'Open'], ['APPROVED', 'Approved'], ['DECLINED', 'Declined'], ['all', 'All']];
const STATUS = {
  PENDING_REVIEW: 'New', UNDER_REVIEW: 'Reviewing', NEEDS_CLARIFICATION: 'Waiting for patient',
  APPROVED: 'Approved', DECLINED: 'Declined', CANCELLED: 'Closed', EXPIRED: 'Expired',
};

export default function PrescriptionRequestsInboxMobile({ rxRoute }) {
  const navigation = useNavigation();
  const [filter, setFilter] = useState('open');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/v1/medical/prescription-requests/inbox?status=${encodeURIComponent(filter)}`);
      setRows(Array.isArray(d) ? d : []);
    } catch (e) { setError(e?.message || 'Could not load requests.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [filter]);

  useEffect(() => { setLoading(true); load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const open = async (r) => {
    setError(''); setText('');
    try {
      const pending = r.status === 'PENDING_REVIEW';
      setSelected(await api(`/api/v1/medical/prescription-requests/${r.id}${pending ? '/review' : ''}`, pending ? { method: 'POST' } : undefined));
      if (pending) load();
    } catch (e) { setError(e?.message || 'Could not open the request.'); }
  };

  const act = async (path, body) => {
    setBusy(true); setError('');
    try {
      setSelected(await api(`/api/v1/medical/prescription-requests/${selected.id}/${path}`, { method: 'POST', body }));
      setText(''); load();
    } catch (e) { setError(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  const approve = () => navigation.navigate(rxRoute, {
    openRxForm: true,
    presetPatientId: selected.patientId,
    presetPatientName: selected.patientName || '',
    presetMedications: (selected.items || []).map(i => ({ name: i.name, strength: i.strength || '' })),
    requestId: selected.id,
  });

  if (selected) {
    const isOpen = ['PENDING_REVIEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'].includes(selected.status);
    const flags = selected.safety?.flags || [];
    return (
      <ScrollView showsVerticalScrollIndicator={false} style={s.container} contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <TouchableOpacity onPress={() => { setSelected(null); load(); }}><Text style={s.link}>← All requests</Text></TouchableOpacity>
        <Text style={s.h1}>{selected.patientName || 'Patient'}</Text>
        <Text style={s.sub}>
          {selected.type === 'REFILL' ? 'Refill request' : 'New prescription request'} · {STATUS[selected.status]} · {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : ''}
        </Text>
        {selected.urgentFlag ? (
          <View style={[s.box, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <Text style={{ color: '#991b1b', fontWeight: '700' }}>The patient's words may describe an emergency or self-harm. They were shown emergency guidance; please contact them directly.</Text>
          </View>
        ) : null}
        <View style={s.box}>
          <Text style={s.label}>Requested</Text>
          {(selected.items || []).length === 0 ? <Text style={s.sub}>No medicine named.</Text> : selected.items.map((i, k) => (
            <Text key={k} style={s.line}>• {i.name}{i.strength ? ` ${i.strength}` : ''}{i.decision ? ` (${i.decision === 'approved' ? 'approved' : 'not included'})` : ''}</Text>
          ))}
          {selected.message ? <Text style={[s.line, { marginTop: 6, fontStyle: 'italic' }]}>"{selected.message}"</Text> : null}
          {selected.clarificationQuestion ? (
            <Text style={[s.line, { marginTop: 6 }]}>You asked: {selected.clarificationQuestion}{'\n'}Patient: {selected.patientReply || 'no reply yet'}</Text>
          ) : null}
          {selected.decisionNotes ? <Text style={[s.line, { marginTop: 6 }]}>Decision: {selected.decisionNotes}</Text> : null}
        </View>
        {flags.length > 0 || selected.safety?.allergyWarning ? (
          <View style={[s.box, { backgroundColor: '#fffbeb', borderColor: '#fde68a' }]}>
            <Text style={[s.label, { color: '#92400e' }]}>Safety check</Text>
            {flags.map((f, k) => <Text key={k} style={s.line}>• [{f.severity}] {f.message}</Text>)}
            {selected.safety?.allergyWarning ? <Text style={s.line}>• {selected.safety.allergyWarning}</Text> : null}
          </View>
        ) : null}
        {(selected.prescriptionHistory || []).length > 0 ? (
          <View style={s.box}>
            <Text style={s.label}>Previous prescriptions</Text>
            {selected.prescriptionHistory.slice(0, 6).map(h => (
              <Text key={h.id} style={[s.line, h.matchesRequest && { backgroundColor: '#f0fdf4' }]}>
                • {(h.medications || []).map(m => [m.name, m.strength, m.dosage, m.frequency].filter(Boolean).join(' ')).join('; ') || '—'} · {h.prescriberName || ''} · {h.createdAt ? new Date(h.createdAt).toLocaleDateString() : ''}
              </Text>
            ))}
          </View>
        ) : null}
        {error ? <Text style={s.error}>{error}</Text> : null}
        {isOpen ? (
          <View style={{ gap: 8 }}>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#047857' }]} onPress={approve} disabled={busy}>
              <Text style={s.btnText}>Approve — open prescription form</Text>
            </TouchableOpacity>
            <TextInput style={s.input} multiline value={text} onChangeText={setText}
              placeholder="Question for the patient, or reason for declining" placeholderTextColor="#94a3b8" />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#1d4ed8' }, !text.trim() && { opacity: 0.5 }]} disabled={busy || !text.trim()} onPress={() => act('clarification', { text })}>
                <Text style={s.btnText}>Ask the patient</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.outline, { flex: 1 }, !text.trim() && { opacity: 0.5 }]} disabled={busy || !text.trim()} onPress={() => act('decline', { text })}>
                <Text style={[s.btnText, { color: '#b91c1c' }]}>Decline</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[s.btn, s.outline, { borderColor: '#e2e8f0' }]} disabled={busy} onPress={() => act('cancel', { text: text || null })}>
              <Text style={[s.btnText, { color: '#475569' }]}>Close as duplicate</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={s.container} contentContainerStyle={{ padding: 16, gap: 8 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}>
      <Text style={s.h1}>Prescription Requests</Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
        {FILTERS.map(([k, l]) => (
          <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[s.chip, filter === k && s.chipOn]}>
            <Text style={[s.chipText, filter === k && { color: '#fff' }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator /> : rows.length === 0 ? <Text style={s.sub}>No requests here.</Text> : rows.map(r => (
        <TouchableOpacity key={r.id} style={[s.box, r.urgentFlag && ['PENDING_REVIEW', 'UNDER_REVIEW'].includes(r.status) && { borderColor: '#fca5a5' }]} onPress={() => open(r)}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '700', color: '#0f172a' }}>{r.patientName || 'Patient'}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: r.urgentFlag ? '#b91c1c' : '#475569' }}>{r.urgentFlag ? 'URGENT · ' : ''}{STATUS[r.status] || r.status}</Text>
          </View>
          <Text style={s.sub}>{r.type === 'REFILL' ? 'Refill' : 'New prescription'} · {(r.items || []).map(i => i.name).join(', ') || 'see message'}</Text>
          <Text style={[s.sub, { fontSize: 11 }]}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  h1: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 12.5, color: '#64748b' },
  link: { color: '#1d4ed8', fontWeight: '700' },
  box: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, gap: 2 },
  label: { fontWeight: '700', color: '#0f172a', marginBottom: 2 },
  line: { fontSize: 13, color: '#334155' },
  error: { color: '#b91c1c', fontSize: 13 },
  btn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  outline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fecaca' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, minHeight: 60, color: '#0f172a' },
  chip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  chipText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
});
