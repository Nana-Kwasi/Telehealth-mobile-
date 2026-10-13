import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, ScrollView, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import { api, uploadFile } from '../services/apiClient';

/**
 * Provider insurance on mobile — twins of web Common/ProviderInsurance.js and
 * RxAdvicePanel.js: claims (with insurer queries and payments), pre-auth
 * requests, the approval form, prescribing advice, licence, and lab/scan billing.
 */
const I = '/api/v1/insurance';
const money = (v) => `GHS ${Number(v || 0).toFixed(2)}`;
const when = (v) => (v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const CLAIM = {
  AWAITING_PATIENT: ['Awaiting member', '#e0f2fe', '#075985'], CONFIRMED: ['Confirmed', '#dbeafe', '#1e40af'], SUBMITTED: ['With insurer', '#ede9fe', '#5b21b6'],
  APPROVED: ['Approved', '#dcfce7', '#166534'], PAID: ['Paid', '#bbf7d0', '#14532d'], QUERIED: ['Queried', '#fef3c7', '#92400e'], REJECTED: ['Rejected', '#fee2e2', '#991b1b'], FLAGGED: ['Flagged', '#fecaca', '#991b1b'],
};
const PA = {
  PENDING: ['Pending', '#fef3c7', '#92400e'], QUERIED: ['Queried', '#ffedd5', '#9a3412'], APPROVED: ['Approved', '#dcfce7', '#166534'], PARTIAL: ['Partly approved', '#d9f99d', '#365314'],
  REJECTED: ['Rejected', '#fee2e2', '#991b1b'], CANCELLED: ['Cancelled', '#f1f5f9', '#475569'], EXPIRED: ['Expired', '#f1f5f9', '#475569'], USED: ['Used', '#e0e7ff', '#3730a3'],
};
const Pill = ({ map, k }) => { const m = map[k] || [k, '#f1f5f9', '#475569']; return <Text style={[s.pill, { backgroundColor: m[1], color: m[2] }]}>{m[0]}</Text>; };
const items = (json) => { try { return JSON.parse(json || '[]'); } catch { return []; } };

export function ProviderClaimsMobile({ accent = '#0f766e' }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const load = useCallback(async () => {
    try { const r = await api(`${I}/provider/claims${status ? `?status=${status}` : ''}`); setRows(Array.isArray(r) ? r : []); } catch { setRows([]); } finally { setLoading(false); }
  }, [status]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const openClaim = async (id) => { try { setOpen(await api(`${I}/claims/${id}`)); } catch (e) { Alert.alert('Error', e?.message); } };
  const respond = async () => {
    try { setOpen(await api(`${I}/provider/claims/${open.id}/respond`, { method: 'POST', body: { note } })); setNote(''); load(); } catch (e) { Alert.alert('Error', e?.message); }
  };
  const sum = (sts) => rows.filter(r => sts.includes(r.status)).reduce((a, r) => a + Number(r.insurerAmount || 0), 0);
  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <View style={s.kpis}>
        <View style={s.kpi}><Text style={s.kpiV}>{money(sum(['AWAITING_PATIENT', 'CONFIRMED', 'SUBMITTED']))}</Text><Text style={s.kpiL}>In progress</Text></View>
        <View style={s.kpi}><Text style={[s.kpiV, { color: '#0f766e' }]}>{money(sum(['APPROVED']))}</Text><Text style={s.kpiL}>Approved</Text></View>
        <View style={s.kpi}><Text style={[s.kpiV, { color: '#16a34a' }]}>{money(sum(['PAID']))}</Text><Text style={s.kpiL}>Paid</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingBottom: 8 }}>
        {[['', 'All'], ['QUERIED', 'Queried'], ['SUBMITTED', 'With insurer'], ['APPROVED', 'Approved'], ['PAID', 'Paid'], ['REJECTED', 'Rejected']].map(([k, l]) => (
          <TouchableOpacity key={k || 'all'} onPress={() => setStatus(k)} style={[s.tab, status === k && { backgroundColor: accent, borderColor: accent }]}><Text style={[s.tabT, status === k && { color: '#fff' }]}>{l}</Text></TouchableOpacity>))}
      </ScrollView>
      {loading ? <ActivityIndicator style={{ margin: 30 }} color={accent} /> : (
        <FlatList data={rows} keyExtractor={r => r.id} contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
          ListEmptyComponent={<Text style={s.empty}>No insurance claims yet.</Text>}
          renderItem={({ item: r }) => (
            <TouchableOpacity style={[s.card, r.status === 'QUERIED' && { borderLeftWidth: 4, borderLeftColor: '#f59e0b' }]} onPress={() => openClaim(r.id)}>
              <View style={s.row}><Text style={s.ref}>{r.claimRef}</Text><Pill map={CLAIM} k={r.status} /></View>
              <Text style={s.title}>{r.patientName || 'Patient'} · {r.serviceType}</Text>
              <Text style={s.meta}>{r.insurerName} · insurer pays {money(r.insurerAmount)} · {when(r.createdAt)}</Text>
            </TouchableOpacity>)} />
      )}
      <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => setOpen(null)}>
        <View style={s.overlay}><View style={s.sheet}>
          {open && <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
            <View style={s.row}><Text style={[s.title, { fontSize: 17 }]}>Claim {open.claimRef}</Text><TouchableOpacity onPress={() => setOpen(null)}><Text style={{ fontSize: 22 }}>✕</Text></TouchableOpacity></View>
            <Pill map={CLAIM} k={open.status} />
            {open.status === 'QUERIED' || open.status === 'REJECTED' ? <View style={[s.note, { backgroundColor: open.status === 'QUERIED' ? '#fffbeb' : '#fef2f2' }]}><Text style={s.title}>{open.status === 'QUERIED' ? 'The insurer asks' : 'Rejected'}</Text><Text style={s.meta}>{open.decisionReason}</Text></View> : null}
            {(open.lines || []).map((l, i) => <View key={i} style={s.lineRow}><Text style={[s.meta, { flex: 1, color: '#0f172a' }]}>{l.description} ×{Number(l.quantity)}</Text><Text style={s.meta}>{money(l.coveredAmount)}</Text></View>)}
            {(open.events || []).map((e, i) => <Text key={i} style={s.meta}>• {e.eventType.replace(/_/g, ' ').toLowerCase()}{e.detail ? ` — ${e.detail}` : ''} ({when(e.createdAt)})</Text>)}
            {open.status === 'QUERIED' ? <>
              <TextInput style={s.input} multiline placeholder="Your answer to the insurer" value={note} onChangeText={setNote} />
              <TouchableOpacity disabled={!note.trim()} onPress={respond} style={[s.btn, { backgroundColor: accent }, !note.trim() && { opacity: 0.5 }]}><Text style={s.btnT}>Send answer</Text></TouchableOpacity>
            </> : null}
          </ScrollView>}
        </View></View>
      </Modal>
    </View>
  );
}

