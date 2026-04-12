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

const MedicalPrescriptionsScreen = () => {
  const [prescriptions, setPrescriptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Completion modal state
  const [completingRx, setCompletingRx] = useState(null); // the rx being completed
  const [showWarning, setShowWarning] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const cu = auth.currentUser;
      if (cu) {
        const rxs = await fetchClientPrescriptions(cu.uid);
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
                {active.map(rx => <RxCard key={rx.id} rx={rx} onTick={handleTickPress} />)}
              </>
            )}

            {/* Completed prescriptions */}
            {completed.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>COMPLETED</Text>
                {completed.map(rx => <RxCard key={rx.id} rx={rx} onTick={handleTickPress} />)}
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
    </>
  );
};

function RxCard({ rx, onTick }) {
  const meds = Array.isArray(rx.medications) && rx.medications.length > 0
    ? rx.medications
    : [{ name: rx.medication || rx.medicationName || 'Prescription', dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration }];
  const isDone = rx.status === 'completed';
  return (
    <View style={[styles.rxCard, isDone && styles.rxCardDone]}>
      <View style={styles.rxCardHeader}>
        <View style={styles.rxIconWrap}>
          <Ionicons name="medkit" size={18} color={isDone ? '#22c55e' : C.success} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.rxName, isDone && styles.rxNameDone]}>{meds[0]?.name || 'Prescription'}</Text>
          {rx.diagnosis ? <Text style={styles.rxDiagnosis}>Diagnosis: {rx.diagnosis}</Text> : null}
          <Text style={styles.rxDoctor}>Dr. {rx.doctorName || 'Doctor'}</Text>
        </View>
        {/* Tick button */}
        <TouchableOpacity
          style={[styles.tickBtn, isDone && styles.tickBtnDone]}
          onPress={() => onTick(rx)}
          disabled={isDone}
        >
          <Ionicons name={isDone ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={isDone ? '#22c55e' : '#cbd5e1'} />
        </TouchableOpacity>
      </View>

      {meds.map((m, i) => (
        <View key={i} style={styles.rxDetails}>
          {i > 0 && <Text style={[styles.rxDetailLabel, { marginBottom: 4 }]}>{m.name}</Text>}
          {m.dosage ? <View style={styles.rxDetailRow}><Text style={styles.rxDetailLabel}>Dosage</Text><Text style={styles.rxDetailValue}>{m.dosage}</Text></View> : null}
          {m.frequency ? <View style={styles.rxDetailRow}><Text style={styles.rxDetailLabel}>Frequency</Text><Text style={styles.rxDetailValue}>{m.frequency}</Text></View> : null}
          {m.duration ? <View style={styles.rxDetailRow}><Text style={styles.rxDetailLabel}>Duration</Text><Text style={styles.rxDetailValue}>{m.duration}</Text></View> : null}
        </View>
      ))}
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
