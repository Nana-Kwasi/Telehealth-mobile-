import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * A patient's payments with "Request a refund". Before sending, the patient sees
 * what the refund policy gives (full, partial, review, or none) — same rules as
 * the web.
 */
const GHS = (v) => `GHS ${Number(v || 0).toFixed(2)}`;
const fmt = (v) => (v ? new Date(v).toLocaleDateString() : '');
const SERVICE = { consultation: 'Doctor consultation', therapy: 'Therapy session', psychiatry: 'Psychiatry', other: 'Payment' };
const REFUND = { UNDER_REVIEW: ['Under review', '#d97706'], APPROVED: ['Approved', '#4f46e5'], PROCESSING: ['Being sent', '#0891b2'], REFUNDED: ['Refunded', '#16a34a'], DECLINED: ['Declined', '#64748b'], FAILED: ['Delayed', '#d97706'] };
const POLICY = 'https://policy.nessahub.com/policy.html?slug=refund-cancellation-policy';

export default function PaymentsAndRefunds({ accent = '#1e6bb8' }) {
  const [payments, setPayments] = useState(null);
  const [reasons, setReasons] = useState({});
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    api('/api/v1/finance/my-payments').then(setPayments).catch(() => setPayments([]));
  }, []);
  useEffect(() => { api('/api/v1/finance/refunds/reasons').then(setReasons).catch(() => setReasons({})); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!payments || payments.length === 0) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>Payments and refunds</Text>
      <Text style={s.small}>Cancel at least 24 hours before for a full refund; later cancellations may get part back.</Text>
      <TouchableOpacity onPress={() => Linking.openURL(POLICY)}><Text style={[s.link, { color: accent }]}>Refund & cancellation policy</Text></TouchableOpacity>
      {payments.map((p) => {
        const [label, color] = REFUND[p.refundStatus] || [];
        const left = Number(p.paid) - Number(p.refunded);
        const canAsk = !p.free && left > 0 && !['UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(p.refundStatus);
        return (
          <View key={p.reference} style={s.item}>
            <View style={s.row}>
              <Text style={s.bold}>{SERVICE[p.serviceType] || 'Payment'}{p.providerName ? ` with ${p.providerName}` : ''}</Text>
              {label ? <Text style={[s.badge, { backgroundColor: color }]}>{label}</Text> : null}
            </View>
            <Text style={s.small}>Paid {GHS(p.paid)} on {fmt(p.paidAt)}{p.serviceAt ? ` · session ${fmt(p.serviceAt)}` : ''}</Text>
            {Number(p.refunded) > 0 ? <Text style={s.small}>Refunded {GHS(p.refunded)}</Text> : null}
            {canAsk ? (open === p.reference
              ? <RefundForm p={p} reasons={reasons} accent={accent} onDone={() => { setOpen(null); load(); }} onCancel={() => setOpen(null)} />
              : <TouchableOpacity onPress={() => setOpen(p.reference)}><Text style={[s.link, { color: accent }]}>Request a refund</Text></TouchableOpacity>) : null}
          </View>
        );
      })}
    </View>
  );
}

function RefundForm({ p, reasons, accent, onDone, onCancel }) {
  const [reason, setReason] = useState('CHANGE_OF_MIND');
  const [details, setDetails] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPreview(null);
    api(`/api/v1/finance/refunds/preview?reference=${encodeURIComponent(p.reference)}&reason=${reason}`)
      .then(setPreview).catch((e) => setPreview({ outcome: 'NONE', note: e?.message, amount: 0 }));
  }, [p.reference, reason]);
  const send = async () => {
    setBusy(true); setError('');
    try { await api('/api/v1/finance/refunds', { method: 'POST', body: { reference: p.reference, reason, details } }); onDone(); }
    catch (e) { setError(e?.message || 'Could not send.'); } finally { setBusy(false); }
  };
  const needsDetails = reason !== 'CHANGE_OF_MIND';
  const head = !preview ? 'Checking…' : preview.outcome === 'FULL' ? `You will be refunded ${GHS(preview.amount)} in full.`
    : preview.outcome === 'PARTIAL' ? `You will be refunded ${GHS(preview.amount)}.`
      : preview.outcome === 'REVIEW' ? 'Our team will review this.' : 'This cannot be refunded.';
  const disabled = busy || !preview || preview.outcome === 'NONE' || (needsDetails && !details.trim());
  return (
    <View style={{ marginTop: 8 }}>
      <View style={s.chips}>
        {Object.entries(reasons).map(([k, v]) => (
          <TouchableOpacity key={k} onPress={() => setReason(k)} style={[s.chip, reason === k && { backgroundColor: accent, borderColor: accent }]}>
            <Text style={[s.chipText, reason === k && { color: '#fff' }]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {needsDetails ? <TextInput style={s.input} placeholder="Tell us what happened" value={details} onChangeText={setDetails} multiline /> : null}
      <View style={[s.note, preview?.outcome === 'NONE' && { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
        <Text style={s.bold}>{head}</Text>
        {preview?.note ? <Text style={s.small}>{preview.note}</Text> : null}
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.chips}>
        <TouchableOpacity disabled={disabled} onPress={send} style={[s.btn, { backgroundColor: accent, borderColor: accent, opacity: disabled ? 0.5 : 1 }]}>
          <Text style={[s.btnText, { color: '#fff' }]}>{busy ? 'Sending…' : preview?.outcome === 'REVIEW' ? 'Send for review' : 'Cancel and refund'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} style={s.btn}><Text style={s.btnText}>Back</Text></TouchableOpacity>
      </View>
      <Text style={s.small}>Refunds go back to the card or mobile money wallet you paid with, usually within 3 to 10 working days.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, padding: 14, margin: 16 },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  item: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10, marginTop: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  bold: { fontWeight: '700', color: '#0f172a', flexShrink: 1 },
  small: { color: '#64748b', fontSize: 12, marginTop: 2 },
  link: { fontWeight: '700', marginTop: 6 },
  badge: { color: '#fff', fontSize: 11, fontWeight: '700', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fff' },
  chipText: { color: '#334155', fontSize: 12 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, minHeight: 70, marginTop: 8, textAlignVertical: 'top' },
  note: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, padding: 10, marginTop: 8 },
  err: { color: '#b91c1c', marginTop: 6 },
  btn: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#fff' },
  btnText: { fontWeight: '700', color: '#0f172a' },
});
