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
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { api, getStoredUserId, uploadFile } from '../../services/apiClient';
import { MedicalColors } from '../../constants/colors';

// ── Type groups ──────────────────────────────────────────────────────────────
const HR_RADIOLOGY = ['MRI', 'CT Scan', 'Ultrasound', 'X-Ray'];
const HR_LAB = [
  'CBC (Complete Blood Count)',
  'BMP (Basic Metabolic Panel)',
  'CMP (Comprehensive Metabolic Panel)',
  'LFT (Liver Function Tests)',
  'TFT (Thyroid Function Tests)',
  'Lipid Panel',
  'HbA1c',
  'Lab Result',
  'Blood Test',
  'Urinalysis',
  'Allergy Test',
];
const HR_OTHER = [
  'Vaccination',
  'Surgical Report',
  'Drug Allergy',
  'Prescribed Medication',
  'Over-the-Counter Medication',
  'Prescription',
  'Other',
];
const HR_GROUPS = [
  { label: 'Radiology', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', types: HR_RADIOLOGY },
  { label: 'Lab Results', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', types: HR_LAB },
  { label: 'Other', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1', types: HR_OTHER },
];
const HR_REQUIRES_FILE = new Set(['MRI', 'CT Scan', 'Ultrasound', 'X-Ray', 'Surgical Report']);

const TYPE_ICONS = {
  'MRI': 'body-outline',
  'CT Scan': 'scan-circle-outline',
  'Ultrasound': 'pulse-outline',
  'X-Ray': 'scan-outline',
  'CBC (Complete Blood Count)': 'water-outline',
  'BMP (Basic Metabolic Panel)': 'flask-outline',
  'CMP (Comprehensive Metabolic Panel)': 'flask-outline',
  'LFT (Liver Function Tests)': 'flask-outline',
  'TFT (Thyroid Function Tests)': 'flask-outline',
  'Lipid Panel': 'analytics-outline',
  'HbA1c': 'cellular-outline',
  'Lab Result': 'flask-outline',
  'Blood Test': 'water-outline',
  'Urinalysis': 'beaker-outline',
  'Allergy Test': 'alert-circle-outline',
  'Prescribed Medication': 'medkit-outline',
  'Over-the-Counter Medication': 'medkit-outline',
  'Vaccination': 'medical-outline',
  'Surgical Report': 'cut-outline',
  'Drug Allergy': 'alert-circle-outline',
  'Prescription': 'document-text-outline',
  'Other': 'folder-open-outline',
};

const emptyRecord = { name: '', types: [], date: '', notes: '', radiologyFiles: {}, fileUrl: '', fileName: '' };

const HealthRecordsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // uploading: null | 'general' | '<radiology type>' tracks which field is uploading
  const [uploading, setUploading] = useState(null);
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(emptyRecord);
  const [error, setError] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid) return;
      const data = await api(`/api/v1/patients/${uid}`).catch(() => null);
      if (data?.healthRecords) setRecords(data.healthRecords);
    } catch (err) {
      console.error('Error loading records:', err);
    } finally {
      setLoading(false);
    }
  };

  const persistRecords = async (updated) => {
    const uid = await getStoredUserId();
    await api(`/api/v1/patients/${uid}`, { method: 'PATCH', body: { healthRecords: updated } });
  };

  const toggleType = (t) => {
    setForm(f => {
      const arr = f.types || [];
      const newTypes = arr.includes(t) ? arr.filter(x => x !== t) : [...arr, t];
      // If removing a radiology type, also clean its file entry
      let radiologyFiles = { ...(f.radiologyFiles || {}) };
      if (arr.includes(t) && HR_RADIOLOGY.includes(t)) {
        delete radiologyFiles[t];
      }
      return { ...f, types: newTypes, radiologyFiles };
    });
  };

  const toggleGroup = (label) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const pickDocument = async (radioType = null) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(radioType || 'general');
      const uid = await getStoredUserId();
      const downloadURL = await uploadFile(`healthRecords/${uid}`, asset.uri, asset.mimeType || 'application/octet-stream');
      if (radioType) {
        setForm(p => ({
          ...p,
          radiologyFiles: { ...(p.radiologyFiles || {}), [radioType]: { fileUrl: downloadURL, fileName: asset.name } },
        }));
      } else {
        setForm(p => ({ ...p, fileUrl: downloadURL, fileName: asset.name }));
      }
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload the file. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  const removeRadiologyFile = (rType) => {
    setForm(p => {
      const rf = { ...(p.radiologyFiles || {}) };
      delete rf[rType];
      return { ...p, radiologyFiles: rf };
    });
  };

  const formatDate = (d) =>
    d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const openAdd = () => {
    const today = new Date();
    setSelectedDate(today);
    setForm({ ...emptyRecord, date: formatDate(today) });
    setEditIndex(null);
    setError('');
    setExpandedGroups(new Set());
    setShowModal(true);
  };

  const openEdit = (idx) => {
    const r = records[idx];
    const types = r.types?.length ? r.types : (r.type ? [r.type] : []);
    const today = new Date();
    let parsedDate = today;
    if (r.date) {
      try { const d = new Date(r.date); if (!isNaN(d)) parsedDate = d; } catch (_) {}
    }
    setSelectedDate(parsedDate);
    setForm({ ...r, types, radiologyFiles: r.radiologyFiles || {}, date: r.date || formatDate(today) });
    setEditIndex(idx);
    setError('');
    setExpandedGroups(new Set());
    setShowModal(true);
  };

  const handleSaveRecord = async () => {
    if (!form.name.trim()) { setError('Please enter a name for this record.'); return; }
    if (!form.types || form.types.length === 0) { setError('Please select at least one record type.'); return; }

    // Validate per-radiology uploads
    const selectedRadiology = form.types.filter(t => HR_RADIOLOGY.includes(t));
    for (const rType of selectedRadiology) {
      if (!form.radiologyFiles?.[rType]?.fileUrl) {
        setError(`Please upload a file for "${rType}".`);
        return;
      }
    }
    // Validate surgical report general file
    if (form.types.includes('Surgical Report') && !form.fileUrl) {
      setError('A file upload is required for Surgical Report records.');
      return;
    }

    setSaving(true);
    try {
      const entry = { ...form, savedAt: new Date().toISOString() };
      delete entry.type; // remove legacy field
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
      setError('Failed to save. Please try again.');
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

  const getDisplayTypes = (r) => r.types?.length ? r.types : (r.type ? [r.type] : ['Other']);
  const getIconForTypes = (types) => {
    if (!types?.length) return 'folder-outline';
    return TYPE_ICONS[types[0]] || 'folder-outline';
  };
  const getGroupForType = (t) => HR_GROUPS.find(g => g.types.includes(t));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={MedicalColors.primary} /></View>;
  }

  const selectedRadiology = (form.types || []).filter(t => HR_RADIOLOGY.includes(t));
  const hasNonRadiologyTypes = (form.types || []).some(t => !HR_RADIOLOGY.includes(t));
  const needsGeneralFile = form.types?.includes('Surgical Report') || (hasNonRadiologyTypes && false); // only Surgical Report requires general file

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
          records.map((r, idx) => {
            const displayTypes = getDisplayTypes(r);
            return (
              <View key={idx} style={styles.recordCard}>
                <View style={styles.recordIconWrap}>
                  <Ionicons name={getIconForTypes(displayTypes)} size={22} color={MedicalColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordName}>{r.name}</Text>
                  <View style={styles.recordMeta}>
                    {displayTypes.map(t => {
                      const grp = getGroupForType(t);
                      return (
                        <View key={t} style={[styles.typeBadge, grp && { backgroundColor: grp.bg }]}>
                          <Text style={[styles.typeText, grp && { color: grp.color }]}>{t}</Text>
                        </View>
                      );
                    })}
                  </View>
                  {r.date ? <Text style={styles.recordDate}>{r.date}</Text> : null}
                  {r.notes ? <Text style={styles.recordNotes} numberOfLines={2}>{r.notes}</Text> : null}
                  {r.fileUrl ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <Ionicons name="attach-outline" size={12} color={MedicalColors.success} />
                      <Text style={[styles.fileUrlText, { color: MedicalColors.success }]}>
                        {r.fileName || 'Document attached'}
                      </Text>
                    </View>
                  ) : null}
                  {r.radiologyFiles && Object.keys(r.radiologyFiles).length > 0 && (
                    Object.entries(r.radiologyFiles).map(([rType, f]) => f?.fileUrl ? (
                      <View key={rType} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <Ionicons name="attach-outline" size={12} color="#7c3aed" />
                        <Text style={[styles.fileUrlText, { color: '#7c3aed' }]}>{rType}: {f.fileName || 'File attached'}</Text>
                      </View>
                    ) : null)
                  )}
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
            );
          })
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
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>{editIndex !== null ? 'Edit Record' : 'New Health Record'}</Text>
                <Text style={styles.modalSubtitle}>Fill in the details below</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={20} color={MedicalColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

              {/* Record Name */}
              <Text style={styles.label}>Record Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={v => setForm(p => ({ ...p, name: v }))}
                placeholder="e.g., Complete Blood Count – March 2026"
                placeholderTextColor={MedicalColors.textLight}
              />

              {/* Date — auto-filled, tappable */}
              <Text style={styles.label}>Date *</Text>
              <TouchableOpacity
                style={[styles.input, styles.dateInput]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.dateText}>{form.date || 'Select date…'}</Text>
                <Ionicons name="calendar-outline" size={18} color={MedicalColors.primary} />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  onChange={(event, date) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (date) {
                      setSelectedDate(date);
                      setForm(p => ({ ...p, date: formatDate(date) }));
                    }
                  }}
                />
              )}
              {Platform.OS === 'ios' && showDatePicker && (
                <TouchableOpacity style={styles.doneBtn} onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              )}

              {/* Type Picker */}
              <Text style={styles.label}>Record Type(s) — select all that apply *</Text>

              {/* Selected tags with X */}
              {(form.types || []).length > 0 && (
                <View style={styles.selectedTagsContainer}>
                  <Text style={styles.selectedTagsHint}>Selected — tap to remove:</Text>
                  <View style={styles.selectedTagsRow}>
                    {form.types.map(t => {
                      const grp = getGroupForType(t);
                      return (
                        <TouchableOpacity
                          key={t}
                          style={[styles.selectedTag, { backgroundColor: grp?.color || '#475569' }]}
                          onPress={() => toggleType(t)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.selectedTagText}>{t}</Text>
                          <View style={styles.selectedTagX}>
                            <Ionicons name="close" size={11} color="#fff" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Accordion groups */}
              {HR_GROUPS.map(group => {
                const isExpanded = expandedGroups.has(group.label);
                const selectedInGroup = (form.types || []).filter(t => group.types.includes(t));
                return (
                  <View key={group.label} style={styles.accordionGroup}>
                    <TouchableOpacity
                      style={[styles.accordionHeader, { borderColor: group.border, backgroundColor: group.bg }]}
                      onPress={() => toggleGroup(group.label)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.accordionHeaderLeft}>
                        <View style={[styles.accordionDot, { backgroundColor: group.color }]} />
                        <Text style={[styles.accordionLabel, { color: group.color }]}>{group.label}</Text>
                        {selectedInGroup.length > 0 && (
                          <View style={[styles.accordionBadge, { backgroundColor: group.color }]}>
                            <Text style={styles.accordionBadgeText}>{selectedInGroup.length} selected</Text>
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={group.color}
                      />
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={[styles.accordionContent, { borderColor: group.border }]}>
                        <View style={styles.chipRow}>
                          {group.types.map(t => {
                            const isSelected = (form.types || []).includes(t);
                            return (
                              <TouchableOpacity
                                key={t}
                                onPress={() => toggleType(t)}
                                style={[
                                  styles.chip,
                                  {
                                    borderColor: isSelected ? group.color : group.border,
                                    backgroundColor: isSelected ? group.color : '#fff',
                                  },
                                ]}
                                activeOpacity={0.7}
                              >
                                {isSelected && (
                                  <Ionicons name="checkmark" size={12} color="#fff" style={{ marginRight: 3 }} />
                                )}
                                <Text style={[styles.chipText, { color: isSelected ? '#fff' : group.color }]}>{t}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Per-radiology dedicated upload fields */}
              {selectedRadiology.length > 0 && (
                <View style={styles.radiologyUploadsSection}>
                  <View style={styles.radiologyUploadsHeader}>
                    <Ionicons name="cloud-upload-outline" size={15} color="#7c3aed" />
                    <Text style={styles.radiologyUploadsTitle}>Radiology Files — Upload Each</Text>
                  </View>
                  {selectedRadiology.map(rType => {
                    const rFile = form.radiologyFiles?.[rType];
                    const isUploading = uploading === rType;
                    const hasFile = !!rFile?.fileUrl;
                    return (
                      <View key={rType} style={styles.radioUploadBlock}>
                        <Text style={styles.radioUploadLabel}>
                          <Text style={{ fontWeight: '700' }}>{rType}</Text> — file required *
                        </Text>
                        <TouchableOpacity
                          style={[
                            styles.uploadBtn,
                            hasFile && styles.uploadBtnSuccess,
                            isUploading && { opacity: 0.65 },
                          ]}
                          onPress={() => pickDocument(rType)}
                          disabled={uploading !== null}
                          activeOpacity={0.75}
                        >
                          {isUploading ? (
                            <>
                              <ActivityIndicator size="small" color="#7c3aed" />
                              <Text style={[styles.uploadBtnText, { color: '#7c3aed' }]}>Uploading…</Text>
                            </>
                          ) : hasFile ? (
                            <>
                              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                              <Text style={[styles.uploadBtnText, { color: '#16a34a', flex: 1 }]} numberOfLines={1}>
                                {rFile.fileName || 'Uploaded'}
                              </Text>
                              <TouchableOpacity
                                onPress={() => removeRadiologyFile(rType)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Ionicons name="close-circle-outline" size={18} color={MedicalColors.error} />
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <Ionicons name="cloud-upload-outline" size={18} color="#7c3aed" />
                              <Text style={[styles.uploadBtnText, { color: '#7c3aed' }]}>
                                Upload {rType} file (PDF, Image)
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* General file upload — for Surgical Report or optional */}
              {(form.types?.includes('Surgical Report') || (!form.types?.some(t => HR_RADIOLOGY.includes(t)) && form.types?.length > 0)) && (
                <>
                  <Text style={styles.label}>
                    Attach Document{form.types?.includes('Surgical Report') ? ' *' : ' (optional)'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.uploadBtn, uploading === 'general' && { opacity: 0.65 }]}
                    onPress={() => pickDocument(null)}
                    disabled={uploading !== null}
                    activeOpacity={0.75}
                  >
                    {uploading === 'general' ? (
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
                      <Text style={styles.uploadedText} numberOfLines={1}>{form.fileName || 'File uploaded'}</Text>
                      <TouchableOpacity onPress={() => setForm(p => ({ ...p, fileUrl: '', fileName: '' }))}>
                        <Ionicons name="close-circle-outline" size={16} color={MedicalColors.error} />
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              )}

              {/* Notes */}
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={form.notes}
                onChangeText={v => setForm(p => ({ ...p, notes: v }))}
                placeholder="Key findings, doctor comments, follow-up needed…"
                placeholderTextColor={MedicalColors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              {error ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                  <Text style={styles.errorText}>{error}</Text>
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

              <View style={{ height: 24 }} />
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
  recordMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 4 },
  typeBadge: {
    backgroundColor: MedicalColors.primaryLight, paddingHorizontal: 8,
    paddingVertical: 2, borderRadius: 6,
  },
  typeText: { fontSize: 11, fontWeight: '600', color: MedicalColors.primary },
  recordDate: { fontSize: 11, color: MedicalColors.textSecondary, marginBottom: 2 },
  recordNotes: { fontSize: 12, color: MedicalColors.textSecondary, lineHeight: 18 },
  fileUrlText: { fontSize: 11, marginTop: 2 },
  recordActions: { gap: 6, alignItems: 'flex-end', flexShrink: 0 },
  iconBtn: { padding: 6 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: MedicalColors.surface, borderRadius: 12, padding: 14, marginTop: 6,
    borderWidth: 2, borderColor: MedicalColors.primary, borderStyle: 'dashed',
  },
  addBtnText: { color: MedicalColors.primary, fontSize: 15, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingTop: 16, maxHeight: '94%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: MedicalColors.text },
  modalSubtitle: { fontSize: 12, color: MedicalColors.textSecondary, marginTop: 2 },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
  },

  label: { fontSize: 13, fontWeight: '700', color: MedicalColors.text, marginBottom: 7, marginTop: 14 },
  input: {
    borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 12,
    padding: 13, fontSize: 14, color: MedicalColors.text,
    backgroundColor: '#fafafa',
  },
  dateInput: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dateText: { fontSize: 14, color: MedicalColors.text, fontWeight: '500' },
  doneBtn: {
    alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: MedicalColors.primary, borderRadius: 8,
  },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  textArea: { minHeight: 90, textAlignVertical: 'top' },

  // Selected removable tags
  selectedTagsContainer: {
    marginBottom: 10, padding: 12, backgroundColor: '#fafafa',
    borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
  },
  selectedTagsHint: { fontSize: 11, color: MedicalColors.textSecondary, marginBottom: 8 },
  selectedTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  selectedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingLeft: 10, paddingRight: 6, paddingVertical: 6,
    borderRadius: 20,
  },
  selectedTagText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  selectedTagX: {
    width: 17, height: 17, borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'center', alignItems: 'center',
  },

  // Accordion
  accordionGroup: { marginBottom: 8 },
  accordionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 13, borderRadius: 12, borderWidth: 1.5,
  },
  accordionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accordionDot: { width: 8, height: 8, borderRadius: 4 },
  accordionLabel: { fontSize: 14, fontWeight: '700' },
  accordionBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
  },
  accordionBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  accordionContent: {
    borderLeftWidth: 2, borderRightWidth: 1, borderBottomWidth: 1,
    borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, marginTop: -4,
    backgroundColor: '#fff',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 12, fontWeight: '600' },

  // Per-radiology uploads
  radiologyUploadsSection: {
    marginTop: 14, padding: 14, backgroundColor: '#faf5ff',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#ddd6fe',
  },
  radiologyUploadsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12,
  },
  radiologyUploadsTitle: { fontSize: 13, fontWeight: '700', color: '#7c3aed' },
  radioUploadBlock: { marginBottom: 10 },
  radioUploadLabel: {
    fontSize: 12, color: '#7c3aed', marginBottom: 6,
  },

  // Upload button
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: MedicalColors.primary, borderStyle: 'dashed',
    borderRadius: 10, padding: 12, backgroundColor: '#f8faff',
  },
  uploadBtnSuccess: {
    borderStyle: 'solid', borderColor: '#bbf7d0', backgroundColor: '#f0fdf4',
  },
  uploadBtnText: { fontSize: 13, fontWeight: '600', color: MedicalColors.primary, flex: 1 },
  uploadedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 6, padding: 8, backgroundColor: '#f0fdf4',
    borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0',
  },
  uploadedText: { flex: 1, fontSize: 12, color: '#15803d', fontWeight: '600' },

  // Error
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, padding: 10, backgroundColor: '#fef2f2',
    borderRadius: 8, borderWidth: 1, borderColor: '#fecaca',
  },
  errorText: { color: '#dc2626', fontSize: 13, flex: 1 },

  saveBtn: {
    backgroundColor: MedicalColors.primary, borderRadius: 14,
    padding: 15, alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default HealthRecordsScreen;
