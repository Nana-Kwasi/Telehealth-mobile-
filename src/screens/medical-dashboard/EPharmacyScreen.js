import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { api, getStoredUserId } from '../../services/apiClient';
import { patientPharmacyKey, removePatientPharmacyByKey, hasPatientPharmacy, dedupePatientPharmacies, pharmacyEntryFromDirectory } from '../../utils/patientPharmacyDedupe';
import { MedicalColors as C } from '../../constants/colors';
import { parseCoords, attachDistance, formatDistanceKm } from '../../utils/homeCareGeo';

const DRUG_STATUS_META = {
  pending:               { icon: '⏳', label: 'Pending',       color: '#d97706' },
  available:             { icon: '✅', label: 'Available',     color: '#16a34a' },
  not_available:         { icon: '❌', label: 'Not Available', color: '#dc2626' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.', color: '#16a34a' },
  transfer_requested:    { icon: '🕒', label: 'Awaiting Consent', color: '#0f766e' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent to Pharmacy', color: '#1d4ed8', bg: '#eff6ff' },
  accepted:            { label: 'Processing',       color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partial',          color: '#d97706', bg: '#fffbeb' },
  ready:               { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
  delivered:           { label: 'Delivered',        color: '#475569', bg: '#f8fafc' },
};

const DEFAULT_TRANSFER_APPROVAL_TTL_HOURS = 6;

export default function EPharmacyScreen() {
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'myPharmacies' | 'pharmacies'
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [myPharmacies, setMyPharmacies] = useState([]);
  const [loadingMyPh, setLoadingMyPh] = useState(true);
  const [removingPhKey, setRemovingPhKey] = useState(null);
  const [systemPharmacies, setSystemPharmacies] = useState([]);
  const [loadingPh, setLoadingPh] = useState(false);
  const [searchPh, setSearchPh] = useState('');
  const [viewingRx, setViewingRx] = useState(null);
  const [qrModal, setQrModal] = useState(null); // prescriptionRef string
  const [refreshing, setRefreshing] = useState(false);
  const [transferActionKey, setTransferActionKey] = useState('');
  // Browse → "Add to my pharmacies": which pharmacy is open, its branches, and the row being saved.
  const [myAnchor, setMyAnchor] = useState(null);
  const [addingKey, setAddingKey] = useState(null);

  const isTransferRequestExpired = (med) => {
    if (!med || med.drugStatus !== 'transfer_requested' || med.transferRequestStatus !== 'pending_patient') return false;
    const requestedAt = med.transferRequestedAt ? new Date(med.transferRequestedAt).getTime() : NaN;
    if (!Number.isFinite(requestedAt)) return false;
    const ttlHours = Math.max(1, Number(med.transferApprovalTtlHours) || DEFAULT_TRANSFER_APPROVAL_TTL_HOURS);
    const ttlMs = ttlHours * 60 * 60 * 1000;
    return Date.now() - requestedAt > ttlMs;
  };

  const expirePendingTransferRequest = (med) => ({
    ...med,
    drugStatus: 'not_available',
    transferRequestStatus: 'expired',
    transferRequestExpiredAt: new Date().toISOString(),
    transferBranchId: null,
    transferBranchName: null,
    transferBranchAddress: null,
    transferRequestBranchId: null,
    transferRequestBranchName: null,
    transferRequestBranchAddress: null,
  });

  useEffect(() => {
    let cancelled = false;
    getStoredUserId().then(uid => {
      if (!uid) { setLoadingMyPh(false); return; }
      api(`/api/v1/patients/${uid}`).then(data => {
        if (!cancelled) {
          setMyPharmacies(data?.pharmacies || []);
          setMyAnchor(parseCoords(data));
          setLoadingMyPh(false);
        }
      }).catch(() => setLoadingMyPh(false));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let intervalId = null;
    getStoredUserId().then(uid => {
      if (!uid) { setLoadingRx(false); return; }
      const loadRx = async () => {
        try {
          const fetched = await api(`/api/v1/medical/prescriptions/patient/${uid}`).catch(() => []) || [];
          // Overdue transfer requests are expired by the server (TransferExpiryJob).
          // Show them as expired straight away, but never write: a patient cannot
          // PATCH a prescription, and the failed write used to skip setPrescriptions.
          const rows = fetched.map((rx) => {
            const meds = Array.isArray(rx.medications) ? rx.medications : [];
            if (!meds.some(isTransferRequestExpired)) return rx;
            const nextMeds = meds.map(m => (isTransferRequestExpired(m) ? expirePendingTransferRequest(m) : m));
            return { ...rx, medications: nextMeds, pharmacyStatus: deriveRxStatusFromMeds(nextMeds) };
          });
          const list = rows.filter(r => r.pharmacyId).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          setPrescriptions(list);
        } catch {} finally {
          setLoadingRx(false);
          setRefreshing(false);
        }
      };
      loadRx();
      intervalId = setInterval(loadRx, 15000);
    });
    return () => { if (intervalId) clearInterval(intervalId); };
  }, []);

  useEffect(() => {
    if (tab !== 'pharmacies') return;
    setLoadingPh(true);
    // Every BRANCH is its own entry (patients go to a branch, not a head
    // office), nearest first. A pharmacy with no branches is listed as itself.
    (async () => {
      try {
        const parents = await api('/api/v1/pharmacies?status=active').catch(() => []) || [];
        const rows = [];
        for (const ph of parents) {
          const bs = await api(`/api/v1/pharmacy-branches?pharmacyId=${ph.id}&status=active`).catch(() => []) || [];
          if (bs.length) bs.forEach(br => rows.push({ key: `${ph.id}:${br.id}`, ph, br, latitude: br.latitude ?? ph.latitude, longitude: br.longitude ?? ph.longitude }));
          else rows.push({ key: ph.id, ph, br: null, latitude: ph.latitude, longitude: ph.longitude });
        }
        setSystemPharmacies(myAnchor ? attachDistance(rows, myAnchor) : rows);
      } finally { setLoadingPh(false); }
    })();
  }, [tab, myAnchor]);

  const filteredPh = systemPharmacies.filter(({ ph, br }) => {
    if (!searchPh.trim()) return true;
    const q = searchPh.toLowerCase();
    return [ph.pharmacyName, ph.name, br?.branchName, br?.address, br?.city, ph.address, ph.city, ph.country]
      .some(v => String(v || '').toLowerCase().includes(q));
  });

  const deriveRxStatusFromMeds = (meds = []) => {
    const statuses = meds.map(m => m.drugStatus || 'pending');
    if (statuses.every(s => s === 'available' || s === 'approved_replacement')) return 'ready';
    if (statuses.some(s => ['not_available', 'alternative_suggested', 'transferred', 'transfer_requested'].includes(s))) return 'partially_fulfilled';
    return 'accepted';
  };

  const removeSavedPharmacy = async (ph) => {
    const uid = await getStoredUserId();
    if (!uid) return;
    const rk = patientPharmacyKey(ph) || ph.id || ph.name || '';
    setRemovingPhKey(rk);
    try {
      const updated = removePatientPharmacyByKey(myPharmacies, ph);
      await api(`/api/v1/patients/${uid}`, { method: 'PATCH', body: { pharmacies: updated } });
      setMyPharmacies(updated);
    } catch {
      Alert.alert('Error', 'Could not remove pharmacy.');
    } finally {
      setRemovingPhKey(null);
    }
  };

  const addPharmacy = async (ph, br) => {
    const uid = await getStoredUserId();
    if (!uid) return;
    const entry = pharmacyEntryFromDirectory(ph, br);
    const key = patientPharmacyKey(entry);
    setAddingKey(key);
    try {
      // Re-read first so a pharmacy the doctor added meanwhile is not lost.
      const fresh = await api(`/api/v1/patients/${uid}`).catch(() => null);
      const current = dedupePatientPharmacies(fresh?.pharmacies || myPharmacies);
      if (hasPatientPharmacy(current, entry)) {
        setMyPharmacies(current);
        Alert.alert('Already saved', `${entry.name} is already in your pharmacies.`);
        return;
      }
      const updated = [...current, entry];
      await api(`/api/v1/patients/${uid}`, { method: 'PATCH', body: { pharmacies: updated } });
      setMyPharmacies(updated);
      Alert.alert('Pharmacy added', `${entry.name} is now in your pharmacies. Your doctor can send prescriptions there.`);
    } catch {
      Alert.alert('Error', 'Could not add this pharmacy. Please try again.');
    } finally {
      setAddingKey(null);
    }
  };

  const isSaved = (ph, br) => hasPatientPharmacy(myPharmacies, pharmacyEntryFromDirectory(ph, br));

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
      await api(`/api/v1/medical/prescriptions/${rx.id}`, { method: 'PATCH', body: { medications: nextMeds, pharmacyStatus: deriveRxStatusFromMeds(nextMeds) } });
    } catch {
      Alert.alert('Error', 'Failed to process transfer decision. Please try again.');
    } finally {
      setTransferActionKey('');
    }
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        {[{ key: 'prescriptions', label: '💊 Prescriptions' }, { key: 'myPharmacies', label: '⭐ Mine' }, { key: 'pharmacies', label: '🏪 Browse' }].map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Prescriptions Tab */}
      {tab === 'prescriptions' && (
        <ScrollView showsVerticalScrollIndicator={false}
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} tintColor={C.primary} />}
        >
          {loadingRx ? (
            <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
          ) : prescriptions.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 56 }}>💊</Text>
              <Text style={styles.emptyTitle}>No pharmacy prescriptions</Text>
              <Text style={styles.emptySub}>When your doctor sends a prescription to a pharmacy, it will appear here with live status.</Text>
            </View>
          ) : prescriptions.map(rx => {
            const pm = rx.pharmacyStatus ? (RX_STATUS_META[rx.pharmacyStatus] || null) : null;
            const meds = rx.medications || [];
            return (
              <View key={rx.id} style={styles.rxCard}>
                <TouchableOpacity onPress={() => setViewingRx(rx)}>
                  <View style={styles.rxHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rxDoctor}>Dr. {rx.doctorName || 'Doctor'}</Text>
                      <Text style={styles.rxDiag}>{rx.diagnosis || '—'} · {rx.date || ''}</Text>
                      {rx.prescriptionRef && (
                        <View style={styles.refRow}>
                          <Text style={styles.refCode}>{rx.prescriptionRef}</Text>
                          <TouchableOpacity onPress={() => setQrModal(rx.prescriptionRef)} style={styles.qrBtn}>
                            <Ionicons name="qr-code" size={16} color={C.primary} />
                            <Text style={styles.qrBtnText}>QR</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {rx.pharmacyName && (
                        <Text style={styles.rxPharmacy}>{rx.pharmacyName}{rx.branchName ? ` › ${rx.branchName}` : ''}</Text>
                      )}
                    </View>
                    {pm && (
                      <View style={[styles.rxStatusBadge, { backgroundColor: pm.bg }]}>
                        <Text style={[styles.rxStatusText, { color: pm.color }]}>{pm.label}</Text>
                      </View>
                    )}
                  </View>

                  {/* Drug pills */}
                  <View style={styles.pillRow}>
                    {meds.map((m, i) => {
                      const ds = DRUG_STATUS_META[m.drugStatus] || DRUG_STATUS_META.pending;
                      return (
                        <Text key={i} style={[styles.pill, { color: ds.color, backgroundColor: ds.color + '18' }]}>
                          {ds.icon} {m.name}
                        </Text>
                      );
                    })}
                  </View>
                  {meds
                    .map((m, i) => ({ m, i }))
                    .filter(({ m }) => m.drugStatus === 'transfer_requested' && m.transferRequestStatus === 'pending_patient')
                    .map(({ m, i }) => (
                      <View key={`${rx.id}-pending-transfer-${i}`} style={styles.transferConsentCard}>
                        <Text style={styles.transferConsentText}>
                          Transfer request for {m.name || 'this drug'} to {m.transferRequestBranchName || 'another branch'}{m.transferRequestBranchAddress ? ` (${m.transferRequestBranchAddress})` : ''}.
                        </Text>
                        <View style={styles.transferConsentActions}>
                          <TouchableOpacity
                            style={[styles.transferConsentBtn, styles.transferConsentAgree]}
                            disabled={transferActionKey === `${rx.id}:${i}:approve` || transferActionKey === `${rx.id}:${i}:reject`}
                            onPress={() => resolveTransferRequest(rx, i, true)}
                          >
                            <Text style={styles.transferConsentAgreeText}>I Agree</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.transferConsentBtn, styles.transferConsentReject]}
                            disabled={transferActionKey === `${rx.id}:${i}:approve` || transferActionKey === `${rx.id}:${i}:reject`}
                            onPress={() => resolveTransferRequest(rx, i, false)}
                          >
                            <Text style={styles.transferConsentRejectText}>I Reject</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  <Text style={styles.expandHint}>Tap for full details</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {tab === 'myPharmacies' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {loadingMyPh ? (
            <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
          ) : myPharmacies.length === 0 ? (
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>⭐</Text>
              <Text style={styles.emptyTitle}>No saved pharmacies</Text>
              <Text style={styles.emptySub}>Add one from the Browse tab, or your doctor can add one for you. Tap − to remove.</Text>
            </View>
          ) : (
            myPharmacies.map((ph, idx) => {
              const rowKey = patientPharmacyKey(ph) || ph.id || String(idx);
              return (
                <View key={rowKey} style={[styles.rxCard, { flexDirection: 'row', alignItems: 'flex-start' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', fontSize: 15, color: '#0f172a' }}>{ph.name}</Text>
                    {ph.address ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>📍 {ph.address}</Text> : null}
                    {ph.phone ? <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>📞 {ph.phone}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#fef2f2',
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      opacity: removingPhKey === rowKey ? 0.55 : 1,
                    }}
                    disabled={removingPhKey === rowKey}
                    onPress={() => {
                      Alert.alert('Remove pharmacy', `Remove ${ph.name || 'this pharmacy'} from your list?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Remove', style: 'destructive', onPress: () => removeSavedPharmacy(ph) },
                      ]);
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontSize: 20, fontWeight: '800' }}>−</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* Pharmacies Tab */}
      {tab === 'pharmacies' && (
        <View style={{ flex: 1 }}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or location…"
              value={searchPh}
              onChangeText={setSearchPh}
              placeholderTextColor="#94a3b8"
            />
          </View>
          {loadingPh ? (
            <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 12 }}>
              {filteredPh.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={{ fontSize: 48 }}>🏪</Text>
                  <Text style={styles.emptyTitle}>{searchPh ? 'No matches found' : 'No pharmacies yet'}</Text>
                </View>
              ) : filteredPh.map(({ key, ph, br, distanceKm }) => {
                const saved = isSaved(ph, br);
                const rowKey = patientPharmacyKey(pharmacyEntryFromDirectory(ph, br));
                const title = br ? (br.branchName || 'Branch') : (ph.pharmacyName || ph.name);
                const address = br ? (br.address || [br.city, br.country].filter(Boolean).join(', ')) : ph.address;
                const phone = br?.phone || ph.phone;
                const meta = [distanceKm != null ? formatDistanceKm(distanceKm) : null, phone ? `📞 ${phone}` : null].filter(Boolean).join(' · ');
                return (
                  <View key={key} style={[styles.phCard, saved && { borderColor: '#c4b5fd' }]}>
                    <View style={styles.phIcon}><Text style={{ fontSize: 22 }}>🏪</Text></View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.phName}>{title}</Text>
                      {br ? <Text style={styles.savedNote}>{ph.pharmacyName || ph.name}</Text> : null}
                      {address ? <Text style={styles.phDetail}>📍 {address}</Text> : null}
                      {meta ? <Text style={styles.phDetail}>{meta}</Text> : null}
                    </View>
                    {saved ? (
                      <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Added</Text></View>
                    ) : (
                      <TouchableOpacity style={styles.addBtn} onPress={() => addPharmacy(ph, br)} disabled={!!addingKey}>
                        {addingKey === rowKey ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addBtnText}>+ Add</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* QR Code Modal */}
      <Modal visible={!!qrModal} transparent animationType="fade" onRequestClose={() => setQrModal(null)}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrCard}>
            <Text style={styles.qrTitle}>Prescription QR Code</Text>
            <Text style={styles.qrSub}>Show this to the pharmacy for verification</Text>
            <View style={styles.qrWrapper}>
              <QRCode value={qrModal || 'N/A'} size={220} />
            </View>
            <Text style={styles.qrRefCode}>{qrModal}</Text>
            <TouchableOpacity style={styles.qrCloseBtn} onPress={() => setQrModal(null)}>
              <Text style={styles.qrCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewingRx} transparent animationType="slide" onRequestClose={() => setViewingRx(null)}>
        <View style={styles.qrOverlay}>
          <View style={styles.qrCard}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.qrTitle}>Prescription Details</Text>
              <TouchableOpacity onPress={() => setViewingRx(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {viewingRx && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }} contentContainerStyle={{ gap: 8 }}>
                <Text style={styles.rxDoctor}>Dr. {viewingRx.doctorName || 'Doctor'}</Text>
                <Text style={styles.rxDiag}>{viewingRx.diagnosis || '—'} · {viewingRx.date || ''}</Text>
                {viewingRx.prescriptionRef ? <Text style={styles.refCode}>{viewingRx.prescriptionRef}</Text> : null}
                {(viewingRx.medications || []).map((m, i) => {
                  const ds = DRUG_STATUS_META[m.drugStatus] || DRUG_STATUS_META.pending;
                  return (
                    <View key={i} style={styles.medRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.medName}>{m.name}{m.strength ? ` (${m.strength})` : ''}</Text>
                        <Text style={styles.medDetail}>{m.dosage} · {m.frequency} · {m.duration} {m.durationUnit}</Text>
                        {m.alternativeSuggested ? (
                          <Text style={styles.altText}>
                            🔁 Alt: {m.alternativeSuggested}{m.drugStatus === 'approved_replacement'
                              ? ` · Approved · Dr. ${m.approvedByDoctorName || viewingRx.doctorName || 'Doctor'}`
                              : ' · Waiting for Approval from your Doctor'}
                            {m.alternativeRationale ? ` · Why: ${m.alternativeRationale}` : ''}
                          </Text>
                        ) : null}
                        {m.drugStatus === 'transferred' && m.transferBranchName ? (
                          <Text style={[styles.altText, { color: '#0369a1' }]}>
                            This drug ({m.name || 'Drug'}) is transfered to branch ({m.transferBranchName}{m.transferBranchAddress ? `, ${m.transferBranchAddress}` : ''}).
                          </Text>
                        ) : null}
                        {m.drugStatus === 'transfer_requested' && m.transferRequestStatus === 'pending_patient' ? (
                          <Text style={[styles.altText, { color: '#0f766e' }]}>
                            Awaiting your approval to transfer to {m.transferRequestBranchName || 'another branch'}{m.transferRequestBranchAddress ? ` (${m.transferRequestBranchAddress})` : ''}.
                          </Text>
                        ) : null}
                      </View>
                      <Text style={[styles.drugStatusText, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab: { flex: 1, padding: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: C.primary, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', paddingHorizontal: 16 },
  // Rx cards
  rxCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  rxHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  rxDoctor: { fontSize: 16, fontWeight: '700', color: C.text },
  rxDiag: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  refCode: { fontFamily: 'monospace', fontSize: 13, fontWeight: '800', color: C.primary, backgroundColor: '#f0f9ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  qrBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0f9ff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  qrBtnText: { fontSize: 12, fontWeight: '700', color: C.primary },
  rxPharmacy: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  rxStatusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginLeft: 8 },
  rxStatusText: { fontSize: 11, fontWeight: '700' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  expandHint: { fontSize: 11, color: '#94a3b8', textAlign: 'right', marginTop: 4 },
  medList: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, gap: 10 },
  medRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  medName: { fontSize: 14, fontWeight: '700', color: C.text },
  medDetail: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  altText: { fontSize: 12, color: '#7c3aed', marginTop: 4 },
  drugStatusText: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  transferConsentCard: { marginTop: 6, backgroundColor: '#f0fdfa', borderWidth: 1, borderColor: '#99f6e4', borderRadius: 10, padding: 8 },
  transferConsentText: { fontSize: 11, color: '#0f766e', fontWeight: '600' },
  transferConsentActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  transferConsentBtn: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  transferConsentAgree: { borderColor: '#14b8a6', backgroundColor: '#ccfbf1' },
  transferConsentReject: { borderColor: '#fda4af', backgroundColor: '#fff1f2' },
  transferConsentAgreeText: { color: '#0f766e', fontSize: 11, fontWeight: '700' },
  transferConsentRejectText: { color: '#be123c', fontSize: 11, fontWeight: '700' },
  pickupBanner: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#bbf7d0', alignItems: 'center', gap: 6, marginTop: 8 },
  pickupTitle: { fontSize: 16, fontWeight: '800', color: '#0f5628' },
  pickupSub: { fontSize: 13, color: '#166534' },
  pickupCode: { fontFamily: 'monospace', fontSize: 22, fontWeight: '900', color: '#14532d', letterSpacing: 3 },
  showQrBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#16a34a', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
  showQrBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  // Pharmacy search tab
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  phCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  phIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f0f9ff', alignItems: 'center', justifyContent: 'center' },
  phName: { fontSize: 15, fontWeight: '700', color: C.text },
  phDetail: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  phCardWrap: { gap: 0 },
  savedNote: { fontSize: 12, color: '#7c3aed', fontWeight: '600', marginTop: 4 },
  addBtn: { backgroundColor: '#7c3aed', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  branchList: { backgroundColor: '#faf5ff', borderWidth: 1, borderTopWidth: 0, borderColor: '#e9d5ff', borderBottomLeftRadius: 14, borderBottomRightRadius: 14, padding: 12, gap: 8, marginTop: -6, paddingTop: 16 },
  branchHint: { fontSize: 12, fontWeight: '700', color: '#6b21a8' },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#ede9fe' },
  branchName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  activeBadge: { backgroundColor: '#f0fdf4', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  // QR modal
  qrOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  qrCard: { backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', maxWidth: 340 },
  qrTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 },
  qrSub: { fontSize: 13, color: C.textSecondary, marginBottom: 20, textAlign: 'center' },
  qrWrapper: { padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0', marginBottom: 16 },
  qrRefCode: { fontFamily: 'monospace', fontSize: 18, fontWeight: '900', color: C.primary, letterSpacing: 3, marginBottom: 20 },
  qrCloseBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12 },
  qrCloseBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
