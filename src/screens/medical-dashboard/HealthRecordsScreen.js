import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { auth, db, storage } from '../../services/firebaseConfig';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { MedicalColors } from '../../constants/colors';

const RECORD_TYPES = ['Lab Result', 'X-Ray', 'MRI / CT Scan', 'Vaccination', 'Surgery Report', 'Allergy Test', 'Blood Test', 'Ultrasound', 'Prescription', 'Other'];

const TYPE_ICONS = {
  'Lab Result': 'flask-outline',
  'X-Ray': 'scan-outline',
  'MRI / CT Scan': 'body-outline',
  'Vaccination': 'medical-outline',
  'Surgery Report': 'cut-outline',
  'Allergy Test': 'alert-circle-outline',
  'Blood Test': 'water-outline',
  'Ultrasound': 'pulse-outline',
  'Prescription': 'document-text-outline',
  'Other': 'folder-open-outline',
};

const emptyRecord = { name: '', type: 'Lab Result', date: '', notes: '', fileUrl: '', fileName: '' };

const HealthRecordsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(emptyRecord);
  const [showTypePicker, setShowTypePicker] = useState(false);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const snap = await getDoc(doc(db, 'patientProfiles', uid));
      if (snap.exists() && snap.data().healthRecords) {
        setRecords(snap.data().healthRecords);
      }
    } catch (err) {
      console.error('Error loading records:', err);
    } finally {
      setLoading(false);
    }
  };

  const persistRecords = async (updated) => {
    const uid = auth.currentUser?.uid;
    await setDoc(
      doc(db, 'patientProfiles', uid),
      { healthRecords: updated, updatedAt: serverTimestamp() },
      { merge: true }
    );
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      const uid = auth.currentUser?.uid;
      const storageRef = ref(storage, `healthRecords/${uid}/${Date.now()}_${asset.name}`);
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      setForm(p => ({ ...p, fileUrl: downloadURL, fileName: asset.name }));
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const openAdd = () => {
    setForm(emptyRecord);
    setEditIndex(null);
    setShowTypePicker(false);
    setShowModal(true);
  };

  const openEdit = (idx) => {
    setForm({ ...records[idx] });
    setEditIndex(idx);
    setShowTypePicker(false);
    setShowModal(true);
  };

  const handleSaveRecord = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter a name for this record.'); return; }
    setSaving(true);
    try {
      const entry = { ...form, savedAt: new Date().toISOString() };
      let updated;
      if (editIndex !== null) {
        updated = records.map((r, i) => i === editIndex ? entry : r);
      } else {
        updated = [...records, entry];
      }
      await persistRecords(updated);
      setRecords(updated);
      setShowModal(false);
    } catch (err) {
      console.error('Error saving record:', err);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (idx) => {
    Alert.alert('Remove Record', `Remove "${records[idx].name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = records.filter((_, i) => i !== idx);
          try {
            await persistRecords(updated);
            setRecords(updated);
          } catch (err) { Alert.alert('Error', 'Failed to remove.'); }
        }
      },
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={MedicalColors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="documents" size={26} color={MedicalColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Health Records</Text>
            <Text style={styles.headerSub}>Lab results, imaging, reports — all in one place</Text>
          </View>
        </View>

        {records.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={54} color={MedicalColors.textLight} />
            <Text style={styles.emptyTitle}>No health records yet</Text>
            <Text style={styles.emptySubtitle}>Add lab results, scans, or reports so your doctor has a full picture of your health.</Text>
          </View>
        ) : (
          records.map((r, idx) => (
            <View key={idx} style={styles.recordCard}>
              <View style={styles.recordIconWrap}>
                <Ionicons name={TYPE_ICONS[r.type] || 'folder-outline'} size={22} color={MedicalColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.recordName}>{r.name}</Text>
                <View style={styles.recordMeta}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{r.type}</Text>
                  </View>
                  {r.date ? <Text style={styles.recordDate}>{r.date}</Text> : null}
                </View>
                {r.notes ? <Text style={styles.recordNotes} numberOfLines={2}>{r.notes}</Text> : null}
                {r.fileUrl ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Ionicons name="attach-outline" size={12} color={MedicalColors.success} />
                    <Text style={[styles.fileUrlText, { color: MedicalColors.success }]}>
                      {r.fileName || 'Document attached'}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.recordActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(idx)}>
                  <Ionicons name="pencil-outline" size={18} color={MedicalColors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(idx)}>
                  <Ionicons name="trash-outline" size={18} color={MedicalColors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle-outline" size={20} color={MedicalColors.primary} />
          <Text style={styles.addBtnText}>Add Health Record</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editIndex !== null ? 'Edit Record' : 'New Record'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={MedicalColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Record Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={v => setForm(p => ({ ...p, name: v }))}
                placeholder="e.g., Complete Blood Count – March 2026"
                placeholderTextColor={MedicalColors.textLight}
              />

              <Text style={styles.label}>Record Type</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowTypePicker(v => !v)}
                activeOpacity={0.8}
              >
                <Text style={styles.inputText}>{form.type}</Text>
              </TouchableOpacity>
              {showTypePicker && (
                <View style={styles.picker}>
                  {RECORD_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.pickerItem, form.type === t && styles.pickerItemActive]}
                      onPress={() => { setForm(p => ({ ...p, type: t })); setShowTypePicker(false); }}
                    >
                      <Ionicons name={TYPE_ICONS[t] || 'folder-outline'} size={16} color={form.type === t ? MedicalColors.primary : MedicalColors.textSecondary} />
                      <Text style={[styles.pickerItemText, form.type === t && styles.pickerItemTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Date</Text>
              <TextInput
                style={styles.input}
                value={form.date}
                onChangeText={v => setForm(p => ({ ...p, date: v }))}
                placeholder="e.g., March 15, 2026 or 2026-03-15"
                placeholderTextColor={MedicalColors.textLight}
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.notes}
                onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                placeholder="Key findings, doctor comments, follow-up needed..."
                placeholderTextColor={MedicalColors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <Text style={styles.label}>Attach Document (optional)</Text>
              <TouchableOpacity
                style={[styles.uploadBtn, uploading && { opacity: 0.65 }]}
                onPress={pickDocument}
                disabled={uploading}
                activeOpacity={0.75}
              >
                {uploading ? (
                  <>
                    <ActivityIndicator size="small" color={MedicalColors.primary} />
                    <Text style={styles.uploadBtnText}>Uploading…</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={20} color={MedicalColors.primary} />
                    <Text style={styles.uploadBtnText}>
                      {form.fileName ? form.fileName : 'Upload from Device (PDF, Image, Doc)'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {form.fileUrl ? (
                <View style={styles.uploadedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={MedicalColors.success} />
                  <Text style={styles.uploadedText} numberOfLines={1}>File uploaded successfully</Text>
                  <TouchableOpacity onPress={() => setForm(p => ({ ...p, fileUrl: '', fileName: '' }))}>
                    <Ionicons name="close-circle-outline" size={16} color={MedicalColors.error} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                onPress={handleSaveRecord}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{editIndex !== null ? 'Update Record' : 'Save Record'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MedicalColors.background },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: MedicalColors.background },

  headerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#f0fdf4', borderRadius: 14, padding: 16,
    marginBottom: 20, borderWidth: 1, borderColor: '#bbf7d0',
  },
  headerIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: MedicalColors.text, marginBottom: 2 },
  headerSub: { fontSize: 12, color: MedicalColors.textSecondary, lineHeight: 17 },

  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: MedicalColors.text, marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: MedicalColors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  recordCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: MedicalColors.surface, borderRadius: 14,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: MedicalColors.border,
  },
  recordIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 2,
  },
  recordName: { fontSize: 14, fontWeight: '700', color: MedicalColors.text, marginBottom: 4 },
  recordMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  typeBadge: {
    backgroundColor: MedicalColors.primaryLight, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },
  typeText: { fontSize: 11, fontWeight: '600', color: MedicalColors.primary },
  recordDate: { fontSize: 11, color: MedicalColors.textSecondary },
  recordNotes: { fontSize: 12, color: MedicalColors.textSecondary, lineHeight: 18 },
  fileUrlText: { fontSize: 11, color: MedicalColors.info, marginTop: 4 },
  recordActions: { gap: 6, alignItems: 'flex-end', flexShrink: 0 },
  iconBtn: { padding: 6 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: MedicalColors.surface, borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 2, borderColor: MedicalColors.primary, borderStyle: 'dashed',
  },
  addBtnText: { color: MedicalColors.primary, fontSize: 15, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: MedicalColors.text },

  label: { fontSize: 13, fontWeight: '600', color: MedicalColors.text, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: MedicalColors.text,
    backgroundColor: MedicalColors.cardBg, justifyContent: 'center',
  },
  inputText: { fontSize: 14, color: MedicalColors.text },
  textArea: { minHeight: 90, textAlignVertical: 'top' },

  picker: {
    borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 10,
    marginTop: 4, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderBottomWidth: 1, borderBottomColor: MedicalColors.border,
  },
  pickerItemActive: { backgroundColor: MedicalColors.primaryLight },
  pickerItemText: { fontSize: 14, color: MedicalColors.text },
  pickerItemTextActive: { color: MedicalColors.primary, fontWeight: '700' },

  saveBtn: {
    backgroundColor: MedicalColors.primary, borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 20, marginBottom: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: MedicalColors.primary, borderStyle: 'dashed',
    borderRadius: 10, padding: 13, backgroundColor: '#f0f9ff',
  },
  uploadBtnText: { fontSize: 13, fontWeight: '600', color: MedicalColors.primary, flex: 1 },
  uploadedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 6, padding: 8, backgroundColor: '#f0fdf4',
    borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0',
  },
  uploadedText: { flex: 1, fontSize: 12, color: '#15803d', fontWeight: '600' },
});

export default HealthRecordsScreen;
