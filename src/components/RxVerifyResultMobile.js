import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * QR / 8-digit prescription codes are checked by the server
 * (POST /api/v1/pharmacy/prescriptions/verify). Mobile twin of web
 * Pharmacy/PrescriptionCodeVerify.js — keep the result handling in step.
 */

/** A NessaHub collection code: the QR link, or 8 digits (spaces/dashes allowed). */
export function isNessaRxCode(value) {
  const v = String(value || '').trim();
  return v.includes('/rx/') || /^\d{4}[\s-]?\d{4}$/.test(v);
}

/** Never uppercase the input: the QR token is case-sensitive. */
export async function verifyRxCode(raw) {
  return api('/api/v1/pharmacy/prescriptions/verify', { method: 'POST', body: { code: String(raw || '').trim() } });
}

const TONE = {
  YOURS: ['#ecfdf5', '#a7f3d0', '#065f46'],
  OPEN: ['#eff6ff', '#bfdbfe', '#1e40af'],
  DISPENSED: ['#f8fafc', '#e2e8f0', '#334155'],
  TAKEN: ['#fffbeb', '#fde68a', '#92400e'],
  NOT_YOUR_PHARMACY: ['#fffbeb', '#fde68a', '#92400e'],
  REVOKED: ['#fff7ed', '#fed7aa', '#9a3412'],
};
const BAD = ['#fef2f2', '#fecaca', '#991b1b'];

export default function RxVerifyResultMobile({ result, rxOpsRoute, onRefresh }) {
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);
  if (!result) return null;
  const [bg, border, color] = TONE[result.result] || BAD;
  const meds = result.prescription?.medications || [];

  const take = async () => {
    setBusy(true);
    try {
      await api(`/api/v1/pharmacy/open-prescriptions/${result.prescriptionId}/take`, { method: 'POST', body: {} });
      navigation.navigate(rxOpsRoute, { rxId: result.prescriptionId });
    } catch (e) {
      Alert.alert('Could not take it', e?.message || 'Please try again.');
      onRefresh?.();
    } finally { setBusy(false); }
  };

  return (
    <View style={[s.box, { backgroundColor: bg, borderColor: border }]}>
      <Text style={[s.msg, { color }]}>{result.message}</Text>
      {result.prescriptionRef ? <Text style={s.ref}>Ref {result.prescriptionRef}</Text> : null}

      {result.result === 'OPEN' ? (
        <>
          {meds.map((m, i) => (
            <Text key={i} style={s.line}>
              • {m.name}{m.strength ? ` ${m.strength}` : ''}{m.quantity ? ` · ${m.quantity}${m.quantityUnit ? ` ${m.quantityUnit}` : ''}` : ''}
            </Text>
          ))}
          {result.prescription?.patientCity ? <Text style={s.ref}>Patient's city: {result.prescription.patientCity}</Text> : null}
          {result.canTake ? (
            <TouchableOpacity style={[s.btn, { backgroundColor: '#1d4ed8' }]} onPress={take} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Take this prescription</Text>}
            </TouchableOpacity>
          ) : <Text style={s.ref}>Only approved pharmacies can take open prescriptions.</Text>}
        </>
      ) : null}

      {result.result === 'YOURS' ? (
        <>
          {(result.dispensings || []).filter(d => d.quantity != null).map(d => (
            <Text key={d.medIndex} style={s.line}>• {d.name}: {Number(d.remaining)} of {Number(d.quantity)} left</Text>
          ))}
          <TouchableOpacity style={[s.btn, { backgroundColor: '#0f766e' }]}
            onPress={() => navigation.navigate(rxOpsRoute, { rxId: result.prescriptionId })}>
            <Text style={s.btnText}>Open prescription</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 1.5, borderRadius: 12, padding: 12, marginTop: 14, gap: 4 },
  msg: { fontSize: 14, fontWeight: '700' },
  ref: { fontSize: 12, color: '#64748b' },
  line: { fontSize: 13, color: '#334155' },
  btn: { marginTop: 8, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
