import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStoredUserId } from '../services/apiClient';
import { askToReconsider, consentToTransfer, fmtWhen, getTransfer, listTransfers } from '../services/careTransfers';

/**
 * Top of the patient's Home: a transfer of their care that needs their consent,
 * or a one-line status for one in progress or just completed. The consent
 * wording comes from the server and is stored with the decision and its time.
 */
const REVIEW_DAYS_MS = 21 * 86400000;

export default function TransferConsentCard({ kind }) {
  const [pending, setPending] = useState([]);
  const [recent, setRecent] = useState(null);

  const load = useCallback(async () => {
    try {
      const me = await getStoredUserId();
      const rows = (await listTransfers()).filter((t) => t.patientId === me && (!kind || t.kind === kind));
      const waiting = rows.filter((t) => t.status === 'AWAITING_PATIENT_CONSENT');
      setPending(await Promise.all(waiting.map((t) => getTransfer(t.id).catch(() => t))));
      const weekAgo = Date.now() - 7 * 86400000;
      setRecent(rows.find((t) => ['AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'].includes(t.status)
        || (t.status === 'COMPLETED' && new Date(t.completedAt).getTime() > (t.autoReassigned ? Date.now() - REVIEW_DAYS_MS : weekAgo))) || null);
    } catch {
      setPending([]);
    }
  }, [kind]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (pending.length) return pending.map((t) => <ConsentRequest key={t.id} t={t} onDone={load} />);
  if (!recent) return null;
  return (
    <View style={s.note} accessibilityRole="summary">
      <Text style={s.noteText}>
        {recent.status === 'COMPLETED'
          ? `Your care was transferred to ${recent.toName} on ${fmtWhen(recent.completedAt)}${recent.autoReassigned ? ' (NessaHub matched them for you)' : ''}. Your records moved with you.`
          : recent.status === 'AWAITING_RECIPIENT'
            ? `You agreed to transfer your care to ${recent.toName}. We are waiting for them to accept and will let you know.`
            : 'Your transfer is still in progress: we are arranging another clinician and will let you know who.'}
      </Text>
      <ReconsiderTransfer t={recent} onDone={load} />
    </View>
  );
}

/** An automatic move can be looked at again by a person, within 21 days. */
function ReconsiderTransfer({ t, onDone }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (t.status !== 'COMPLETED' || !t.autoReassigned) return null;
  if (t.reconsiderationRequestedAt) {
    return <Text style={[s.noteText, { marginTop: 8 }]}>You asked for a review. NessaHub will reply to you in writing within 21 days.</Text>;
  }
  if (new Date(t.completedAt).getTime() <= Date.now() - REVIEW_DAYS_MS) return null;

  const send = async () => {
    setBusy(true); setError('');
    try { await askToReconsider(t.id, note); onDone(); }
    catch (e) { setError(e?.message || 'Your request could not be sent. Please try again.'); setBusy(false); }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <Text style={s.noteText}>This was decided automatically because no clinician confirmed in time. You can ask a person to reconsider it.</Text>
      {open ? (
        <TextInput style={s.input} placeholder="Anything you would like us to know (optional)" value={note} onChangeText={setNote} multiline />
      ) : null}
      {error ? <Text style={[s.noteText, { color: '#b91c1c' }]}>{error}</Text> : null}
      <TouchableOpacity style={[s.btn, { marginTop: 8, alignSelf: 'flex-start' }]} disabled={busy} onPress={open ? send : () => setOpen(true)}>
        <Text style={s.btnText}>{open ? 'Send request' : 'Ask for a review'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function ConsentRequest({ t, onDone }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const role = t.kind === 'MEDICAL' ? 'doctor' : 'therapist';

  const decide = async (agree) => {
    setBusy(true); setError('');
    try { await consentToTransfer(t.id, agree, agree ? null : reason); onDone(); }
    catch (e) { setError(e?.message || 'Your answer could not be saved. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>Your {role} would like to transfer your care</Text>
      <Text style={s.body}>
        <Text style={s.bold}>{t.fromName}</Text> has asked to transfer your {t.kind === 'MEDICAL' ? 'medical care' : 'therapy'} to{' '}
        <Text style={s.bold}>{t.toName}</Text>. Reason: {t.reasonLabel}{t.reasonDetails ? ` — ${t.reasonDetails}` : ''}.
      </Text>
      <Text style={s.body}>Nothing changes unless you agree.</Text>
      {t.consentText ? <View style={s.quote}><Text style={s.quoteText}>{t.consentText}</Text></View> : null}
      {declining ? (
        <TextInput
          style={s.input}
          placeholder={`Tell ${t.fromName} why (optional)`}
          value={reason}
          onChangeText={setReason}
          multiline
        />
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={s.row}>
        {busy ? <ActivityIndicator /> : declining ? (
          <>
            <TouchableOpacity style={[s.btn, s.danger]} onPress={() => decide(false)}><Text style={s.dangerText}>Decline the transfer</Text></TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => setDeclining(false)}><Text style={s.btnText}>Back</Text></TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={[s.btn, s.primary]} onPress={() => decide(true)}><Text style={s.primaryText}>I agree</Text></TouchableOpacity>
            <TouchableOpacity style={s.btn} onPress={() => setDeclining(true)}><Text style={s.btnText}>Decline</Text></TouchableOpacity>
          </>
        )}
      </View>
      <Text style={s.small}>Your answer is saved with the date and time and appears in your consent history in Settings.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', borderWidth: 1, borderRadius: 14, padding: 16, marginHorizontal: 16, marginVertical: 10 },
  title: { fontSize: 16, fontWeight: '700', color: '#78350f', marginBottom: 6 },
  body: { color: '#451a03', fontSize: 14, marginBottom: 6, lineHeight: 20 },
  bold: { fontWeight: '700' },
  quote: { backgroundColor: '#fff', borderLeftWidth: 4, borderLeftColor: '#f59e0b', borderRadius: 6, padding: 10, marginVertical: 8 },
  quoteText: { color: '#1f2937', fontSize: 13, lineHeight: 19 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, minHeight: 70, backgroundColor: '#fff', marginTop: 6, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  btn: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#fff' },
  btnText: { color: '#0f172a', fontWeight: '600' },
  primary: { backgroundColor: '#1e6bb8', borderColor: '#1e6bb8' },
  primaryText: { color: '#fff', fontWeight: '700' },
  danger: { borderColor: '#fca5a5' },
  dangerText: { color: '#b91c1c', fontWeight: '700' },
  error: { color: '#b91c1c', marginTop: 6 },
  small: { color: '#64748b', fontSize: 12, marginTop: 8 },
  note: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, padding: 12, marginHorizontal: 16, marginVertical: 10 },
  noteText: { color: '#1e3a8a', fontSize: 14, lineHeight: 20 },
});
