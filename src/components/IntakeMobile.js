import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/apiClient';
import { s } from './PsychRecordMobile';

/*
 * Intake packets on mobile.
 *  - ShareIntakeMobile: the clinician picks forms and questionnaires for a client.
 *  - MyIntakeFormsMobile: the client reads and signs each form (Home screen).
 */

function Check({ on, label, onPress, accent }) {
  return (
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: accent, backgroundColor: on ? accent : '#fff', alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>✓</Text> : null}
      </View>
      <Text style={[s.detail, { marginTop: 0, flex: 1 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ShareIntakeMobile({ clientId, clientName, onClose, onSent, accent = '#4f46e5' }) {
  const [catalog, setCatalog] = useState(null);
  const [docs, setDocs] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/v1/intake/catalog').then((c) => { setCatalog(c); setDocs(c.documents.map((d) => d.key)); })
      .catch((e) => setError(e?.message || 'Could not load the forms.'));
  }, []);
  const toggle = (list, set, k) => set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
  const send = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/api/v1/intake/packets', { method: 'POST', body: { clientId, documents: docs, measures, message } });
      onSent && onSent(r); onClose();
    } catch (e) { setError(e?.message || 'Could not send.'); setBusy(false); }
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>Send forms to {clientName || 'this client'}</Text>
      {!catalog ? <Text style={s.muted}>{error || 'Loading…'}</Text> : (
        <>
          <Text style={s.muted}>Forms to read and sign</Text>
          {catalog.documents.map((d) => <Check key={d.key} accent={accent} label={d.title} on={docs.includes(d.key)} onPress={() => toggle(docs, setDocs, d.key)} />)}
          <Text style={[s.muted, { marginTop: 8 }]}>Questionnaires</Text>
          {catalog.measures.map((m) => <Check key={m.code} accent={accent} label={`${m.name} (${m.purpose})`} on={measures.includes(m.code)} onPress={() => toggle(measures, setMeasures, m.code)} />)}
          <TextInput style={s.input} placeholder="Message (optional)" value={message} onChangeText={setMessage} multiline />
          {error ? <Text style={s.err}>{error}</Text> : null}
          <View style={s.actions}>
            <TouchableOpacity onPress={onClose}><Text style={[s.link, { color: accent }]}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: accent }, (busy || (!docs.length && !measures.length)) && { opacity: 0.5 }]}
              disabled={busy || (!docs.length && !measures.length)} onPress={send}>
              <Text style={s.btnText}>{busy ? 'Sending…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

export function MyIntakeFormsMobile({ accent = '#4f46e5' }) {
  const [packets, setPackets] = useState([]);
  const [reading, setReading] = useState(null);
  const load = useCallback(() => {
    api('/api/v1/intake/mine').then((p) => setPackets(Array.isArray(p) ? p : [])).catch(() => setPackets([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (reading) return <SignMobile packet={reading.packet} doc={reading.doc} accent={accent} onClose={() => setReading(null)} onSigned={() => { setReading(null); load(); }} />;
  if (!packets.length) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>Forms to read and sign</Text>
      {packets.map((p) => (
        <View key={p.id}>
          <Text style={s.muted}>From {p.clinician_name || 'your clinician'}{p.message ? `: “${p.message}”` : ''}</Text>
          {p.documents.map((d) => (
            <View key={d.key} style={[s.row, { alignItems: 'center' }]}>
              <Text style={[s.detail, { flex: 1, marginTop: 0 }]}>{d.title}</Text>
              {d.signedAt ? <Text style={s.ok}>Signed</Text> : (
                <TouchableOpacity style={[s.btn, { backgroundColor: accent, marginTop: 0 }]} onPress={() => setReading({ packet: p, doc: d })}>
                  <Text style={s.btnText}>Read and sign</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SignMobile({ packet, doc, accent, onClose, onSigned }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sign = async () => {
    setBusy(true); setError('');
    try {
      await api(`/api/v1/intake/packets/${packet.id}/sign`, { method: 'POST', body: { document: doc.key, signedName: name, platform: Platform.OS === 'ios' ? 'ios' : 'android' } });
      onSigned();
    } catch (e) { setError(e?.message || 'Could not sign.'); setBusy(false); }
  };
  const ready = agree && name.trim().length >= 2 && !busy;
  return (
    <View style={s.card}>
      <Text style={s.title}>{doc.title}</Text>
      {doc.paragraphs.map((p, i) => <Text key={i} style={[s.detail, { lineHeight: 20 }]}>{p}</Text>)}
      <Check accent={accent} on={agree} onPress={() => setAgree(!agree)} label="I have read this and I agree to it." />
      <TextInput style={s.input} placeholder="Type your full name to sign" value={name} onChangeText={setName} autoComplete="name" />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}>
        <TouchableOpacity onPress={onClose}><Text style={[s.link, { color: accent }]}>Later</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }, !ready && { opacity: 0.5 }]} disabled={!ready} onPress={sign}>
          <Text style={s.btnText}>{busy ? 'Signing…' : 'Sign'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