/** Pick supporting documents (results, scans, letters, photos) and upload them; returns [{ url, name }]. */
async function pickAndUpload() {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    copyToCacheDirectory: true, multiple: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  const out = [];
  for (const a of result.assets) {
    if (a.size && a.size > 15 * 1024 * 1024) { Alert.alert('Too large', `${a.name} is larger than 15 MB`); continue; }
    const safe = String(a.name || 'file').replace(/[^\w.-]+/g, '_');
    const url = await uploadFile(`preauth/${Date.now()}_${safe}`, a.uri, a.mimeType || 'application/octet-stream');
    if (url) out.push({ url, name: a.name });
  }
  return out;
}

function AttachRow({ files, setFiles, accent }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try { const got = await pickAndUpload(); setFiles([...files, ...got]); }
    catch (e) { Alert.alert('Upload failed', e?.message || 'Could not upload the file.'); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ gap: 6 }}>
      <TouchableOpacity onPress={add} disabled={busy} style={[s.choice, { borderStyle: 'dashed', alignItems: 'center' }]}>
        {busy ? <ActivityIndicator color={accent} /> : <Text style={[s.title, { color: accent }]}>📎 Attach results / letter / photo</Text>}
      </TouchableOpacity>
      {files.map((f, i) => (
        <View key={i} style={s.row}><Text style={[s.meta, { flex: 1 }]} numberOfLines={1}>📎 {f.name}</Text>
          <TouchableOpacity onPress={() => setFiles(files.filter((_, j) => j !== i))}><Text style={{ color: '#b91c1c', fontWeight: '800' }}>Remove</Text></TouchableOpacity></View>
      ))}
    </View>
  );
}

