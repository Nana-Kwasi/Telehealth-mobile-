import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { api, getStoredUserId, uploadFile } from '../services/apiClient';

/**
 * Upload a document; it is read, sorted and filled in, then a person files it.
 * Mobile counterpart of web's SmartDocumentUpload.
 *
 * The name check comes from the server, in code: the name printed on the
 * document against the patient it is about to be filed to. A mismatch needs
 * an explicit switch before it can be filed — a lab report in the wrong record
 * is the failure this has to prevent.
 *
 * `patientId` is for a clinician filing to someone they treat.
 */
export default function SmartDocumentCard({ patientId = null, onFiled, accent = '#2a3ea8' }) {
  const [stage, setStage]   = useState('idle');
  const [result, setResult] = useState(null);
  const [record, setRecord] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [error, setError]   = useState('');

  const pick = async () => {
    setError('');
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      setStage('reading'); setConfirm(false);
      const me = await getStoredUserId();
      const { fileId } = await uploadFile(`healthRecords/${me}`, asset.uri,
        asset.mimeType || 'image/jpeg', { withMeta: true });
      const res = await api('/api/v1/ai/document/classify', { method: 'POST', body: { fileId, patientId } });
      if (!res?.ok) { setError(res?.message || 'That document could not be read.'); setStage('idle'); return; }
      setResult(res);
      setRecord({ ...res.suggestedRecord });
      setStage('review');
    } catch (e) {
      setError(e?.message || 'That document could not be read.');
      setStage('idle');
    }
  };

  const file = async () => {
    setStage('filing'); setError('');
    try {
      await api('/api/v1/ai/document/file', {
        method: 'POST', body: { classificationId: result.classificationId, ...record, confirmMismatch: confirm },
      });
      setStage('done');
      onFiled?.();
    } catch (e) {
      setError(e?.message || 'That could not be filed.');
      setStage('review');
    }
  };

  const reset = () => { setStage('idle'); setResult(null); setRecord(null); setError(''); };
  const mismatch = result?.nameCheck === 'mismatch';
  const blocked = stage === 'filing' || (mismatch && !confirm);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}><Ionicons name="scan-outline" size={16} color={accent} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add a document</Text>
          <Text style={styles.sub}>A lab report, prescription, referral, certificate or scan report — read and filled in for you to check.</Text>
        </View>
      </View>

      {stage === 'idle' ? (
        <TouchableOpacity style={[styles.go, { backgroundColor: accent }]} onPress={pick}>
          <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
          <Text style={styles.goText}>Choose a document</Text>
        </TouchableOpacity>
      ) : null}
      {stage === 'reading' ? (
        <View style={styles.busy}><ActivityIndicator size="small" color={accent} /><Text style={styles.sub}>Reading the document…</Text></View>
      ) : null}
      {stage === 'done' ? (
        <View style={styles.busy}>
          <Ionicons name="checkmark-circle" size={16} color="#12602f" />
          <Text style={styles.doneText}>Filed to Health Records.</Text>
          <TouchableOpacity onPress={reset}><Text style={[styles.link, { color: accent }]}>Add another</Text></TouchableOpacity>
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {(stage === 'review' || stage === 'filing') && result ? (
        <View style={styles.review}>
          <Text style={styles.type}>{result.label} <Text style={styles.sub}>· {result.confidence} confidence</Text></Text>
          {result.printed?.issuer ? <Text style={styles.sub}>{result.printed.issuer}</Text> : null}

          <NameCheck check={result.nameCheck} printed={result.printed?.patientName} patient={result.patientName} />

          {result.documentType === 'lab_report' && Array.isArray(result.fields?.tests)
            ? result.fields.tests.map((t, i) => (
              <Text key={i} style={styles.line}>
                {t.name}: {t.value} {t.unit}{t.referenceRange ? `  (ref ${t.referenceRange})` : ''}{t.flag ? `  ${t.flag}` : ''}
              </Text>
            ))
            : Object.entries(result.fields || {})
              .filter(([, v]) => typeof v === 'string' && v.trim())
              .map(([k, v]) => <Text key={k} style={styles.line}><Text style={styles.bold}>{k}: </Text>{v}</Text>)}
          {result.pagesNotRead ? (
            <Text style={styles.warn}>Only page 1 was read — {result.pagesNotRead} more page(s) were not.</Text>
          ) : null}

          <Text style={styles.route}>Suggested for: <Text style={styles.bold}>{result.route?.department}</Text></Text>

          <Text style={styles.label}>Record name</Text>
          <TextInput style={styles.input} value={record.name} onChangeText={(t) => setRecord({ ...record, name: t })} />
          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput style={styles.input} value={record.date} onChangeText={(t) => setRecord({ ...record, date: t })} />
          <Text style={styles.label}>Notes</Text>
          <TextInput style={[styles.input, { minHeight: 70 }]} multiline textAlignVertical="top"
            value={record.notes} onChangeText={(t) => setRecord({ ...record, notes: t })} />

          {mismatch ? (
            <View style={styles.confirm}>
              <Switch value={confirm} onValueChange={setConfirm} />
              <Text style={styles.confirmText}>I have checked — this belongs to {result.patientName || 'this patient'}.</Text>
            </View>
          ) : null}

          <Text style={styles.sub}>{result.disclaimer}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.go, { backgroundColor: accent }, blocked && styles.off]} onPress={file} disabled={blocked}>
              <Text style={styles.goText}>{stage === 'filing' ? 'Filing…' : 'File to Health Records'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.ghost} onPress={reset}><Text style={styles.ghostText}>Discard</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function NameCheck({ check, printed, patient }) {
  if (check === 'match') {
    return <Text style={[styles.check, styles.ok]}>✓ Name matches: {printed}</Text>;
  }
  if (check === 'not_found') {
    return <Text style={[styles.check, styles.neutral]}>No patient name on the document — check it is {patient}'s.</Text>;
  }
  return (
    <Text style={[styles.check, check === 'mismatch' ? styles.bad : styles.warnBox]}>
      ⚠ {check === 'mismatch' ? 'Different name' : 'Name only partly matches'}: the document says “{printed}”, this record is {patient}.
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 18, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 10 },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 2 },
  go: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999 },
  goText: { color: '#fff', fontSize: 13.5, fontWeight: '700' },
  ghost: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: '#d8dce6' },
  ghostText: { fontSize: 13.5, fontWeight: '700', color: '#2c3040' },
  off: { opacity: 0.5 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { fontSize: 13.5, fontWeight: '700', color: '#12602f' },
  link: { fontSize: 13, fontWeight: '700' },
  error: { fontSize: 12.5, color: '#8f1d17', marginTop: 6 },
  warn: { fontSize: 12, color: '#8a4b09', marginTop: 4 },
  review: { borderTopWidth: 1, borderTopColor: '#eef0f4', paddingTop: 10, marginTop: 4 },
  type: { fontSize: 14.5, fontWeight: '800', color: '#15173a' },
  check: { fontSize: 12.5, fontWeight: '600', borderRadius: 10, padding: 9, marginVertical: 8, overflow: 'hidden' },
  ok: { backgroundColor: '#e6f6ec', color: '#12602f' },
  neutral: { backgroundColor: '#f4f5f8', color: '#3d4257' },
  warnBox: { backgroundColor: '#fff4e5', color: '#8a4b09' },
  bad: { backgroundColor: '#fdeceb', color: '#8f1d17' },
  line: { fontSize: 12.5, color: '#2c3040', marginTop: 2 },
  bold: { fontWeight: '700' },
  route: { fontSize: 12.5, color: '#2c3040', marginTop: 8 },
  label: { fontSize: 11.5, fontWeight: '700', color: '#3d4257', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#d8dce6', borderRadius: 10, padding: 9, fontSize: 13, color: '#2c3040', marginTop: 3 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  confirmText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#8f1d17' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
});
