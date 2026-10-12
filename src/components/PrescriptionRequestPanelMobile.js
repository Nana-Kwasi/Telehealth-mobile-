import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { api } from '../services/apiClient';
import PhoneForSmsMobile from './PhoneForSmsMobile';

/**
 * Patient / psychiatry-client prescription requests (mobile). Twin of web
 * Common/PrescriptionRequestPanel.js — keep in step: My doctor (patients),
 * Request a prescription (refill / new), My requests (reply, withdraw).
 */
const STATUS = {
  PENDING_REVIEW: ['Sent', '#1d4ed8'], UNDER_REVIEW: ['Being reviewed', '#1d4ed8'],
  NEEDS_CLARIFICATION: ['Your clinician has a question', '#b45309'], APPROVED: ['Approved — prescription issued', '#047857'],
  DECLINED: ['Not approved', '#b91c1c'], CANCELLED: ['Closed', '#64748b'], EXPIRED: ['Expired', '#64748b'],
};

function Choice({ label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.choice, active && s.choiceOn]}>
      <Text style={[s.choiceText, active && { color: '#0c4a6e' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PrescriptionRequestPanelMobile({ onChanged }) {
  const [opts, setOpts] = useState(null);
  const [mine, setMine] = useState([]);
  const [myDoctor, setMyDoctor] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('REFILL');
  const [sourceId, setSourceId] = useState('');
  const [items, setItems] = useState([{ name: '', strength: '' }]);
  const [message, setMessage] = useState('');
  const [clinicianId, setClinicianId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replies, setReplies] = useState({});
  const isPatient = opts?.kind === 'PATIENT';

  const load = useCallback(async () => {
    const [o, m] = await Promise.all([
      api('/api/v1/medical/prescription-requests/options').catch(() => null),
      api('/api/v1/medical/prescription-requests/mine').catch(() => []),
    ]);
    setOpts(o);
    setMine(Array.isArray(m) ? m : []);
    if (o?.kind === 'PATIENT') setMyDoctor(await api('/api/v1/medical/my-doctor').catch(() => null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const chooseDoctor = async (id) => {
    setBusy(true);
    try { setMyDoctor(await api('/api/v1/medical/my-doctor', { method: 'PUT', body: { doctorId: id } })); await load(); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not save your doctor.'); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await api('/api/v1/medical/prescription-requests', {
        method: 'POST',
        body: {
          type,
          sourcePrescriptionId: type === 'REFILL' && sourceId ? sourceId : null,
          items: items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), strength: i.strength.trim() || null })),
          message: message.trim() || null,
          clinicianId: clinicianId || null,
        },
      });
      if (res?.guidance) Alert.alert('Please get help now', res.guidance);
      else Alert.alert('Request sent', 'Your clinician will review it. You will be notified here.');
      setShowForm(false); setItems([{ name: '', strength: '' }]); setMessage(''); setSourceId('');
      await load();
      onChanged?.();
    } catch (e) { setError(e?.message || 'Could not send your request.'); }
    finally { setBusy(false); }
  };

  const reply = async (id) => {
    const text = (replies[id] || '').trim();
    if (!text) return;
    try { await api(`/api/v1/medical/prescription-requests/${id}/reply`, { method: 'POST', body: { text } }); setReplies(r => ({ ...r, [id]: '' })); await load(); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not send your answer.'); }
  };

  const withdraw = (id) => Alert.alert('Withdraw request?', '', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Withdraw', style: 'destructive', onPress: async () => {
      try { await api(`/api/v1/medical/prescription-requests/${id}/withdraw`, { method: 'POST' }); await load(); }
      catch (e) { Alert.alert('Error', e?.message || 'Could not withdraw.'); }
    } },
  ]);

  if (!opts) return null;
  const candidates = myDoctor?.candidates || [];
  const clinicians = opts.clinicians || [];

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 12, gap: 10 }}>
      {/* Verified phone for SMS codes and updates (hidden until SMS is set up). */}
      <PhoneForSmsMobile />
      <View style={s.card}>
        <Text style={s.title}>Need a refill or a new prescription?</Text>
        {isPatient ? <Text style={s.sub}>My doctor: {myDoctor?.primary?.name || 'not chosen yet'}</Text> : null}
        {!opts.eligible ? <Text style={[s.sub, { color: '#92400e', marginTop: 4 }]}>{opts.reason}</Text> : null}

        {isPatient && candidates.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            <Text style={s.sub}>{myDoctor?.primary ? 'Change doctor:' : 'Choose your doctor:'}</Text>
            <View style={s.wrap}>
              {candidates.map(c => (
                <Choice key={c.id} label={c.name || 'Doctor'} active={myDoctor?.primary?.id === c.id} onPress={() => !busy && chooseDoctor(c.id)} />
              ))}
            </View>
            <Text style={[s.sub, { fontSize: 11 }]}>New requests go to this doctor. Refills go to whoever wrote the prescription.</Text>
          </View>
        ) : null}

        {opts.eligible && !showForm ? (
          <TouchableOpacity style={[s.btn, { backgroundColor: '#047857', marginTop: 8 }]} onPress={() => setShowForm(true)}>
            <Text style={s.btnText}>Request a prescription</Text>
          </TouchableOpacity>
        ) : null}

        {showForm ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <View style={s.wrap}>
              <Choice label="Refill one I have" active={type === 'REFILL'} onPress={() => setType('REFILL')} />
              <Choice label="Ask for a new one" active={type === 'NEW_PRESCRIPTION'} onPress={() => setType('NEW_PRESCRIPTION')} />
            </View>
            {type === 'REFILL' && (opts.refillable || []).length > 0 ? (
              <View>
                <Text style={s.sub}>Which prescription? (optional)</Text>
                {(opts.refillable || []).slice(0, 8).map(r => (
                  <Choice key={r.prescriptionId} active={sourceId === r.prescriptionId}
                    label={`${(r.medications || []).join(', ') || 'Prescription'} · ${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}`}
                    onPress={() => setSourceId(sourceId === r.prescriptionId ? '' : r.prescriptionId)} />
                ))}
              </View>
            ) : null}
            {type === 'NEW_PRESCRIPTION' || !sourceId ? (
              <View style={{ gap: 6 }}>
                <Text style={s.sub}>Medicines (name and strength if you know it)</Text>
                {items.map((it, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 6 }}>
                    <TextInput style={[s.input, { flex: 2 }]} placeholder="e.g. Amlodipine" placeholderTextColor="#94a3b8" value={it.name}
                      onChangeText={v => setItems(arr => arr.map((x, k) => k === i ? { ...x, name: v } : x))} />
                    <TextInput style={[s.input, { flex: 1 }]} placeholder="5mg" placeholderTextColor="#94a3b8" value={it.strength}
                      onChangeText={v => setItems(arr => arr.map((x, k) => k === i ? { ...x, strength: v } : x))} />
                  </View>
                ))}
                {items.length < 10 ? (
                  <TouchableOpacity onPress={() => setItems(arr => [...arr, { name: '', strength: '' }])}>
                    <Text style={{ color: '#0369a1', fontWeight: '700' }}>+ Add medicine</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <TextInput style={[s.input, { minHeight: 70 }]} multiline placeholder="Anything your clinician should know (optional)"
              placeholderTextColor="#94a3b8" value={message} onChangeText={setMessage} />
            {opts.needsChoice && !isPatient && clinicians.length > 1 ? (
              <View>
                <Text style={s.sub}>Which therapist should review this?</Text>
                <View style={s.wrap}>{clinicians.map(c => <Choice key={c.id} label={c.name} active={clinicianId === c.id} onPress={() => setClinicianId(c.id)} />)}</View>
              </View>
            ) : null}
            <Text style={[s.sub, { fontSize: 11 }]}>Your clinician reviews every request; nothing is issued automatically. If you feel unwell right now, contact emergency services.</Text>
            {error ? <Text style={{ color: '#b91c1c', fontSize: 13 }}>{error}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#047857' }]} disabled={busy} onPress={submit}>
                <Text style={s.btnText}>{busy ? 'Sending…' : 'Send request'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, s.outline, { flex: 1 }]} onPress={() => { setShowForm(false); setError(''); }}>
                <Text style={[s.btnText, { color: '#475569' }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      {mine.length > 0 ? (
        <View style={s.card}>
          <Text style={s.title}>My requests</Text>
          {mine.slice(0, 10).map(r => {
            const [label, color] = STATUS[r.status] || [r.status, '#475569'];
            const open = ['PENDING_REVIEW', 'UNDER_REVIEW', 'NEEDS_CLARIFICATION'].includes(r.status);
            return (
              <View key={r.id} style={s.row}>
                <Text style={s.line}>{r.type === 'REFILL' ? 'Refill' : 'New prescription'}: {(r.items || []).map(i => i.name).join(', ') || 'see message'}</Text>
                <Text style={{ color, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
                <Text style={[s.sub, { fontSize: 11 }]}>To {r.clinicianName || 'your clinician'} · {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}</Text>
                {r.decisionNotes ? <Text style={s.line}>{r.decisionNotes}</Text> : null}
                {r.status === 'NEEDS_CLARIFICATION' ? (
                  <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={[s.line, { color: '#92400e' }]}>Question: {r.clarificationQuestion}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      <TextInput style={[s.input, { flex: 1 }]} placeholder="Your answer" placeholderTextColor="#94a3b8"
                        value={replies[r.id] || ''} onChangeText={v => setReplies(x => ({ ...x, [r.id]: v }))} />
                      <TouchableOpacity style={[s.btn, { backgroundColor: '#1d4ed8', paddingHorizontal: 14 }]} onPress={() => reply(r.id)}>
                        <Text style={s.btnText}>Send</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                {open ? <TouchableOpacity onPress={() => withdraw(r.id)}><Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Withdraw</Text></TouchableOpacity> : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, gap: 2 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  sub: { fontSize: 12.5, color: '#64748b' },
  line: { fontSize: 13, color: '#334155' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 4 },
  choice: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, backgroundColor: '#fff', marginBottom: 4 },
  choiceOn: { borderColor: '#0369a1', backgroundColor: '#e0f2fe' },
  choiceText: { fontSize: 12.5, fontWeight: '600', color: '#475569' },
  input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, color: '#0f172a', backgroundColor: '#fff' },
  btn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  outline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  row: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingVertical: 8, gap: 2 },
});
