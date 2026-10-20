import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Switch,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import RxFullDetailsMobile from '../../components/RxFullDetailsMobile';
import RxHoldAndDispenseMobile from '../../components/RxHoldAndDispenseMobile';
import {
  deriveRxStockStatus,
  branchCanMarkLinePickup,
  ownerDrugRowLockedForOps,
  allPickupsSatisfied,
  awaitingDoctorDecision,
} from '../../utils/pharmacyRxStatus';
import { isRxDelivered } from '../../utils/pharmacyRxNotes';

const DRUG_STATUS_META = {
  pending:               { label: 'Pending',       icon: '⏳', color: '#f59e0b' },
  available:             { label: 'Available',     icon: '✅', color: '#16a34a' },
  not_available:         { label: 'Not Available', icon: '❌', color: '#dc2626' },
  transfer_requested:    { label: 'Awaiting Patient Consent', icon: '🕒', color: '#0f766e' },
  alternative_suggested: { label: 'Alt. Suggested', icon: '🔁', color: '#7c3aed' },
  approved_replacement:  { label: 'Approved Alt.',  icon: '✅', color: '#16a34a' },
  transferred:           { label: 'Transferred',    icon: '↔️', color: '#0369a1' },
};

/**
 * Prescription operations — the mobile counterpart of the web PrescriptionOps /
 * BranchPrescriptionOps screens, running the identical dispensing process.
 *
 *   mode 'branch' : actor is the branch (id = profile.id). Owns prescriptions routed
 *                   to it and can act on lines transferred to it.
 *   mode 'parent' : actor is the parent pharmacy. It dispenses prescriptions that are
 *                   not routed to any branch. A prescription routed to a branch
 *                   belongs to that branch — the parent may read every detail of it
 *                   but must not act on it.
 */
