// Add an e-pharmacy for several psychiatry clients at once — a copy of the
// E-Pharmacy feature on doctor-dashboard/DoctorHomeScreen.js (state, directory
// loading, save, modal and styles), for therapists. Differences are marked
// "Psychiatry:". Keep fixes in step with DoctorHomeScreen.js.
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';
import { dedupePatientPharmacies, hasPatientPharmacy } from '../../utils/patientPharmacyDedupe';

export default function ClientEPharmacyModal({ visible, onClose, therapistId }) {
  const [showEPharmacyModal, setShowEPharmacyModal] = useState(false);
  const [selectedPatientIds, setSelectedPatientIds] = useState(new Set());
  const [pharmacyForm, setPharmacyForm] = useState({ name: '', address: '', phone: '' });
  const [savingPharmacy, setSavingPharmacy] = useState(false);
  const [ephSearch, setEphSearch] = useState('');
  const [ephSource, setEphSource] = useState('platform'); // 'platform' | 'manual'
  const [ephPharmacies, setEphPharmacies] = useState([]);
  const [ephBranches, setEphBranches] = useState([]);
  const [ephPharmacyId, setEphPharmacyId] = useState('');
  const [ephPharmacyName, setEphPharmacyName] = useState('');
  const [ephBranchId, setEphBranchId] = useState('');
  const [ephBranchName, setEphBranchName] = useState('');
  const [ephLoadingPh, setEphLoadingPh] = useState(false);
  const [ephLoadingBranches, setEphLoadingBranches] = useState(false);
  const [showEphPhPicker, setShowEphPhPicker] = useState(false);
  const [showEphBrPicker, setShowEphBrPicker] = useState(false);

  // Psychiatry: the therapist's own psychiatry-track clients stand in for the
  // doctor's patients-from-appointments (same source as TherapistPrescriptionsScreen).
  const [allPatients, setAllPatients] = useState([]);
  useEffect(() => {
    if (!visible || !therapistId) return;
    let cancelled = false;
    (async () => {
      const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`).catch(() => []) || [];
      const map = new Map();
      for (const a of assignments) {
        if (!a.clientId || map.has(a.clientId)) continue;
        try {
          const raw = await api(`/api/v1/clients/${a.clientId}`);
          let prefs = {};
          try { prefs = raw?.preferencesJson ? JSON.parse(raw.preferencesJson) : {}; } catch { /* ignore */ }
          if (String(prefs.careTrack || '').toLowerCase() !== 'psychiatry') continue;
          map.set(a.clientId, { id: a.clientId, name: a.clientName || a.clientDisplayName || prefs.name || 'Client' });
        } catch { /* skip */ }
      }
      if (!cancelled) setAllPatients(Array.from(map.values()).sort((x, y) => x.name.localeCompare(y.name)));
    })();
    return () => { cancelled = true; };
  }, [visible, therapistId]);

  // Psychiatry: opened from the therapist home rather than toggled inside it.
  useEffect(() => { if (visible) openEPharmacy(); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!showEPharmacyModal && visible) onClose?.(); }, [showEPharmacyModal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showEPharmacyModal) return;
    let cancelled = false;
    (async () => {
      setEphLoadingPh(true);
      try {
        const snap = await api('/api/v1/pharmacies?status=active');
        if (!cancelled) setEphPharmacies(snap || []);
      } catch {
        if (!cancelled) setEphPharmacies([]);
      } finally {
        if (!cancelled) setEphLoadingPh(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showEPharmacyModal]);

  const loadEphBranches = async (pharmacyId) => {
    if (!pharmacyId) {
      setEphBranches([]);
      return;
    }
    setEphLoadingBranches(true);
    setEphBranches([]);
    try {
      const snap = await api(`/api/v1/pharmacy-branches?pharmacyId=${pharmacyId}&status=active`);
      setEphBranches(snap || []);
    } catch {
      setEphBranches([]);
    } finally {
      setEphLoadingBranches(false);
    }
  };

  const ephPatients = useMemo(() => {
    if (!ephSearch.trim()) return allPatients;
    const q = ephSearch.toLowerCase();
    return allPatients.filter(p => p.name.toLowerCase().includes(q));
  }, [allPatients, ephSearch]);

  const togglePatient = (id) => {
    setSelectedPatientIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openEPharmacy = () => {
    setSelectedPatientIds(new Set());
    setPharmacyForm({ name: '', address: '', phone: '' });
    setEphSearch('');
    setEphSource('platform');
    setEphPharmacyId('');
    setEphPharmacyName('');
    setEphBranchId('');
    setEphBranchName('');
    setEphBranches([]);
    setShowEphPhPicker(false);
    setShowEphBrPicker(false);
    setShowEPharmacyModal(true);
  };

  const pickEphPharmacy = (ph) => {
    setEphPharmacyId(ph.id);
    setEphPharmacyName(ph.pharmacyName || ph.name || 'Pharmacy');
    setEphBranchId('');
    setEphBranchName('');
    setShowEphPhPicker(false);
    loadEphBranches(ph.id);
  };

  const pickEphBranch = (br) => {
    setEphBranchId(br.id);
    setEphBranchName(br.branchName || 'Branch');
    setShowEphBrPicker(false);
  };

  const saveEPharmacy = async () => {
    if (selectedPatientIds.size === 0) {
      alert('Please select at least one client.');
      return;
    }

    let pharmacy;
    if (ephSource === 'platform') {
      if (!ephPharmacyId || !ephBranchId) {
        alert('Select a pharmacy and branch from the platform directory.');
        return;
      }
      const ph = ephPharmacies.find(p => p.id === ephPharmacyId);
      const br = ephBranches.find(b => b.id === ephBranchId);
      const lineName = [ephBranchName, ephPharmacyName].filter(Boolean).join(' · ');
      pharmacy = {
        name: lineName,
        address: (br?.address || ph?.address || '').trim(),
        country: (br?.country || ph?.country || br?.location?.country || ph?.location?.country || '').trim(),
        city: (br?.city || ph?.city || br?.location?.city || ph?.location?.city || '').trim(),
        area: (br?.area || ph?.area || br?.location?.area || ph?.location?.area || '').trim(),
        region: (br?.region || ph?.region || br?.location?.region || ph?.location?.region || '').trim(),
        street: (br?.street || ph?.street || br?.location?.street || ph?.location?.street || '').trim(),
        ghanaDigitalAddress: (br?.ghanaDigitalAddress || ph?.ghanaDigitalAddress || '').trim(),
        latitude: Number.isFinite(Number(br?.latitude ?? ph?.latitude ?? br?.location?.latitude ?? ph?.location?.latitude))
          ? Number(br?.latitude ?? ph?.latitude ?? br?.location?.latitude ?? ph?.location?.latitude)
          : null,
        longitude: Number.isFinite(Number(br?.longitude ?? ph?.longitude ?? br?.location?.longitude ?? ph?.location?.longitude))
          ? Number(br?.longitude ?? ph?.longitude ?? br?.location?.longitude ?? ph?.location?.longitude)
          : null,
        phone: (br?.phone || ph?.phone || '').trim(),
        pharmacyId: ephPharmacyId,
        branchId: ephBranchId,
        pharmacyName: ephPharmacyName,
        branchName: ephBranchName,
        source: 'platform',
        addedByDoctor: true,
        addedAt: new Date().toISOString(),
      };
    } else {
      if (!pharmacyForm.name.trim()) {
        alert('Please enter a pharmacy name.');
        return;
      }
      pharmacy = {
        name: pharmacyForm.name.trim(),
        address: pharmacyForm.address.trim(),
        country: '',
        city: '',
        area: '',
        region: '',
        street: '',
        ghanaDigitalAddress: '',
        latitude: null,
        longitude: null,
        phone: pharmacyForm.phone.trim(),
        source: 'manual',
        addedByDoctor: true,
        addedAt: new Date().toISOString(),
      };
    }

    setSavingPharmacy(true);
    try {
      let added = 0;
      let skippedDup = 0;
      for (const patientId of selectedPatientIds) {
        const patData = await api(`/api/v1/patients/${patientId}`).catch(() => null);
        const cleaned = dedupePatientPharmacies(patData?.pharmacies || []);
        if (hasPatientPharmacy(cleaned, pharmacy)) {
          skippedDup += 1;
          continue;
        }
        await api(`/api/v1/patients/${patientId}`, { method: 'PATCH', body: { pharmacies: [...cleaned, pharmacy] } });
        added += 1;
      }
      setShowEPharmacyModal(false);
      const parts = [];
      if (added) parts.push(`Added to ${added} client${added > 1 ? 's' : ''}.`);
      if (skippedDup) parts.push(`${skippedDup} skipped (already on file).`);
      alert(parts.join(' ') || 'No changes.');
    } catch (err) {
      console.error('E-Pharmacy save error:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSavingPharmacy(false);
    }
  };

  return (
    <>
    {/* ── E-Pharmacy Modal ── */}
    <Modal
      visible={showEPharmacyModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowEPharmacyModal(false)}
    >
      <View style={eph.overlay}>
        <View style={eph.card}>
          {/* Header */}
          <View style={eph.header}>
            <View style={eph.headerIconWrap}>
              <Ionicons name="storefront-outline" size={22} color="#0f766e" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={eph.title}>Add E-Pharmacy</Text>
              <Text style={eph.subtitle}>Assign a pharmacy to your psychiatry clients</Text>
            </View>
            <TouchableOpacity style={eph.closeBtn} onPress={() => setShowEPharmacyModal(false)}>
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* Source toggle */}
            <View style={eph.modeRow}>
              <TouchableOpacity
                style={[eph.modeChip, ephSource === 'platform' && eph.modeChipOn]}
                onPress={() => setEphSource('platform')}
              >
                <Text style={[eph.modeChipText, ephSource === 'platform' && eph.modeChipTextOn]}>Platform directory</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[eph.modeChip, ephSource === 'manual' && eph.modeChipOn]}
                onPress={() => setEphSource('manual')}
              >
                <Text style={[eph.modeChipText, ephSource === 'manual' && eph.modeChipTextOn]}>Enter manually</Text>
              </TouchableOpacity>
            </View>

            {/* Pharmacy details */}
            <View style={eph.sectionBlock}>
              <Text style={eph.sectionLabel}>
                {ephSource === 'platform' ? 'Choose e-pharmacy (onboarded)' : 'Pharmacy details'}
              </Text>

              {ephSource === 'platform' ? (
                <>
                  <Text style={eph.helper}>Only pharmacies approved by admin appear here (same list as when routing prescriptions).</Text>
                  {ephLoadingPh ? (
                    <ActivityIndicator color={DoctorColors.primary} style={{ marginVertical: 12 }} />
                  ) : ephPharmacies.length === 0 ? (
                    <Text style={eph.warn}>No active pharmacies in the directory. Use &quot;Enter manually&quot; or ask admin to approve the pharmacy.</Text>
                  ) : (
                    <>
                      <Text style={eph.fieldLbl}>Pharmacy *</Text>
                      <TouchableOpacity style={eph.pickerBtn} onPress={() => { setShowEphBrPicker(false); setShowEphPhPicker(v => !v); }}>
                        <Text style={eph.pickerBtnText} numberOfLines={1}>
                          {ephPharmacyId ? ephPharmacyName : '— Select pharmacy —'}
                        </Text>
                        <Ionicons name={showEphPhPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                      </TouchableOpacity>
                      {showEphPhPicker && (
                        <View style={eph.pickerList}>
                          {ephPharmacies.map(ph => (
                            <TouchableOpacity key={ph.id} style={eph.pickerItem} onPress={() => pickEphPharmacy(ph)}>
                              <Text style={eph.pickerItemText}>{ph.pharmacyName || ph.name || 'Pharmacy'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      <Text style={[eph.fieldLbl, { marginTop: 12 }]}>Branch *</Text>
                      <TouchableOpacity
                        style={[eph.pickerBtn, !ephPharmacyId && { opacity: 0.55 }]}
                        disabled={!ephPharmacyId}
                        onPress={() => { if (!ephPharmacyId) return; setShowEphPhPicker(false); setShowEphBrPicker(v => !v); }}
                      >
                        <Text style={eph.pickerBtnText} numberOfLines={1}>
                          {!ephPharmacyId
                            ? 'Select pharmacy first'
                            : ephLoadingBranches
                              ? 'Loading branches…'
                              : ephBranchId
                                ? ephBranchName
                                : ephBranches.length === 0
                                  ? 'No active branches'
                                  : '— Select branch —'}
                        </Text>
                        <Ionicons name={showEphBrPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                      </TouchableOpacity>
                      {showEphBrPicker && ephBranches.length > 0 && (
                        <View style={eph.pickerList}>
                          {ephBranches.map(br => (
                            <TouchableOpacity key={br.id} style={eph.pickerItem} onPress={() => pickEphBranch(br)}>
                              <Text style={eph.pickerItemText}>{br.branchName || 'Branch'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <TextInput
                    style={eph.input}
                    placeholder="Pharmacy name *"
                    placeholderTextColor="#94a3b8"
                    value={pharmacyForm.name}
                    onChangeText={v => setPharmacyForm(p => ({ ...p, name: v }))}
                  />
                  <TextInput
                    style={[eph.input, { marginTop: 8 }]}
                    placeholder="Address (optional)"
                    placeholderTextColor="#94a3b8"
                    value={pharmacyForm.address}
                    onChangeText={v => setPharmacyForm(p => ({ ...p, address: v }))}
                  />
                  <TextInput
                    style={[eph.input, { marginTop: 8 }]}
                    placeholder="Phone number (optional)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="phone-pad"
                    value={pharmacyForm.phone}
                    onChangeText={v => setPharmacyForm(p => ({ ...p, phone: v }))}
                  />
                </>
              )}
            </View>

            {/* Patient selection */}
            <View style={eph.sectionBlock}>
              <View style={eph.patientSectionHeader}>
                <Text style={eph.sectionLabel}>Select Clients</Text>
                {selectedPatientIds.size > 0 && (
                  <View style={eph.selectionBadge}>
                    <Text style={eph.selectionBadgeText}>{selectedPatientIds.size} selected</Text>
                  </View>
                )}
              </View>

              {/* Search */}
              <View style={eph.searchBar}>
                <Ionicons name="search-outline" size={15} color="#94a3b8" />
                <TextInput
                  style={eph.searchInput}
                  placeholder="Search clients…"
                  placeholderTextColor="#94a3b8"
                  value={ephSearch}
                  onChangeText={setEphSearch}
                />
              </View>

              {allPatients.length === 0 ? (
                <View style={eph.emptyPatients}>
                  <Ionicons name="people-outline" size={32} color="#cbd5e1" />
                  <Text style={eph.emptyPatientsText}>No psychiatry clients found</Text>
                </View>
              ) : (
                ephPatients.map(p => {
                  const isSelected = selectedPatientIds.has(p.id);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[eph.patientRow, isSelected && eph.patientRowSelected]}
                      onPress={() => togglePatient(p.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[eph.patientAvatar, isSelected && eph.patientAvatarSelected]}>
                        <Text style={[eph.patientAvatarText, isSelected && { color: '#fff' }]}>
                          {(p.name || 'P')[0].toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[eph.patientName, isSelected && eph.patientNameSelected]}>{p.name}</Text>
                      <View style={[eph.checkbox, isSelected && eph.checkboxSelected]}>
                        {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[eph.saveBtn, (savingPharmacy || selectedPatientIds.size === 0 || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)) || (ephSource === 'manual' && !pharmacyForm.name.trim())) && { opacity: 0.6 }]}
              onPress={saveEPharmacy}
              disabled={
                savingPharmacy
                || selectedPatientIds.size === 0
                || (ephSource === 'platform' && (!ephPharmacyId || !ephBranchId))
                || (ephSource === 'manual' && !pharmacyForm.name.trim())
              }
              activeOpacity={0.8}
            >
              {savingPharmacy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="storefront-outline" size={18} color="#fff" />
                  <Text style={eph.saveBtnText}>
                    {selectedPatientIds.size === 0
                      ? 'Select clients first'
                      : ephSource === 'manual' && !pharmacyForm.name.trim()
                        ? 'Enter pharmacy name'
                        : ephSource === 'platform' && (!ephPharmacyId || !ephBranchId)
                          ? 'Select pharmacy & branch'
                          : `Add to ${selectedPatientIds.size} Client${selectedPatientIds.size > 1 ? 's' : ''}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
    </>
  );
}

const eph = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingTop: 16, maxHeight: '90%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingBottom: 14, marginBottom: 4,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  headerIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#ccfbf1', justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 1 },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
  },

  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modeChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0',
    backgroundColor: '#fff', alignItems: 'center',
  },
  modeChipOn: { borderColor: '#0f766e', backgroundColor: '#f0fdfa' },
  modeChipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  modeChipTextOn: { color: '#0f766e' },

  helper: { fontSize: 11, color: '#64748b', lineHeight: 16, marginBottom: 10 },
  warn: { fontSize: 12, color: '#b45309', lineHeight: 18 },
  fieldLbl: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 6 },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#bae6fd', borderRadius: 10,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  pickerBtnText: { flex: 1, fontSize: 14, color: '#0f172a', marginRight: 8 },
  pickerList: {
    marginTop: 6, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff',
    maxHeight: 180, overflow: 'hidden',
  },
  pickerItem: { paddingVertical: 12, paddingHorizontal: 13, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerItemText: { fontSize: 14, color: '#334155', fontWeight: '600' },

  sectionBlock: {
    marginTop: 16, padding: 14, backgroundColor: '#f8fafc',
    borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0',
  },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 10 },
  patientSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  selectionBadge: {
    backgroundColor: '#0f766e', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3,
  },
  selectionBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 13, paddingVertical: 11,
    fontSize: 14, color: '#0f172a',
  },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },

  patientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10,
    marginBottom: 4, backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  patientRowSelected: {
    backgroundColor: '#f0fdfa', borderColor: '#5eead4',
  },
  patientAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center',
  },
  patientAvatarSelected: { backgroundColor: '#0f766e' },
  patientAvatarText: { fontSize: 14, fontWeight: '700', color: DoctorColors.primary },
  patientName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
  patientNameSelected: { color: '#0f766e' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: '#0f766e', borderColor: '#0f766e' },

  emptyPatients: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyPatientsText: { fontSize: 13, color: '#94a3b8' },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0f766e', borderRadius: 14, padding: 15, marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
