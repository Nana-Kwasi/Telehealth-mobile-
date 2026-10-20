import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../services/apiClient';
import { normalizeDiagnosticOrderStatus } from '../utils/diagnosticOrderStatus';

/**
 * The QR code and 8-digit check-in code a patient shows at a lab or scan
 * centre. Mobile twin of web Common/DiagnosticCodeCard.js — keep in step.
 *
 * Props: order, canManage (ordering doctor / psychiatrist: "New code").
 */
export default function DiagnosticCodeCardMobile({ order, canManage = false }) {
  const o = order || {};
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [smsInfo, setSmsInfo] = useState(null);
  const status = normalizeDiagnosticOrderStatus(o.status);
  const closed = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(status);
  const isScan = String(o.centerType || o.diagnosticType || o.type || '').toLowerCase().includes('scan');
  const where = o.branchName || o.centerName || (isScan ? 'the scan centre' : 'the lab');

  const load = useCallback(async () => {
    if (!o.id || closed) return;
    setError('');
    try {
      setCode(await api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code`));
    } catch (e) {
      setError(e?.message || 'Could not load the check-in code.');
    }
    api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code/sms`).then(setSmsInfo).catch(() => {});
  }, [o.id, closed]);

  useEffect(() => { load(); }, [load]);

  const textCode = async () => {
    setBusy(true);
    try {
      setSmsInfo(await api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code/sms`, { method: 'POST' }));
      Alert.alert('Sent', 'The code has been sent by SMS.');
    } catch (e) { Alert.alert('Could not send', e?.message || 'Please try again.'); }
    finally { setBusy(false); }
  };

  const reissue = () => Alert.alert('New code', 'Create a new code? The current code will stop working.', [
    { text: 'Keep current', style: 'cancel' },
    { text: 'New code', onPress: async () => {
      setBusy(true);
      try {
        await api(`/api/v1/diagnostics/operations/orders/${o.id}/access-code/reissue`, { method: 'POST' });
        await load();
      } catch (e) { Alert.alert('Error', e?.message || 'Could not create a new code.'); }
      finally { setBusy(false); }
    } },
  ]);

  if (closed) return null;
  const accent = isScan ? '#4c1d95' : '#065f46';

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Check in at {isScan ? 'the scan centre' : 'the lab'}</Text>
        <Text style={[s.pill, o.checkedInAt ? s.pillOk : null]}>{o.checkedInAt ? 'Checked in' : 'Not checked in'}</Text>
      </View>
      <Text style={s.sub}>
        {canManage
          ? `The patient shows this code at ${where}. Staff scan or type it to check them in before the test.`
          : `Show this code at ${where}. Staff scan or type it to check you in. Bring your ID too.`}
      </Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!code && !error ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
      {code ? (
        <View style={s.codeRow}>
          {code.qrUrl ? <View style={s.qr}><QRCode value={code.qrUrl} size={120} /></View> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.codeLabel}>CHECK-IN CODE</Text>
            <Text style={[s.code, { color: accent }]}>{code.code ? `${code.code.slice(0, 4)} ${code.code.slice(4)}` : ''}</Text>
          </View>
        </View>
      ) : null}
      {smsInfo?.smsAvailable ? (
        smsInfo.patientHasVerifiedPhone ? (
          <TouchableOpacity style={[s.btn, { alignSelf: 'flex-start' }]} disabled={busy} onPress={textCode}>
            <Text style={s.btnText}>{canManage ? 'Text the code to the patient' : 'Text me this code'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.sub}>{canManage ? 'The patient has no verified phone for SMS yet.' : 'Verify your phone in Settings to get this code by SMS.'}</Text>
        )
      ) : null}
      {canManage ? (
        <TouchableOpacity style={[s.btn, { alignSelf: 'flex-start' }]} disabled={busy} onPress={reissue}>
          <Text style={s.btnText}>New code</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#fff', marginBottom: 12, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: '#0f172a', flexShrink: 1 },
  pill: { fontSize: 11, fontWeight: '700', color: '#1e40af', backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  pillOk: { color: '#047857', backgroundColor: '#ecfdf5' },
  sub: { fontSize: 12, color: '#475569', lineHeight: 17 },
  error: { fontSize: 12, color: '#b91c1c' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  qr: { padding: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  codeLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.6 },
  code: { fontSize: 24, fontWeight: '900', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  btn: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  btnText: { fontSize: 13, fontWeight: '700', color: '#334155' },
});