export default function PharmacyRxOpsScreen({ profile, mode = 'branch' }) {
  const route = useRoute();
  const navigation = useNavigation();
  const rxId = route.params?.rxId;
  const isParent = mode === 'parent';
  const actorId = profile?.id;
  const actorName = isParent ? (profile?.pharmacyName || 'Pharmacy') : (profile?.branchName || 'Branch');

  const [rx, setRx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState([]);
  const [altDraft, setAltDraft] = useState({});
  const [altRationaleDraft, setAltRationaleDraft] = useState({});
  const [noteDraft, setNoteDraft] = useState({});
  const [reasonDraft, setReasonDraft] = useState({});
  const [branchPickerFor, setBranchPickerFor] = useState(null);
  const [brandPack, setBrandPack] = useState('');
  const [counseling, setCounseling] = useState('');
  const [coldChain, setColdChain] = useState('');
  const [hasException, setHasException] = useState(false);
  const [exceptionNote, setExceptionNote] = useState('');
  // Per-medicine UI: the "not in stock" reason box, and which extra action is open.
  const [naOpen, setNaOpen] = useState({});
  const [moreOpen, setMoreOpen] = useState({});

  const load = useCallback(async () => {
    if (!rxId) { setLoading(false); return; }
    try {
      const data = await api(`/api/v1/medical/prescriptions/${rxId}`).catch(() => null);
      if (!data) return;
      setRx(data);
      setBrandPack(data.dispensedBrandPackUsed || '');
      setCounseling(data.counselingPickupInstruction || '');
      setColdChain(data.coldChainStorageHandling || '');
      setExceptionNote(data.dispenseExceptionDetail || '');
      setHasException(!!(data.dispenseExceptionDetail || '').trim());

      const pharmacyId = data.pharmacyId || profile?.organizationId || profile?.pharmacyId;
      if (pharmacyId) {
        const list = await api(`/api/v1/pharmacy-branches?pharmacyId=${pharmacyId}&status=active`).catch(() => []) || [];
        setBranches(list.filter(b => b.id !== actorId));
      }
    } finally {
      setLoading(false);
    }
  }, [rxId, actorId, profile?.organizationId, profile?.pharmacyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { navigation.setOptions?.({ title: 'Prescription Operations' }); }, [navigation]);

  const persistMeds = async (nextMeds, extra = {}) => {
    setSaving(true);
    try {
      const pharmacyStatus = deriveRxStockStatus(nextMeds);
      await api(`/api/v1/medical/prescriptions/${rxId}`, {
        method: 'PATCH',
        body: { medications: nextMeds, pharmacyStatus, ...extra },
      });
      setRx(prev => ({ ...prev, medications: nextMeds, pharmacyStatus, ...extra }));
    } catch {
      Alert.alert('Error', 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const meds = rx?.medications || [];
  const isFinalized = isRxDelivered(rx);
  // A prescription routed to a branch is that branch's to dispense.
  const branchOwned = isParent && !!rx?.branchId && rx.branchId !== actorId;
  const isOwner = isParent ? !branchOwned : ((rx?.branchId || '') === actorId);
  const ownerId = rx?.branchId || actorId;
  const readOnly = branchOwned || isFinalized;

  const setDrugStatus = (i, status, extra = {}) => {
    const next = meds.map((m, idx) => (idx === i ? { ...m, drugStatus: status, ...extra } : m));
    persistMeds(next);
  };

  const suggestAlternative = (i) => {
    const text = (altDraft[i] || '').trim();
    if (!text) return;
    const rationale = (altRationaleDraft[i] || '').trim();
    const next = meds.map((m, idx) => (idx === i ? {
      ...m,
      drugStatus: 'alternative_suggested',
      alternativeSuggested: text,
      alternativeRationale: rationale || null,
      alternativeSuggestedByBranchName: actorName,
    } : m));
    persistMeds(next);
    setAltDraft(prev => ({ ...prev, [i]: '' }));
    setAltRationaleDraft(prev => ({ ...prev, [i]: '' }));
  };

  const addClinicalNote = (i) => {
    const text = (noteDraft[i] || '').trim();
    if (!text) return;
    const next = meds.map((m, idx) => {
      if (idx !== i) return m;
      const existing = Array.isArray(m.pharmacyNotes) ? m.pharmacyNotes : [];
      return {
        ...m,
        pharmacyNotes: [...existing, {
          type: 'clinical_impact_note',
          label: 'Clinical-impact note',
          note: text,
          requiresDoctorApproval: true,
          approvalStatus: 'pending_doctor',
          createdAt: new Date().toISOString(),
          createdByBranchId: actorId || null,
          createdByBranchName: actorName,
        }],
      };
    });
    persistMeds(next);
    setNoteDraft(prev => ({ ...prev, [i]: '' }));
  };

  // A transfer moves a patient's medicine to a different pharmacy — the patient has
  // to agree, because it changes where they must physically go to collect it. So the
  // branch RAISES A REQUEST and the line sits in `transfer_requested /
  // pending_patient` until the patient approves; only then does it become
  // `transferred` and appear in the receiving branch's queue. This mirrors the web
  // flow exactly (previously mobile jumped straight to `transferred`, skipping the
  // patient and leaving the receiving branch unaware).
  const transferDrug = (i, toBranch) => {
    if (branchOwned) return;
    const med = meds[i];
    if (!med) return;
    if (!isParent && med.drugStatus !== 'not_available') return;
    const next = meds.map((m, idx) => (idx === i ? {
      ...m,
      drugStatus: 'transfer_requested',
      transferRequestStatus: 'pending_patient',
      transferRequestedAt: new Date().toISOString(),
      transferRequestedByBranchId: actorId || null,
      transferRequestedByBranchName: actorName,
      transferApprovalTtlHours: Math.max(1, Number(profile?.transferApprovalTtlHours) || 6),
      transferFromBranchId: actorId || null,
      transferFromBranchName: actorName,
      transferRequestBranchId: toBranch.id,
      transferRequestBranchName: toBranch.branchName || 'Branch',
      transferRequestBranchAddress: [toBranch.address, toBranch.city].filter(Boolean).join(', '),
      // Cleared until the patient agrees — these only get set on approval.
      transferBranchId: null,
      transferBranchName: null,
      transferBranchAddress: null,
      transferOutcome: null,
    } : m));
    persistMeds(next);
    // Tell the patient there is something to approve.
    api('/api/v1/patient-notifications', {
      method: 'POST',
      body: {
        patientId: rx?.patientId || null,
        type: 'TRANSFER_APPROVAL_REQUEST',
        channel: 'in_app',
        title: 'Pharmacy transfer request',
        message: `${med?.name || 'A medicine'} is unavailable at ${actorName}. Confirm transfer to ${toBranch.branchName || 'another branch'}?`,
        read: false,
        rxId: rx?.id || null,
        prescriptionRef: rx?.prescriptionRef || null,
        medIndex: i,
        transferRequestBranchId: toBranch.id,
        transferRequestBranchName: toBranch.branchName || '',
      },
    }).catch(() => { /* best-effort — the request itself is already persisted */ });
    setBranchPickerFor(null);
    Alert.alert(
      'Transfer requested',
      `${med?.name || 'This drug'} is awaiting the patient's approval to move to ${toBranch.branchName || 'the other branch'}. It will appear in their queue once approved.`,
    );
  };

  // The receiving branch confirms it actually has the drug, or reports that it does
  // not — which hands the line back to the branch that sent it.
  const confirmTransferReceipt = (i, received) => {
    const next = meds.map((m, idx) => (idx === i ? (received
      ? {
          ...m,
          // Confirming receipt IS the availability confirmation — there is no second
          // "Available" step. transferBranch* is deliberately preserved so the
          // sending branch keeps seeing where the drug went and that it arrived.
          drugStatus: 'available',
          transferOutcome: 'received',
          transferReceivedAt: new Date().toISOString(),
          transferReceivedByBranchId: actorId || null,
          transferReceivedByBranchName: actorName,
        }
      : {
          ...m,
          drugStatus: 'not_available',
          transferOutcome: 'not_received',
          transferFailedByBranchId: actorId || null,
          transferFailedByBranchName: actorName,
        }) : m));
    persistMeds(next);
  };

  const markLinePickup = (i) => {
    const med = meds[i];
    if (!branchCanMarkLinePickup(actorId, med, rx, ownerId)) return;
    const next = meds.map((m, idx) => (idx === i ? {
      ...m,
      pickupDeliveredAt: new Date().toISOString(),
      pickupDeliveredByBranchId: actorId || null,
      pickupDeliveredByBranchName: actorName,
    } : m));
    persistMeds(next);
  };

  const finalizeDelivery = async () => {
    if (!allPickupsSatisfied(meds)) {
      Alert.alert('Not ready', 'Every medication line must be picked up or marked not available before closing this prescription.');
      return;
    }
    if (!brandPack.trim() || !counseling.trim() || !coldChain.trim()) {
      Alert.alert('Checklist incomplete', 'Brand/pack, counseling and cold-chain notes are all required.');
      return;
    }
    if (hasException && !exceptionNote.trim()) {
      Alert.alert('Checklist incomplete', 'Describe the dispensing exception.');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/v1/medical/prescriptions/${rxId}`, {
        method: 'PATCH',
        body: {
          pharmacyStatus: 'delivered',
          dispensedBrandPackUsed: brandPack.trim(),
          counselingPickupInstruction: counseling.trim(),
          coldChainStorageHandling: coldChain.trim(),
          dispenseExceptionDetail: hasException ? exceptionNote.trim() : null,
        },
      });
      setRx(prev => ({ ...prev, pharmacyStatus: 'delivered' }));
      Alert.alert('Delivered', 'This prescription is now closed and locked.');
    } catch {
      Alert.alert('Error', 'Could not close this prescription.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={C.primary} size="large" /></View>;
  if (!rx) return <View style={styles.centered}><Text style={styles.muted}>Prescription not found.</Text></View>;

  const visibleMeds = meds
    .map((m, i) => ({ ...m, __idx: i }))
    .filter(m => isOwner || branchOwned || ((m.transferBranchId || '') === actorId));

  const RX_META = {
    sent: ['Incoming', '#1d4ed8', '#eff6ff'], accepted: ['Processing', '#b45309', '#fffbeb'],
    partially_fulfilled: ['Partly ready', '#b45309', '#fffbeb'], ready: ['Ready for pickup', '#15803d', '#f0fdf4'],
    delivered: ['Delivered', '#475569', '#f1f5f9'], open: ['Open to all', '#0369a1', '#e0f2fe'],
  };
  const [rxLabel, rxColor, rxBg] = RX_META[rx.pharmacyStatus] || RX_META.sent;
  const created = rx.createdAt ? new Date(rx.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : rx.date;

  return (
    <ScrollView showsVerticalScrollIndicator={false}
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>

      {/* Summary: who, which prescription, its state — at a glance. */}
      <View style={styles.summary}>
        <View style={styles.summaryTop}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(rx.patientName || 'P').charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.patient} numberOfLines={1}>{rx.patientName || 'Patient'}</Text>
            <Text style={styles.summarySub} numberOfLines={1}>{rx.diagnosis || 'No diagnosis given'}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: rxBg }]}><Text style={[styles.pillText, { color: rxColor }]}>{rxLabel}</Text></View>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCell}><Text style={styles.cellLabel}>Reference</Text><Text style={[styles.cellValue, styles.mono]}>{rx.prescriptionRef || '—'}</Text></View>
          <View style={styles.summaryCell}><Text style={styles.cellLabel}>Prescriber</Text><Text style={styles.cellValue} numberOfLines={1}>{rx.doctorName ? `Dr. ${rx.doctorName}` : '—'}</Text></View>
          <View style={styles.summaryCell}><Text style={styles.cellLabel}>Issued</Text><Text style={styles.cellValue}>{created || '—'}</Text></View>
          <View style={styles.summaryCell}><Text style={styles.cellLabel}>Medicines</Text><Text style={styles.cellValue}>{meds.length}</Text></View>
        </View>
      </View>

      {isFinalized && (
        <View style={[styles.banner, styles.bannerOk]}><Ionicons name="checkmark-circle" size={18} color="#166534" />
          <Text style={[styles.bannerText, { color: '#166534' }]}>Delivered and closed. No further changes can be made.</Text></View>
      )}
      {branchOwned && !isFinalized && (
        <View style={[styles.banner, styles.bannerInfo]}><Ionicons name="eye-outline" size={18} color="#1e40af" />
          <Text style={[styles.bannerText, { color: '#1e40af' }]}>Routed to {rx.branchName || 'a branch'}. You can review it here; only that branch can dispense it.</Text></View>
      )}

      <RxFullDetailsMobile rx={rx} />
      {/* Open-list hold timer and counted handover (shown only when they apply). */}
      <RxHoldAndDispenseMobile rx={rx} onChanged={load} backRoute={mode === 'parent' ? 'PharmacyPrescriptions' : 'BranchPrescriptions'} />

      <Text style={styles.sectionLabel}>Medicines</Text>

      {visibleMeds.map((med) => {
        const i = med.__idx;
        const ds = DRUG_STATUS_META[med.drugStatus] || DRUG_STATUS_META.pending;
        const isTransferredToMe = (med.transferBranchId || '') === actorId;
        const ownerLocked = ownerDrugRowLockedForOps(isOwner, med, actorId);
        const canManage = !readOnly && ((isOwner && !ownerLocked) || isTransferredToMe);
        const pendingDoctor = awaitingDoctorDecision(med);
        const canPickup = !readOnly && branchCanMarkLinePickup(actorId, med, rx, ownerId);
        // Mirrors the web rules: a branch may only transfer a drug it has marked
        // Not available, and Suggest needs both the alternative and its rationale.
        // Once a transfer is in flight the sending branch must not keep changing the
        // line — it is the patient's / receiving branch's move next.
        const inTransfer = ['transfer_requested', 'transferred'].includes(med.drugStatus || '');
        const awaitingPatient = med.drugStatus === 'transfer_requested' && med.transferRequestStatus === 'pending_patient';
        const isIncomingTransfer = med.drugStatus === 'transferred' && (med.transferBranchId || '') === actorId && med.transferOutcome !== 'received';
        const isTransferTargetHere = (med.transferBranchId || '') === actorId;
        const alreadyAvailable = med.drugStatus === 'available';
        const alreadyUnavailable = med.drugStatus === 'not_available';
        const canTransfer = !inTransfer && (isParent || med.drugStatus === 'not_available');
        const altReady = !!(altDraft[i] || '').trim() && !!(altRationaleDraft[i] || '').trim();
        const noteReady = !!(noteDraft[i] || '').trim();
        const stockLocked = saving || !canManage || pendingDoctor || (inTransfer && !isIncomingTransfer);
        const reason = (reasonDraft[i] ?? med.partialFillReasoning ?? '');
        const more = moreOpen[i];

        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={styles.drugIcon}><Ionicons name="medkit-outline" size={18} color={C.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.drugName}>{med.name}{med.strength ? ` ${med.strength}` : ''}</Text>
                <Text style={styles.drugSub}>{[med.drugForm, med.dosage, med.frequency, med.quantity ? `Qty ${med.quantity}` : null].filter(Boolean).join(' · ') || '—'}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: `${ds.color}1A` }]}><Text style={[styles.pillText, { color: ds.color }]}>{ds.label}</Text></View>
            </View>

            {pendingDoctor && (
              <View style={[styles.banner, styles.bannerPending]}><Ionicons name="time-outline" size={16} color="#6d28d9" />
                <Text style={[styles.bannerText, { color: '#6d28d9' }]}>
                  Waiting for the doctor to respond to {med.drugStatus === 'alternative_suggested' ? `the suggested alternative${med.alternativeSuggested ? ` (${med.alternativeSuggested})` : ''}` : 'your clinical note'}. This medicine is locked until then.
                </Text></View>
            )}
            {awaitingPatient && (
              <View style={[styles.banner, styles.bannerInfo]}><Ionicons name="time-outline" size={16} color="#1e40af" />
                <Text style={[styles.bannerText, { color: '#1e40af' }]}>Transfer to {med.transferRequestBranchName || 'another branch'} is waiting for the patient's approval.</Text></View>
            )}
            {med.transferBranchName && !isIncomingTransfer && med.transferOutcome !== 'not_received' && (
              <View style={[styles.banner, med.transferOutcome === 'received' ? styles.bannerOk : styles.bannerInfo]}>
                <Ionicons name={med.transferOutcome === 'received' ? 'checkmark-circle' : 'swap-horizontal'} size={16} color={med.transferOutcome === 'received' ? '#166534' : '#1e40af'} />
                <Text style={[styles.bannerText, { color: med.transferOutcome === 'received' ? '#166534' : '#1e40af' }]}>
                  {med.transferOutcome === 'received'
                    ? `${med.transferReceivedByBranchName || med.transferBranchName} has it — the patient can collect it there.`
                    : `Transferred to ${med.transferBranchName}, waiting for them to confirm.`}
                </Text></View>
            )}
            {med.transferRequestStatus === 'superseded' && (
              <View style={[styles.banner, styles.bannerWarn]}><Ionicons name="alert-circle-outline" size={16} color="#92400e" />
                <Text style={[styles.bannerText, { color: '#92400e' }]}>Your transfer request was withdrawn — the patient answered a newer one. Raise it again if needed.</Text></View>
            )}
            {med.transferOutcome === 'not_received' && (
              <View style={[styles.banner, styles.bannerWarn]}><Ionicons name="close-circle-outline" size={16} color="#92400e" />
                <Text style={[styles.bannerText, { color: '#92400e' }]}>{med.transferFailedByBranchName || 'The other branch'} could not supply it — it is back with you.</Text></View>
            )}
            {med.transferOutcome === 'received' && isTransferTargetHere && (
              <Text style={styles.doneLine}>✓ Received from {med.transferFromBranchName || 'the sending branch'} and available here.</Text>
            )}
            {med.pickupDeliveredAt && (
              <Text style={styles.doneLine}>✓ Collected{med.pickupDeliveredByBranchName ? ` at ${med.pickupDeliveredByBranchName}` : ''}</Text>
            )}

            {isIncomingTransfer && !readOnly && (
              <View style={styles.block}>
                <Text style={styles.question}>Sent to you from {med.transferFromBranchName || 'another branch'}. Can you supply it?</Text>
                <View style={styles.choiceRow}>
                  <TouchableOpacity disabled={saving} onPress={() => confirmTransferReceipt(i, true)} style={[styles.choice, styles.choiceYes, saving && styles.dim]}>
                    <Ionicons name="checkmark" size={18} color="#fff" /><Text style={styles.choiceYesText}>We have it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={saving} onPress={() => confirmTransferReceipt(i, false)} style={[styles.choice, styles.choiceNo, saving && styles.dim]}>
                    <Ionicons name="close" size={18} color="#be123c" /><Text style={styles.choiceNoText}>Cannot supply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!readOnly && !isIncomingTransfer && (
              <View style={styles.block}>
                <Text style={styles.question}>Is this medicine in stock?</Text>
                <View style={styles.choiceRow}>
                  <TouchableOpacity disabled={stockLocked || alreadyAvailable} onPress={() => { setNaOpen(o => ({ ...o, [i]: false })); setDrugStatus(i, 'available'); }}
                    style={[styles.choice, alreadyAvailable ? styles.choiceYes : styles.choiceYesOutline, (stockLocked && !alreadyAvailable) && styles.dim]}>
                    <Ionicons name="checkmark" size={18} color={alreadyAvailable ? '#fff' : '#15803d'} />
                    <Text style={alreadyAvailable ? styles.choiceYesText : styles.choiceYesOutlineText}>{alreadyAvailable ? 'In stock' : 'Yes, in stock'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={stockLocked || alreadyUnavailable} onPress={() => setNaOpen(o => ({ ...o, [i]: !o[i] }))}
                    style={[styles.choice, alreadyUnavailable ? styles.choiceNoFilled : styles.choiceNo, (stockLocked && !alreadyUnavailable) && styles.dim]}>
                    <Ionicons name="close" size={18} color={alreadyUnavailable ? '#fff' : '#be123c'} />
                    <Text style={alreadyUnavailable ? styles.choiceYesText : styles.choiceNoText}>{alreadyUnavailable ? 'Not in stock' : 'No, not in stock'}</Text>
                  </TouchableOpacity>
                </View>
                {alreadyUnavailable && med.partialFillReasoning ? <Text style={styles.metaLine}>Reason: {med.partialFillReasoning}</Text> : null}

                {naOpen[i] && !alreadyUnavailable && (
                  <View style={styles.subPanel}>
                    <Text style={styles.label}>Why is it not available? <Text style={styles.req}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. Out of stock until Friday" placeholderTextColor="#94a3b8"
                      value={reason} onChangeText={v => setReasonDraft(prev => ({ ...prev, [i]: v }))} multiline />
                    <View style={styles.inlineRow}>
                      <TouchableOpacity onPress={() => setNaOpen(o => ({ ...o, [i]: false }))} style={styles.linkBtn}><Text style={styles.linkBtnText}>Cancel</Text></TouchableOpacity>
                      <TouchableOpacity disabled={saving || !reason.trim()} onPress={() => { setDrugStatus(i, 'not_available', { partialFillReasoning: reason.trim() }); setNaOpen(o => ({ ...o, [i]: false })); }}
                        style={[styles.smallPrimary, { backgroundColor: '#be123c' }, (saving || !reason.trim()) && styles.dim]}>
                        <Text style={styles.smallPrimaryText}>Confirm not in stock</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity disabled={saving || !canManage || pendingDoctor || !canTransfer} onPress={() => setBranchPickerFor(branchPickerFor === i ? null : i)}
                  style={[styles.actionRow, (saving || !canManage || pendingDoctor || !canTransfer) && styles.dim]}>
                  <Ionicons name="swap-horizontal-outline" size={18} color={C.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>Transfer to another branch</Text>
                    <Text style={styles.actionSub}>{canTransfer ? 'The patient approves before it moves.' : 'Mark it "Not in stock" first to transfer it.'}</Text>
                  </View>
                  <Ionicons name={branchPickerFor === i ? 'chevron-up' : 'chevron-forward'} size={16} color="#94a3b8" />
                </TouchableOpacity>
                {branchPickerFor === i && (
                  <View style={styles.subPanel}>
                    <Text style={styles.label}>Choose the branch</Text>
                    {branches.length === 0 ? <Text style={styles.metaLine}>No other active branches to transfer to.</Text> : branches.map(b => (
                      <TouchableOpacity key={b.id} style={styles.branchOption} onPress={() => transferDrug(i, b)}>
                        <Ionicons name="storefront-outline" size={16} color={C.primary} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.branchName}>{b.branchName || 'Branch'}</Text>
                          <Text style={styles.metaLine}>{[b.address, b.city].filter(Boolean).join(', ') || 'No address'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#cbd5e1" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TouchableOpacity disabled={!canManage || pendingDoctor} onPress={() => setMoreOpen(o => ({ ...o, [i]: o[i] === 'alt' ? null : 'alt' }))}
                  style={[styles.actionRow, (!canManage || pendingDoctor) && styles.dim]}>
                  <Ionicons name="repeat-outline" size={18} color="#6d28d9" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>Suggest an alternative</Text>
                    <Text style={styles.actionSub}>The doctor approves before you dispense it.</Text>
                  </View>
                  <Ionicons name={more === 'alt' ? 'chevron-up' : 'chevron-forward'} size={16} color="#94a3b8" />
                </TouchableOpacity>
                {more === 'alt' && (
                  <View style={styles.subPanel}>
                    <Text style={styles.label}>Alternative medicine <Text style={styles.req}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. Amoxicillin 250mg capsules" placeholderTextColor="#94a3b8"
                      value={altDraft[i] || ''} onChangeText={v => setAltDraft(prev => ({ ...prev, [i]: v }))} />
                    <Text style={styles.label}>Why this alternative? <Text style={styles.req}>*</Text></Text>
                    <TextInput style={styles.input} placeholder="e.g. Same medicine, 500mg out of stock" placeholderTextColor="#94a3b8"
                      value={altRationaleDraft[i] || ''} onChangeText={v => setAltRationaleDraft(prev => ({ ...prev, [i]: v }))} multiline />
                    <TouchableOpacity disabled={saving || !altReady} onPress={() => suggestAlternative(i)} style={[styles.smallPrimary, { backgroundColor: '#6d28d9', alignSelf: 'flex-end' }, (saving || !altReady) && styles.dim]}>
                      <Text style={styles.smallPrimaryText}>Send to doctor</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity disabled={!canManage} onPress={() => setMoreOpen(o => ({ ...o, [i]: o[i] === 'note' ? null : 'note' }))}
                  style={[styles.actionRow, !canManage && styles.dim]}>
                  <Ionicons name="document-text-outline" size={18} color="#b45309" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionTitle}>Clinical note for the doctor</Text>
                    <Text style={styles.actionSub}>Use for anything that affects treatment; it needs their approval.</Text>
                  </View>
                  <Ionicons name={more === 'note' ? 'chevron-up' : 'chevron-forward'} size={16} color="#94a3b8" />
                </TouchableOpacity>
                {more === 'note' && (
                  <View style={styles.subPanel}>
                    <Text style={styles.label}>Note <Text style={styles.req}>*</Text></Text>
                    <TextInput style={[styles.input, { minHeight: 70 }]} placeholder="e.g. Patient reports a penicillin rash in the past" placeholderTextColor="#94a3b8"
                      value={noteDraft[i] || ''} onChangeText={v => setNoteDraft(prev => ({ ...prev, [i]: v }))} multiline />
                    <TouchableOpacity disabled={saving || !noteReady} onPress={() => addClinicalNote(i)} style={[styles.smallPrimary, { backgroundColor: '#b45309', alignSelf: 'flex-end' }, (saving || !noteReady) && styles.dim]}>
                      <Text style={styles.smallPrimaryText}>Send note</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {canPickup && (
              <TouchableOpacity disabled={saving} onPress={() => markLinePickup(i)} style={[styles.primaryBtn, saving && styles.dim]}>
                <Ionicons name="bag-check-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>Hand over this medicine</Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {isOwner && !isFinalized && !allPickupsSatisfied(meds) && (
        <Text style={styles.footHint}>The closing checklist appears once every medicine is handed over or marked not in stock.</Text>
      )}

      {isOwner && !isFinalized && allPickupsSatisfied(meds) && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Close this prescription</Text>
          <Text style={styles.metaLine}>All fields are required.</Text>
          <Text style={styles.label}>Brand / pack dispensed</Text>
          <TextInput style={styles.input} placeholder="e.g. Amoxil 500mg, 15 capsules" placeholderTextColor="#94a3b8" value={brandPack} onChangeText={setBrandPack} />
          <Text style={styles.label}>Counselling / pickup instructions</Text>
          <TextInput style={styles.input} placeholder="What you told the patient" placeholderTextColor="#94a3b8" value={counseling} onChangeText={setCounseling} multiline />
          <Text style={styles.label}>Cold chain / storage</Text>
          <TextInput style={styles.input} placeholder="e.g. Room temperature" placeholderTextColor="#94a3b8" value={coldChain} onChangeText={setColdChain} multiline />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>There was a dispensing exception</Text>
            <Switch value={hasException} onValueChange={setHasException} />
          </View>
          {hasException && (
            <TextInput style={styles.input} placeholder="Describe the exception" placeholderTextColor="#94a3b8" value={exceptionNote} onChangeText={setExceptionNote} multiline />
          )}
          <TouchableOpacity disabled={saving} onPress={finalizeDelivery} style={[styles.primaryBtn, { backgroundColor: '#166534' }, saving && styles.dim]}>
            <Ionicons name="lock-closed-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>{saving ? 'Saving…' : 'Mark delivered & close'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={16} color={C.primary} />
        <Text style={styles.backText}>Back to prescriptions</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { fontSize: 12, color: '#94a3b8' },
  summary: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e6ebf2', padding: 16, gap: 14 },
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '800', color: C.primary },
  patient: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  summarySub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, rowGap: 12 },
  summaryCell: { width: '50%', paddingRight: 8 },
  cellLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  cellValue: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 3 },
  mono: { fontFamily: 'Menlo', fontSize: 13 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '800' },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  bannerOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  bannerInfo: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  bannerWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  bannerPending: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e6ebf2', padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  drugIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center' },
  drugName: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  drugSub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  doneLine: { fontSize: 13, color: '#166534', fontWeight: '700' },
  block: { gap: 10 },
  question: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  choiceRow: { flexDirection: 'row', gap: 10 },
  choice: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5 },
  choiceYes: { backgroundColor: '#15803d', borderColor: '#15803d' },
  choiceYesText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  choiceYesOutline: { backgroundColor: '#f0fdf4', borderColor: '#86efac' },
  choiceYesOutlineText: { color: '#15803d', fontWeight: '800', fontSize: 14 },
  choiceNo: { backgroundColor: '#fff1f2', borderColor: '#fda4af' },
  choiceNoFilled: { backgroundColor: '#be123c', borderColor: '#be123c' },
  choiceNoText: { color: '#be123c', fontWeight: '800', fontSize: 14 },
  dim: { opacity: 0.45 },
  subPanel: { backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, gap: 8 },
  label: { fontSize: 12, fontWeight: '800', color: '#475569' },
  req: { color: '#be123c' },
  input: { borderWidth: 1, borderColor: '#dbe3ee', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a', backgroundColor: '#fff' },
  inlineRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12 },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  linkBtnText: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  smallPrimary: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  smallPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e6ebf2', backgroundColor: '#fff' },
  actionTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  actionSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  metaLine: { fontSize: 12, color: '#64748b' },
  branchOption: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10 },
  branchName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, borderRadius: 12, paddingVertical: 14 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  footHint: { fontSize: 12, color: '#64748b', textAlign: 'center', paddingHorizontal: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 14, color: '#0f172a', flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 14 },
  backText: { color: C.primary, fontWeight: '700', fontSize: 14 },
});
