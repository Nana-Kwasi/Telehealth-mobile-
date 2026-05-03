import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { fetchClientPrescriptions } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';

const C = MedicalColors;
const DEFAULT_TRANSFER_APPROVAL_TTL_HOURS = 6;

const MedicalPrescriptionsScreen = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Completion modal state
  const [completingRx, setCompletingRx] = useState(null); // the rx being completed
  const [showWarning, setShowWarning] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [viewingRx, setViewingRx] = useState(null);
  const [transferActionKey, setTransferActionKey] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const cu = auth.currentUser;
      if (cu) {
        const rxs = await fetchClientPrescriptions(cu.uid);
        const isTransferRequestExpired = (med) => {
          if (!med || med.drugStatus !== 'transfer_requested' || med.transferRequestStatus !== 'pending_patient') return false;
          const requestedAt = med.transferRequestedAt ? new Date(med.transferRequestedAt).getTime() : NaN;
          if (!Number.isFinite(requestedAt)) return false;
          const ttlHours = Math.max(1, Number(med.transferApprovalTtlHours) || DEFAULT_TRANSFER_APPROVAL_TTL_HOURS);
          const ttlMs = ttlHours * 60 * 60 * 1000;
          return Date.now() - requestedAt > ttlMs;
        };
        const deriveRxStatusFromMeds = (meds = []) => {
          const statuses = meds.map(m => m.drugStatus || 'pending');
          if (statuses.every(s => s === 'available' || s === 'approved_replacement')) return 'ready';
          if (statuses.some(s => ['not_available', 'alternative_suggested', 'transferred', 'transfer_requested'].includes(s))) return 'partially_fulfilled';
          return 'accepted';
        };
        const expiries = rxs
          .filter(rx => (rx.medications || []).some(isTransferRequestExpired))
          .map(async (rx) => {
            const nextMeds = (rx.medications || []).map((m) => (isTransferRequestExpired(m)
              ? {
                ...m,
                drugStatus: 'not_available',
                transferRequestStatus: 'expired',
                transferRequestExpiredAt: new Date().toISOString(),
                transferBranchId: null,
                transferBranchName: null,
                transferBranchAddress: null,
                transferRequestBranchId: null,
                transferRequestBranchName: null,
                transferRequestBranchAddress: null,
              }
              : m));
            await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
              medications: nextMeds,
              pharmacyStatus: deriveRxStatusFromMeds(nextMeds),
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          });
        if (expiries.length) await Promise.all(expiries);
        setPrescriptions(rxs);
      }
    } catch (err) {
      console.error('Error loading prescriptions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleTickPress = (rx) => {
    if (rx.status === 'completed') return; // already done
    const meds = Array.isArray(rx.medications) ? rx.medications : [];
    const hasBlockedDrug = meds.some(m => ['pending', 'alternative_suggested', 'not_available'].includes(m.drugStatus || 'pending'));
    if (hasBlockedDrug) {
      Alert.alert(
        'Cannot Mark Completed',
        'Some drugs are still pending, waiting for doctor approval, or not available. Please resolve those statuses first.'
      );
      return;
    }
    setCompletingRx(rx);
    setShowWarning(true);
  };

  const confirmComplete = async () => {
    if (!completingRx) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', completingRx.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      });
      setPrescriptions(prev =>
        prev.map(r => r.id === completingRx.id ? { ...r, status: 'completed' } : r)
      );
      setShowWarning(false);
      setCompletingRx(null);
      Alert.alert('Marked Complete', 'Your doctor has been notified. Well done for completing your prescription!');
    } catch {
      Alert.alert('Error', 'Could not update prescription. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const deriveRxStatusFromMeds = (meds = []) => {
    const statuses = meds.map(m => m.drugStatus || 'pending');
    if (statuses.every(s => s === 'available' || s === 'approved_replacement')) return 'ready';
    if (statuses.some(s => ['not_available', 'alternative_suggested', 'transferred', 'transfer_requested'].includes(s))) return 'partially_fulfilled';
    return 'accepted';
  };

  const resolveTransferRequest = async (rx, medIndex, approve) => {
    const meds = Array.isArray(rx?.medications) ? rx.medications : [];
    const med = meds[medIndex];
    if (!med || med.drugStatus !== 'transfer_requested' || med.transferRequestStatus !== 'pending_patient') return;
    const key = `${rx.id}:${medIndex}:${approve ? 'approve' : 'reject'}`;
    setTransferActionKey(key);
    try {
      const nextMeds = meds.map((m, i) => {
        if (i !== medIndex) return m;
        if (approve) {
          return {
            ...m,
            drugStatus: 'transferred',
            transferRequestStatus: 'approved_by_patient',
            transferApprovedByPatientAt: new Date().toISOString(),
            transferBranchId: m.transferRequestBranchId || null,
            transferBranchName: m.transferRequestBranchName || null,
            transferBranchAddress: m.transferRequestBranchAddress || null,
          };
        }
        return {
          ...m,
          drugStatus: 'not_available',
          transferRequestStatus: 'rejected_by_patient',
          transferRejectedByPatientAt: new Date().toISOString(),
          transferBranchId: null,
          transferBranchName: null,
          transferBranchAddress: null,
          transferRequestBranchId: null,
          transferRequestBranchName: null,
          transferRequestBranchAddress: null,
        };
      });
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        medications: nextMeds,
        pharmacyStatus: deriveRxStatusFromMeds(nextMeds),
        updatedAt: serverTimestamp(),
      });
      setPrescriptions(prev => prev.map(p => (p.id === rx.id ? { ...p, medications: nextMeds, pharmacyStatus: deriveRxStatusFromMeds(nextMeds) } : p)));
    } catch {
      Alert.alert('Error', 'Failed to process transfer decision. Please try again.');
    } finally {
      setTransferActionKey('');
    }
  };

  if (isLoading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={C.primary} /></View>;
  }

  const active = prescriptions.filter(r => r.status !== 'completed');
  const completed = prescriptions.filter(r => r.status === 'completed');

  return (
    <>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        <View style={styles.infoCard}>
          <Ionicons name="medkit" size={28} color={C.primary} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={styles.infoTitle}>My Prescriptions</Text>
            <Text style={styles.infoSub}>Tap the tick to mark a prescription as completed</Text>
          </View>
        </View>

        {prescriptions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="medkit-outline" size={64} color={C.textLight} />
            <Text style={styles.emptyTitle}>No prescriptions yet</Text>
            <Text style={styles.emptySub}>Prescriptions from your doctor will appear here after your consultation.</Text>
          </View>
        ) : (
          <>
            {/* Active prescriptions */}
            {active.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>ACTIVE</Text>
                {active.map(rx => <RxCard key={rx.id} rx={rx} onTick={handleTickPress} onOpen={setViewingRx} onTransferDecision={resolveTransferRequest} transferActionKey={transferActionKey} />)}
              </>
            )}

            {/* Completed prescriptions */}
            {completed.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>COMPLETED</Text>
                {completed.map(rx => <RxCard key={rx.id} rx={rx} onTick={handleTickPress} onOpen={setViewingRx} onTransferDecision={resolveTransferRequest} transferActionKey={transferActionKey} />)}
              </>
            )}
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Side effects warning / confirmation modal */}
      <Modal visible={showWarning} transparent animationType="fade" onRequestClose={() => { setShowWarning(false); setCompletingRx(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.warningIcon}>
              <Ionicons name="warning" size={30} color="#f59e0b" />
            </View>
            <Text style={styles.modalTitle}>Mark as Completed?</Text>
            <Text style={styles.modalSub}>
              Before marking <Text style={{ fontWeight: '700' }}>{completingRx?.medication || completingRx?.medications?.[0]?.name || 'this prescription'}</Text> as completed, please confirm:
            </Text>

            <View style={styles.checkList}>
              {[
                'I have taken all doses as prescribed by my doctor.',
                'I did not stop early without medical advice.',
                'I understand stopping a prescription early may reduce effectiveness.',
              ].map((item, i) => (
                <View key={i} style={styles.checkItem}>
                  <Ionicons name="checkmark-circle-outline" size={16} color="#f59e0b" />
                  <Text style={styles.checkText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sideEffectNote}>
              <Ionicons name="information-circle-outline" size={15} color="#64748b" />
              <Text style={styles.sideEffectText}>
                If you are experiencing side effects or stopped early, please inform your doctor first.
              </Text>
            </View>

            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setShowWarning(false); setCompletingRx(null); }}
              >
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, updating && { opacity: 0.6 }]}
                onPress={confirmComplete}
                disabled={updating}
              >
                {updating
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.modalBtnConfirmText}>Yes, Completed</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewingRx} transparent animationType="slide" onRequestClose={() => setViewingRx(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={styles.modalTitle}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setViewingRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {viewingRx && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.rxName}>{viewingRx.medication || viewingRx.medications?.[0]?.name || 'Prescription'}</Text>
                <Text style={styles.rxDoctor}>Dr. {viewingRx.doctorName || 'Doctor'}</Text>
                <Text style={styles.rxDiagnosis}>Diagnosis: {viewingRx.diagnosis || '—'}</Text>
                <Text style={styles.rxDiagnosis}>Date: {viewingRx.date || '—'}</Text>
                {viewingRx.prescriptionRef ? <Text style={styles.rxDiagnosis}>Ref: {viewingRx.prescriptionRef}</Text> : null}
                {(viewingRx.medications || []).map((m, i) => (
                  <View key={i} style={styles.rxDetails}>
                    <Text style={styles.rxDetailLabel}>{m.name || 'Medication'}{m.strength ? ` (${m.strength})` : ''}</Text>
                    <Text style={styles.rxDetailValue}>{[m.dosage, m.frequency, m.duration].filter(Boolean).join(' · ') || '—'}</Text>
                    {m.alternativeSuggested ? (
                      <Text style={m.drugStatus === 'approved_replacement' ? styles.altApproved : styles.altSuggested}>
                        🔁 {m.alternativeSuggested} {m.drugStatus === 'approved_replacement'
                          ? `· Approved · Dr. ${m.approvedByDoctorName || viewingRx.doctorName || 'Doctor'}`
                          : '· Waiting for Approval from your Doctor'}
                        {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                      </Text>
                    ) : null}
                    {m.drugStatus === 'transferred' && m.transferBranchName ? (
                      <Text style={[styles.altApproved, { color: '#0369a1' }]}>
                        This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                      </Text>
                    ) : null}
                  </View>
                ))}
                {viewingRx.instructions ? (
                  <View style={styles.rxInstructions}>
                    <Text style={styles.rxDetailLabel}>Instructions</Text>
                    <Text style={styles.rxInstructionsText}>{viewingRx.instructions}</Text>
                  </View>
                ) : null}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const DRUG_STATUS_META = {
  pending:               { icon: '⏳', label: 'Pending',        color: '#d97706', bg: '#fffbeb' },
  available:             { icon: '✅', label: 'Available',      color: '#16a34a', bg: '#f0fdf4' },
  not_available:         { icon: '❌', label: 'Not Available',  color: '#dc2626', bg: '#fff1f2' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested', color: '#7c3aed', bg: '#f5f3ff' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.',  color: '#16a34a', bg: '#f0fdf4' },
  transferred:           { icon: '↔️', label: 'Transferred',    color: '#0369a1', bg: '#e0f2fe' },
  transfer_requested:    { icon: '🕒', label: 'Awaiting Consent', color: '#0f766e', bg: '#f0fdfa' },
};

const PHARMACY_STATUS_META = {
  sent:                { label: 'Sent to Pharmacy',    color: '#1d4ed8', bg: '#eff6ff' },
  accepted:            { label: 'Processing',          color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partially Filled',   color: '#d97706', bg: '#fffbeb' },
  ready:               { label: 'Ready for Pickup',   color: '#16a34a', bg: '#f0fdf4' },
  delivered:           { label: 'Delivered',           color: '#475569', bg: '#f8fafc' },
};

function RxCard({ rx, onTick, onOpen, onTransferDecision, transferActionKey }) {
  const meds = Array.isArray(rx.medications) && rx.medications.length > 0
    ? rx.medications
    : [{ name: rx.medication || rx.medicationName || 'Prescription', dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }];
  const isDone = rx.status === 'completed';
  const pm = rx.pharmacyStatus ? (PHARMACY_STATUS_META[rx.pharmacyStatus] || null) : null;
  const hasDrugStatuses = meds.some(m => m.drugStatus);

  return (
    <View style={[styles.rxCard, isDone && styles.rxCardDone]}>
      <TouchableOpacity activeOpacity={0.92} onPress={() => onOpen(rx)}>
      <View style={styles.rxCardHeader}>
        <View style={styles.rxIconWrap}>
          <Ionicons name="medkit" size={18} color={isDone ? '#22c55e' : C.success} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.rxName, isDone && styles.rxNameDone]}>{meds[0]?.name || 'Prescription'}</Text>
          {rx.diagnosis ? <Text style={styles.rxDiagnosis}>Diagnosis: {rx.diagnosis}</Text> : null}
          <Text style={styles.rxDoctor}>Dr. {rx.doctorName || 'Doctor'}</Text>
          {rx.pharmacyName && (
            <Text style={styles.rxPharmacy}>
              🏥 {rx.pharmacyName}{rx.branchName ? ` › ${rx.branchName}` : ''}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.tickBtn, isDone && styles.tickBtnDone]}
          onPress={() => onTick(rx)}
          disabled={isDone}
        >
          <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={isDone ? '#22c55e' : '#cbd5e1'} />
        </TouchableOpacity>
      </View>

      {/* Pharmacy status banner */}
      {pm && (
        <View style={[styles.pharmacyBanner, { backgroundColor: pm.bg }]}>
          <Text style={[styles.pharmacyBannerText, { color: pm.color }]}>{pm.label}</Text>
          {rx.prescriptionRef && rx.pharmacyStatus === 'ready' && (
            <Text style={[styles.pharmacyBannerRef, { color: pm.color }]}>Code: {rx.prescriptionRef}</Text>
          )}
        </View>
      )}

      {meds.map((m, i) => {
        const ds = m.drugStatus ? (DRUG_STATUS_META[m.drugStatus] || null) : null;
        return (
          <View key={i} style={styles.rxDetails}>
            {i > 0 && <Text style={[styles.rxDetailLabel, { marginBottom: 4 }]}>{m.name}</Text>}
            {m.dosage ? <View style={styles.rxDetailRow}><Text style={styles.rxDetailLabel}>Dosage</Text><Text style={styles.rxDetailValue}>{m.dosage}</Text></View> : null}
            {m.frequency ? <View style={styles.rxDetailRow}><Text style={styles.rxDetailLabel}>Frequency</Text><Text style={styles.rxDetailValue}>{m.frequency}</Text></View> : null}
            {m.duration ? <View style={styles.rxDetailRow}><Text style={styles.rxDetailLabel}>Duration</Text><Text style={styles.rxDetailValue}>{m.duration}</Text></View> : null}
            {ds && (
              <View style={[styles.drugStatusPill, { backgroundColor: ds.bg }]}>
                <Text style={[styles.drugStatusPillText, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
              </View>
            )}
            {m.alternativeSuggested && m.drugStatus === 'alternative_suggested' && (
              <Text style={styles.altSuggested}>🔁 Alternative: {m.alternativeSuggested} · Waiting for Approval from your Doctor{m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}</Text>
            )}
            {m.alternativeSuggested && m.drugStatus === 'approved_replacement' && (
              <Text style={styles.altApproved}>✅ Approved replacement: {m.alternativeSuggested} · Approved · Dr. {m.approvedByDoctorName || rx.doctorName || 'Doctor'}{m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}</Text>
            )}
            {m.drugStatus === 'transferred' && m.transferBranchName && (
              <Text style={[styles.altApproved, { color: '#0369a1' }]}>
                This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
              </Text>
            )}
            {m.drugStatus === 'transfer_requested' && m.transferRequestStatus === 'pending_patient' && (
              <View style={styles.transferConsentCard}>
                <Text style={styles.transferConsentText}>
                  Transfer request for {m.name || 'this drug'} to {m.transferRequestBranchName || 'another branch'}{m.transferRequestBranchAddress ? ` (${m.transferRequestBranchAddress})` : ''}.
                </Text>
                <View style={styles.transferConsentActions}>
                  <TouchableOpacity
                    style={[styles.transferConsentBtn, styles.transferConsentAgree]}
                    disabled={transferActionKey === `${rx.id}:${i}:approve` || transferActionKey === `${rx.id}:${i}:reject`}
                    onPress={() => onTransferDecision?.(rx, i, true)}
                  >
                    <Text style={styles.transferConsentAgreeText}>I Agree</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.transferConsentBtn, styles.transferConsentReject]}
                    disabled={transferActionKey === `${rx.id}:${i}:approve` || transferActionKey === `${rx.id}:${i}:reject`}
                    onPress={() => onTransferDecision?.(rx, i, false)}
                  >
                    <Text style={styles.transferConsentRejectText}>I Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}

      {rx.instructions ? (
        <View style={styles.rxInstructions}>
          <Text style={styles.rxDetailLabel}>Instructions</Text>
          <Text style={styles.rxInstructionsText}>{rx.instructions}</Text>
        </View>
      ) : null}
      {isDone && (
        <View style={styles.completedBanner}>
          <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
          <Text style={styles.completedBannerText}>Prescription completed</Text>
        </View>
      )}
      <Text style={{ marginTop: 8, fontSize: 11, color: '#94a3b8', textAlign: 'right' }}>Tap card for full details</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, padding: 16 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
  infoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.primaryLight, padding: 16, borderRadius: 14,
    marginBottom: 20, borderWidth: 1, borderColor: C.primary + '30',
  },
  infoTitle: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  infoSub: { fontSize: 12, color: C.textSecondary },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.text, marginTop: 14 },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 6, paddingHorizontal: 24, lineHeight: 19 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.8, marginBottom: 8 },
  rxCard: {
    backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  rxCardDone: { opacity: 0.8, borderColor: '#bbf7d0' },
  rxCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  rxIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  rxName: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 2 },
  rxNameDone: { textDecorationLine: 'line-through', color: C.textSecondary },
  rxDiagnosis: { fontSize: 11, color: C.textSecondary, marginBottom: 1 },
  rxDoctor: { fontSize: 12, color: C.textSecondary },
  rxPharmacy: { fontSize: 11, color: '#0891b2', marginTop: 2, fontWeight: '600' },
  pharmacyBanner: { borderRadius: 8, padding: 8, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pharmacyBannerText: { fontSize: 12, fontWeight: '700' },
  pharmacyBannerRef: { fontFamily: 'monospace', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  drugStatusPill: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  drugStatusPillText: { fontSize: 11, fontWeight: '700' },
  altSuggested: { fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 3 },
  altApproved: { fontSize: 11, color: '#16a34a', fontWeight: '600', marginTop: 3 },
  transferConsentCard: { marginTop: 6, backgroundColor: '#f0fdfa', borderColor: '#99f6e4', borderWidth: 1, borderRadius: 10, padding: 8 },
  transferConsentText: { fontSize: 11, color: '#0f766e', fontWeight: '600' },
  transferConsentActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  transferConsentBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  transferConsentAgree: { borderColor: '#14b8a6', backgroundColor: '#ccfbf1' },
  transferConsentReject: { borderColor: '#fda4af', backgroundColor: '#fff1f2' },
  transferConsentAgreeText: { color: '#0f766e', fontSize: 11, fontWeight: '700' },
  transferConsentRejectText: { color: '#be123c', fontSize: 11, fontWeight: '700' },
  tickBtn: { padding: 4 },
  tickBtnDone: { opacity: 0.7 },
  rxDetails: { gap: 5, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  rxDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rxDetailLabel: { fontSize: 12, fontWeight: '600', color: C.textSecondary },
  rxDetailValue: { fontSize: 13, color: C.text, fontWeight: '500' },
  rxInstructions: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 4 },
  rxInstructionsText: { fontSize: 13, color: C.textSecondary, lineHeight: 18, marginTop: 2 },
  completedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#bbf7d0',
  },
  completedBannerText: { fontSize: 12, fontWeight: '600', color: '#16a34a' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%' },
  warningIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b', textAlign: 'center', marginBottom: 8 },
  modalSub: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  checkList: { gap: 8, marginBottom: 14 },
  checkItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  checkText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },
  sideEffectNote: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 20,
  },
  sideEffectText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#f1f5f9' },
  modalBtnCancelText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  modalBtnConfirm: { backgroundColor: '#22c55e' },
  modalBtnConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});

export default MedicalPrescriptionsScreen;
