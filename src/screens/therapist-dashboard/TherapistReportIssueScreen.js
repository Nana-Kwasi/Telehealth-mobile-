import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { TherapistColors } from '../../constants/colors';
import {
  REPORT_CATEGORIES,
  REPORT_SEVERITIES,
  emptyGlobalReportForm,
  submitGlobalReport,
  listMyGlobalReports,
} from '../../services/globalReportService';

const STATUS_META = {
  open:        { label: 'Open',        bg: '#eff6ff', text: '#1d4ed8' },
  in_progress: { label: 'In progress', bg: '#fffbeb', text: '#b45309' },
  resolved:    { label: 'Resolved',    bg: '#f0fdf4', text: '#16a34a' },
  closed:      { label: 'Closed',      bg: '#f1f5f9', text: '#475569' },
};
function statusMeta(s) {
  const k = String(s || 'open').toLowerCase().replace(/[\s-]/g, '_');
  return STATUS_META[k] || STATUS_META.open;
}
function fmtDate(v) {
  if (!v) return '—';
  const d = v?.seconds ? new Date(v.seconds * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString();
}

export default function TherapistReportIssueScreen({ profile }) {
  const [form, setForm] = useState(emptyGlobalReportForm());
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selected, setSelected] = useState(null);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      setReports(await listMyGlobalReports(profile));
    } catch {
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, [profile]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleSubmit = async () => {
    if (!form.subject.trim() || !form.message.trim()) {
      Alert.alert('Required', 'Subject and details are required.');
      return;
    }
    setSaving(true);
    try {
      await submitGlobalReport(form, profile, 'therapist', 'therapist-mobile/report-issue');
      setForm(emptyGlobalReportForm());
      setSubmitted(true);
      loadReports();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to submit report. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successWrap}>
          <Ionicons name="checkmark-circle" size={64} color={TherapistColors.success} />
          <Text style={styles.successTitle}>Report submitted</Text>
          <Text style={styles.successSub}>
            Your report was sent to Super Admin. You will be contacted if follow-up is needed.
          </Text>
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => setSubmitted(false)}
          >
            <Text style={styles.submitBtnText}>Submit another report</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.pageTitle}>Report an Issue</Text>
          <Text style={styles.pageSub}>
            Send complaints, incidents, and feedback directly to Super Admin.
          </Text>

          <View style={styles.card}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {REPORT_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, form.category === c.id && styles.chipActive]}
                  onPress={() => setForm((p) => ({ ...p, category: c.id }))}
                >
                  <Text style={[styles.chipText, form.category === c.id && styles.chipTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Severity</Text>
            <View style={styles.chipRow}>
              {REPORT_SEVERITIES.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, form.severity === s.id && styles.chipActive]}
                  onPress={() => setForm((p) => ({ ...p, severity: s.id }))}
                >
                  <Text style={[styles.chipText, form.severity === s.id && styles.chipTextActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Subject *</Text>
            <TextInput
              style={styles.input}
              value={form.subject}
              onChangeText={(t) => setForm((p) => ({ ...p, subject: t }))}
              placeholder="Brief subject"
              placeholderTextColor={TherapistColors.textLight}
            />

            <Text style={styles.label}>Details *</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.message}
              onChangeText={(t) => setForm((p) => ({ ...p, message: t }))}
              placeholder="Describe the issue in detail…"
              placeholderTextColor={TherapistColors.textLight}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Report</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* My reports */}
          <View style={styles.myHeaderRow}>
            <Text style={styles.myTitle}>My Reports</Text>
            <Text style={styles.myCount}>{reports.length}</Text>
          </View>
          {loadingReports ? (
            <ActivityIndicator color={TherapistColors.primary} style={{ marginVertical: 16 }} />
          ) : reports.length === 0 ? (
            <Text style={styles.emptyText}>You haven't submitted any reports yet.</Text>
          ) : (
            reports.map((r) => {
              const sm = statusMeta(r.status);
              return (
                <TouchableOpacity key={r.id} style={styles.reportRow} activeOpacity={0.85} onPress={() => setSelected(r)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reportSubject} numberOfLines={1}>{r.subject || '—'}</Text>
                    <Text style={styles.reportMeta}>{(r.category || '—')} · {fmtDate(r.createdAt)}</Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: sm.bg }]}>
                    <Text style={[styles.statusPillText, { color: sm.text }]}>{sm.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modalCard}>
            {selected && (() => {
              const sm = statusMeta(selected.status);
              return (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle} numberOfLines={2}>{selected.subject || 'Report'}</Text>
                    <TouchableOpacity onPress={() => setSelected(null)}>
                      <Ionicons name="close" size={22} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.modalBadgeRow}>
                    <View style={[styles.statusPill, { backgroundColor: sm.bg }]}>
                      <Text style={[styles.statusPillText, { color: sm.text }]}>{sm.label}</Text>
                    </View>
                    {selected.category ? <View style={styles.metaPill}><Text style={styles.metaPillText}>{selected.category}</Text></View> : null}
                    {selected.severity ? <View style={styles.metaPill}><Text style={styles.metaPillText}>{selected.severity}</Text></View> : null}
                  </View>
                  <ScrollView style={{ maxHeight: 360 }}>
                    {[
                      ['Submitted', fmtDate(selected.createdAt)],
                      ['Last updated', fmtDate(selected.updatedAt)],
                      ['Reference', selected.id],
                    ].filter(([, v]) => v).map(([k, v]) => (
                      <View key={k} style={styles.detailKV}>
                        <Text style={styles.detailK}>{k}</Text>
                        <Text style={styles.detailV}>{String(v)}</Text>
                      </View>
                    ))}
                    <Text style={styles.detailSectionLabel}>Details</Text>
                    <Text style={styles.detailBody}>{selected.message || '—'}</Text>
                    {selected.adminNote ? (
                      <>
                        <Text style={styles.detailSectionLabel}>Admin response</Text>
                        <Text style={styles.adminBody}>{selected.adminNote}</Text>
                      </>
                    ) : (
                      <Text style={styles.noAdmin}>No admin response yet. Updates will appear here once reviewed.</Text>
                    )}
                  </ScrollView>
                  <TouchableOpacity style={styles.submitBtn} onPress={() => setSelected(null)}>
                    <Text style={styles.submitBtnText}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  content: { padding: 16, paddingBottom: 32 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: TherapistColors.text },
  pageSub: { fontSize: 14, color: TherapistColors.textLight, marginTop: 6, marginBottom: 16, lineHeight: 20 },
  card: {
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: TherapistColors.border,
  },
  label: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    backgroundColor: 'transparent',
  },
  chipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: TherapistColors.textSecondary, textTransform: 'capitalize' },
  chipTextActive: { color: '#fff' },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TherapistColors.text,
  },
  textarea: { minHeight: 140, textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  submitBtn: {
    backgroundColor: TherapistColors.primary,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  successWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successTitle: { fontSize: 20, fontWeight: '800', color: TherapistColors.text, marginTop: 16 },
  successSub: {
    fontSize: 14,
    color: TherapistColors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  myHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  myTitle: { fontSize: 17, fontWeight: '800', color: TherapistColors.text },
  myCount: { fontSize: 13, color: TherapistColors.textLight, fontWeight: '600' },
  emptyText: { fontSize: 14, color: TherapistColors.textLight, textAlign: 'center', paddingVertical: 20 },
  reportRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 12, borderWidth: 1, borderColor: TherapistColors.border,
    padding: 12, marginBottom: 8,
  },
  reportSubject: { fontSize: 14, fontWeight: '700', color: TherapistColors.text },
  reportMeta: { fontSize: 12, color: TherapistColors.textLight, marginTop: 3, textTransform: 'capitalize' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: TherapistColors.text },
  modalBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  metaPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.72)' },
  metaPillText: { fontSize: 11, fontWeight: '700', color: '#0d0d0d', textTransform: 'capitalize' },
  detailKV: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  detailK: { fontSize: 11, fontWeight: '700', color: '#3d3d3d', textTransform: 'uppercase' },
  detailV: { fontSize: 13, color: '#0d0d0d', flex: 1, textAlign: 'right' },
  detailSectionLabel: { fontSize: 11, fontWeight: '700', color: '#3d3d3d', textTransform: 'uppercase', marginTop: 14, marginBottom: 4 },
  detailBody: { fontSize: 14, color: '#0d0d0d', lineHeight: 20, backgroundColor: 'transparent', borderRadius: 10, padding: 12 },
  adminBody: { fontSize: 14, color: '#0c4a6e', lineHeight: 20, backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12 },
  noAdmin: { fontSize: 12, color: '#3d3d3d', marginTop: 10 },
});