export function ProviderPreauthMobile({ accent = '#0f766e', listPath = `${I}/preauth` }) {
  const [rows, setRows] = useState([]);
  const [reply, setReply] = useState({});
  const [replyFiles, setReplyFiles] = useState({});
  const load = useCallback(async () => { try { const r = await api(listPath); setRows(Array.isArray(r) ? r : []); } catch { setRows([]); } }, [listPath]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const respond = async (p) => {
    try {
      await api(`${I}/preauth/${p.id}/respond`, { method: 'POST', body: { note: reply[p.id], attachments: (replyFiles[p.id] || []).map(f => f.url) } });
      setReply(r => ({ ...r, [p.id]: '' })); setReplyFiles(r => ({ ...r, [p.id]: [] })); load();
    } catch (e) { Alert.alert('Error', e?.message); }
  };
  const cancel = (p) => Alert.alert('Cancel request?', '', [{ text: 'No', style: 'cancel' }, { text: 'Cancel it', style: 'destructive', onPress: async () => { try { await api(`${I}/preauth/${p.id}/cancel`, { method: 'POST' }); load(); } catch (e) { Alert.alert('Error', e?.message); } } }]);
  return (
    <FlatList style={{ backgroundColor: '#f8fafc' }} data={rows} keyExtractor={r => r.id} contentContainerStyle={{ padding: 12, gap: 8, flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} />} ListEmptyComponent={<Text style={s.empty}>No approval requests yet.</Text>}
      renderItem={({ item: p }) => (
        <View style={s.card}>
          <View style={s.row}><Text style={s.ref}>{p.ref}</Text><Pill map={PA} k={p.status} /></View>
          <Text style={s.title}>{p.patientName} · {items(p.itemsJson).map(i => i.description).join(', ')}</Text>
          <Text style={s.meta}>{p.insurerName} · {money(p.estimatedAmount)}{p.decisionReason ? ` — ${p.decisionReason}` : ''}</Text>
          {p.status === 'QUERIED' ? <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="Your answer" value={reply[p.id] || ''} onChangeText={v => setReply(r => ({ ...r, [p.id]: v }))} />
            <TouchableOpacity onPress={() => respond(p)} style={[s.btnSm, { backgroundColor: accent }]}><Text style={s.btnT}>Send</Text></TouchableOpacity></View> : null}
          {p.status === 'QUERIED' ? <View style={{ marginTop: 6 }}><AttachRow files={replyFiles[p.id] || []} setFiles={(f) => setReplyFiles(r => ({ ...r, [p.id]: f }))} accent={accent} /></View> : null}
          {items(p.attachmentsJson).length ? <Text style={s.meta}>📎 {items(p.attachmentsJson).length} document(s) attached</Text> : null}
          {['PENDING', 'QUERIED'].includes(p.status) ? <TouchableOpacity onPress={() => cancel(p)}><Text style={[s.meta, { color: '#b91c1c', marginTop: 6, fontWeight: '700' }]}>Cancel request</Text></TouchableOpacity> : null}
        </View>)} />
  );
}

/** Ask the insurer to approve before giving care. */
export function PreauthRequestSheet({ visible, patientId, patientName, cards: givenCards, serviceType, initialItems, sourceType, sourceId, diagnosisText, accent = '#0f766e', onClose, onDone }) {
  const [cards, setCards] = useState(givenCards || null);
  const [cardId, setCardId] = useState(givenCards?.[0]?.id || '');
  const [notes, setNotes] = useState('');
  const [icd, setIcd] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!visible || cards || !patientId) return;
    api(`${I}/patients/${patientId}/cards`).then(c => { setCards(c || []); if (c?.[0]) setCardId(c[0].id); }).catch(() => setCards([]));
  }, [visible, patientId]); // eslint-disable-line react-hooks/exhaustive-deps
  const send = async () => {
    setBusy(true);
    try {
      const r = await api(`${I}/preauth`, { method: 'POST', body: { attachments: files.map(f => f.url), patientId, cardId, serviceType, sourceType, sourceId, diagnosisIcd: icd || null, diagnosisText: diagnosisText || null,
        clinicalNotes: notes, items: (initialItems || []).map(i => ({ ...i, quantity: Number(i.quantity) || 1, unitPrice: i.unitPrice === '' || i.unitPrice == null ? null : Number(i.unitPrice) })) } });
      onDone?.(r);
    } catch (e) { Alert.alert('Error', e?.message || 'Could not send.'); } finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}><View style={s.sheet}><ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
        <View style={s.row}><Text style={[s.title, { fontSize: 17 }]}>Ask the insurer for approval</Text><TouchableOpacity onPress={onClose}><Text style={{ fontSize: 22 }}>✕</Text></TouchableOpacity></View>
        <Text style={s.meta}>{patientName || 'Patient'} · {(initialItems || []).map(i => i.description).join(', ')}</Text>
        {cards == null ? <ActivityIndicator color={accent} /> : cards.length === 0 ? <Text style={{ color: '#b91c1c' }}>This patient has no verified insurance card.</Text> : cards.map(c => (
          <TouchableOpacity key={c.id} onPress={() => setCardId(c.id)} style={[s.choice, cardId === c.id && { borderColor: accent, backgroundColor: '#f0fdfa' }]}><Text style={s.title}>{cardId === c.id ? '● ' : '○ '}{c.insurerName} · {c.planName || ''}</Text><Text style={s.meta}>{c.memberNo}</Text></TouchableOpacity>))}
        <TextInput style={s.input} placeholder="Diagnosis ICD-10 (e.g. E78.5)" value={icd} onChangeText={setIcd} autoCapitalize="characters" />
        <TextInput style={[s.input, { minHeight: 90 }]} multiline placeholder="Clinical reason (required): why it is needed, what was tried, results" value={notes} onChangeText={setNotes} />
        <AttachRow files={files} setFiles={setFiles} accent={accent} />
        <TouchableOpacity disabled={busy || !cardId || notes.trim().length < 10} onPress={send} style={[s.btn, { backgroundColor: accent }, (busy || !cardId || notes.trim().length < 10) && { opacity: 0.5 }]}><Text style={s.btnT}>{busy ? 'Sending…' : 'Send request'}</Text></TouchableOpacity>
      </ScrollView></View></View>
    </Modal>
  );
}

