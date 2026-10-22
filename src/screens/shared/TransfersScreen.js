import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getStoredUserId } from '../../services/apiClient';
import {
  OPEN_STATUSES, TRANSFER_STATUS, cancelTransfer, decideTransfer, fmtWhen, getTransfer,
  listTransfers, redirectTransfer, timeLeft, transferSuggestions,
} from '../../services/careTransfers';

const EVENT_LABELS = {
  REQUESTED: 'Transfer requested',
  CONSENT_REMINDER: 'Reminder sent to the patient',
  CONSENT_NO_ANSWER: 'Patient has not answered after two reminders',
  PATIENT_CONSENTED: 'Patient gave consent',
  PATIENT_DECLINED: 'Patient declined',
  ACCEPTED: 'Accepted by the receiving clinician',
  REJECTED: 'Declined by the receiving clinician',
  REDIRECTED: 'Sent to another clinician',
  TIMED_OUT: 'No answer within 24 hours',
  REASSIGN_TIMED_OUT: 'No new clinician chosen within 24 hours',
  AUTO_REASSIGNED: 'Reassigned automatically by NessaHub',
  COMPLETED: 'Transfer completed',
  APPOINTMENTS_MOVED: 'Upcoming appointments moved',
  SESSIONS_CANCELLED: 'Upcoming sessions cancelled',
  NO_MATCH: 'No suitable clinician — NessaHub team alerted',
  CANCELLED: 'Cancelled',
};

/**
 * Transfers for a doctor or therapist on the phone: requests waiting for their
 * decision (24 hours), transfers they sent, and the history of who went where.
 */
