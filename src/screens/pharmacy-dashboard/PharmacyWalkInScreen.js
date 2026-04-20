import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { PharmacyColors as C } from '../../constants/colors';

const DRUG_STATUS = {
  pending:               { icon: '⏳', label: 'Pending',       color: '#d97706' },
  available:             { icon: '✅', label: 'Available',     color: '#16a34a' },
  not_available:         { icon: '❌', label: 'Not Available', color: '#dc2626' },
  alternative_suggested: { icon: '🔁', label: 'Alt. Suggested',color: '#7c3aed' },
  approved_replacement:  { icon: '✅', label: 'Approved Alt.', color: '#16a34a' },
};

const RX_STATUS_META = {
  sent:                { label: 'Sent',               color: '#1d4ed8', bg: '#eff6ff' },
  accepted:            { label: 'Accepted',           color: '#d97706', bg: '#fffbeb' },
  partially_fulfilled: { label: 'Partially Fulfilled',color: '#d97706', bg: '#fffbeb' },
  ready:               { label: 'Ready for Pickup',   color: '#16a34a', bg: '#f0fdf4' },
  delivered:           { label: 'Delivered',          color: '#475569', bg: '#f8fafc' },
};

export default function PharmacyWalkInScreen({ profile }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rx, setRx] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [marking, setMarking] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setScanned(false);
    setShowScanner(true);
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setShowScanner(false);
    const ref = data.toUpperCase();
    setInput(ref);
    searchRef(ref);
  };

  const searchRef = async (val) => {
    const ref = (val || input).trim().toUpperCase();
    if (!ref) return;
    setLoading(true);
    setRx(null);
    setNotFound(false);
    try {
      const snap = await getDocs(query(
        collection(db, 'doctorPrescriptions'),
        where('prescriptionRef', '==', ref),
        where('pharmacyId', '==', profile.id)
      ));
      if (!snap.empty) {
        setRx({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setNotFound(true);
      }
    } catch {
      Alert.alert('Error', 'Lookup failed. Please try again.');
    } finally { setLoading(false); }
  };

  const markDelivered = async () => {
    if (!rx) return;
    setMarking(true);
    try {
      await updateDoc(doc(db, 'doctorPrescriptions', rx.id), {
        pharmacyStatus: 'delivered', deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setRx(prev => ({ ...prev, pharmacyStatus: 'delivered' }));
      Alert.alert('Done', 'Prescription marked as delivered.');
    } catch { Alert.alert('Error', 'Could not mark as delivered.'); }
    finally { setMarking(false); }
  };

  const pm = rx?.pharmacyStatus ? (RX_STATUS_META[rx.pharmacyStatus] || null) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.heading}>Walk-in Verification</Text>
      <Text style={styles.sub}>Scan a QR code or enter a prescription reference code</Text>

      <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
        <Ionicons name="qr-code-outline" size={22} color="#fff" />
        <Text style={styles.scanBtnText}>Scan QR Code</Text>
      </TouchableOpacity>

      <Text style={styles.orDivider}>— or enter manually —</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={t => setInput(t.toUpperCase())}
          placeholder="RX-XXXXXXXX"
          placeholderTextColor="#94a3b8"
          autoCapitalize="characters"
          returnKeyType="search"
          onSubmitEditing={() => searchRef()}
        />
        <TouchableOpacity style={[styles.searchBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
          onPress={() => searchRef()} disabled={!input.trim() || loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="search" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      {notFound && (
        <View style={styles.notFound}>
          <Text style={{ fontSize: 40 }}>🔍</Text>
          <Text style={styles.notFoundTitle}>Not Found</Text>
          <Text style={styles.notFoundSub}>No prescription with code <Text style={{ fontFamily: 'monospace', fontWeight: '700' }}>{input}</Text> is routed to this pharmacy.</Text>
        </View>
      )}

      {rx && (
        <View style={styles.result}>
          {pm && (
            <View style={[styles.statusBanner, { backgroundColor: pm.bg }]}>
              <Text style={[styles.statusLabel, { color: pm.color }]}>Status</Text>
              <Text style={[styles.statusValue, { color: pm.color }]}>{pm.label}</Text>
            </View>
          )}
          <View style={styles.refBox}>
            <Text style={styles.refLabel}>Prescription Reference</Text>
            <Text style={styles.refValue}>{rx.prescriptionRef}</Text>
          </View>
          {[
            { label: 'Patient', value: rx.patientName || '—' },
            { label: 'Doctor', value: rx.doctorName ? `Dr. ${rx.doctorName}` : '—' },
            { label: 'Diagnosis', value: rx.diagnosis || '—' },
            { label: 'Date', value: rx.date || '—' },
          ].map(({ label, value }) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
          <Text style={styles.medsTitle}>Medications</Text>
          {(rx.medications || []).map((med, i) => {
            const ds = DRUG_STATUS[med.drugStatus] || DRUG_STATUS.pending;
            return (
              <View key={i} style={styles.medRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName}>{med.name}{med.strength ? ` (${med.strength})` : ''}</Text>
                  <Text style={styles.medDetail}>{[med.drugForm, med.dosage, med.frequency].filter(Boolean).join(' · ')}</Text>
                  {med.alternativeSuggested && (
                    <Text style={styles.altText}>🔁 Alt: {med.alternativeSuggested}{med.drugStatus === 'approved_replacement' ? ' ✅' : ''}</Text>
                  )}
                </View>
                <Text style={[styles.drugStatus, { color: ds.color }]}>{ds.icon} {ds.label}</Text>
              </View>
            );
          })}
          {rx.pharmacyStatus === 'ready' && (
            <TouchableOpacity style={styles.deliverBtn} onPress={markDelivered} disabled={marking}>
              <Text style={styles.deliverBtnText}>{marking ? 'Saving…' : '📦 Mark as Delivered'}</Text>
            </TouchableOpacity>
          )}
          {rx.pharmacyStatus === 'delivered' && (
            <View style={styles.deliveredBanner}>
              <Text style={styles.deliveredText}>✅ Prescription Delivered</Text>
            </View>
          )}
        </View>
      )}

      {/* QR Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <Text style={styles.scannerHint}>Align QR code within the frame</Text>
            <TouchableOpacity style={styles.cancelScanBtn} onPress={() => setShowScanner(false)}>
              <Text style={styles.cancelScanText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  heading: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 },
  sub: { fontSize: 14, color: C.textSecondary, marginBottom: 20 },
  scanBtn: { backgroundColor: C.primary, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 },
  scanBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  orDivider: { textAlign: 'center', color: C.textSecondary, fontSize: 13, marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  input: { flex: 1, borderWidth: 1.5, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 16, fontFamily: 'monospace', fontWeight: '700', color: C.text, backgroundColor: '#fff', letterSpacing: 2 },
  searchBtn: { width: 52, backgroundColor: C.primary, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notFound: { alignItems: 'center', padding: 24, gap: 8 },
  notFoundTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  notFoundSub: { fontSize: 14, color: C.textSecondary, textAlign: 'center' },
  result: { gap: 12 },
  statusBanner: { borderRadius: 12, padding: 14 },
  statusLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  statusValue: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  refBox: { backgroundColor: C.primaryLight, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: C.border },
  refLabel: { fontSize: 11, fontWeight: '700', color: C.info, textTransform: 'uppercase', marginBottom: 4 },
  refValue: { fontFamily: 'monospace', fontSize: 22, fontWeight: '900', color: C.primary, letterSpacing: 3 },
  infoRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { fontSize: 12, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase' },
  infoValue: { fontSize: 14, fontWeight: '600', color: C.text },
  medsTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  medRow: { backgroundColor: '#fff', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#e2e8f0' },
  medName: { fontSize: 15, fontWeight: '700', color: C.text },
  medDetail: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  altText: { fontSize: 12, color: '#7c3aed', marginTop: 4 },
  drugStatus: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  deliverBtn: { backgroundColor: C.primary, borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  deliverBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  deliveredBanner: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#bbf7d0' },
  deliveredText: { color: '#15803d', fontWeight: '800', fontSize: 16 },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scannerFrame: { width: 260, height: 260, borderWidth: 3, borderColor: '#fff', borderRadius: 16, marginBottom: 24 },
  scannerHint: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 32 },
  cancelScanBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  cancelScanText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