/** Live prescription check for doctors (insured patients). */
export function RxAdviceMobile({ patientId, patientName, medications, diagnosis, onSwitch, accent = '#1e6bb8' }) {
  const [advice, setAdvice] = useState(null);
  const [pa, setPa] = useState(null);
  const t = useRef(null);
  const meds = (medications || []).filter(m => m?.name?.trim());
  const key = JSON.stringify([patientId, meds.map(m => [m.name, m.strength, m.quantity]), diagnosis]);
  useEffect(() => {
    if (!patientId || !meds.length) { setAdvice(null); return undefined; }
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const icd = (diagnosis || '').match(/\b[A-TV-Z]\d{2}(\.\d{1,2})?\b/i)?.[0] || null;
      api(`${I}/rx-advice`, { method: 'POST', body: { patientId, medications: meds.map(m => ({ name: m.name, strength: m.strength || null, quantity: m.quantity ? Number(m.quantity) : null })), diagnosisIcd: icd, diagnosisText: diagnosis || null } })
        .then(setAdvice).catch(() => setAdvice(null));
    }, 800);
    return () => clearTimeout(t.current);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!advice || (!advice.insured && !(advice.warnings || []).length)) return null;
  return (
    <View style={s.advice}>
      <View style={s.row}><Text style={[s.title, { color: '#312e81' }]}>✨ Prescription check{advice.insured ? ` · ${advice.insurerName}` : ''}</Text>
        {Number(advice.potentialSaving) > 0 ? <Text style={[s.pill, { backgroundColor: '#16a34a', color: '#fff' }]}>Save {money(advice.potentialSaving)}</Text> : null}</View>
      {(advice.warnings || []).map((w, i) => <Text key={i} style={[s.warn, w.severity === 'HIGH' && { backgroundColor: '#fef2f2', color: '#991b1b' }]}>⚠ {w.text}</Text>)}
      {advice.insured ? (advice.lines || []).map((l, i) => (
        <View key={i} style={{ borderTopWidth: 1, borderTopColor: '#e0e7ff', paddingTop: 6, marginTop: 6 }}>
          <Text style={s.title}>{l.name} <Text style={s.meta}>· {(l.cover || '').toLowerCase()}</Text></Text>
          <Text style={s.meta}>{l.coverText}</Text>
          {l.cheaperOption ? <View style={[s.row, { marginTop: 4 }]}><Text style={[s.meta, { flex: 1, color: '#166534' }]}>{l.cheaperOption.name} — {l.cheaperOption.why}</Text>
            {onSwitch ? <TouchableOpacity onPress={() => onSwitch(medications.findIndex(m => m.name === l.name), l.cheaperOption.name, l.cheaperOption.strength)} style={[s.btnSm, { backgroundColor: accent }]}><Text style={s.btnT}>Switch</Text></TouchableOpacity> : null}</View> : null}
          {l.requiresPreauth ? <TouchableOpacity onPress={() => setPa(l)}><Text style={[s.meta, { color: accent, fontWeight: '800', marginTop: 4 }]}>Ask insurer for approval →</Text></TouchableOpacity> : null}
        </View>)) : null}
      <PreauthRequestSheet visible={!!pa} patientId={patientId} patientName={patientName} serviceType="PHARMACY" sourceType="PRESCRIPTION" accent={accent} diagnosisText={diagnosis}
        initialItems={pa ? [{ description: pa.name, code: '', quantity: Number((medications.find(m => m.name === pa.name) || {}).quantity) || 1, unitPrice: pa.tariff ?? '' }] : []}
        onClose={() => setPa(null)} onDone={() => { setPa(null); Alert.alert('Sent', 'The insurer will decide; the pharmacy can dispense once approved.'); }} />
    </View>
  );
}

