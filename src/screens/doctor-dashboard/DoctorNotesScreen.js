import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, ScrollView,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';

const NOTE_TYPES = [
  { value: 'consultation', label: 'Consultation', color: '#1e6bb8', bg: '#dbeafe' },
  { value: 'followup',     label: 'Follow-up',    color: '#7c3aed', bg: '#ede9fe' },
  { value: 'prescription', label: 'Prescription', color: '#059669', bg: '#d1fae5' },
  { value: 'referral',     label: 'Referral',     color: '#d97706', bg: '#fef3c7' },
  { value: 'general',      label: 'General',      color: '#64748b', bg: '#f1f5f9' },
];

const NOTE_TEMPLATES = [
  {
    id: 'soap',
    name: 'General Consultation (SOAP)',
    icon: 'document-text-outline',
    type: 'consultation',
    title: 'Consultation Note',
    content: `SUBJECTIVE:\n[Chief complaint and patient-reported symptoms]\n\nOBJECTIVE:\n[Physical exam findings, vital signs, test results]\n\nASSESSMENT:\n[Diagnosis / differential diagnosis]\n\nPLAN:\n[Treatment plan, medications, referrals, follow-up]`,
  },
  {
    id: 'hypertension',
    name: 'Hypertension',
    icon: 'heart-outline',
    type: 'consultation',
    title: 'Hypertension Follow-up',
    content: `BLOOD PRESSURE READING:\nSystolic: ___ mmHg  |  Diastolic: ___ mmHg\n\nCURRENT MEDICATIONS:\n[List antihypertensives and dosages]\n\nSYMPTOMS:\n[Headache, dizziness, chest pain, shortness of breath, edema]\n\nCOMPLIANCE:\n[Medication adherence, dietary compliance, exercise]\n\nASSESSMENT:\n[BP control status: controlled / uncontrolled]\n\nPLAN:\n[Medication adjustments, lifestyle advice, next visit]`,
  },
  {
    id: 'diabetes',
    name: 'Diabetes',
    icon: 'cellular-outline',
    type: 'consultation',
    title: 'Diabetes Management Note',
    content: `BLOOD GLUCOSE READINGS:\nFasting: ___ mg/dL  |  Post-prandial: ___ mg/dL\nHbA1c: ___ %\n\nCURRENT MEDICATIONS:\n[Insulin type/dose, oral hypoglycemics]\n\nSYMPTOMS:\n[Polyuria, polydipsia, blurred vision, numbness/tingling, wound healing]\n\nCOMPLICATION SCREENING:\n[Retinopathy, nephropathy, neuropathy, cardiovascular]\n\nASSESSMENT:\n[Diabetes control: well-controlled / poorly-controlled]\n\nPLAN:\n[Medication adjustments, dietary advice, monitoring frequency, referrals]`,
  },
  {
    id: 'respiratory',
    name: 'Respiratory Infection',
    icon: 'cloud-outline',
    type: 'consultation',
    title: 'Respiratory Infection Note',
    content: `PRESENTING COMPLAINT:\n[Cough, fever, sore throat, runny nose, shortness of breath]\n\nDURATION: ___ days\n\nVITALS:\nTemp: ___  |  SpO2: ___  |  RR: ___\n\nEXAMINATION:\n[Throat inspection, chest auscultation findings]\n\nDIAGNOSIS:\n[ ] URTI  [ ] Pharyngitis  [ ] Bronchitis  [ ] Pneumonia  [ ] Other: ___\n\nPLAN:\n[Antibiotics if indicated, symptomatic treatment, rest, hydration, follow-up]`,
  },
  {
    id: 'pediatric',
    name: 'Pediatric',
    icon: 'happy-outline',
    type: 'consultation',
    title: 'Pediatric Consultation',
    content: `PATIENT AGE / WEIGHT: ___ years  |  ___ kg\n\nPRESENTING COMPLAINT:\n[Symptom description from parent/guardian]\n\nDEVELOPMENTAL HISTORY:\n[Milestones appropriate for age? Any concerns?]\n\nIMMUNIZATION STATUS:\n[Up to date / Overdue — list outstanding vaccines]\n\nEXAMINATION:\n[General appearance, growth parameters, systems review]\n\nASSESSMENT:\n[Diagnosis]\n\nPLAN:\n[Treatment, parent counseling, follow-up, referrals]`,
  },
];

function getTypeMeta(type) {
  return NOTE_TYPES.find(t => t.value === type) || NOTE_TYPES[4];
}

