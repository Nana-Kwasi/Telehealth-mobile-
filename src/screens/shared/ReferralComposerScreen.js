import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import ZCGround from '../../components/ZCGround';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Prepare a referral on the phone.
 *
 * The clinician states who and why; the packet the receiving clinician needs is
 * gathered from the record and shown for checking before it goes. The reason is
 * required — deciding that someone needs a specialist is not a thing to
 * generate, and without it there is nothing to select the record against.
 */
export default function ReferralComposerScreen({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patientId: '', specialty: '', reason: '' });
  const [packet, setPacket] = useState(null);
  const [proposed, setProposed] = useState(null);
  const [auditId, setAuditId] = useState(null);
  const [busy, setBusy] = useState('');
  const [history, setHistory] = useState(null);
  const [received, setReceived] = useState(null);
  const [listTab, setListTab] = useState('sent');
  const [openId, setOpenId] = useState(null);
  // Where it goes: a clinician on NessaHub, or an outside email address.
  const [sendMode, setSendMode] = useState('clinician');
  const [recipient, setRecipient] = useState(null);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);

  useEffect(() => {
    if (sendMode !== 'clinician' || recipient) return undefined;
    const t = setTimeout(() => {
      api(`/api/v1/care-plans/referrals/recipients?q=${encodeURIComponent(search.trim())}&specialty=${encodeURIComponent(form.specialty.trim())}`)
        .then((d) => setMatches(Array.isArray(d) ? d : []))
        .catch(() => setMatches([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, sendMode, recipient, form.specialty]);
  const P = role === 'THERAPIST' ? PALETTES.therapy : PALETTES.medical;

  const loadHistory = useCallback(async () => {
    const [rows, inbox] = await Promise.all([
      api('/api/v1/care-plans/referrals').catch(() => []),
      api('/api/v1/care-plans/referrals/received').catch(() => []),
    ]);
    setHistory(Array.isArray(rows) ? rows : []);
    setReceived(Array.isArray(inbox) ? inbox : []);
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  const loadPatients = useCallback(async () => {
    try {
      const me = await getStoredUserId();
      if (role === 'THERAPIST') {
        const rows = await api(`/api/v1/therapy-management/assignments?therapistId=${me}`);
        setPatients(dedupe((Array.isArray(rows) ? rows : [])
          .filter((a) => String(a.status || 'active').toLowerCase() === 'active')
          .map((a) => ({ id: a.clientId, name: a.clientName || a.clientEmail || 'Client' }))));
        return;
      }
      const appts = await api(`/api/v1/medical/appointments/doctor/${me}`);
      setPatients(dedupe((Array.isArray(appts) ? appts : [])
        .map((a) => ({ id: a.patientId, name: a.patientName || 'Patient' }))));
    } catch {
      setPatients([]);
    }
  }, [role]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const assemble = async () => {
    setBusy('Assembling…');
    try {
      const res = await api('/api/v1/care-plans/referrals/draft', {
        method: 'POST',
        body: { patientId: form.patientId || null, specialty: form.specialty, reason: form.reason },
      });
      if (!res?.ok) { Alert.alert('Not assembled', res?.message || 'The referral could not be assembled.'); return; }
      setPacket(res.packet);
      setProposed(JSON.stringify(res.packet));
      setAuditId(res.aiAuditId || null);
    } catch (e) {
      Alert.alert('Not assembled', e?.message || 'The referral could not be assembled.');
    } finally { setBusy(''); }
  };

  const save = async (submit) => {
    setBusy(submit ? 'Submitting…' : 'Saving…');
    try {
      const res = await api('/api/v1/care-plans/referrals', {
        method: 'POST',
        body: {
          ...form,
          clinicalSummary: packet?.clinicalSummary || '',
          relevantHistory: packet?.relevantHistory || '',
          currentMedications: packet?.currentMedications || '',
          relevantResults: packet?.relevantResults || '',
          submit,
          aiAssisted: Boolean(auditId),
          aiAuditId: auditId,
          aiEdited: auditId ? JSON.stringify(packet) !== proposed : null,
          recipientId: sendMode === 'clinician' ? recipient?.id || null : null,
          recipientEmail: sendMode === 'email' ? recipientEmail.trim() || null : null,
          recipientName: sendMode === 'email' ? recipientName.trim() || null : null,
        },
      });
      const toWho = sendMode === 'clinician' ? recipient?.name : (recipientName.trim() || recipientEmail.trim());
      Alert.alert(res.status === 'submitted' ? 'Referral sent' : 'Saved',
        res.status === 'submitted' ? `Sent to ${toWho}. A copy is in your email.` : 'Saved as a draft.');
      loadHistory();
    } catch (e) {
      Alert.alert('Not saved', e?.message || 'That could not be saved.');
    } finally { setBusy(''); }
  };

  const field = (key, label, icon) => (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Ionicons name={icon} size={14} color={P.accent} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={packet?.[key] || ''}
        onChangeText={(v) => setPacket((p) => ({ ...p, [key]: v }))}
        placeholder="Nothing on record — add anything the receiving clinician needs."
        placeholderTextColor="#94a3b8"
        multiline
        textAlignVertical="top"
      />
    </View>
  );

  const canAssemble = !busy && form.patientId && form.reason.trim();
  const nameOf = (id) => patients.find((x) => String(x.id) === String(id))?.name || 'Patient';
  const step = packet ? 2 : 1;
  const specialties = role === 'THERAPIST' ? THERAPY_SPECIALTIES : MEDICAL_SPECIALTIES;

  return (
    <ZCGround>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <LinearGradient colors={[P.accent, P.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroIcon}><Ionicons name="share-social" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Refer a patient</Text>
              <Text style={styles.heroSub}>
                You decide who and why. The packet is gathered from the record for you to check before it goes.
              </Text>
            </View>
          </LinearGradient>

          <View style={styles.steps}>
            {['Who & why', 'Check packet', 'Submit'].map((t, i) => {
              const on = step === i + 1;
              const done = step > i + 1;
              return (
                <View key={t} style={[styles.step, on && { borderColor: P.accent, backgroundColor: P.soft }]}>
                  <View style={[styles.stepDot, on && { backgroundColor: P.accent }, done && { backgroundColor: '#dcfce7' }]}>
                    {done ? <Ionicons name="checkmark" size={12} color="#15803d" />
                      : <Text style={[styles.stepNum, on && { color: '#fff' }]}>{i + 1}</Text>}
                  </View>
                  <Text style={[styles.stepText, on && { color: P.accent }]} numberOfLines={1}>{t}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.card}>
            <View style={styles.labelRow}>
              <Ionicons name="person" size={14} color={P.accent} />
              <Text style={styles.label}>Patient</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {patients.map((p) => {
                const on = form.patientId === p.id;
                return (
                  <TouchableOpacity key={p.id} style={[styles.person, on && { backgroundColor: P.accent, borderColor: P.accent }]}
                    onPress={() => set('patientId', p.id)}>
                    <View style={[styles.avatar, { backgroundColor: on ? 'rgba(255,255,255,0.25)' : P.soft }]}>
                      <Text style={[styles.avatarText, { color: on ? '#fff' : P.accent }]}>{(p.name || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={[styles.personText, on && { color: '#fff' }]} numberOfLines={1}>{p.name}</Text>
                  </TouchableOpacity>
                );
              })}
              {patients.length === 0 ? <Text style={styles.hint}>No patients found.</Text> : null}
            </ScrollView>

            <View style={[styles.labelRow, { marginTop: 14 }]}>
              <Ionicons name="medkit" size={14} color={P.accent} />
              <Text style={styles.label}>Refer to</Text>
            </View>
            <TextInput style={styles.input} value={form.specialty}
              onChangeText={(v) => set('specialty', v)}
              placeholder="e.g. Cardiology" placeholderTextColor="#94a3b8" />
            <View style={styles.chips}>
              {specialties.map((sp) => {
                const on = form.specialty === sp;
                return (
                  <TouchableOpacity key={sp} onPress={() => set('specialty', sp)}
                    style={[styles.chip, on && { backgroundColor: P.soft, borderColor: P.accent }]}>
                    <Text style={[styles.chipText, on && { color: P.accent }]}>{sp}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.labelRow, { marginTop: 14 }]}>
              <Ionicons name="clipboard" size={14} color={P.accent} />
              <Text style={styles.label}>Why are you referring?</Text>
            </View>
            <TextInput style={[styles.input, styles.textarea]} value={form.reason}
              onChangeText={(v) => set('reason', v)} multiline textAlignVertical="top"
              placeholder="e.g. Exertional chest discomfort with a family history of coronary disease."
              placeholderTextColor="#94a3b8" />
            <Text style={styles.hint}>
              Required. The record is selected against this, so the packet carries
              what bears on your reason rather than everything on file.
            </Text>

            <TouchableOpacity
              style={[styles.btnPrimary, { backgroundColor: P.accent }, !canAssemble && styles.off]}
              onPress={assemble}
              disabled={!canAssemble}
            >
              {busy === 'Assembling…' ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={16} color="#fff" />}
              <Text style={styles.btnPrimaryText}>
                {busy === 'Assembling…' ? 'Assembling…' : packet ? 'Assemble again' : 'Assemble the packet'}
              </Text>
            </TouchableOpacity>
          </View>

          {packet ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>The packet</Text>
                <View style={[styles.badge, { backgroundColor: P.soft }]}>
                  <Text style={[styles.badgeText, { color: P.accent }]} numberOfLines={1}>
                    {nameOf(form.patientId)}{form.specialty ? ` · ${form.specialty}` : ''}
                  </Text>
                </View>
              </View>
              {field('clinicalSummary', 'Clinical summary', 'document-text')}
              {field('relevantHistory', 'Relevant history', 'time')}
              {field('currentMedications', 'Current medications', 'medical')}
              {field('relevantResults', 'Relevant results', 'flask')}

              <View style={styles.sendTo}>
                <View style={styles.labelRow}>
                  <Ionicons name="send" size={14} color={P.accent} />
                  <Text style={styles.label}>Send to</Text>
                </View>
                <View style={styles.toggle}>
                  {[['clinician', 'On NessaHub', 'medkit'], ['email', 'Email address', 'mail']].map(([k, t, ic]) => (
                    <TouchableOpacity key={k} onPress={() => setSendMode(k)}
                      style={[styles.toggleBtn, sendMode === k && styles.toggleOn]}>
                      <Ionicons name={ic} size={14} color={sendMode === k ? P.accent : '#64748b'} />
                      <Text style={[styles.toggleText, sendMode === k && { color: P.accent }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {sendMode === 'clinician' ? (
                  recipient ? (
                    <View style={[styles.picked, { borderColor: P.accent }]}>
                      <View style={[styles.avatar, { backgroundColor: P.soft }]}><Text style={[styles.avatarText, { color: P.accent }]}>{(recipient.name || '?').charAt(0)}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{recipient.name}</Text>
                        <Text style={styles.rowSub}>{roleLine(recipient)}</Text>
                      </View>
                      <TouchableOpacity onPress={() => { setRecipient(null); setSearch(''); }} hitSlop={10}>
                        <Ionicons name="close-circle" size={22} color="#94a3b8" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <TextInput style={styles.input} value={search} onChangeText={setSearch}
                        placeholder="Search by name or specialty…" placeholderTextColor="#94a3b8" />
                      {matches.slice(0, 6).map((m) => (
                        <TouchableOpacity key={m.id} style={styles.match} onPress={() => setRecipient(m)}>
                          <View style={[styles.avatar, { backgroundColor: P.soft }]}><Text style={[styles.avatarText, { color: P.accent }]}>{(m.name || '?').charAt(0)}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{m.name}</Text>
                            <Text style={styles.rowSub} numberOfLines={1}>{roleLine(m)}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                      {matches.length === 0 ? <Text style={styles.hint}>No clinicians match that search.</Text> : null}
                    </>
                  )
                ) : (
                  <View style={{ gap: 8 }}>
                    <TextInput style={styles.input} value={recipientEmail} onChangeText={setRecipientEmail}
                      placeholder="specialist@hospital.com" placeholderTextColor="#94a3b8"
                      keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                    <TextInput style={styles.input} value={recipientName} onChangeText={setRecipientName}
                      placeholder="Their name (optional)" placeholderTextColor="#94a3b8" />
                  </View>
                )}
                <Text style={styles.hint}>On submit they get the full packet by email; you get a copy.</Text>
              </View>

              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: P.accent }, (!!busy || !(sendMode === 'clinician' ? !!recipient : !!recipientEmail.trim())) && styles.off]}
                onPress={() => save(true)} disabled={!!busy || !(sendMode === 'clinician' ? !!recipient : !!recipientEmail.trim())}
              >
                <Ionicons name="send" size={15} color="#fff" />
                <Text style={styles.btnPrimaryText}>
                  {busy === 'Submitting…' ? 'Submitting…' : 'Submit referral'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghost, !!busy && styles.off]}
                onPress={() => save(false)} disabled={!!busy}
              >
                <Text style={styles.ghostText}>{busy === 'Saving…' ? 'Saving…' : 'Save as draft'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Referrals</Text>
            </View>
            <View style={[styles.toggle, { marginBottom: 10 }]}>
              {[['sent', `Sent${history?.length ? ` · ${history.length}` : ''}`], ['received', `Received${received?.length ? ` · ${received.length}` : ''}`]].map(([k, t]) => (
                <TouchableOpacity key={k} onPress={() => setListTab(k)} style={[styles.toggleBtn, listTab === k && styles.toggleOn]}>
                  <Text style={[styles.toggleText, listTab === k && { color: P.accent }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {(listTab === 'sent' ? history : received) === null ? <ActivityIndicator color={P.accent} /> : null}
            {(listTab === 'sent' ? history : received)?.length === 0 ? (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: P.soft }]}><Ionicons name="share-social-outline" size={24} color={P.accent} /></View>
                <Text style={styles.emptyTitle}>{listTab === 'sent' ? 'No referrals yet' : 'Nothing referred to you yet'}</Text>
                <Text style={styles.hint}>{listTab === 'sent' ? 'Referrals you save or submit appear here.' : 'When a colleague refers a patient to you, it appears here.'}</Text>
              </View>
            ) : null}
            {listTab === 'sent' ? (history || []).map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={[styles.rowIcon, { backgroundColor: P.soft }]}><Ionicons name="share-social" size={16} color={P.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{r.patient_name || nameOf(r.patient_id)}{r.specialty ? ` → ${r.specialty}` : ''}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{r.recipient_name || r.recipient_email ? `To ${r.recipient_name || r.recipient_email} · ` : ''}{r.reason}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <View style={[styles.status, r.status === 'submitted' && styles.statusOk]}>
                    <Text style={[styles.statusText, r.status === 'submitted' && styles.statusTextOk]}>
                      {r.status === 'submitted' ? 'Sent' : 'Draft'}
                    </Text>
                  </View>
                  <Text style={styles.rowDate}>
                    {new Date(r.submitted_at || r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
              </View>
            )) : (received || []).map((r) => (
              <View key={r.id}>
                <TouchableOpacity style={styles.row} onPress={() => setOpenId(openId === r.id ? null : r.id)}>
                  <View style={[styles.rowIcon, { backgroundColor: P.soft }]}><Ionicons name="mail-open" size={16} color={P.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{r.patient_name || 'Patient'}{r.specialty ? ` → ${r.specialty}` : ''}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>From {r.referrer_name || 'a colleague'} · {r.reason}</Text>
                  </View>
                  <Ionicons name={openId === r.id ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
                </TouchableOpacity>
                {openId === r.id ? (
                  <View style={styles.receivedBody}>
                    {[['Reason', r.reason], ['Clinical summary', r.clinical_summary], ['Relevant history', r.relevant_history],
                      ['Current medications', r.current_medications], ['Relevant results', r.relevant_results]]
                      .filter(([, v]) => v).map(([k, v]) => (
                        <View key={k} style={{ marginBottom: 8 }}>
                          <Text style={[styles.receivedHead, { color: P.accent }]}>{k.toUpperCase()}</Text>
                          <Text style={styles.receivedText}>{v}</Text>
                        </View>
                      ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ZCGround>
  );
}

const PALETTES = {
  therapy: { accent: '#5046bd', accent2: '#3f37a0', soft: '#eeedfb' },
  medical: { accent: '#1e6bb8', accent2: '#155a9c', soft: '#e8f1fb' },
};
// "Doctor · Cardiology", or just the role when no specialty is on the profile.
const roleLine = (c) => [c.role === 'DOCTOR' ? 'Doctor' : 'Therapist', c.specialty].filter(Boolean).join(' · ');

const MEDICAL_SPECIALTIES = ['Cardiology', 'Dermatology', 'Endocrinology', 'Neurology', 'Orthopaedics', 'Psychiatry'];
const THERAPY_SPECIALTIES = ['Psychiatry', 'Psychology', 'Couples therapy', 'Addiction services', 'Family therapy', 'GP'];

/** One entry per person: a patient with six appointments is still one patient. */
function dedupe(list) {
  const seen = new Map();
  for (const p of list) if (p.id && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 14 },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 18,
    shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18, marginTop: 2 },

  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 8,
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  stepDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 11, fontWeight: '800', color: '#64748b' },
  stepText: { flex: 1, fontSize: 11.5, fontWeight: '700', color: '#64748b' },

  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  badge: { flexShrink: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },

  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '800', color: '#334155' },
  field: { marginBottom: 10 },
  input: { borderWidth: 1.5, borderColor: '#dbe2ea', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 92, paddingTop: 12 },
  hint: { fontSize: 12, color: '#64748b', lineHeight: 17, marginTop: 6 },

  person: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12,
    borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', maxWidth: 200 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800' },
  personText: { fontSize: 13.5, fontWeight: '700', color: '#334155', flexShrink: 1 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#475569' },

  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginTop: 14 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  ghost: { marginTop: 8, paddingVertical: 13, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: '#d5dbe5' },
  ghostText: { fontSize: 14.5, fontWeight: '700', color: '#334155' },
  off: { opacity: 0.5 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12.5, color: '#64748b', marginTop: 1 },
  rowDate: { fontSize: 11, color: '#94a3b8' },
  status: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#f1f5f9' },
  statusOk: { backgroundColor: '#dcfce7' },
  statusText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  statusTextOk: { color: '#15803d' },

  empty: { alignItems: 'center', paddingVertical: 14 },
  sendTo: { marginTop: 6, marginBottom: 4, padding: 12, borderRadius: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#edf0f5', gap: 8 },
  toggle: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: '#eef2f7' },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 9 },
  toggleOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 12, borderWidth: 1.5, backgroundColor: '#fff' },
  match: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, backgroundColor: '#fff' },
  receivedBody: { paddingLeft: 46, paddingBottom: 10 },
  receivedHead: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 2 },
  receivedText: { fontSize: 13.5, color: '#334155', lineHeight: 19 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
});