/** Doctor's professional licence for NessaHub verification. */
export function LicenceCardMobile({ accent = '#1e6bb8' }) {
  const [d, setD] = useState(null);
  const [form, setForm] = useState(null);
  const load = useCallback(() => { api(`${I}/licence`).then(setD).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { try { await api(`${I}/licence`, { method: 'POST', body: form }); setForm(null); load(); Alert.alert('Sent', 'NessaHub will verify your licence.'); } catch (e) { Alert.alert('Error', e?.message); } };
  const st = d?.status || 'NOT_SUBMITTED';
  // Only for clinicians who bill insurers (or who already sent a licence).
  if (!d || (!d.servesInsuredMembers && st === 'NOT_SUBMITTED')) return null;
  return (
    <View style={[s.card, { borderColor: st === 'VERIFIED' ? '#86efac' : '#fde68a', marginBottom: 12 }]}>
      <Text style={s.title}>Professional licence: {st === 'NOT_SUBMITTED' ? 'not submitted' : st.toLowerCase()}</Text>
      <Text style={s.meta}>{d?.licenceNo ? `${d.licenceBody} · ${d.licenceNo}${d.licenceExpiry ? ` · expires ${d.licenceExpiry}` : ''}` : 'Insurers only pay verified clinicians.'}{d?.notes ? ` — ${d.notes}` : ''}</Text>
      {form ? <View style={{ gap: 6, marginTop: 8 }}>
        <TextInput style={s.input} placeholder="Licensing body" value={form.licenceBody} onChangeText={v => setForm({ ...form, licenceBody: v })} />
        <TextInput style={s.input} placeholder="Licence number" value={form.licenceNo} onChangeText={v => setForm({ ...form, licenceNo: v })} />
        <TextInput style={s.input} placeholder="Expiry (YYYY-MM-DD)" value={form.licenceExpiry} onChangeText={v => setForm({ ...form, licenceExpiry: v })} />
        <TouchableOpacity onPress={save} disabled={!form.licenceNo?.trim()} style={[s.btn, { backgroundColor: accent }]}><Text style={s.btnT}>Send for verification</Text></TouchableOpacity>
      </View> : <TouchableOpacity onPress={() => setForm({ licenceBody: d?.licenceBody || 'Medical & Dental Council', licenceNo: d?.licenceNo || '', licenceExpiry: d?.licenceExpiry || '' })}><Text style={{ color: accent, fontWeight: '800', marginTop: 6 }}>{st === 'NOT_SUBMITTED' ? 'Submit licence' : 'Update'}</Text></TouchableOpacity>}
    </View>
  );
}

/** Bill the patient's insurer for a lab/scan test (order detail). */
export function InsuranceBillMobile({ order, type = 'lab', accent = '#065f46' }) {
  const [info, setInfo] = useState(null);
  const [cardId, setCardId] = useState('');
  const [price, setPrice] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!order?.id) return;
    api(`/api/v1/diagnostics/operations/orders/${order.id}/insurance`).then(d => {
      setInfo(d); const u = (d.cards || []).filter(c => c.status === 'VERIFIED' && c.inNetwork); if (u[0]) setCardId(u[0].id); if (d.price != null) setPrice(String(d.price));
    }).catch(() => setInfo({ cards: [] }));
  }, [order?.id]);
  if (!info || !(info.cards || []).some(c => c.status === 'VERIFIED')) return null;
  const usable = (info.cards || []).filter(c => c.status === 'VERIFIED' && c.inNetwork);
  const bill = async () => {
    setBusy(true); setError('');
    try { setResult(await api(`/api/v1/diagnostics/operations/orders/${order.id}/bill-insurance`, { method: 'POST', body: { cardId, unitPrice: price === '' ? null : Number(price) } })); }
    catch (e) { setError(e?.message || 'Could not bill.'); } finally { setBusy(false); }
  };
  return (
    <View style={[s.card, { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }]}>
      <Text style={s.title}>🛡️ Insurance</Text>
      {info.billed && !result ? <Text style={s.meta}>Already billed to the insurer.</Text> : result ? (
        <Text style={[s.meta, { color: '#166534' }]}>✓ Billed to {result.insurerName}: insurer pays {money(result.coveredTotal)}, patient {money(result.patientTotal)}. The patient will confirm the test.</Text>
      ) : usable.length === 0 ? <Text style={[s.meta, { color: '#92400e' }]}>Patient has {(info.cards || []).map(c => c.insurerName).join(', ')} cover, but this centre has no verified provider code for it.</Text> : (
        <View style={{ gap: 6, marginTop: 6 }}>
          {usable.map(c => <TouchableOpacity key={c.id} onPress={() => setCardId(c.id)} style={[s.choice, cardId === c.id && { borderColor: accent }]}><Text style={s.title}>{cardId === c.id ? '● ' : '○ '}{c.insurerName} · {c.memberNo}</Text></TouchableOpacity>)}
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Price (GHS)" value={price} onChangeText={setPrice} />
          <TouchableOpacity disabled={busy || !cardId || price === ''} onPress={bill} style={[s.btn, { backgroundColor: accent }, (busy || price === '') && { opacity: 0.5 }]}><Text style={s.btnT}>{busy ? 'Checking…' : 'Check cover & bill insurer'}</Text></TouchableOpacity>
          {error ? <Text style={{ color: '#b91c1c', fontSize: 12 }}>{error}</Text> : null}
          {/pre-approval/i.test(error) ? <TouchableOpacity onPress={() => setAsk(true)}><Text style={{ color: accent, fontWeight: '800' }}>Ask the insurer for approval →</Text></TouchableOpacity> : null}
        </View>
      )}
      <PreauthRequestSheet visible={ask} patientId={order?.patientId} patientName={order?.patientName} cards={usable.map(c => ({ id: c.id, insurerName: c.insurerName, planName: c.planName, memberNo: c.memberNo }))}
        serviceType={type === 'scan' ? 'SCAN' : 'LAB'} sourceType="DIAGNOSTIC_ORDER" sourceId={order?.id} accent={accent}
        initialItems={[{ description: order?.testType || 'Test', code: '', quantity: 1, unitPrice: price }]} onClose={() => setAsk(false)} onDone={() => { setAsk(false); setError('Approval requested — bill again once approved.'); }} />
    </View>
  );
}

