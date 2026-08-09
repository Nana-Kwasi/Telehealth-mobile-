import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Modal, TextInput, Alert, RefreshControl, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import { rxHasPendingDoctorNote, isRxDelivered, awaitingDoctorDecision } from '../../utils/pharmacyRxNotes';
import RxFullDetailsMobile from '../../components/RxFullDetailsMobile';

const DRUG_STATUS = {
  pending:               { icon: '⏳', label: 'Pending',       color: '#d97706' },
  available:             { icon: '✅', label: 'Available',     color: '#16a34a' },
  not_available:         { icon: '❌', label: 'Not Available', color: '#dc2626' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.', color: '#16a34a' },
};

const RX_STATUS = {
  sent:                { label: 'Sent',     color: '#1d4ed8', bg: '#eff6ff' },
  accepted:            { label: 'Accepted', color: '#16a34a', bg: '#f0fdf4' },
  partially_fulfilled: { label: 'Partial',  color: '#d97706', bg: '#fffbeb' },
  ready:               { label: 'Ready',    color: '#16a34a', bg: '#f0fdf4' },
  delivered:           { label: 'Delivered',color: '#475569', bg: '#f8fafc' },
};

export default function BranchPrescriptionsScreen({ profile }) {
  const navigation = useNavigation();
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [altModal, setAltModal] = useState(null);
  const [altText, setAltText] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      // A branch must see BOTH the prescriptions routed to it and any drug line
      // transferred to it from a sibling branch. /prescriptions/branch/{id} only
      // matches the routed column, so a transferred line was invisible to the branch
      // that was supposed to fill it. Query the parent org and filter, as web does.
      const branchId = profile?.id;
      const parentOrgId = profile?.organizationId || profile?.pharmacyId;
      const rawList = parentOrgId
        ? (await api(`/api/v1/medical/prescriptions/pharmacy/${parentOrgId}`).catch(() => []) || [])
        : (await api(`/api/v1/medical/prescriptions/branch/${branchId}`).catch(() => []) || []);
      const touchesThisBranch = (rx) => (rx.branchId || '') === branchId
        || (rx.medications || []).some(m => (m.transferBranchId || '') === branchId
          || (m.transferRequestBranchId || '') === branchId);
      const list = rawList
        .filter(touchesThisBranch)
        .map(data => ({
          ...data,
          medications: (data.medications || []).map(m => ({ ...m, drugStatus: m.drugStatus || 'pending' })),
        }))
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setPrescriptions(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const updateDrugStatus = async (rx, medIndex, newStatus) => {
    setSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) => i === medIndex ? { ...m, drugStatus: newStatus } : m);
      const statuses = updatedMeds.map(m => m.drugStatus);
      let rxStatus = 'accepted';
      if (statuses.every(s => s === 'available' || s === 'approved_replacement')) rxStatus = 'ready';
      else if (statuses.some(s => s === 'not_available' || s === 'alternative_suggested')) rxStatus = 'partially_fulfilled';

      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { medications: updatedMeds, pharmacyStatus: rxStatus } });
      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: rxStatus };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      if (selected?.id === rx.id) setSelected(updated);
    } catch { Alert.alert('Error', 'Failed to update.'); }
    finally { setSaving(false); }
  };

  const suggestAlternative = async () => {
    if (!altText.trim() || !altModal) return;
    const { rxId, medIndex } = altModal;
    const rx = prescriptions.find(r => r.id === rxId);
    if (!rx) return;
    setSaving(true);
    try {
      const updatedMeds = rx.medications.map((m, i) =>
        i === medIndex ? { ...m, drugStatus: 'alternative_suggested', alternativeSuggested: altText.trim() } : m
      );
      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { medications: updatedMeds, pharmacyStatus: 'partially_fulfilled' } });
      const updated = { ...rx, medications: updatedMeds, pharmacyStatus: 'partially_fulfilled' };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      if (selected?.id === rx.id) setSelected(updated);
      setAltModal(null); setAltText('');
    } catch { Alert.alert('Error', 'Failed to suggest alternative.'); }
    finally { setSaving(false); }
  };

  const markDelivered = async (rx) => {
    // A clinical-impact note must be signed off by the prescribing doctor first.
    if (rxHasPendingDoctorNote(rx)) {
      Alert.alert(
        'Waiting for doctor approval',
        'A clinical note on this prescription is still awaiting the prescribing doctor\'s approval. It cannot be delivered yet.'
      );
      return;
    }
    setSaving(true);
    try {
      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { pharmacyStatus: 'delivered' } });
      const updated = { ...rx, pharmacyStatus: 'delivered' };
      setPrescriptions(prev => prev.map(r => r.id === rx.id ? updated : r));
      setSelected(updated);
    } catch { Alert.alert('Error', 'Failed to mark as delivered.'); }
    finally { setSaving(false); }
  };

  const renderCard = ({ item: rx }) => {
    const pm = RX_STATUS[rx.pharmacyStatus] || RX_STATUS.sent;
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('BranchRxOps', { rxId: rx.id })}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardPatient}>{rx.patientName || 'Patient'}</Text>
            <Text style={styles.cardSub}>Dr. {rx.doctorName || 'Doctor'} · {rx.diagnosis || '—'}</Text>
            {rx.prescriptionRef && <Text style={styles.refCode}>{rx.prescriptionRef}</Text>}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: pm.bg }]}>
            <Text style={[styles.statusText, { color: pm.color }]}>{pm.label}</Text>
          </View>
        </View>
        <View style={styles.drugPills}>
          {(rx.medications || []).map((m, i) => {
            const ds = DRUG_STATUS[m.drugStatus] || DRUG_STATUS.pending;
            return (
              <Text key={i} style={[styles.drugPill, { color: ds.color, backgroundColor: ds.color + '18' }]}>
                {ds.icon} {m.name}
              </Text>
            );
          })}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={C.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={prescriptions}
          keyExtractor={r => r.id}
          renderItem={renderCard}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>💊</Text>
              <Text style={styles.emptyTitle}>No prescriptions yet</Text>
              <Text style={styles.emptySub}>Prescriptions routed to this branch will appear here.</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.primary} />}
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{selected?.patientName}</Text>
                <Text style={styles.modalSub}>Dr. {selected?.doctorName} · {selected?.diagnosis}</Text>
                {selected?.prescriptionRef && <Text style={styles.refCodeLarge}>{selected?.prescriptionRef}</Text>}
              </View>
              <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <RxFullDetailsMobile rx={selected} />
              <Text style={styles.sectionTitle}>Medications</Text>
              {(selected?.medications || []).map((med, i) => {
                const ds = DRUG_STATUS[med.drugStatus] || DRUG_STATUS.pending;
                // Frozen once delivered, or while the doctor still has to rule on
                // a suggested alternative / clinical-impact note for this line.
                const rowLocked = isRxDelivered(selected) || awaitingDoctorDecision(med);
                return (
                  <View key={i} style={styles.medRow}>
                    <View style={styles.medInfo}>
                      <Text style={styles.medName}>{med.name}{med.strength ? ` (${med.strength})` : ''}</Text>
                      <Text style={styles.medDetails}>{[med.drugForm, med.dosage, med.frequency].filter(Boolean).join(' · ')}</Text>
                      {med.alternativeSuggested && (
                        <Text style={styles.altSuggested}>🔁 Alt: {med.alternativeSuggested}{med.drugStatus === 'approved_replacement' ? ' ✅' : ''}</Text>
                      )}
                      <Text style={[styles.drugStatusBadge, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
                    </View>
                    <View style={styles.medActions}>
                      <TouchableOpacity disabled={saving || rowLocked || med.drugStatus === 'available'} onPress={() => updateDrugStatus(selected, i, 'available')}
                        style={[styles.actionBtn, styles.availBtn, (saving || rowLocked || med.drugStatus === 'available') && { opacity: 0.4 }]}>
                        <Text style={styles.availBtnText}>✅</Text>
                      </TouchableOpacity>
                      <TouchableOpacity disabled={saving || rowLocked || med.drugStatus === 'not_available'} onPress={() => updateDrugStatus(selected, i, 'not_available')}
                        style={[styles.actionBtn, styles.unavailBtn, (saving || rowLocked || med.drugStatus === 'not_available') && { opacity: 0.4 }]}>
                        <Text style={styles.unavailBtnText}>❌</Text>
                      </TouchableOpacity>
                      <TouchableOpacity disabled={saving || rowLocked} onPress={() => { setAltModal({ rxId: selected.id, medIndex: i }); setAltText(''); }}
                        style={[styles.actionBtn, styles.altBtn, (saving || rowLocked) && { opacity: 0.4 }]}>
                        <Text style={styles.altBtnText}>🔁</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {selected?.pharmacyStatus === 'ready' && (
                rxHasPendingDoctorNote(selected) ? (
                  <View style={styles.noteBlockBanner}>
                    <Text style={styles.noteBlockText}>
                      ⏳ Waiting for doctor approval — a clinical note on this prescription must be approved by the prescribing doctor before it can be delivered.
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.deliverBtn} onPress={() => markDelivered(selected)} disabled={saving}>
                    <Text style={styles.deliverBtnText}>{saving ? 'Saving…' : '📦 Mark as Delivered'}</Text>
                  </TouchableOpacity>
                )
              )}
              {selected?.pharmacyStatus === 'delivered' && (
                <View style={styles.deliveredBanner}>
                  <Text style={styles.deliveredText}>✅ Delivered</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!altModal} transparent animationType="fade" onRequestClose={() => setAltModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.altCard}>
            <Text style={styles.altTitle}>Suggest Alternative Drug</Text>
            <Text style={styles.altSub}>Enter the alternative drug name. The doctor will approve.</Text>
            <TextInput style={styles.altInput} placeholder="e.g. Amoxicillin 500mg" value={altText} onChangeText={setAltText} autoFocus />
            <View style={styles.altBtns}>
              <TouchableOpacity style={styles.altCancelBtn} onPress={() => setAltModal(null)}>
                <Text style={styles.altCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.altSubmitBtn, (!altText.trim() || saving) && { opacity: 0.5 }]}
                onPress={suggestAlternative} disabled={!altText.trim() || saving}>
                <Text style={styles.altSubmitText}>{saving ? 'Sending…' : '🔁 Submit'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardPatient: { fontSize: 16, fontWeight: '700', color: C.text },
  cardSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  refCode: { fontFamily: 'monospace', fontSize: 11, fontWeight: '700', color: C.primary, marginTop: 4, backgroundColor: C.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  drugPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  drugPill: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  modalSub: { fontSize: 13, color: C.textSecondary },
  refCodeLarge: { fontFamily: 'monospace', fontSize: 13, fontWeight: '900', color: C.primary, backgroundColor: C.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start', marginTop: 4 },
  closeBtn: { padding: 6, backgroundColor: '#f1f5f9', borderRadius: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 12 },
  medRow: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  medInfo: { marginBottom: 8 },
  medName: { fontSize: 15, fontWeight: '700', color: C.text },
  medDetails: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  altSuggested: { fontSize: 12, color: '#7c3aed', marginTop: 4 },
  drugStatusBadge: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  medActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  availBtn: { backgroundColor: '#dcfce7' },
  availBtnText: { fontSize: 18 },
  unavailBtn: { backgroundColor: '#fff1f2' },
  unavailBtnText: { fontSize: 18 },
  altBtn: { backgroundColor: '#fdf4ff' },
  altBtnText: { fontSize: 18 },
  deliverBtn: { backgroundColor: C.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  deliverBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  deliveredBanner: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16, borderWidth: 1.5, borderColor: '#bbf7d0' },
  noteBlockBanner: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1.5, borderColor: '#fde68a' },
  noteBlockText: { color: '#b45309', fontWeight: '700', fontSize: 13, lineHeight: 19 },
  deliveredText: { color: '#15803d', fontWeight: '800', fontSize: 16 },
  altCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, margin: 24 },
  altTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 8 },
  altSub: { fontSize: 13, color: C.textSecondary, marginBottom: 16 },
  altInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 16 },
  altBtns: { flexDirection: 'row', gap: 12 },
  altCancelBtn: { flex: 1, padding: 12, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center' },
  altCancelText: { color: C.textSecondary, fontWeight: '700' },
  altSubmitBtn: { flex: 2, padding: 12, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center' },
  altSubmitText: { color: '#fff', fontWeight: '800' },
});