export default function TransfersScreen({ role = 'DOCTOR', navigation }) {
  const isDoctor = role === 'DOCTOR';
  const accent = isDoctor ? '#1e6bb8' : '#4f46e5';
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState('incoming');
  const [openId, setOpenId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setMe(await getStoredUserId());
    try { setRows(await listTransfers()); } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const groups = useMemo(() => {
    const list = rows || [];
    return {
      incoming: list.filter((t) => t.status === 'AWAITING_RECIPIENT' && t.toClinicianId === me),
      sent: list.filter((t) => t.fromClinicianId === me && OPEN_STATUSES.includes(t.status)),
      history: list.filter((t) => !OPEN_STATUSES.includes(t.status) || (t.status !== 'AWAITING_RECIPIENT' && t.toClinicianId === me)),
    };
  }, [rows, me]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={s.wrap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Text style={s.muted}>
        Hand {isDoctor ? 'patients' : 'clients'} over to another {isDoctor ? 'doctor' : 'therapist'}, and answer requests sent to you. Requests not answered within 24 hours are reassigned automatically.
      </Text>
      <View style={s.tabs}>
        {[['incoming', 'Needs your decision'], ['sent', 'Sent'], ['history', 'History']].map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && { backgroundColor: '#0f172a', borderColor: '#0f172a' }]}>
            <Text style={[s.tabText, tab === k && { color: '#fff' }]}>
              {label}{k !== 'history' && groups[k].length ? ` (${groups[k].length})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {rows === null ? <ActivityIndicator style={{ marginTop: 24 }} /> : groups[tab].length === 0 ? (
        <Text style={s.empty}>
          {tab === 'incoming' ? 'No transfer requests are waiting for you.' : tab === 'sent' ? 'You have no transfers in progress.' : 'No finished transfers yet.'}
        </Text>
      ) : groups[tab].map((t) => {
        const st = TRANSFER_STATUS[t.status] || { label: t.status, bg: '#f1f5f9', fg: '#475569' };
        const iAmSender = t.fromClinicianId === me;
        const iAmRecipient = t.toClinicianId === me;
        const title = iAmSender ? `${t.patientName} → ${t.toName || 'not yet chosen'}` : `${t.patientName} — from ${t.fromName}`;
        const line = t.status === 'COMPLETED'
          ? (iAmSender ? `Transferred to ${t.toName} on ${fmtWhen(t.completedAt)}` : `Transferred to ${iAmRecipient ? 'you' : t.toName} on ${fmtWhen(t.completedAt)}`)
            + (t.autoReassigned ? ' (automatic)' : '')
          : t.status === 'AWAITING_RECIPIENT' ? `Decision due · ${timeLeft(t.deadlineAt)}`
            : t.status === 'REJECTED_AWAITING_REASSIGN' ? `Choose another clinician · ${timeLeft(t.deadlineAt)}`
              : `Requested ${fmtWhen(t.createdAt)}`;
        return (
          <View key={t.id} style={s.card}>
            <Text style={s.cardTitle}>{title}</Text>
            <Text style={s.small}>{t.reasonLabel}{t.neededSpecialty ? ` · needs ${t.neededSpecialty}` : ''}{t.neededFormat ? ` · ${t.neededFormat} therapy` : ''}</Text>
            <Text style={s.small}>{line}</Text>
            <View style={s.badges}>
              {t.urgency === 'urgent' ? <Text style={[s.badge, { backgroundColor: '#fee2e2', color: '#991b1b' }]}>Urgent</Text> : null}
              <Text style={[s.badge, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
            </View>
            <TouchableOpacity onPress={() => setOpenId(openId === t.id ? null : t.id)}>
              <Text style={[s.link, { color: accent }]}>{openId === t.id ? 'Hide details' : 'View details'}</Text>
            </TouchableOpacity>
            {openId === t.id ? (
              <TransferDetail id={t.id} me={me} isDoctor={isDoctor} accent={accent} navigation={navigation} onChanged={load} />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function TransferDetail({ id, me, isDoctor, accent, navigation, onChanged }) {
  const [t, setT] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [choosing, setChoosing] = useState(false);
  const [options, setOptions] = useState([]);
  const [pick, setPick] = useState('');

  const load = useCallback(() => { getTransfer(id).then(setT).catch((e) => setMsg({ ok: '', err: e?.message || '' })); }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!choosing || !t) return;
    transferSuggestions({
      patientId: t.patientId,
      specialty: t.neededSpecialty || undefined,
      format: t.neededFormat || undefined,
      focus: t.neededFocus ? String(t.neededFocus).split(',').filter(Boolean) : [],
    }).then((rows) => {
      const excluded = new Set(String(t.triedClinicianIds || '').split(',').concat([t.toClinicianId]).filter(Boolean));
      setOptions(rows.filter((r) => !excluded.has(r.id)));
    }).catch(() => setOptions([]));
  }, [choosing, t]);

  if (!t) return <Text style={s.small}>{msg.err || 'Loading…'}</Text>;

  const act = async (fn, okText) => {
    setBusy(true); setMsg({ ok: '', err: '' });
    try { await fn(); setMsg({ ok: okText, err: '' }); load(); onChanged?.(); }
    catch (e) { setMsg({ ok: '', err: e?.message || 'That did not work.' }); }
    finally { setBusy(false); }
  };
  const sec = (label, text) => (text ? (
    <View style={s.section}><Text style={s.secLabel}>{label}</Text><Text style={s.secText}>{text}</Text></View>
  ) : null);
  const iAmRecipient = t.toClinicianId === me && t.status === 'AWAITING_RECIPIENT';
  const iAmSender = t.fromClinicianId === me;

  return (
    <View>
      {sec('Reason', [t.reasonLabel, t.reasonDetails].filter(Boolean).join(' — '))}
      {sec('Clinical summary', t.clinicalSummary)}
      {sec('Current medications', t.currentMedications)}
      {sec('Open issues and follow-ups', t.activeIssues)}
      {sec('Handover notes', t.handoverNotes)}
      {sec('Patient consent', t.consentStatus === 'GIVEN' ? `Given ${fmtWhen(t.consentDecidedAt)}`
        : t.consentStatus === 'DECLINED' ? `Declined ${fmtWhen(t.consentDecidedAt)}` : 'Waiting for the patient')}
      {sec('Receiving clinician’s note', t.recipientDecisionNote)}
      {t.events?.length ? (
        <View style={s.section}>
          <Text style={s.secLabel}>Timeline</Text>
          {t.events.map((e, i) => (
            <Text key={i} style={s.small}>{fmtWhen(e.created_at)} · {EVENT_LABELS[e.event] || e.event}{e.actor_name ? ` — ${e.actor_name}` : ''}</Text>
          ))}
        </View>
      ) : null}

      {iAmRecipient ? (
        <View style={s.section}>
          <Text style={s.secLabel}>Your decision · {timeLeft(t.deadlineAt)}</Text>
          <TouchableOpacity style={s.btn} onPress={() => (isDoctor
            ? navigation?.navigate('DoctorPatientDetail', { patientId: t.patientId, patientName: t.patientName })
            : navigation?.navigate('TherapistClients', { screen: 'TherapistClientDetail', params: { clientId: t.patientId } }))}>
            <Text style={s.btnText}>Open the patient's record</Text>
          </TouchableOpacity>
          <TextInput style={s.input} placeholder="Note (required to decline)" value={note} onChangeText={setNote} multiline />
          <View style={s.row}>
            <TouchableOpacity disabled={busy} style={[s.btn, { backgroundColor: accent, borderColor: accent }]} onPress={() => act(() => decideTransfer(t.id, true, note), 'Accepted — the patient is now in your care.')}>
              <Text style={[s.btnText, { color: '#fff' }]}>Accept patient</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy || !note.trim()} style={[s.btn, { borderColor: '#fca5a5', opacity: note.trim() ? 1 : 0.5 }]} onPress={() => act(() => decideTransfer(t.id, false, note), 'Declined. The referring clinician has been told.')}>
              <Text style={[s.btnText, { color: '#b91c1c' }]}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {iAmSender && OPEN_STATUSES.includes(t.status) ? (
        <View style={s.section}>
          {['AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'].includes(t.status) ? (choosing ? (
            <View>
              <Text style={s.secLabel}>Choose another {isDoctor ? 'doctor' : 'therapist'}</Text>
              {options.length === 0 ? <Text style={s.small}>No other matching clinician is available right now.</Text> : options.map((o) => (
                <TouchableOpacity key={o.id} onPress={() => setPick(o.id)} style={[s.option, pick === o.id && { borderColor: accent, borderWidth: 2 }]}>
                  <Text style={s.cardTitle}>{isDoctor ? `Dr. ${o.name}` : o.name} · {o.score}%</Text>
                  <Text style={s.small}>{o.specialization || o.professionalType || ''}{o.reasons?.length ? ` · ${o.reasons.join(' · ')}` : ''}</Text>
                </TouchableOpacity>
              ))}
              <View style={s.row}>
                <TouchableOpacity disabled={!pick || busy} style={[s.btn, { backgroundColor: accent, borderColor: accent, opacity: pick ? 1 : 0.5 }]} onPress={() => act(() => redirectTransfer(t.id, pick), 'Sent. They have 24 hours to accept.')}>
                  <Text style={[s.btnText, { color: '#fff' }]}>Send to this clinician</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btn} onPress={() => setChoosing(false)}><Text style={s.btnText}>Back</Text></TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[s.btn, { backgroundColor: accent, borderColor: accent }]} onPress={() => setChoosing(true)}>
              <Text style={[s.btnText, { color: '#fff' }]}>{t.status === 'REJECTED_AWAITING_REASSIGN' ? 'Choose another clinician' : 'Send to someone else instead'}</Text>
            </TouchableOpacity>
          )) : null}
          <TouchableOpacity disabled={busy} style={[s.btn, { borderColor: '#fca5a5', marginTop: 8 }]} onPress={() => act(() => cancelTransfer(t.id, 'Cancelled by the referring clinician'), 'Transfer cancelled.')}>
            <Text style={[s.btnText, { color: '#b91c1c' }]}>Cancel transfer</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {msg.ok ? <Text style={s.ok}>{msg.ok}</Text> : null}
      {msg.err ? <Text style={s.errText}>{msg.err}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40 },
  muted: { color: '#64748b', marginBottom: 12, lineHeight: 20 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tab: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  tabText: { fontWeight: '600', color: '#334155' },
  empty: { color: '#64748b', textAlign: 'center', padding: 20, backgroundColor: '#f1f5f9', borderRadius: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardTitle: { fontWeight: '700', color: '#0f172a', fontSize: 15 },
  small: { color: '#64748b', fontSize: 13, marginTop: 2 },
  badges: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  link: { fontWeight: '700', marginTop: 8 },
  section: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, marginTop: 8 },
  secLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 },
  secText: { color: '#0f172a', lineHeight: 20 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, minHeight: 70, backgroundColor: '#fff', textAlignVertical: 'top', marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btn: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#fff', alignSelf: 'flex-start', marginTop: 4 },
  btnText: { fontWeight: '700', color: '#0f172a' },
  option: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginTop: 6, backgroundColor: '#fff' },
  ok: { color: '#166534', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginTop: 10 },
  errText: { color: '#991b1b', backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, marginTop: 10 },
});
