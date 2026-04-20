import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, onSnapshot,
} from 'firebase/firestore';
import { MedicalColors as C } from '../../constants/colors';

const DRUG_STATUS_META = {
  pending:               { icon: '⏳', label: 'Pending',       color: '#d97706' },
  available:             { icon: '✅', label: 'Available',     color: '#16a34a' },
  not_available:         { icon: '❌', label: 'Not Available', color: '#dc2626' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.', color: '#16a34a' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent to Pharmacy', color: '#1d4ed8', bg: '#eff6ff' },
  accepted:            { label: 'Processing',       color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partial',          color: '#d97706', bg: '#fffbeb' },
  ready:               { label: 'Ready for Pickup', color: '#16a34a', bg: '#f0fdf4' },
  delivered:           { label: 'Delivered',        color: '#475569', bg: '#f8fafc' },
};

export default function EPharmacyScreen() {
  const [tab, setTab] = useState('prescriptions'); // 'prescriptions' | 'pharmacies'
  const [prescriptions, setPrescriptions] = useState([]);
  const [loadingRx, setLoadingRx] = useState(true);
  const [systemPharmacies, setSystemPharmacies] = useState([]);
  const [loadingPh, setLoadingPh] = useState(false);
  const [searchPh, setSearchPh] = useState('');
  const [expandedRx, setExpandedRx] = useState(null);
  const [qrModal, setQrModal] = useState(null); // prescriptionRef string
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoadingRx(false); return; }
    const q = query(
      collection(db, 'doctorPrescriptions'),
      where('patientId', '==', uid)
    );
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => r.pharmacyId)
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPrescriptions(list);
      setLoadingRx(false);
      setRefreshing(false);
    }, () => setLoadingRx(false));
    return unsub;
  }, []);

  useEffect(() => {
    if (tab !== 'pharmacies') return;
    setLoadingPh(true);
    getDocs(query(collection(db, 'pharmacies'), where('status', '==', 'active')))
      .then(snap => setSystemPharmacies(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(console.error)
      .finally(() => setLoadingPh(false));
  }, [tab]);

  const filteredPh = systemPharmacies.filter(ph => {
    if (!searchPh.trim()) return true;
    const q = searchPh.toLowerCase();
    return (ph.pharmacyName || ph.name || '').toLowerCase().includes(q) ||
           (ph.country || '').toLowerCase().includes(q) ||
           (ph.address || '').toLowerCase().includes(q);
  });

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabRow}>
        {[{ key: 'prescriptions', label: '💊 Prescriptions' }, { key: 'pharmacies', label: '🏪 Pharmacies' }].map(t => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Prescriptions Tab */}
      {tab === 'prescriptions' && (
        <ScrollView
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
            const isExpanded = expandedRx === rx.id;
            return (
              <View key={rx.id} style={styles.rxCard}>
                <TouchableOpacity onPress={() => setExpandedRx(isExpanded ? null : rx.id)}>
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
                  <Text style={styles.expandHint}>{isExpanded ? 'Tap to collapse ▲' : 'Tap for details ▼'}</Text>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={styles.medList}>
                    {meds.map((m, i) => {
                      const ds = DRUG_STATUS_META[m.drugStatus] || DRUG_STATUS_META.pending;
                      return (
                        <View key={i} style={styles.medRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.medName}>{m.name}{m.strength ? ` (${m.strength})` : ''}</Text>
                            <Text style={styles.medDetail}>{m.dosage} · {m.frequency} · {m.duration} {m.durationUnit}</Text>
                            {m.alternativeSuggested && (
                              <Text style={styles.altText}>
                                🔁 Alt: {m.alternativeSuggested}{m.drugStatus === 'approved_replacement' ? ' ✅ Approved' : ' (Pending doctor approval)'}
                              </Text>
                            )}
                          </View>
                          <Text style={[styles.drugStatusText, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
                        </View>
                      );
                    })}
                    {rx.pharmacyStatus === 'ready' && rx.prescriptionRef && (
                      <View style={styles.pickupBanner}>
                        <Text style={styles.pickupTitle}>Ready for Pickup!</Text>
                        <Text style={styles.pickupSub}>Show this code at the pharmacy:</Text>
                        <Text style={styles.pickupCode}>{rx.prescriptionRef}</Text>
                        <TouchableOpacity style={styles.showQrBtn} onPress={() => setQrModal(rx.prescriptionRef)}>
                          <Ionicons name="qr-code" size={18} color="#fff" />
                          <Text style={styles.showQrBtnText}>Show QR Code</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
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
            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
              {filteredPh.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={{ fontSize: 48 }}>🏪</Text>
                  <Text style={styles.emptyTitle}>{searchPh ? 'No matches found' : 'No pharmacies yet'}</Text>
                </View>
              ) : filteredPh.map(ph => (
                <View key={ph.id} style={styles.phCard}>
                  <View style={styles.phIcon}>
                    <Text style={{ fontSize: 22 }}>🏪</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.phName}>{ph.pharmacyName || ph.name}</Text>
                    {ph.country && <Text style={styles.phDetail}>🌍 {ph.country}</Text>}
                    {ph.address && <Text style={styles.phDetail}>📍 {ph.address}</Text>}
                    {ph.phone && <Text style={styles.phDetail}>📞 {ph.phone}</Text>}
                  </View>
                  <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Active</Text></View>
                </View>
              ))}
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
  pickupBanner: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: '#bbf7d0', alignItems: 'center', gap: 6, marginTop: 8 },
  pickupTitle: { fontSize: 16, fontWeight: '800', color: '#15803d' },
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
