import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, TextInput, Alert, Switch, ActivityIndicator, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { api, uploadFile } from '../../services/apiClient';
import {
  STAGES, PRIORITY, OPEN_STAGES, stageOf, priorityOf, templateFor, flagFor, FLAG_META, rangeText, modalityFor, SPECIMENS, toDate,
} from './diagUi';

/**
 * Branch workflow on mobile — twin of web DiagWorklist's actions: collect sample
 * (lab), book (scan), start, enter result / write report, priority, reject.
 */
const OPS = '/api/v1/diagnostics/operations';

export function StagePill({ status, small }) {
  const m = STAGES[stageOf(status)] || STAGES.PENDING;
  return (
    <View style={[s.pill, { backgroundColor: m.bg }]}>
      <View style={[s.dot, { backgroundColor: m.dot }]} />
      <Text style={[s.pillText, { color: m.fg }, small && { fontSize: 10 }]}>{m.short}</Text>
    </View>
  );
}

export function PriorityPill({ priority }) {
  const k = priorityOf(priority);
  if (k === 'ROUTINE') return null;
  const m = PRIORITY[k];
  return <View style={[s.pill, { backgroundColor: m.bg }]}><Text style={[s.pillText, { color: m.fg }]}>{k === 'STAT' ? '⚡ ' : ''}{m.label}</Text></View>;
}

export function useCatalogMobile(type) {
  const [items, setItems] = useState([]);
  useEffect(() => { api(`${OPS}/catalog/mine?diagnosticType=${type}`).then(r => setItems(Array.isArray(r) ? r : [])).catch(() => setItems([])); }, [type]);
  return useMemo(() => {
    const byId = new Map(items.map(i => [i.id, i]));
    const byName = new Map(items.map(i => [String(i.name || '').trim().toLowerCase(), i]));
    return { items, find: (o) => byId.get(o?.catalogItemId) || byName.get(String(o?.testType || '').trim().toLowerCase()) || null };
  }, [items]);
}

function Sheet({ visible, title, sub, onClose, children, footer, accent }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              {sub ? <Text style={s.muted} numberOfLines={2}>{sub}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={{ fontSize: 22, color: '#64748b' }}>✕</Text></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={s.sheetFoot}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

function Btn({ label, onPress, primary, danger, disabled, accent, small, busy }) {
  return (
    <TouchableOpacity disabled={disabled || busy} onPress={onPress}
      style={[s.btn, small && s.btnSm, primary && { backgroundColor: accent, borderColor: accent }, danger && { borderColor: '#fecaca' }, (disabled || busy) && { opacity: 0.5 }]}>
      {busy ? <ActivityIndicator color={primary ? '#fff' : accent} size="small" /> :
        <Text style={[s.btnText, small && { fontSize: 12 }, primary && { color: '#fff' }, danger && { color: '#b91c1c' }]}>{label}</Text>}
    </TouchableOpacity>
  );
}

function Chips({ options, value, onChange, accent }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(o => (
        <TouchableOpacity key={o} onPress={() => onChange(o)} style={[s.chip, value === o && { backgroundColor: accent, borderColor: accent }]}>
          <Text style={[s.chipText, value === o && { color: '#fff' }]}>{o}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function CollectSheet({ order, catalogItem, accent, onClose, onDone }) {
  const tpl = templateFor(order.testType, catalogItem);
  const [specimen, setSpecimen] = useState(order.specimenType || tpl.specimen || SPECIMENS[0]);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onDone(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action: 'COLLECT_SAMPLE', specimenType: specimen } })); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not record the sample.'); setBusy(false); }
  };
  return (
    <Sheet visible title="Collect sample" sub={`${order.patientName || 'Patient'} · ${order.testType || ''}`} onClose={onClose}
      footer={<><Btn label="Cancel" onPress={onClose} accent={accent} /><Btn primary label="Sample collected" busy={busy} onPress={save} accent={accent} /></>}>
      <View style={s.warn}><Text style={s.warnTitle}>🪪 Check identity first</Text><Text style={s.warnText}>Match the National ID to {order.patientName || 'the patient'} before drawing the sample.</Text></View>
      <Text style={s.label}>Specimen</Text>
      <Chips options={[...new Set([specimen, ...SPECIMENS])].filter(Boolean)} value={specimen} onChange={setSpecimen} accent={accent} />
      <Text style={s.muted}>An accession number is issued for the tube label.</Text>
    </Sheet>
  );
}

function ScheduleSheet({ order, catalogItem, accent, onClose, onDone }) {
  const mod = modalityFor(order.testType);
  const init = toDate(order.scheduledAt) || (() => { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); return d; })();
  const [when, setWhen] = useState(init);
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onDone(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action: 'SCHEDULE', scheduledAt: when.toISOString() } })); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not book the scan.'); setBusy(false); }
  };
  return (
    <Sheet visible title={`Book ${mod.label.toLowerCase()}`} sub={`${order.patientName || 'Patient'} · ${order.testType || ''}`} onClose={onClose}
      footer={<><Btn label="Cancel" onPress={onClose} accent={accent} /><Btn primary label="Book & notify" busy={busy} onPress={save} accent={accent} /></>}>
      <Text style={s.label}>Date and time</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Btn label={`📅 ${when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}`} onPress={() => setPicker('date')} accent={accent} />
        <Btn label={`🕒 ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`} onPress={() => setPicker('time')} accent={accent} />
      </View>
      {picker && (
        <DateTimePicker value={when} mode={picker} minimumDate={picker === 'date' ? new Date() : undefined}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(e, d) => { if (Platform.OS !== 'ios') setPicker(null); if (d) setWhen(d); }} />
      )}
      {picker && Platform.OS === 'ios' ? <Btn small label="Done" onPress={() => setPicker(null)} accent={accent} /> : null}
      <View style={s.infoBox}>
        <Text style={[s.label, { marginBottom: 4 }]}>Patient preparation — {mod.label}</Text>
        <Text style={s.body}>{catalogItem?.preparation || mod.prep}</Text>
      </View>
    </Sheet>
  );
}

