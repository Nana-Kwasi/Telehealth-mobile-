import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { api } from '../services/apiClient';

/**
 * Verify the phone number used for SMS. Mobile twin of web
 * Common/PhoneForSms.js. Hidden while SMS is not set up on NessaHub.
 */
export default function PhoneForSmsMobile({ onVerified, embedded = false }) {
  const [status, setStatus] = useState(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api('/api/v1/me/phone').then(s => { setStatus(s); if (s?.suggestedPhone) setPhone(String(s.suggestedPhone)); }).catch(() => {});
  }, []);

  if (!status?.smsAvailable) return null;

  const start = async () => {
    setBusy(true); setError('');
    try { const r = await api('/api/v1/me/phone/verify/start', { method: 'POST', body: { phone } }); setSentTo(r.sentTo); }
    catch (e) { setError(e?.message || 'Could not send the code.'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true); setError('');
    try { const st = await api('/api/v1/me/phone/verify/confirm', { method: 'POST', body: { code } }); setStatus(st); setSentTo(''); setCode(''); setEditing(false); onVerified?.(st); }
    catch (e) { setError(e?.message || 'Could not verify the code.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={embedded ? null : s.box}>
      {status.verified && !editing ? (
        <Text style={s.text}>📱 Codes and updates are texted to {status.phone}.{' '}
          <Text style={s.link} onPress={() => setEditing(true)}>Change</Text>
        </Text>
      ) : sentTo ? (
        <View style={{ gap: 6 }}>
          <Text style={s.text}>Enter the 6-digit code sent to {sentTo}</Text>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1, letterSpacing: 4 }]} keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode} />
            <TouchableOpacity style={s.btn} disabled={busy || code.length < 6} onPress={confirm}><Text style={s.btnText}>Verify</Text></TouchableOpacity>
          </View>
          <Text style={s.link} onPress={() => setSentTo('')}>Use another number</Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={s.text}>Get your prescription codes by SMS</Text>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} keyboardType="phone-pad" placeholder="024 123 4567" placeholderTextColor="#94a3b8" value={phone} onChangeText={setPhone} />
            <TouchableOpacity style={s.btn} disabled={busy || !phone.trim()} onPress={start}><Text style={s.btnText}>Send code</Text></TouchableOpacity>
          </View>
        </View>
      )}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: '#f0fdfa', borderWidth: 1.5, borderColor: '#99f6e4', borderRadius: 12, padding: 12 },
  text: { fontSize: 13, color: '#134e4a' },
  link: { color: '#0f766e', fontWeight: '700', fontSize: 13 },
  row: { flexDirection: 'row', gap: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, color: '#0f172a' },
  btn: { backgroundColor: '#0f766e', borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
  error: { color: '#b91c1c', fontSize: 12.5, marginTop: 4 },
});
