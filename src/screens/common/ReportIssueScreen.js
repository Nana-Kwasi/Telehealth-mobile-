import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../../services/apiClient';

/**
 * Mobile counterpart of the web GlobalReportForm — raise an issue with the platform
 * team and review what this account has already reported. Shared by every org
 * dashboard (pharmacy parent/branch, lab, scan); `reporterType` scopes the report.
 */

const CATEGORIES = ['complaint', 'bug', 'feature_request', 'billing', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const SEVERITY_COLOR = {
  low: '#16a34a', medium: '#d97706', high: '#dc2626', critical: '#7f1d1d',
};

export default function ReportIssueScreen({ profile, reporterType, accent = '#1e6bb8' }) {
  const [category, setCategory] = useState('complaint');
  const [severity, setSeverity] = useState('medium');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const reporterId = profile?.id;

  const loadReports = useCallback(async () => {
    if (!reporterId) { setLoading(false); return; }
    try {
      const data = await api(`/api/v1/reports/global?reporterId=${reporterId}`).catch(() => []);
      setReports(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [reporterId]);

  useFocusEffect(useCallback(() => { loadReports(); }, [loadReports]));

  const submit = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert('Incomplete', 'A subject and a message are both required.');
      return;
    }
    setSaving(true);
    try {
      await api('/api/v1/reports/global', {
        method: 'POST',
        body: {
          category,
          severity,
          subject: subject.trim(),
          message: message.trim(),
          reporterId,
          reporterType,
          reporterName: profile?.branchName || profile?.pharmacyName || profile?.labName
            || profile?.centerName || profile?.name || 'Account',
          reporterEmail: profile?.email || null,
          status: 'open',
        },
      });
      setSubject(''); setMessage(''); setCategory('complaint'); setSeverity('medium');
      Alert.alert('Sent', 'Your report has been submitted.');
      loadReports();
    } catch {
      Alert.alert('Error', 'Could not submit your report. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const Chip = ({ label, active, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: `${accent}18`, borderColor: accent }]}>
      <Text style={[styles.chipText, active && { color: accent, fontWeight: '800' }]}>
        {String(label).replace(/_/g, ' ')}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>Report an Issue</Text>
      <Text style={styles.sub}>Raise a problem with the platform team</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map(c => (
            <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>

        <Text style={styles.label}>Severity</Text>
        <View style={styles.chipRow}>
          {SEVERITIES.map(s => (
            <Chip key={s} label={s} active={severity === s} onPress={() => setSeverity(s)} />
          ))}
        </View>

        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          placeholder="Short summary"
          placeholderTextColor="#94a3b8"
          value={subject}
          onChangeText={setSubject}
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Describe what happened…"
          placeholderTextColor="#94a3b8"
          value={message}
          onChangeText={setMessage}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          disabled={saving}
          onPress={submit}
          style={[styles.submit, { backgroundColor: accent }, saving && { opacity: 0.5 }]}>
          <Text style={styles.submitText}>{saving ? 'Sending…' : 'Submit report'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>My reports</Text>
      {loading ? (
        <ActivityIndicator color={accent} style={{ marginTop: 20 }} />
      ) : reports.length === 0 ? (
        <Text style={styles.muted}>You have not reported anything yet.</Text>
      ) : (
        reports.map(r => (
          <View key={r.id} style={styles.reportCard}>
            <View style={styles.reportHead}>
              <Text style={styles.reportSubject}>{r.subject || '—'}</Text>
              <Text style={[styles.severity, { color: SEVERITY_COLOR[r.severity] || '#64748b' }]}>
                {r.severity || '—'}
              </Text>
            </View>
            <Text style={styles.reportMeta}>
              {String(r.category || '—').replace(/_/g, ' ')} · {r.status || 'open'}
              {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString()}` : ''}
            </Text>
            {r.message ? <Text style={styles.reportBody}>{r.message}</Text> : null}
            {/* The admin replies as a thread (`adminReplies`); `adminNote` is the
                older single-note field kept for reports raised before that. */}
            {r.adminNote ? <Text style={styles.response}>Admin: {r.adminNote}</Text> : null}
            {(Array.isArray(r.adminReplies) ? r.adminReplies : []).map((rep, i) => (
              <View key={i} style={styles.replyBox}>
                <Text style={styles.replyFrom}>{rep.by || 'Admin'}</Text>
                <Text style={styles.replyText}>{rep.text || rep.message || ''}</Text>
                {rep.sentAt ? (
                  <Text style={styles.replyTime}>
                    {new Date(rep.sentAt.seconds ? rep.sentAt.seconds * 1000 : rep.sentAt).toLocaleString()}
                  </Text>
                ) : null}
              </View>
            ))}
            {!r.adminNote && !(Array.isArray(r.adminReplies) && r.adminReplies.length > 0) ? (
              <Text style={styles.awaiting}>No admin response yet.</Text>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  label: { fontSize: 12, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 12, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { fontSize: 12, color: '#475569', textTransform: 'capitalize' },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#0f172a', backgroundColor: '#fff' },
  textarea: { minHeight: 110 },
  submit: { marginTop: 16, borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 22, marginBottom: 8 },
  muted: { fontSize: 13, color: '#94a3b8' },
  reportCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 10 },
  reportHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  reportSubject: { fontSize: 14, fontWeight: '700', color: '#0f172a', flex: 1 },
  severity: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  reportMeta: { fontSize: 11, color: '#94a3b8', marginTop: 3, textTransform: 'capitalize' },
  reportBody: { fontSize: 13, color: '#334155', marginTop: 6 },
  response: { fontSize: 13, color: '#166534', marginTop: 6, fontWeight: '600' },
  replyBox: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 8, padding: 9, marginTop: 8 },
  replyFrom: { fontSize: 11, fontWeight: '800', color: '#1d4ed8' },
  replyText: { fontSize: 13, color: '#0f172a', marginTop: 3 },
  replyTime: { fontSize: 10, color: '#94a3b8', marginTop: 4 },
  awaiting: { fontSize: 12, color: '#94a3b8', marginTop: 6, fontStyle: 'italic' },
});