function RejectSheet({ order, accent, onClose, onDone }) {
  const reasons = ['Patient did not attend', 'Sample haemolysed / clotted', 'Insufficient sample', 'Wrong or missing label', 'Test not offered here', 'Equipment unavailable', 'Patient refused'];
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { onDone(await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action: 'REJECT', reason } })); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not reject.'); setBusy(false); }
  };
  return (
    <Sheet visible title="Reject order" sub={`${order.patientName || 'Patient'} · ${order.testType || ''}`} onClose={onClose}
      footer={<><Btn label="Cancel" onPress={onClose} accent={accent} /><Btn danger label="Reject & tell doctor" busy={busy} disabled={!reason.trim()} onPress={save} accent={accent} /></>}>
      <Chips options={reasons} value={reason} onChange={setReason} accent="#b91c1c" />
      <Text style={s.label}>Reason (sent to the ordering doctor)</Text>
      <TextInput style={[s.input, { minHeight: 70 }]} multiline value={reason} onChangeText={setReason} />
    </Sheet>
  );
}

function ResultSheet({ type, order, catalogItem, accent, onClose, onDone }) {
  const tpl = useMemo(() => templateFor(order.testType, catalogItem), [order.testType, catalogItem]);
  const [rows, setRows] = useState(() => tpl.params.map(p => ({ ...p, value: '' })));
  const [findings, setFindings] = useState('');
  const [technique, setTechnique] = useState('');
  const [impression, setImpression] = useState('');
  const [techNote, setTechNote] = useState('');
  const [criticalScan, setCriticalScan] = useState(false);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const flagged = rows.map(r => ({ ...r, flag: flagFor(r, r.value) }));
  const anyCritical = type === 'lab' ? flagged.some(r => r.flag === 'LL' || r.flag === 'HH') : criticalScan;
  const canSave = type === 'lab' ? (flagged.some(r => String(r.value || '').trim()) || findings.trim() || file) : (impression.trim() && (findings.trim() || file));
  const setRow = (i, patch) => setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    if (!r.canceled && r.assets?.[0]) setFile(r.assets[0]);
  };

  const save = async () => {
    setBusy(true);
    try {
      let reportUrl = null;
      if (file) {
        const safe = String(file.name || 'report').replace(/[^a-zA-Z0-9._-]/g, '_');
        reportUrl = await uploadFile(`diagnostic-results/${order.id}/${Date.now()}_${safe}`, file.uri, file.mimeType || 'application/octet-stream');
      }
      const values = type === 'lab'
        ? flagged.filter(r => String(r.value || '').trim()).map(r => ({ name: r.name, value: String(r.value).trim(), unit: r.unit || '', range: rangeText(r), flag: r.flag || '' }))
        : null;
      const scanFindings = [order.notes && `Clinical indication: ${order.notes}`, technique.trim() && `Technique: ${technique.trim()}`, findings.trim() && `Findings: ${findings.trim()}`].filter(Boolean).join('\n\n');
      const saved = await api(`${OPS}/orders/${order.id}/results`, { method: 'POST', body: {
        findings: type === 'lab' ? (findings.trim() || null) : scanFindings,
        conclusion: type === 'lab' ? null : impression.trim(),
        reportUrl, values, critical: anyCritical, techNote: techNote.trim() || null,
      } });
      api('/api/v1/patient-timeline', { method: 'POST', body: {
        patientId: order.patientId, type: type === 'lab' ? 'LAB_RESULT' : 'SCAN_RESULT',
        title: `${type === 'lab' ? 'Lab test' : 'Scan'} done: ${order.testType || 'Diagnostic test'}`,
        note: 'Your doctor will review the result and share it with you.', status: 'COMPLETED', relatedId: order.id,
      } }).catch(() => {});
      Alert.alert('Submitted', anyCritical ? 'Sent to the doctor with an urgent alert.' : 'Sent to the ordering doctor. The patient sees it once the doctor shares it.');
      onDone(saved);
    } catch (e) { Alert.alert('Error', e?.message || 'Could not save the result.'); setBusy(false); }
  };

  return (
    <Sheet visible title={type === 'lab' ? 'Enter lab result' : 'Write scan report'}
      sub={`${order.patientName || 'Patient'} · ${order.testType || ''}${order.accessionNo ? ` · ${order.accessionNo}` : ''}`} onClose={onClose}
      footer={<><Btn label="Cancel" onPress={onClose} accent={accent} /><Btn primary label={anyCritical ? 'Submit & alert' : 'Submit'} busy={busy} disabled={!canSave} onPress={save} accent={accent} /></>}>
      {anyCritical ? <View style={s.crit}><Text style={s.critText}>🚨 Critical {type === 'lab' ? 'value' : 'finding'} — the doctor gets an urgent alert.</Text></View> : null}
      {type === 'lab' ? (
        <>
          {flagged.map((r, i) => (
            <View key={i} style={s.paramRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={s.paramName}>{r.name}</Text>
                {r.flag ? <View style={[s.flag, { backgroundColor: FLAG_META[r.flag].bg }]}><Text style={[s.flagText, { color: FLAG_META[r.flag].fg }]}>{FLAG_META[r.flag].label}</Text></View> : null}
              </View>
              {r.kind === 'qual'
                ? <Chips options={r.options} value={r.value} onChange={(v) => setRow(i, { value: v })} accent={accent} />
                : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput style={[s.input, { flex: 1 }]} value={r.value} keyboardType={r.kind === 'num' ? 'decimal-pad' : 'default'} onChangeText={(v) => setRow(i, { value: v })} placeholder="Result" placeholderTextColor="#94a3b8" />
                    {r.unit ? <Text style={s.muted}>{r.unit}</Text> : null}
                  </View>
                )}
              {rangeText(r) ? <Text style={[s.muted, { marginTop: 4 }]}>Reference: {rangeText(r)}</Text> : null}
            </View>
          ))}
          <Text style={s.muted}>{tpl.source === 'catalog' ? 'Ranges from your Test Catalog.' : tpl.source === 'default' ? 'Typical adult ranges — set your own in the catalog on web.' : 'No template — type the result.'}</Text>
          <Text style={s.label}>Comment (optional)</Text>
          <TextInput style={[s.input, { minHeight: 70 }]} multiline value={findings} onChangeText={setFindings} />
        </>
      ) : (
        <>
          {order.notes ? <View style={s.infoBox}><Text style={s.label}>Clinical indication</Text><Text style={s.body}>{order.notes}</Text></View> : null}
          <Text style={s.label}>Technique</Text>
          <TextInput style={[s.input, { minHeight: 50 }]} multiline value={technique} onChangeText={setTechnique} />
          <Text style={s.label}>Findings</Text>
          <TextInput style={[s.input, { minHeight: 110 }]} multiline value={findings} onChangeText={setFindings} />
          <Text style={s.label}>Impression *</Text>
          <TextInput style={[s.input, { minHeight: 60 }]} multiline value={impression} onChangeText={setImpression} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[s.label, { color: '#991b1b', flex: 1 }]}>Critical / urgent finding</Text>
            <Switch value={criticalScan} onValueChange={setCriticalScan} />
          </View>
        </>
      )}
      <Btn label={file ? `📎 ${file.name}` : '📎 Attach report (PDF or photo)'} onPress={pick} accent={accent} />
      <Text style={s.label}>Internal note (not for the patient)</Text>
      <TextInput style={s.input} value={techNote} onChangeText={setTechNote} placeholder="Analyser, QC lot, repeat run…" placeholderTextColor="#94a3b8" />
    </Sheet>
  );
}