const s = StyleSheet.create({
  kpis: { flexDirection: 'row', gap: 8, padding: 12 },
  kpi: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 10 },
  kpiV: { fontSize: 15, fontWeight: '900', color: '#5b21b6' }, kpiL: { fontSize: 11, color: '#64748b', marginTop: 2 },
  tab: { borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }, tabT: { fontSize: 12, fontWeight: '800', color: '#334155' },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  ref: { fontFamily: 'monospace', fontWeight: '800', color: '#0f172a' },
  title: { fontSize: 14, fontWeight: '800', color: '#0f172a', flexShrink: 1 },
  meta: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 17 },
  pill: { fontSize: 10, fontWeight: '900', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  empty: { textAlign: 'center', color: '#94a3b8', padding: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '90%' },
  note: { borderRadius: 10, padding: 10 },
  lineRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#0f172a', backgroundColor: '#fff' },
  btn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' }, btnSm: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, justifyContent: 'center' },
  btnT: { color: '#fff', fontWeight: '800' },
  choice: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 8 },
  advice: { borderWidth: 1.5, borderColor: '#c7d2fe', backgroundColor: '#eef2ff', borderRadius: 14, padding: 12, marginVertical: 10 },
  warn: { backgroundColor: '#fffbeb', color: '#92400e', borderRadius: 8, padding: 8, fontSize: 12, marginTop: 6, overflow: 'hidden' },
});

