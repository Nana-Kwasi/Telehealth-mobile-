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

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>Prescription Operations</Text>
      <Text style={styles.sub}>{rx.patientName || 'Patient'} · Ref {rx.prescriptionRef || '—'}</Text>

      {isFinalized && (
        <View style={[styles.banner, styles.bannerOk]}>
          <Text style={styles.bannerOkText}>✅ Delivered and marked done. Further changes are locked.</Text>
        </View>
      )}
      {branchOwned && !isFinalized && (
        <View style={[styles.banner, styles.bannerInfo]}>
          <Text style={styles.bannerInfoText}>
            👁 This prescription is routed to {rx.branchName || 'a branch'}. You can review every detail here, but only that branch can dispense it.
          </Text>
        </View>
      )}
      {isOwner && !isFinalized && !allPickupsSatisfied(meds) && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerWarnText}>
            The closing checklist stays hidden until every line is delivered or marked not available.
          </Text>
        </View>
      )}

      <RxFullDetailsMobile rx={rx} />

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
        const awaitingPatient = med.drugStatus === 'transfer_requested'
          && med.transferRequestStatus === 'pending_patient';
        // This branch is the destination of an approved transfer.
        const isIncomingTransfer = med.drugStatus === 'transferred'
          && (med.transferBranchId || '') === actorId
          && med.transferOutcome !== 'received';
        // This branch is where a transferred drug ended up (before or after receipt).
        const isTransferTargetHere = (med.transferBranchId || '') === actorId;
        const alreadyAvailable = med.drugStatus === 'available';
        const alreadyUnavailable = med.drugStatus === 'not_available';
        const canTransfer = !inTransfer && (isParent || med.drugStatus === 'not_available');
        const altReady = !!(altDraft[i] || '').trim() && !!(altRationaleDraft[i] || '').trim();
        const noteReady = !!(noteDraft[i] || '').trim();

        return (
          <View key={i} style={styles.card}>
            <View style={styles.cardHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.drugName}>{med.name}{med.strength ? ` (${med.strength})` : ''}</Text>
                <Text style={styles.drugSub}>{[med.drugForm, med.dosage, med.frequency].filter(Boolean).join(' · ') || '—'}</Text>
              </View>
              <Text style={[styles.statusPill, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
            </View>

            {pendingDoctor && (
              <View style={[styles.banner, styles.bannerPending]}>
                <Text style={styles.bannerPendingText}>
                  ⏳ Locked until the prescribing doctor responds
                  {med.drugStatus === 'alternative_suggested'
                    ? ` to the suggested alternative${med.alternativeSuggested ? ` (${med.alternativeSuggested})` : ''}.`
                    : ' to the clinical-impact note on this line.'}
                </Text>
              </View>
            )}

            {awaitingPatient && (
              <View style={[styles.banner, styles.bannerInfo]}>
                <Text style={styles.bannerInfoText}>
                  ⏳ Transfer to <Text style={{ fontWeight: '800' }}>{med.transferRequestBranchName || 'another branch'}</Text> is
                  awaiting the patient's approval. This line is locked until they respond.
                </Text>
              </View>
            )}
            {med.transferBranchName && !isIncomingTransfer && med.transferOutcome !== 'not_received' && (
              <View style={[styles.banner, med.transferOutcome === 'received' ? styles.bannerOk : styles.bannerInfo]}>
                <Text style={med.transferOutcome === 'received' ? styles.bannerOkText : styles.bannerInfoText}>
                  {med.transferOutcome === 'received'
                    ? `✅ ${med.transferReceivedByBranchName || med.transferBranchName} confirmed they have this drug — the patient can collect it there.`
                    : `↔️ Transferred to ${med.transferBranchName} · awaiting their confirmation.`}
                </Text>
              </View>
            )}
            {med.transferRequestStatus === 'superseded' && (
              <View style={[styles.banner, styles.bannerWarn]}>
                <Text style={styles.bannerWarnText}>
                  ⚠️ Your transfer request was withdrawn — the patient responded to a newer request instead. Raise it again if this drug still needs to move.
                </Text>
              </View>
            )}
            {med.transferOutcome === 'not_received' && (
              <View style={[styles.banner, styles.bannerWarn]}>
                <Text style={styles.bannerWarnText}>
                  ❌ {med.transferFailedByBranchName || 'The other branch'} could not supply this drug — it is back with you.
                </Text>
              </View>
            )}
            {isIncomingTransfer && !readOnly && (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.hint}>
                  Transferred to you from {med.transferFromBranchName || 'another branch'}. Confirm whether you can supply it.
                </Text>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    disabled={saving}
                    onPress={() => confirmTransferReceipt(i, true)}
                    style={[styles.opBtn, styles.okBtn, saving && styles.dim]}>
                    <Text style={styles.okBtnText}>We have it</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={saving}
                    onPress={() => confirmTransferReceipt(i, false)}
                    style={[styles.opBtn, styles.badBtn, saving && styles.dim]}>
                    <Text style={styles.badBtnText}>Cannot supply</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {med.transferOutcome === 'received' && isTransferTargetHere && (
              <Text style={styles.pickedUp}>
                ✓ Received from {med.transferFromBranchName || 'the sending branch'} and confirmed available here.
              </Text>
            )}
            {med.pickupDeliveredAt && (
              <Text style={styles.pickedUp}>
                ✓ Picked up{med.pickupDeliveredByBranchName ? ` · ${med.pickupDeliveredByBranchName}` : ''}
              </Text>
            )}

            {!readOnly && (
              <>
                <View style={styles.btnRow}>
                  <TouchableOpacity
                    disabled={saving || !canManage || pendingDoctor || alreadyAvailable || (inTransfer && !isIncomingTransfer)}
                    onPress={() => setDrugStatus(i, 'available')}
                    style={[styles.opBtn, styles.okBtn,
                      (saving || !canManage || pendingDoctor || alreadyAvailable || (inTransfer && !isIncomingTransfer)) && styles.dim]}>
                    <Text style={styles.okBtnText}>Available</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={saving || !canManage || pendingDoctor || alreadyUnavailable || (inTransfer && !isIncomingTransfer)}
                    onPress={() => {
                      const reason = (reasonDraft[i] || med.partialFillReasoning || '').trim();
                      if (!reason) {
                        Alert.alert('Reason required', 'Enter a partial-fill reason before marking this drug unavailable.');
                        return;
                      }
                      setDrugStatus(i, 'not_available', { partialFillReasoning: reason });
                    }}
                    style={[styles.opBtn, styles.badBtn,
                      (saving || !canManage || pendingDoctor || alreadyUnavailable || (inTransfer && !isIncomingTransfer)) && styles.dim]}>
                    <Text style={styles.badBtnText}>Not available</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={saving || !canManage || pendingDoctor || !canTransfer}
                    onPress={() => setBranchPickerFor(branchPickerFor === i ? null : i)}
                    style={[styles.opBtn, styles.neutralBtn,
                      (saving || !canManage || pendingDoctor || !canTransfer) && styles.dim]}>
                    <Text style={styles.neutralBtnText}>Transfer</Text>
                  </TouchableOpacity>
                </View>
                {!canTransfer && !pendingDoctor && (
                  <Text style={styles.hint}>
                    Mark this drug <Text style={styles.hintStrong}>Not available</Text> first to transfer it to another branch.
                  </Text>
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Partial fill reasoning (required for Not available)"
                  placeholderTextColor="#94a3b8"
                  value={reasonDraft[i] ?? med.partialFillReasoning ?? ''}
                  editable={canManage && !pendingDoctor}
                  onChangeText={v => setReasonDraft(prev => ({ ...prev, [i]: v }))}
                />

                {branchPickerFor === i && (
                  <View style={styles.picker}>
                    {/* Tapping "Transfer" only opened an unlabelled list, so it was easy
                        to miss that a branch still had to be chosen — and the transfer
                        was never actually raised. */}
                    <View style={styles.pickerHead}>
                      <Text style={styles.pickerTitle}>Transfer to which branch?</Text>
                      <TouchableOpacity onPress={() => setBranchPickerFor(null)}>
                        <Text style={styles.pickerCancel}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.pickerHint}>
                      Pick a branch below. The patient must approve before the drug moves.
                    </Text>
                    {branches.length === 0 && (
                      <Text style={[styles.muted, { padding: 10 }]}>
                        No other active branches to transfer to.
                      </Text>
                    )}
                    {branches.map(b => (
                      <TouchableOpacity key={b.id} style={styles.pickerItem} onPress={() => transferDrug(i, b)}>
                        <Text style={styles.pickerName}>{b.branchName || 'Branch'}</Text>
                        <Text style={styles.muted}>{[b.address, b.city].filter(Boolean).join(', ') || 'No address'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Suggest alternative drug"
                  placeholderTextColor="#94a3b8"
                  value={altDraft[i] || ''}
                  editable={canManage && !pendingDoctor}
                  onChangeText={v => setAltDraft(prev => ({ ...prev, [i]: v }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Why this alternative? (required)"
                  placeholderTextColor="#94a3b8"
                  value={altRationaleDraft[i] || ''}
                  editable={canManage && !pendingDoctor}
                  onChangeText={v => setAltRationaleDraft(prev => ({ ...prev, [i]: v }))}
                />
                <TouchableOpacity
                  disabled={saving || !canManage || pendingDoctor || !altReady}
                  onPress={() => suggestAlternative(i)}
                  style={[styles.wideBtn, styles.altBtn,
                    (saving || !canManage || pendingDoctor || !altReady) && styles.dim]}>
                  <Text style={styles.altBtnText}>🔁 Suggest to doctor</Text>
                </TouchableOpacity>
                {!altReady && !pendingDoctor && (
                  <Text style={styles.hint}>
                    Enter the alternative drug and why you are suggesting it to enable this.
                  </Text>
                )}

                <TextInput
                  style={styles.input}
                  placeholder="Clinical-impact note (needs doctor approval)"
                  placeholderTextColor="#94a3b8"
                  value={noteDraft[i] || ''}
                  editable={canManage}
                  onChangeText={v => setNoteDraft(prev => ({ ...prev, [i]: v }))}
                />
                <TouchableOpacity
                  disabled={saving || !canManage || !noteReady}
                  onPress={() => addClinicalNote(i)}
                  style={[styles.wideBtn, styles.noteBtn,
                    (saving || !canManage || !noteReady) && styles.dim]}>
                  <Text style={styles.noteBtnText}>📝 Send clinical note</Text>
                </TouchableOpacity>
                {!noteReady && (
                  <Text style={styles.hint}>Type the note above to enable this.</Text>
                )}

                {canPickup && (
                  <TouchableOpacity
                    disabled={saving}
                    onPress={() => markLinePickup(i)}
                    style={[styles.wideBtn, styles.deliverBtn, saving && styles.dim]}>
                    <Text style={styles.deliverBtnText}>Deliver this drug</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        );
      })}

      {isOwner && !isFinalized && allPickupsSatisfied(meds) && (
        <View style={styles.card}>
          <Text style={styles.drugName}>Closing checklist</Text>
          <Text style={styles.muted}>All fields are required before this prescription can be closed.</Text>
          <TextInput style={styles.input} placeholder="Brand / pack actually dispensed" placeholderTextColor="#94a3b8"
            value={brandPack} onChangeText={setBrandPack} />
          <TextInput style={styles.input} placeholder="Counseling / pickup instruction" placeholderTextColor="#94a3b8"
            value={counseling} onChangeText={setCounseling} multiline />
          <TextInput style={styles.input} placeholder="Cold chain / storage handling" placeholderTextColor="#94a3b8"
            value={coldChain} onChangeText={setColdChain} multiline />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>There was a dispensing exception</Text>
            <Switch value={hasException} onValueChange={setHasException} />
          </View>
          {hasException && (
            <TextInput style={styles.input} placeholder="Describe the exception" placeholderTextColor="#94a3b8"
              value={exceptionNote} onChangeText={setExceptionNote} multiline />
          )}
          <TouchableOpacity disabled={saving} onPress={finalizeDelivery}
            style={[styles.wideBtn, styles.finalBtn, saving && styles.dim]}>
            <Text style={styles.finalBtnText}>{saving ? 'Saving…' : '📦 Mark delivered & lock'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={16} color={C.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  muted: { fontSize: 12, color: '#94a3b8' },
  banner: { borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1 },
  bannerOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  bannerOkText: { color: '#166534', fontWeight: '700', fontSize: 13 },
  bannerInfo: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  bannerInfoText: { color: '#1e40af', fontSize: 13, lineHeight: 18 },
  bannerWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  bannerWarnText: { color: '#92400e', fontSize: 12, lineHeight: 17 },
  bannerPending: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', marginTop: 8 },
  bannerPendingText: { color: '#6d28d9', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 12, marginBottom: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  drugName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  drugSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statusPill: { fontSize: 12, fontWeight: '700' },
  pickedUp: { fontSize: 12, color: '#15803d', fontWeight: '700', marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  opBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  okBtn: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  okBtnText: { color: '#166534', fontWeight: '700', fontSize: 12 },
  badBtn: { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  badBtnText: { color: '#be123c', fontWeight: '700', fontSize: 12 },
  neutralBtn: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  neutralBtnText: { color: '#334155', fontWeight: '700', fontSize: 12 },
  dim: { opacity: 0.4 },
  hint: { fontSize: 11, color: '#64748b', marginTop: 6, lineHeight: 16 },
  hintStrong: { fontWeight: '800', color: '#334155' },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10,
    paddingVertical: 8, fontSize: 13, color: '#0f172a', marginTop: 8, backgroundColor: '#fff',
  },
  wideBtn: { marginTop: 8, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  altBtn: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  altBtnText: { color: '#6d28d9', fontWeight: '700', fontSize: 13 },
  noteBtn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  noteBtnText: { color: '#b45309', fontWeight: '700', fontSize: 13 },
  deliverBtn: { backgroundColor: C.primary, borderColor: C.primary },
  deliverBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  finalBtn: { backgroundColor: '#166534', borderColor: '#166534', marginTop: 12 },
  finalBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  picker: { marginTop: 8, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, backgroundColor: '#fff' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerTitle: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  pickerCancel: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  pickerHint: { fontSize: 11, color: '#64748b', paddingHorizontal: 10, paddingTop: 8 },
  pickerItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  pickerName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  switchLabel: { fontSize: 13, color: '#0f172a', flex: 1 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingVertical: 14 },
  backText: { color: C.primary, fontWeight: '700', fontSize: 13 },
});
