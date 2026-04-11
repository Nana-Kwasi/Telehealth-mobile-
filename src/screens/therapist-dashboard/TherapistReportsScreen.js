import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert,
  Platform, KeyboardAvoidingView, SafeAreaView, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp,
  orderBy, doc, getDoc,
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';

const { width } = Dimensions.get('window');

const SEVERITY = ['low', 'medium', 'high', 'critical'];
const SEVERITY_COLOR = { low: '#10B981', medium: '#F59E0B', high: '#F97316', critical: '#EF4444' };
const STATUS_COLOR  = { open: '#3B82F6', in_progress: '#F59E0B', resolved: '#10B981', closed: '#9CA3AF' };

const TherapistReportsScreen = ({ navigation }) => {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewReport, setShowNewReport] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({
    title: '', description: '', severity: 'medium',
    clientId: '', clientName: '', type: 'clinical',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.currentUser) { loadReports(); loadClients(); }
  }, []);

  const loadReports = async () => {
    try {
      setIsLoading(true);
      const q = query(
        collection(db, 'reports'),
        where('therapistId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      try {
        const q2 = query(collection(db, 'reports'), where('therapistId', '==', auth.currentUser.uid));
        const snap = await getDocs(q2);
        const r = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setReports(r);
      } catch (_) {}
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadClients = async () => {
    try {
      const ref = collection(db, 'therapists', auth.currentUser.uid, 'clients');
      const snap = await getDocs(ref);
      const ids = snap.docs.map(d => d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', id));
          if (cSnap.exists()) {
            const cd = cSnap.data();
            list.push({ id, name: cd.name || cd.email || 'Client' });
          }
        } catch (_) {}
      }
      setClients(list);
    } catch (_) {}
  };

  const submitReport = async () => {
    if (!form.title.trim() || !form.description.trim()) {
      Alert.alert('Required', 'Title and description are required.');
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        ...form,
        therapistId: auth.currentUser.uid,
        status: 'open',
        createdAt: serverTimestamp(),
      });
      setShowNewReport(false);
      setForm({ title: '', description: '', severity: 'medium', clientId: '', clientName: '', type: 'clinical' });
      await loadReports();
      Alert.alert('Submitted', 'Report submitted successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to submit report.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtDate = (ts) => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (isLoading) return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowNewReport(true)}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadReports(); }} colors={[TherapistColors.primary]} />}
      >
        {reports.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="flag-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>No reports yet</Text>
            <Text style={styles.emptySub}>Tap + New to create a report</Text>
          </View>
        ) : reports.map(r => (
          <TouchableOpacity key={r.id} style={styles.reportCard} onPress={() => setSelectedReport(r)} activeOpacity={0.8}>
            <View style={styles.reportTop}>
              <View style={[styles.chip, { backgroundColor: `${SEVERITY_COLOR[r.severity] || '#9CA3AF'}1A` }]}>
                <Text style={[styles.chipText, { color: SEVERITY_COLOR[r.severity] || '#9CA3AF' }]}>{r.severity || 'medium'}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: `${STATUS_COLOR[r.status] || '#9CA3AF'}1A` }]}>
                <Text style={[styles.chipText, { color: STATUS_COLOR[r.status] || '#9CA3AF' }]}>{r.status || 'open'}</Text>
              </View>
              <Text style={styles.reportDate}>{fmtDate(r.createdAt)}</Text>
            </View>
            <Text style={styles.reportTitle}>{r.title}</Text>
            {r.clientName ? <Text style={styles.reportClient}>Client: {r.clientName}</Text> : null}
            <Text style={styles.reportDesc} numberOfLines={2}>{r.description}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── New Report Modal ── */}
      <Modal visible={showNewReport} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowNewReport(false)}>
        <SafeAreaView style={styles.modalSafe}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowNewReport(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>New Report</Text>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { opacity: submitting ? 0.6 : 1 }]}
                onPress={submitReport}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.modalSaveText}>Submit</Text>
                }
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={t => setForm({ ...form, title: t })}
                placeholder="Report title"
                placeholderTextColor={TherapistColors.textLight}
              />

              <Text style={styles.fieldLabel}>Description *</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={form.description}
                onChangeText={t => setForm({ ...form, description: t })}
                placeholder="Describe the issue in detail…"
                placeholderTextColor={TherapistColors.textLight}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              <Text style={styles.fieldLabel}>Severity</Text>
              <View style={styles.chipRow}>
                {SEVERITY.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[
                      styles.selectChip,
                      form.severity === s && { backgroundColor: SEVERITY_COLOR[s], borderColor: SEVERITY_COLOR[s] },
                    ]}
                    onPress={() => setForm({ ...form, severity: s })}
                  >
                    <Text style={[styles.selectChipText, form.severity === s && { color: '#fff' }]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.chipRow}>
                {['clinical', 'technical', 'administrative', 'other'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.selectChip, form.type === t && styles.selectChipActive]}
                    onPress={() => setForm({ ...form, type: t })}
                  >
                    <Text style={[styles.selectChipText, form.type === t && styles.selectChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Related Client (optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                  <TouchableOpacity
                    style={[styles.clientChip, !form.clientId && styles.clientChipSelected]}
                    onPress={() => setForm({ ...form, clientId: '', clientName: '' })}
                  >
                    <Text style={[styles.clientChipText, !form.clientId && { color: TherapistColors.primary }]}>None</Text>
                  </TouchableOpacity>
                  {clients.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.clientChip, form.clientId === c.id && styles.clientChipSelected]}
                      onPress={() => setForm({ ...form, clientId: c.id, clientName: c.name })}
                    >
                      <Text style={[styles.clientChipText, form.clientId === c.id && { color: TherapistColors.primary }]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Report Detail Modal ── */}
      <Modal visible={!!selectedReport} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedReport(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Report Detail</Text>
            <View style={{ width: 60 }} />
          </View>
          {selectedReport && (
            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.chipRow}>
                <View style={[styles.chip, { backgroundColor: `${SEVERITY_COLOR[selectedReport.severity]}1A` }]}>
                  <Text style={[styles.chipText, { color: SEVERITY_COLOR[selectedReport.severity] }]}>{selectedReport.severity}</Text>
                </View>
                <View style={[styles.chip, { backgroundColor: `${STATUS_COLOR[selectedReport.status]}1A` }]}>
                  <Text style={[styles.chipText, { color: STATUS_COLOR[selectedReport.status] }]}>{selectedReport.status}</Text>
                </View>
              </View>

              <Text style={styles.detailTitle}>{selectedReport.title}</Text>
              {selectedReport.clientName ? (
                <Text style={styles.reportClient}>Client: {selectedReport.clientName}</Text>
              ) : null}
              <Text style={styles.fieldLabel}>Type</Text>
              <Text style={styles.detailBody}>{selectedReport.type || 'clinical'}</Text>
              <Text style={styles.fieldLabel}>Description</Text>
              <Text style={styles.detailBody}>{selectedReport.description}</Text>
              <Text style={styles.detailDate}>Submitted: {fmtDate(selectedReport.createdAt)}</Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: TherapistColors.primaryDark,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: TherapistColors.primary,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  listContent: { padding: 16 },
  emptyTitle:  { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  emptySub:    { fontSize: 13, color: TherapistColors.textLight, textAlign: 'center' },

  reportCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  reportTop:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  chip:        { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  chipText:    { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  reportDate:  { fontSize: 11, color: TherapistColors.textLight, marginLeft: 'auto' },
  reportTitle: { fontSize: 15, fontWeight: '700', color: TherapistColors.text, marginBottom: 4 },
  reportClient:{ fontSize: 12, color: TherapistColors.primary, marginBottom: 4 },
  reportDesc:  { fontSize: 13, color: TherapistColors.textSecondary },

  // Modal
  modalSafe:       { flex: 1, backgroundColor: TherapistColors.background },
  modalHeader:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: TherapistColors.border,
  },
  modalCancelBtn:  { minWidth: 60 },
  modalCancelText: { fontSize: 15, color: TherapistColors.textSecondary, fontWeight: '500' },
  modalTitle:      { fontSize: 17, fontWeight: '700', color: TherapistColors.text },
  modalSaveBtn:    { backgroundColor: TherapistColors.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7, minWidth: 60, alignItems: 'center' },
  modalSaveText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalBody:       { padding: 20 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: TherapistColors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: TherapistColors.text,
  },
  textarea: { height: 110, textAlignVertical: 'top' },

  chipRow:         { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  selectChip:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: TherapistColors.border, backgroundColor: '#fff' },
  selectChipActive:{ backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  selectChipText:  { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary, textTransform: 'capitalize' },
  selectChipTextActive: { color: '#fff' },

  clientChip:       { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: TherapistColors.border },
  clientChipSelected: { borderColor: TherapistColors.primary, backgroundColor: `${TherapistColors.primary}12` },
  clientChipText:   { fontSize: 13, color: TherapistColors.text, fontWeight: '500' },

  detailTitle: { fontSize: 19, fontWeight: '800', color: TherapistColors.text, marginVertical: 10 },
  detailBody:  { fontSize: 14, color: TherapistColors.textSecondary, lineHeight: 22, marginBottom: 8 },
  detailDate:  { fontSize: 12, color: TherapistColors.textLight, marginTop: 16 },
});

export default TherapistReportsScreen;
