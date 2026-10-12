import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { api } from '../services/apiClient';

/**
 * The QR code and 8-digit code a patient shows at a pharmacy, plus what has been
 * dispensed. Mobile twin of web Common/PrescriptionCodeCard.js — keep in step.
 *
 * The QR holds only a link with a random token. A pharmacy must be signed in to
 * do anything with it.
 *
 * Props: prescription, canManage (prescriber: "New code", "Cancel"), onChanged.
 */
const LIFECYCLE_LABEL = {
  ISSUED: 'Ready to collect',
  PARTIALLY_DISPENSED: 'Partly dispensed',
  DISPENSED: 'Fully dispensed',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

export default function PrescriptionCodeCardMobile({ prescription, canManage = false, onChanged }) {
  const rx = prescription || {};
  const [code, setCode] = useState(null);
  const [dispensings, setDispensings] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [smsInfo, setSmsInfo] = useState(null);
  const lifecycle = rx.lifecycleStatus || 'ISSUED';
  const closed = ['DISPENSED', 'CANCELLED', 'EXPIRED'].includes(lifecycle) || !!rx.deliveredAt;

  const load = useCallback(async () => {
    if (!rx.id) return;
    setError('');
    try {
      setCode(await api(`/api/v1/medical/prescriptions/${rx.id}/access-code`));
    } catch (e) {
      setError(e?.message || 'Could not load the collection code.');
    }
    api(`/api/v1/medical/prescriptions/${rx.id}/dispensings`)
      .then(d => setDispensings(Array.isArray(d) ? d : [])).catch(() => {});
    api(`/api/v1/medical/prescriptions/${rx.id}/access-code/sms`).then(setSmsInfo).catch(() => {});
  }, [rx.id]);

  // Re-send the CURRENT code by SMS (no new code is created).
  const textCode = async () => {
    setBusy(true);
    try {
      setSmsInfo(await api(`/api/v1/medical/prescriptions/${rx.id}/access-code/sms`, { method: 'POST' }));
      Alert.alert('Sent', 'The code has been sent by SMS.');
    } catch (e) { Alert.alert('Could not send', e?.message || 'Please try again.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, [load]);

  const reissue = () => Alert.alert('New code', 'Create a new code? The current code will stop working.', [
    { text: 'Keep current', style: 'cancel' },
    { text: 'New code', onPress: async () => {
      setBusy(true);
      try {
        await api(`/api/v1/medical/prescriptions/${rx.id}/access-code/reissue`, { method: 'POST' });
        await load();
        onChanged?.();
      } catch (e) { Alert.alert('Error', e?.message || 'Could not create a new code.'); }
      finally { setBusy(false); }
    } },
  ]);

  const cancel = () => Alert.alert('Cancel prescription', 'Pharmacies will no longer be able to dispense it.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Cancel prescription', style: 'destructive', onPress: async () => {
      setBusy(true);
      try {
        await api(`/api/v1/medical/prescriptions/${rx.id}/cancel`, { method: 'POST', body: {} });
        onChanged?.();
      } catch (e) { Alert.alert('Error', e?.message || 'Could not cancel the prescription.'); }
      finally { setBusy(false); }
    } },
  ]);

  const where = rx.openToAll && !rx.pharmacyId && !rx.branchId
    ? 'Open to all NessaHub pharmacies. Show this code at any of them.'
    : rx.openToAll
      ? `Being prepared by ${rx.branchName || rx.pharmacyName || 'a pharmacy'}.`
      : (rx.branchName || rx.pharmacyName) ? `Sent to ${rx.branchName || rx.pharmacyName}. Show this code there.` : 'Not sent to a pharmacy yet.';
  const shown = dispensings.filter(d => d.quantity != null || d.pickedUp);

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Collect at a pharmacy</Text>
        <Text style={[s.pill, closed && s.pillClosed]}>{LIFECYCLE_LABEL[lifecycle] || lifecycle}</Text>
      </View>
      <Text style={s.sub}>{where}</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      {!closed && !code && !error ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
      {!closed && code ? (
        <View style={s.codeRow}>
          {code.qrUrl ? <View style={s.qr}><QRCode value={code.qrUrl} size={120} /></View> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.codeLabel}>COLLECTION CODE</Text>
            <Text style={s.code}>{code.code ? `${code.code.slice(0, 4)} ${code.code.slice(4)}` : ''}</Text>
            {code.expiresAt ? <Text style={s.sub}>Valid until {new Date(code.expiresAt).toLocaleDateString()}</Text> : null}
          </View>
        </View>
      ) : null}
      {!closed && smsInfo?.smsAvailable ? (
        smsInfo.patientHasVerifiedPhone ? (
          <TouchableOpacity style={[s.btn, { alignSelf: 'flex-start' }]} disabled={busy} onPress={textCode}>
            <Text style={s.btnText}>{canManage ? 'Text the code to the patient' : 'Text me this code'}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.sub}>{canManage ? 'The patient has no verified phone for SMS yet.' : 'Verify your phone to get this code by SMS.'}</Text>
        )
      ) : null}
      {shown.length > 0 ? (
        <View style={s.disp}>
          <Text style={s.dispTitle}>Dispensed so far</Text>
          {shown.map(d => (
            <View key={d.medIndex} style={s.dispRow}>
              <Text style={s.dispText}>{d.name || 'Medicine'}</Text>
              <Text style={s.dispText}>
                {d.quantity != null ? `${Number(d.dispensed)} of ${Number(d.quantity)}${d.quantityUnit ? ` ${d.quantityUnit}` : ''}` : 'Collected'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {canManage && !closed ? (
        <View style={s.actions}>
          <TouchableOpacity style={s.btn} disabled={busy} onPress={reissue}><Text style={s.btnText}>New code</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnDanger]} disabled={busy} onPress={cancel}><Text style={[s.btnText, { color: '#b91c1c' }]}>Cancel prescription</Text></TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 12, backgroundColor: '#fff', marginTop: 10, gap: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  pill: { fontSize: 11, fontWeight: '700', color: '#047857', backgroundColor: '#ecfdf5', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
  pillClosed: { color: '#475569', backgroundColor: '#f1f5f9' },
  sub: { fontSize: 12, color: '#475569' },
  error: { fontSize: 12, color: '#b91c1c' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  qr: { padding: 6, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  codeLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.6 },
  code: { fontSize: 24, fontWeight: '900', color: '#0c4a6e', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  disp: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 6, marginTop: 4 },
  dispTitle: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 2 },
  dispRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  dispText: { fontSize: 12, color: '#475569' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  btn: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  btnDanger: { borderColor: '#fecaca' },
  btnText: { fontSize: 13, fontWeight: '700', color: '#334155' },
});
