import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, Modal, Alert, ScrollView,
  RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';

const TODAY = new Date().toISOString().split('T')[0];

const EMPTY_MED = { name: '', dosage: '', frequency: '', duration: '' };

export default function DoctorPrescriptionsScreen() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [doctorProfile, setDoctorProfile] = useState(null);

  const [form, setForm] = useState({
    patientId: '', patientName: '',
    diagnosis: '', instructions: '',
    followUpDate: '', medications: [{ ...EMPTY_MED }],
  });

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      const profile = dSnap.exists() ? { id: cu.uid, ...dSnap.data() } : { id: cu.uid, name: 'Doctor' };
      setDoctorProfile(profile);

      const apptSnap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const patMap = new Map();
      apptSnap.docs.forEach(d => {
        const data = d.data();
        if (data.clientId && !patMap.has(data.clientId)) {
          patMap.set(data.clientId, { id: data.clientId, name: data.clientName || '' });
        }
      });
      const enriched = await enrichPatientNames(patMap);
      setPatients(Array.from(enriched.values()));

      // Build name lookup from enriched patient map
      const nameById = {};
      for (const [id, p] of enriched.entries()) nameById[id] = p.name;

      // Load prescriptions — no orderBy to avoid composite index requirement; sort in JS
      const rxSnap = await getDocs(
        query(collection(db, 'doctorPrescriptions'), where('doctorId', '==', cu.uid))
      );
      const rxList = rxSnap.docs.map(d => {
        const data = d.data();
        // Normalize: handle both flat format (from PatientDetail) and array format
        let medications = data.medications;
        if (!medications || medications.length === 0) {
          if (data.medication) {
            medications = [{ name: data.medication, dosage: data.dosage || '', frequency: data.frequency || '', duration: data.duration || '' }];
          } else {
            medications = [];
          }
        }
        const patientName = data.patientName || (data.patientId && nameById[data.patientId]) || 'Patient';
        // Fallback diagnosis for old flat-format records that stored text in `instructions`
        const diagnosis = data.diagnosis || data.instructions || '';
        return { id: d.id, ...data, medications, patientName, diagnosis };
      });
      rxList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(rxList);
    } catch (err) {
      console.error('DoctorPrescriptions load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const openNew = () => {
    setEditing(null);
    setForm({ patientId: '', patientName: '', diagnosis: '', instructions: '', followUpDate: '', medications: [{ ...EMPTY_MED }] });
    setShowModal(true);
  };

  const openEdit = (rx) => {
    setEditing(rx);
    setForm({
      patientId: rx.patientId || '',
      patientName: rx.patientName || '',
      diagnosis: rx.diagnosis || '',
      instructions: rx.instructions || '',
      followUpDate: rx.followUpDate || '',
      medications: rx.medications?.length ? rx.medications.map(m => ({ ...m })) : [{ ...EMPTY_MED }],
    });
    setShowModal(true);
  };

  const addMed = () => setForm(p => ({ ...p, medications: [...p.medications, { ...EMPTY_MED }] }));
  const removeMed = (i) => setForm(p => ({ ...p, medications: p.medications.filter((_, idx) => idx !== i) }));
  const updateMed = (i, field, val) => setForm(p => {
    const meds = [...p.medications];
    meds[i] = { ...meds[i], [field]: val };
    return { ...p, medications: meds };
  });

  const handleSave = async () => {
    if (!form.patientId) { Alert.alert('Validation', 'Please select a patient.'); return; }
    if (!form.diagnosis.trim()) { Alert.alert('Validation', 'Diagnosis is required.'); return; }
    if (!form.medications[0].name.trim()) { Alert.alert('Validation', 'At least one medication is required.'); return; }
    setSaving(true);
    try {
      const cu = auth.currentUser;
      const payload = {
        patientId: form.patientId,
        patientName: form.patientName,
        diagnosis: form.diagnosis.trim(),
        instructions: form.instructions.trim(),
        followUpDate: form.followUpDate,
        medications: form.medications.filter(m => m.name.trim()),
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, 'doctorPrescriptions', editing.id), payload);
      } else {
        await addDoc(collection(db, 'doctorPrescriptions'), {
          ...payload,
          doctorId: cu.uid,
          doctorName: doctorProfile?.name || '',
          date: TODAY,
          createdAt: serverTimestamp(),
        });
      }
      setShowModal(false);
      await loadAll();
    } catch (err) {
      Alert.alert('Error', 'Could not save prescription. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (rxId) => {
    Alert.alert('Delete Prescription', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'doctorPrescriptions', rxId));
          setPrescriptions(prev => prev.filter(r => r.id !== rxId));
        } catch {
          Alert.alert('Error', 'Could not delete prescription.');
        }
      }},
    ]);
  };

  const filtered = prescriptions.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.patientName || '').toLowerCase().includes(q) ||
           (r.diagnosis || '').toLowerCase().includes(q) ||
           (r.date || '').includes(q);
  });

  const renderRx = ({ item }) => (
    <View style={styles.rxCard}>
      <View style={styles.rxHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rxPatient}>{item.patientName || 'Patient'}</Text>
          <Text style={styles.rxDiagnosis}>{item.diagnosis}</Text>
        </View>
        <View style={styles.rxActions}>
          <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionIcon}>
            <Ionicons name="pencil-outline" size={17} color={DoctorColors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionIcon}>
            <Ionicons name="trash-outline" size={17} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.medsPreview}>
        {(item.medications || []).slice(0, 2).map((m, i) => (
          <View key={i} style={styles.medPill}>
            <Text style={styles.medPillText}>{m.name} {m.dosage}</Text>
          </View>
        ))}
        {(item.medications || []).length > 2 && (
          <View style={styles.medPill}>
            <Text style={styles.medPillText}>+{item.medications.length - 2} more</Text>
          </View>
        )}
      </View>

      <View style={styles.rxFooter}>
        <Text style={styles.rxDate}>📅 {item.date}</Text>
        {item.followUpDate ? <Text style={styles.rxDate}>🔄 Follow-up: {item.followUpDate}</Text> : null}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search prescriptions..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openNew}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>New Rx</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderRx}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="medkit-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>{search ? 'No matching prescriptions' : 'No prescriptions yet'}</Text>
            </View>
          }
        />
      )}

      {/* Prescription Form Modal */}
      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editing ? 'Edit Prescription' : 'New Prescription'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
              {/* Patient */}
              {!editing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Patient *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                    {patients.map(p => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.chip, form.patientId === p.id && styles.chipActive]}
                        onPress={() => setForm(prev => ({ ...prev, patientId: p.id, patientName: p.name }))}
                      >
                        <Text style={[styles.chipText, form.patientId === p.id && styles.chipTextActive]}>{p.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  {!form.patientId && <Text style={styles.hint}>Select a patient above</Text>}
                </View>
              )}

              {/* Diagnosis */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Diagnosis *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter diagnosis"
                  placeholderTextColor="#94a3b8"
                  value={form.diagnosis}
                  onChangeText={v => setForm(p => ({ ...p, diagnosis: v }))}
                />
              </View>

              {/* Medications */}
              <View style={styles.fieldGroup}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.fieldLabel}>Medications *</Text>
                  <TouchableOpacity onPress={addMed} style={styles.addMedBtn}>
                    <Ionicons name="add-circle-outline" size={18} color={DoctorColors.primary} />
                    <Text style={styles.addMedText}>Add</Text>
                  </TouchableOpacity>
                </View>
                {form.medications.map((med, i) => (
                  <View key={i} style={styles.medRow}>
                    <View style={styles.medRowHeader}>
                      <Text style={styles.medRowLabel}>Medication {i + 1}</Text>
                      {form.medications.length > 1 && (
                        <TouchableOpacity onPress={() => removeMed(i)}>
                          <Ionicons name="remove-circle-outline" size={18} color="#ef4444" />
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput style={styles.input} placeholder="Drug name" placeholderTextColor="#94a3b8"
                      value={med.name} onChangeText={v => updateMed(i, 'name', v)} />
                    <View style={styles.medFieldRow}>
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Dosage (e.g. 500mg)"
                        placeholderTextColor="#94a3b8" value={med.dosage} onChangeText={v => updateMed(i, 'dosage', v)} />
                      <TextInput style={[styles.input, { flex: 1 }]} placeholder="Frequency (e.g. 2x/day)"
                        placeholderTextColor="#94a3b8" value={med.frequency} onChangeText={v => updateMed(i, 'frequency', v)} />
                    </View>
                    <TextInput style={styles.input} placeholder="Duration (e.g. 7 days)"
                      placeholderTextColor="#94a3b8" value={med.duration} onChangeText={v => updateMed(i, 'duration', v)} />
                  </View>
                ))}
              </View>

              {/* Instructions */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Special Instructions</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Additional instructions for patient..."
                  placeholderTextColor="#94a3b8"
                  value={form.instructions}
                  onChangeText={v => setForm(p => ({ ...p, instructions: v }))}
                  multiline numberOfLines={3} textAlignVertical="top"
                />
              </View>

              {/* Follow-up Date */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Follow-up Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94a3b8"
                  value={form.followUpDate}
                  onChangeText={v => setForm(p => ({ ...p, followUpDate: v }))}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
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
  rxCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  rxHeader: { flexDirection: 'row', marginBottom: 8 },
  rxPatient: { fontSize: 15, fontWeight: '700', color: DoctorColors.text },
  rxDiagnosis: { fontSize: 13, color: DoctorColors.textSecondary, marginTop: 2 },
  rxActions: { flexDirection: 'row', gap: 8 },
  actionIcon: { padding: 4 },
  medsPreview: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  medPill: {
    backgroundColor: DoctorColors.primaryLight, paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: 20,
  },
  medPillText: { fontSize: 11, color: DoctorColors.primary, fontWeight: '600' },
  rxFooter: { flexDirection: 'row', gap: 16 },
  rxDate: { fontSize: 12, color: DoctorColors.textSecondary },
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
    borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 6,
  },
  textarea: { height: 90, textAlignVertical: 'top' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginRight: 8,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  chipActive: { backgroundColor: DoctorColors.primaryLight, borderColor: DoctorColors.primary },
  chipText: { fontSize: 13, color: DoctorColors.textSecondary, fontWeight: '500' },
  chipTextActive: { color: DoctorColors.primary, fontWeight: '700' },
  hint: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addMedBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addMedText: { fontSize: 13, color: DoctorColors.primary, fontWeight: '600' },
  medRow: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0',
  },
  medRowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  medRowLabel: { fontSize: 12, fontWeight: '600', color: DoctorColors.textSecondary },
  medFieldRow: { flexDirection: 'row', gap: 8 },
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
});
