import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Modal,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../../services/apiClient';
import { LabColors, ScanColors } from '../../constants/colors';

/**
 * Check a patient in at a lab or scan centre with the order's QR or 8-digit
 * code — the counterpart of the pharmacy's walk-in verify. Mobile twin of web
 * Diagnostic/DiagCheckIn.js.
 *
 * The server decides: a valid code for an order at this centre checks the
 * patient in, which is needed before collecting a sample, starting a scan or
 * sending a result. Any other code gets a reason and no patient details.
 */
const OPS = '/api/v1/diagnostics/operations';
const TONE = {
  CHECKED_IN: ['#ecfdf5', '#a7f3d0', '#065f46'],
  COMPLETED: ['#f8fafc', '#e2e8f0', '#334155'],
  NOT_YOUR_CENTRE: ['#fffbeb', '#fde68a', '#92400e'],
  PRESCRIPTION_CODE: ['#fffbeb', '#fde68a', '#92400e'],
  REVOKED: ['#fff7ed', '#fed7aa', '#9a3412'],
};
const BAD = ['#fef2f2', '#fecaca', '#991b1b'];

export default function DiagnosticCheckInScreen({ type = 'lab', profile }) {
  const isScan = type === 'scan';
  const C = isScan ? ScanColors : LabColors;
  const centreName = isScan ? (profile?.centerName || 'Scan Center') : (profile?.labName || 'Lab Center');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [showResult, setShowResult] = useState(false);
  const [notes, setNotes] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const order = result?.order;
  const st = String(order?.status || '').toUpperCase();

  // Never uppercase the input: the QR token is case-sensitive.
  const check = async (raw) => {
    const code = String(raw || '').trim();
    if (!code) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await api(`${OPS}/check-in`, { method: 'POST', body: { code } }));
    } catch (e) {
      Alert.alert('Could not check the code', e?.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { Alert.alert('Camera needed', 'Allow the camera to scan QR codes, or type the 8-digit code.'); return; }
    }
    setScanned(false);
    setShowScanner(true);
  };

  const onScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setShowScanner(false);
    setInput(data);
    check(data);
  };

  const refresh = (o) => setResult(r => (r ? { ...r, order: { ...r.order, ...o } } : r));

  const step = async (action, label) => {
    setBusy(true);
    try {
      const saved = await api(`${OPS}/orders/${order.id}/workflow`, { method: 'POST', body: { action } });
      refresh(saved);
      api('/api/v1/patient-timeline', { method: 'POST', body: { patientId: order.patientId, type: isScan ? 'SCAN_ORDER' : 'LAB_ORDER', title: `${label}: ${order.testType || 'test'}`, status: 'IN_PROGRESS', relatedId: order.id, actor: { role: isScan ? 'SCAN' : 'LAB', name: centreName } } }).catch(() => {});
    } catch (e) { Alert.alert('Could not update', e?.message || 'Please try again.'); }
    finally { setBusy(false); }
  };

  const submitResult = async () => {
    if (!notes.trim()) { Alert.alert('Required', isScan ? 'Add the findings.' : 'Add the result findings.'); return; }
    setSubmitting(true);
    try {
      await api(`${OPS}/orders/${order.id}/results`, { method: 'POST', body: { findings: notes.trim(), conclusion: conclusion.trim() || null } });
      api('/api/v1/patient-timeline', { method: 'POST', body: { patientId: order.patientId, type: isScan ? 'SCAN_RESULT' : 'LAB_RESULT', title: `${isScan ? 'Scan' : 'Lab test'} done: ${order.testType || ''}`, note: 'Your clinician will review the result and share it with you.', status: 'COMPLETED', relatedId: order.id, actor: { role: isScan ? 'SCAN' : 'LAB', name: centreName } } }).catch(() => {});
      refresh({ status: 'COMPLETED' });
      setShowResult(false);
      setNotes(''); setConclusion('');
      Alert.alert('Sent', 'The result went to the ordering clinician. The patient sees it once they share it.');
    } catch (e) { Alert.alert('Could not send', e?.message || 'Please try again.'); }
    finally { setSubmitting(false); }
  };

  const [bg, border, color] = result ? (TONE[result.result] || BAD) : [];
  const open = order && !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(st);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.background }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={[s.heading, { color: C.text }]}>Check in a patient</Text>
      <Text style={s.sub}>Ask for the QR code or 8-digit code in their NessaHub app or SMS. You need it before {isScan ? 'starting the scan' : 'collecting the sample'}.</Text>

      <TouchableOpacity style={[s.scanBtn, { backgroundColor: C.primary }]} onPress={openScanner} activeOpacity={0.85}>
        <Ionicons name="qr-code-outline" size={22} color="#fff" />
        <Text style={s.scanBtnText}>Scan QR code</Text>
      </TouchableOpacity>

      <Text style={s.or}>or type the code</Text>
      <View style={s.row}>
        <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="1234 5678" placeholderTextColor="#94a3b8"
          keyboardType="number-pad" autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => check(input)} returnKeyType="done" />
        <TouchableOpacity style={[s.goBtn, { backgroundColor: C.primary }, (!input.trim() || busy) && { opacity: 0.5 }]} disabled={!input.trim() || busy} onPress={() => check(input)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>Check in</Text>}
        </TouchableOpacity>
      </View>

      {result ? (
        <View style={[s.box, { backgroundColor: bg, borderColor: border }]}>
          <Text style={[s.msg, { color }]}>{result.message}</Text>
          {order ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <Text style={s.name}>{order.patientName || 'Patient'}</Text>
              <Text style={s.hint}>Check this name against their ID.</Text>
              <Text style={s.line}>{order.testType || 'Test'}{order.orderCode ? `  ·  ${order.orderCode}` : ''}</Text>
              {order.doctorName ? <Text style={s.hint}>Ordered by {order.doctorName}</Text> : null}
              {order.notes ? <Text style={s.hint}>Note: {order.notes}</Text> : null}
              {order.specimenType ? <Text style={s.hint}>Specimen: {order.specimenType}</Text> : null}
              {open ? (
                <View style={s.actions}>
                  {!isScan && st === 'PENDING' ? (
                    <TouchableOpacity style={[s.act, { backgroundColor: C.primaryLight }]} disabled={busy} onPress={() => step('COLLECT_SAMPLE', 'Sample collected')}>
                      <Ionicons name="water-outline" size={16} color={C.primary} /><Text style={[s.actText, { color: C.primary }]}>Collect sample</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isScan && (st === 'PENDING' || st === 'SCHEDULED') ? (
                    <TouchableOpacity style={[s.act, { backgroundColor: C.primaryLight }]} disabled={busy} onPress={() => step('START', 'Scan in progress')}>
                      <Ionicons name="play-circle-outline" size={16} color={C.primary} /><Text style={[s.actText, { color: C.primary }]}>Start scan</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!isScan && st === 'SAMPLE_COLLECTED' ? (
                    <TouchableOpacity style={[s.act, { backgroundColor: '#dbeafe' }]} disabled={busy} onPress={() => step('START', 'Lab test in progress')}>
                      <Ionicons name="play-circle-outline" size={16} color="#1e40af" /><Text style={[s.actText, { color: '#1e40af' }]}>Start test</Text>
                    </TouchableOpacity>
                  ) : null}
                  {st !== 'PENDING' || isScan ? (
                    <TouchableOpacity style={[s.act, { backgroundColor: C.primary }]} onPress={() => setShowResult(true)}>
                      <Ionicons name="cloud-upload-outline" size={16} color="#fff" /><Text style={[s.actText, { color: '#fff' }]}>{isScan ? 'Send report' : 'Send result'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          {result.otherOpenOrders?.length ? (
            <View style={{ marginTop: 10 }}>
              <Text style={s.line}>Other tests for this patient here — each has its own code:</Text>
              {result.otherOpenOrders.map(x => <Text key={x.id} style={s.hint}>• {x.testType || 'Test'}{x.checkedIn ? ' · checked in' : ''}</Text>)}
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView style={StyleSheet.absoluteFillObject} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : onScanned} />
          <View style={s.overlay}>
            <View style={s.frame} />
            <Text style={s.overlayHint}>Point at the patient’s QR code</Text>
            <TouchableOpacity style={s.cancel} onPress={() => setShowScanner(false)}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showResult} transparent animationType="slide" onRequestClose={() => setShowResult(false)}>
        <KeyboardAvoidingView style={s.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{isScan ? 'Send scan report' : 'Send lab result'}</Text>
            <Text style={s.hint}>{order?.testType} — {order?.patientName}</Text>
            <Text style={s.label}>Findings *</Text>
            <TextInput style={[s.field, { minHeight: 110 }]} multiline textAlignVertical="top" value={notes} onChangeText={setNotes}
              placeholder={isScan ? 'What the images show…' : 'Values and observations…'} placeholderTextColor="#94a3b8" />
            <Text style={s.label}>Conclusion</Text>
            <TextInput style={s.field} value={conclusion} onChangeText={setConclusion} placeholder="Short summary (optional)" placeholderTextColor="#94a3b8" />
            <Text style={s.hint}>It goes to the ordering clinician first. The patient sees it after they share it.</Text>
            <View style={s.sheetActions}>
              <TouchableOpacity style={s.sheetCancel} onPress={() => setShowResult(false)}><Text style={s.sheetCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[s.sheetSend, { backgroundColor: C.primary }, submitting && { opacity: 0.6 }]} disabled={submitting} onPress={submitResult}>
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.sheetSendText}>Send</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  heading: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  sub: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 16 },
  scanBtn: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  or: { textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: '700', marginVertical: 12 },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, letterSpacing: 2, fontVariant: ['tabular-nums'], color: '#0f172a' },
  goBtn: { borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  goText: { color: '#fff', fontWeight: '800' },
  box: { marginTop: 16, borderWidth: 1.5, borderRadius: 14, padding: 14 },
  msg: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  name: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  line: { fontSize: 14, color: '#0f172a', fontWeight: '600' },
  hint: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  actText: { fontWeight: '800', fontSize: 13 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 260, height: 260, borderWidth: 3, borderColor: '#fff', borderRadius: 16, marginBottom: 24 },
  overlayHint: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 32 },
  cancel: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  cancelText: { color: '#fff', fontWeight: '700' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, gap: 6 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  label: { fontSize: 12, fontWeight: '800', color: '#334155', marginTop: 8 },
  field: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, fontSize: 14, color: '#0f172a' },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  sheetCancel: { flex: 1, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 12, padding: 12, alignItems: 'center' },
  sheetCancelText: { fontWeight: '700', color: '#334155' },
  sheetSend: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  sheetSendText: { color: '#fff', fontWeight: '800' },
});