export function useOrderActionsMobile(type, catalog, accent, onChanged) {
  const [modal, setModal] = useState(null);
  const done = (saved) => { setModal(null); onChanged(saved); };
  const workflow = async (o, body) => {
    try { onChanged(await api(`${OPS}/orders/${o.id}/workflow`, { method: 'POST', body })); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not update the order.'); }
  };
  const changePriority = (o) => Alert.alert('Priority', `${o.patientName || 'Order'} · ${o.testType || ''}`, [
    ...Object.keys(PRIORITY).map(k => ({ text: PRIORITY[k].label, onPress: () => workflow(o, { action: 'PRIORITY', priority: k }) })),
    { text: 'Cancel', style: 'cancel' },
  ]);

  const element = modal ? (() => {
    const item = catalog.find(modal.order);
    const props = { order: modal.order, catalogItem: item, accent, onClose: () => setModal(null), onDone: done };
    if (modal.kind === 'collect') return <CollectSheet {...props} />;
    if (modal.kind === 'schedule') return <ScheduleSheet {...props} />;
    if (modal.kind === 'reject') return <RejectSheet {...props} />;
    return <ResultSheet type={type} {...props} />;
  })() : null;

  const buttons = (o) => {
    const st = stageOf(o.status);
    if (!OPEN_STAGES.includes(st)) return null;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {type === 'lab' && st === 'PENDING' && <Btn small primary label="Collect sample" onPress={() => setModal({ kind: 'collect', order: o })} accent={accent} />}
        {type === 'scan' && st === 'PENDING' && <Btn small primary label="Book" onPress={() => setModal({ kind: 'schedule', order: o })} accent={accent} />}
        {type === 'scan' && st === 'SCHEDULED' && <Btn small label="Reschedule" onPress={() => setModal({ kind: 'schedule', order: o })} accent={accent} />}
        {(st === 'SAMPLE_COLLECTED' || st === 'SCHEDULED' || (type === 'scan' && st === 'PENDING')) && <Btn small label="Start" onPress={() => workflow(o, { action: 'START' })} accent={accent} />}
        {(st === 'IN_PROGRESS' || st === 'SAMPLE_COLLECTED' || st === 'SCHEDULED') && <Btn small primary label={type === 'lab' ? 'Enter result' : 'Write report'} onPress={() => setModal({ kind: 'result', order: o })} accent={accent} />}
        <Btn small label={`Priority: ${PRIORITY[priorityOf(o.priority)].label}`} onPress={() => changePriority(o)} accent={accent} />
        <Btn small danger label="Reject" onPress={() => setModal({ kind: 'reject', order: o })} accent={accent} />
      </View>
    );
  };
  return { element, buttons };
}

const s = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  pillText: { fontSize: 11, fontWeight: '800' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%' },
  sheetHead: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', gap: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sheetFoot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, padding: 14, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  muted: { fontSize: 12, color: '#64748b' },
  body: { fontSize: 13, color: '#334155', lineHeight: 19 },
  label: { fontSize: 12, fontWeight: '800', color: '#334155' },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#0f172a', textAlignVertical: 'top' },
  btn: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  btnSm: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnText: { fontWeight: '800', fontSize: 13, color: '#0f172a' },
  chip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  warn: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1.5, borderRadius: 12, padding: 12 },
  warnTitle: { fontWeight: '800', color: '#92400e' },
  warnText: { color: '#92400e', fontSize: 12, marginTop: 2 },
  infoBox: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 12, padding: 12 },
  crit: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1.5, borderRadius: 12, padding: 12 },
  critText: { color: '#991b1b', fontWeight: '800', fontSize: 13 },
  paramRow: { borderWidth: 1, borderColor: '#f1f5f9', backgroundColor: '#f8fafc', borderRadius: 12, padding: 10 },
  paramName: { fontWeight: '800', fontSize: 13, color: '#0f172a' },
  flag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  flagText: { fontSize: 10, fontWeight: '900' },
});