/**
 * Insured e-prescription: the prescriber picks which verified card pays (or
 * self-pay). After saving, attachRxCardMobile links it; the patient gets an SMS
 * estimate and the pharmacy finds the card already chosen. Twin of web
 * Common/RxInsuranceCard.
 */
export function RxInsurancePickerMobile({ patientId, value, onChange, accent = '#1e6bb8' }) {
  const [cards, setCards] = useState(null);
  useEffect(() => {
    setCards(null);
    if (!patientId) return;
    api(`${I}/patients/${patientId}/cards`).then(c => {
      const list = Array.isArray(c) ? c : [];
      setCards(list);
      onChange((list.find(x => x.isDefault) || list[0])?.id || '');
    }).catch(() => setCards([]));
  }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!patientId || !cards || !cards.length) return null;
  return (
    <View style={{ borderWidth: 1.5, borderColor: '#bae6fd', backgroundColor: '#f0f9ff', borderRadius: 12, padding: 12, marginBottom: 12, gap: 6 }}>
      <Text style={[s.title, { color: '#075985' }]}>🛡️ Who pays for this prescription?</Text>
      <Text style={s.meta}>The patient gets a cost estimate by SMS; the pharmacy sees the card already selected.</Text>
      {cards.map(c => (
        <TouchableOpacity key={c.id} onPress={() => onChange(c.id)} style={[s.choice, value === c.id && { borderColor: accent, backgroundColor: '#fff' }]}>
          <Text style={s.title}>{value === c.id ? '● ' : '○ '}{c.insurerName}</Text><Text style={s.meta}>{c.planName || 'Plan'} · {c.memberNo}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={() => onChange('')} style={[s.choice, value === '' && { borderColor: accent, backgroundColor: '#fff' }]}><Text style={s.title}>{value === '' ? '● ' : '○ '}Self-pay</Text></TouchableOpacity>
    </View>
  );
}

export async function attachRxCardMobile(rxId, cardId) {
  if (!rxId || !cardId) return;
  try {
    const est = await api(`${I}/prescriptions/${rxId}/card`, { method: 'POST', body: { cardId } });
    const lines = (est?.lines || []).map(l => `• ${l.name}: ${String(l.tier || '').toLowerCase()}${l.requiresPreauth ? ' (needs approval)' : ''}`).join('\n');
    Alert.alert(`Insured · ${est?.insurerName || ''}`, est?.available
      ? `Estimate sent to the patient:\nInsurer pays about ${money(est.insurerTotal)}\nPatient pays about ${money(est.patientTotal)}${lines ? `\n\n${lines}` : ''}`
      : `${est?.note || 'No estimate available — the pharmacy will check cover.'}${lines ? `\n\n${lines}` : ''}`);
  } catch (e) { Alert.alert('Insurance', e?.message || 'Could not attach the insurance card.'); }
}