export default function DoctorNotesScreen() {
  const [notes, setNotes] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState(null);
  const [viewingNote, setViewingNote] = useState(null);

  const [form, setForm] = useState({
    patientId: '', patientName: 'General',
    type: 'consultation', title: '', content: '',
  });
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid) return;

      const profile = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      setDoctorProfile(profile ? { id: uid, ...profile } : { id: uid, name: 'Doctor' });

      const appts = await api(`/api/v1/medical/appointments/doctor/${uid}`).catch(() => []) || [];
      const patMap = new Map();
      appts.forEach(a => {
        if (a.clientId && !patMap.has(a.clientId)) {
          patMap.set(a.clientId, { id: a.clientId, name: a.clientName || '' });
        }
      });
      const enriched = await enrichPatientNames(patMap);
      setPatients(Array.from(enriched.values()));

      const notesList = await api(`/api/v1/doctor-notes?doctorId=${uid}`).catch(() => []) || [];
      notesList.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setNotes(notesList);
    } catch (err) {
      console.error('DoctorNotes load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ patientId: '', patientName: 'General', type: 'consultation', title: '', content: '' });
    setShowTemplates(false);
    setShowModal(true);
  };

  const applyTemplate = (tpl) => {
    setForm(p => ({ ...p, type: tpl.type, title: tpl.title, content: tpl.content }));
    setShowTemplates(false);
  };

  const openEdit = (note) => {
    setEditing(note);
    setForm({
      patientId: note.patientId || '',
      patientName: note.patientName || 'General',
      type: note.type || 'consultation',
      title: note.title || '',
      content: note.content || '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.patientId) { Alert.alert('Validation', 'Please select a patient.'); return; }
    if (!form.title.trim()) { Alert.alert('Validation', 'Title is required.'); return; }
    if (!form.content.trim()) { Alert.alert('Validation', 'Content is required.'); return; }
    setSaving(true);
    try {
      const uid = await getStoredUserId();
      if (editing) {
        await api(`/api/v1/doctor-notes/${editing.id}`, {
          method: 'PATCH',
          body: { title: form.title.trim(), content: form.content.trim(), type: form.type },
        });
      } else {
        await api('/api/v1/doctor-notes', {
          method: 'POST',
          body: {
            doctorId: uid,
            doctorName: doctorProfile?.name || '',
            patientId: form.patientId || '',
            patientName: form.patientId ? form.patientName : 'General',
            title: form.title.trim(),
            content: form.content.trim(),
            type: form.type,
          },
        });
      }
      setShowModal(false);
      await loadAll();
    } catch (err) {
      Alert.alert('Error', 'Could not save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (noteId) => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api(`/api/v1/doctor-notes/${noteId}`, { method: 'DELETE' });
          setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
          Alert.alert('Error', 'Could not delete note.');
        }
      }},
    ]);
  };

  const filtered = notes.filter(n => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (n.title || '').toLowerCase().includes(q) ||
           (n.patientName || '').toLowerCase().includes(q) ||
           (n.content || '').toLowerCase().includes(q);
  });

  const renderNote = ({ item }) => {
    const meta = getTypeMeta(item.type);
    return (
      <TouchableOpacity
        style={[styles.noteCard, { borderLeftColor: meta.color }]}
        onPress={() => setViewingNote(item)}
        activeOpacity={0.8}
      >
        <View style={styles.noteHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.noteTitle}>{item.title}</Text>
            <View style={styles.noteMeta}>
              <View style={[styles.typeBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              <Text style={styles.notePatient}>{item.patientName || 'General'}</Text>
            </View>
          </View>
          <View style={styles.noteActions}>
            <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionIcon}>
              <Ionicons name="pencil-outline" size={17} color={DoctorColors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon}>
              <Ionicons name="trash-outline" size={17} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.noteContent} numberOfLines={3}>{item.content}</Text>
        <Text style={styles.tapHint}>Tap to read full note</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search notes..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>New Note</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderNote}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>{search ? 'No matching notes' : 'No notes yet'}</Text>
            </View>
          }
        />
      )}

      {/* Note Reading Modal */}
      {viewingNote && (() => {
        const meta = getTypeMeta(viewingNote.type);
        return (
          <Modal visible={!!viewingNote} transparent animationType="fade" onRequestClose={() => setViewingNote(null)}>
            <View style={styles.readOverlay}>
              <View style={styles.readCard}>
                <View style={styles.readHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={[styles.typeBadge, { backgroundColor: meta.bg, alignSelf: 'flex-start', marginBottom: 6 }]}>
                      <Text style={[styles.typeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.readTitle}>{viewingNote.title}</Text>
                    <Text style={styles.readPatient}>{viewingNote.patientName || 'General'}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setViewingNote(null)} style={styles.readClose}>
                    <Ionicons name="close" size={22} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <View style={[styles.readDivider, { borderLeftColor: meta.color }]} />
                <ScrollView style={styles.readBody}>
                  <Text style={styles.readContent}>{viewingNote.content}</Text>
                </ScrollView>
                <View style={styles.readFooter}>
                  <TouchableOpacity style={styles.readEditBtn} onPress={() => { setViewingNote(null); openEdit(viewingNote); }}>
                    <Ionicons name="pencil-outline" size={15} color={DoctorColors.primary} />
                    <Text style={styles.readEditBtnText}>Edit Note</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.readCloseBtn} onPress={() => setViewingNote(null)}>
                    <Text style={styles.readCloseBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* Note Form Modal */}
      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Note' : 'New Note'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {/* Patient selector */}
              {!editing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Patient *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {patients.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.patientChip, form.patientId === p.id && styles.patientChipActive]}
                        onPress={() => setForm(prev => ({ ...prev, patientId: p.id, patientName: p.name }))}
                      >
                        <Text style={[styles.patientChipText, form.patientId === p.id && styles.patientChipTextActive]}>{p.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* Templates */}
              {!editing && (
                <View style={styles.fieldGroup}>
                  <TouchableOpacity
                    style={styles.templateToggleBtn}
                    onPress={() => setShowTemplates(v => !v)}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="layers-outline" size={16} color={DoctorColors.primary} />
                    <Text style={styles.templateToggleBtnText}>
                      {showTemplates ? 'Hide Templates' : 'Use a Template'}
                    </Text>
                    <Ionicons name={showTemplates ? 'chevron-up' : 'chevron-down'} size={14} color={DoctorColors.primary} style={{ marginLeft: 'auto' }} />
                  </TouchableOpacity>
                  {showTemplates && (
                    <View style={styles.templateList}>
                      {NOTE_TEMPLATES.map(tpl => (
                        <TouchableOpacity
                          key={tpl.id}
                          style={styles.templateItem}
                          onPress={() => applyTemplate(tpl)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name={tpl.icon} size={18} color={DoctorColors.primary} />
                          <Text style={styles.templateItemText}>{tpl.name}</Text>
                          <Ionicons name="arrow-forward-circle-outline" size={18} color={DoctorColors.primary} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Type selector */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Note Type</Text>
                <View style={styles.typeRow}>
                  {NOTE_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[styles.typeChip, form.type === t.value && { backgroundColor: t.bg, borderColor: t.color }]}
                      onPress={() => setForm(p => ({ ...p, type: t.value }))}
                    >
                      <Text style={[styles.typeChipText, form.type === t.value && { color: t.color, fontWeight: '700' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Title */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Title *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Note title"
                  placeholderTextColor="#94a3b8"
                  value={form.title}
                  onChangeText={v => setForm(p => ({ ...p, title: v }))}
                />
              </View>

              {/* Content */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Content *</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Write your note..."
                  placeholderTextColor="#94a3b8"
                  value={form.content}
                  onChangeText={v => setForm(p => ({ ...p, content: v }))}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  toolbar: { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'center' },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: DoctorColors.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  noteCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  noteHeader: { flexDirection: 'row', marginBottom: 8 },
  noteTitle: { fontSize: 15, fontWeight: '700', color: DoctorColors.text, marginBottom: 4 },
  noteMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  typeText: { fontSize: 11, fontWeight: '600' },
  notePatient: { fontSize: 12, color: DoctorColors.textSecondary },
  noteActions: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 4 },
  noteContent: { fontSize: 13, color: DoctorColors.textSecondary, lineHeight: 19 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15, color: '#94a3b8' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text },
  fieldGroup: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: DoctorColors.text, marginBottom: 8 },
  input: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 13,
    fontSize: 15, color: DoctorColors.text,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  textarea: { height: 130, textAlignVertical: 'top' },
  patientChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  patientChipActive: { backgroundColor: DoctorColors.primaryLight, borderColor: DoctorColors.primary },
  patientChipText: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  patientChipTextActive: { color: DoctorColors.primary, fontWeight: '700' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  typeChipText: { fontSize: 12, color: DoctorColors.textSecondary, fontWeight: '500' },
  modalFooter: {
    flexDirection: 'row', gap: 12, padding: 20,
    borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  cancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  cancelBtnText: { fontSize: 15, color: DoctorColors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 10, alignItems: 'center',
    backgroundColor: DoctorColors.primary,
  },
  saveBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
  tapHint: { fontSize: 11, color: '#cbd5e1', marginTop: 4, fontStyle: 'italic' },
  // Read modal
  readOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  readCard: {
    backgroundColor: '#fff', borderRadius: 20, width: '100%', maxHeight: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 12,
    overflow: 'hidden',
  },
  readHeader: { flexDirection: 'row', padding: 20, paddingBottom: 12 },
  readTitle: { fontSize: 18, fontWeight: '800', color: DoctorColors.text, lineHeight: 24, marginBottom: 4 },
  readPatient: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  readClose: { padding: 4, marginLeft: 8 },
  readDivider: { height: 3, backgroundColor: '#f1f5f9', borderLeftWidth: 4, borderLeftColor: DoctorColors.primary, marginBottom: 0 },
  readBody: { paddingHorizontal: 20, paddingTop: 16, maxHeight: 300 },
  readContent: { fontSize: 15, color: DoctorColors.text, lineHeight: 24, paddingBottom: 20 },
  readFooter: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  readEditBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: DoctorColors.primaryLight, borderWidth: 1, borderColor: DoctorColors.primary + '40',
  },
  readEditBtnText: { fontSize: 14, color: DoctorColors.primary, fontWeight: '700' },
  readCloseBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: DoctorColors.primary,
  },
  readCloseBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // Templates
  templateToggleBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: DoctorColors.primaryLight, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: DoctorColors.primary + '40',
  },
  templateToggleBtnText: { fontSize: 13, fontWeight: '700', color: DoctorColors.primary },
  templateList: { marginTop: 10, gap: 6 },
  templateItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  templateItemText: { flex: 1, fontSize: 13, fontWeight: '600', color: DoctorColors.text },
});
