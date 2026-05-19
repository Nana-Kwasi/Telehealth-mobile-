import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc,
  onSnapshot, deleteDoc,
} from 'firebase/firestore';
import { DoctorColors as C } from '../../constants/colors';
import { buildEnrichedPatientMap } from '../../utils/doctorUtils';
import { getDoctorDisplayName } from '../../utils/doctorDisplayName';

const LAB_TESTS = ['Blood Test (CBC)', 'Urine Analysis', 'Blood Sugar (Fasting)', 'Blood Sugar (Random)', 'HbA1c', 'Liver Function Test', 'Kidney Function Test', 'Lipid Profile', 'Thyroid Function Test', 'HIV Test', 'Hepatitis B & C', 'Malaria Test', 'Stool Test', 'Widal Test', 'Pregnancy Test', 'Full Blood Panel'];
const SCAN_TYPES = ['X-Ray', 'MRI', 'CT Scan', 'Ultrasound'];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generateOrderId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let ref = 'ORD-';
  for (let i = 0; i < 8; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

const SEARCH_TIERS_KM = [30, 80, 150, 400, 2500, 100000];

function customEntryLabel(entry) {
  return String(entry?.label ?? entry?.name ?? '').trim();
}

export default function DoctorDiagnosticScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [orderType, setOrderType] = useState(null); // 'lab' | 'scan'
  const [testType, setTestType] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deviceLocation, setDeviceLocation] = useState(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [centerSearch, setCenterSearch] = useState('');
  const [customEntries, setCustomEntries] = useState([]);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [patientAnchor, setPatientAnchor] = useState(null);
  const [searchPhase, setSearchPhase] = useState(null);
  const [searchRingKm, setSearchRingKm] = useState(null);
  const [draftSaving, setDraftSaving] = useState(false);

  const doctorId = auth.currentUser?.uid;

  useEffect(() => {
    if (!selectedPatient?.id) {
      setPatientAnchor(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let lat;
        let lng;
        const ppSnap = await getDoc(doc(db, 'patientProfiles', selectedPatient.id)).catch(() => null);
        if (ppSnap?.exists()) {
          const pd = ppSnap.data();
          lat = pd.latitude ?? pd.lat ?? pd.location?.latitude ?? pd.location?.lat;
          lng = pd.longitude ?? pd.lng ?? pd.location?.longitude ?? pd.location?.lng;
        }
        if ((lat == null || lng == null)) {
          const authSnap = await getDoc(doc(db, 'auth', selectedPatient.id)).catch(() => null);
          if (authSnap?.exists()) {
            const ad = authSnap.data();
            lat = ad.latitude ?? ad.lat;
            lng = ad.longitude ?? ad.lng;
          }
        }
        if (cancelled) return;
        if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
          setPatientAnchor({ lat: Number(lat), lng: Number(lng) });
        } else {
          setPatientAnchor(null);
        }
      } catch {
        if (!cancelled) setPatientAnchor(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  useEffect(() => {
    if (!doctorId) return;
    const unsub = onSnapshot(collection(db, 'doctors', doctorId, 'diagnosticCustomEntries'), (snap) => {
      setCustomEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {});
    return unsub;
  }, [doctorId]);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setDeviceLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

  const loadPatients = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'doctorAppointments'), where('doctorId', '==', doctorId)));
      const enriched = await buildEnrichedPatientMap(snap.docs);
      const list = Array.from(enriched.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setPatients(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadBranchesStaged = async () => {
    setLoading(true);
    setSelectedBranch(null);
    setSearchRingKm(null);
    setSearchPhase({ message: 'Loading registered centers…', sub: null });
    try {
      const collName = orderType === 'lab' ? 'labBranches' : 'scanBranches';
      const snap = await getDocs(collection(db, collName));
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list = list.filter((b) => {
        const s = b.status;
        return s === undefined || s === null || String(s).toLowerCase() === 'active';
      });
      if (list.length === 0) {
        setBranches([]);
        setSearchPhase({ message: 'No active branches found', sub: 'Ask your admin to add lab/scan branches in the directory.' });
        return;
      }

      const anchor = patientAnchor || deviceLocation;
      const labelHint = patientAnchor ? 'patient location' : deviceLocation ? 'your location' : null;

      const withDist = list.map((b) => {
        if (!anchor || b.latitude == null || b.longitude == null) {
          return { ...b, distanceKm: null };
        }
        return {
          ...b,
          distanceKm: haversineKm(anchor.lat, anchor.lng, Number(b.latitude), Number(b.longitude)),
        };
      });
      withDist.sort((a, b) => {
        if (a.distanceKm == null && b.distanceKm == null) return (a.branchName || '').localeCompare(b.branchName || '');
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });

      if (!anchor) {
        setBranches(withDist);
        setSearchPhase({
          message: 'Patient GPS not on file',
          sub: 'Allow location access or save patient address/coordinates in profile for nearest-first results. Showing all active centers.',
        });
        setSearchRingKm(Infinity);
        return;
      }

      const withCoords = withDist.filter((b) => b.distanceKm != null);
      setSearchPhase({
        message: 'Searching centers near the patient…',
        sub: labelHint ? `Anchor: ${labelHint}` : null,
      });
      await new Promise((r) => setTimeout(r, 350));

      for (let i = 0; i < SEARCH_TIERS_KM.length; i++) {
        const tier = SEARCH_TIERS_KM[i];
        const tierLabel = tier >= 100000 ? 'all regions' : `${tier} km`;
        setSearchPhase({
          message: tier <= 400
            ? `Searching near patient (within ${tierLabel})…`
            : `Expanding search (${tierLabel})…`,
          sub: 'Sorted by driving distance from patient',
        });
        await new Promise((r) => setTimeout(r, 400));
        const inTier = withCoords.filter((b) => b.distanceKm <= tier);
        if (inTier.length > 0 || i === SEARCH_TIERS_KM.length - 1) {
          setSearchRingKm(tier >= 100000 ? Infinity : tier);
          setBranches(withDist);
          setSearchPhase({
            message: inTier.length > 0
              ? `Found ${inTier.length} center(s) within ${tier >= 100000 ? 'expanded search' : `${tier} km`}.`
              : withCoords.length === 0
                ? 'Centers have no map pins yet — showing full list.'
                : 'Showing every active center sorted by distance.',
            sub: null,
          });
          break;
        }
      }
    } catch (e) {
      console.error(e);
      setSearchPhase({ message: 'Could not load centers', sub: 'Check connection and try again.' });
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  const saveCustomTest = async () => {
    const label = customLabel.trim();
    if (!label || !orderType || !doctorId) return;
    try {
      await addDoc(collection(db, 'doctors', doctorId, 'diagnosticCustomEntries'), {
        category: orderType,
        label,
        createdAt: serverTimestamp(),
      });
      setCustomLabel('');
      setShowCustomModal(false);
      setTestType(label);
    } catch {
      Alert.alert('Error', 'Could not save your custom test name.');
    }
  };

  const deleteCustomEntry = (entry) => {
    if (!doctorId || !entry?.id) return;
    Alert.alert('Remove custom item?', customEntryLabel(entry) || 'this item', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDoc(doc(db, 'doctors', doctorId, 'diagnosticCustomEntries', entry.id));
            if (testType === customEntryLabel(entry)) setTestType(null);
          } catch {
            Alert.alert('Error', 'Could not delete.');
          }
        },
      },
    ]);
  };

  const handleSaveDraft = async () => {
    if (!selectedPatient || !selectedBranch || !testType || !orderType) {
      Alert.alert('Incomplete', 'Complete patient, center, and test before saving a draft.');
      return;
    }
    setDraftSaving(true);
    try {
      const centerIdField = orderType === 'lab' ? 'labId' : 'scanId';
      const centerDocRef = doc(db, orderType === 'lab' ? 'labs' : 'scanCenters', selectedBranch[centerIdField]);
      const centerSnap = await getDoc(centerDocRef).catch(() => null);
      const centerName =
        centerSnap?.data()?.labName || centerSnap?.data()?.centerName || 'Center';

      await addDoc(collection(db, 'doctors', doctorId, 'diagnosticDrafts'), {
        orderType,
        testType,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name || selectedPatient.clientName || 'Patient',
        patientNameLower: (selectedPatient.name || selectedPatient.clientName || 'patient').toLowerCase(),
        branchId: selectedBranch.id,
        branchName: selectedBranch.branchName,
        branchAddress: selectedBranch.address || '',
        centerId: selectedBranch[centerIdField],
        centerName,
        notes: notes.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      Alert.alert('Draft saved', 'Open Lab & Scan Results → Draft to submit or delete.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not save draft.');
    } finally {
      setDraftSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedPatient || !selectedBranch || !testType) {
      Alert.alert('Incomplete', 'Please complete all steps before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const orderId = generateOrderId();
      const centerIdField = orderType === 'lab' ? 'labId' : 'scanId';
      const centerDocRef = doc(db, orderType === 'lab' ? 'labs' : 'scanCenters', selectedBranch[centerIdField]);
      const centerSnap = await getDoc(centerDocRef).catch(() => null);
      const centerName = centerSnap?.data()?.labName || centerSnap?.data()?.centerName || 'Center';

      const doctorName = await getDoctorDisplayName(db, doctorId, [auth.currentUser?.displayName]);

      const orderData = {
        orderId,
        type: orderType,
        centerType: orderType,
        testType,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name || selectedPatient.clientName || 'Patient',
        patientNameLower: (selectedPatient.name || selectedPatient.clientName || 'patient').toLowerCase(),
        doctorId,
        doctorName,
        branchId: selectedBranch.id,
        branchName: selectedBranch.branchName,
        centerId: selectedBranch[centerIdField],
        centerName,
        notes: notes.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'diagnosticOrders'), orderData);

      await addDoc(collection(db, 'patientTimeline'), {
        patientId: selectedPatient.id,
        type: orderType === 'lab' ? 'LAB_ORDER' : 'SCAN_ORDER',
        title: `${orderType === 'lab' ? 'Lab test' : 'Scan'} ordered: ${testType}`,
        status: 'PENDING',
        relatedId: orderId,
        actor: { role: 'DOCTOR', name: doctorName },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'notifications'), {
        targetId: selectedPatient.id,
        title: `${orderType === 'lab' ? 'Lab Test' : 'Scan'} Ordered`,
        body: `Your doctor has ordered a ${testType} at ${selectedBranch.branchName}. Please present your National ID when you visit.`,
        type: orderType === 'lab' ? 'LAB_ORDER' : 'SCAN_ORDER',
        relatedId: orderId,
        read: false,
        createdAt: serverTimestamp(),
      });

      Alert.alert('Order Created', `Order ID: ${orderId}\n\nPatient has been notified to visit ${selectedBranch.branchName} with their National ID.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to create order. Please try again.');
    } finally { setSubmitting(false); }
  };

  const filteredPatients = patients.filter(p =>
    !patientSearch || (p.name || '').toLowerCase().includes(patientSearch.toLowerCase())
  );

  const filteredBranches = branches.filter(b =>
    !centerSearch || b.branchName?.toLowerCase().includes(centerSearch.toLowerCase()) || b.address?.toLowerCase().includes(centerSearch.toLowerCase())
  );

  const ring = searchRingKm;
  const nearBranches = filteredBranches.filter((b) => {
    if (b.distanceKm == null) return false;
    if (ring === Infinity || ring == null) return true;
    return b.distanceKm <= ring;
  });
  const farBranches = filteredBranches.filter((b) => {
    if (ring === Infinity || ring == null) return b.distanceKm == null;
    return b.distanceKm == null || b.distanceKm > ring;
  });

  return (
    <View style={styles.container}>
      {/* Step indicators */}
      <View style={styles.stepBar}>
        {[1, 2, 3, 4, 5].map(s => (
          <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]}>
            <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>

        {/* Step 1: Select Type */}
        {step === 1 && (
          <View>
            <Text style={styles.stepTitle}>Step 1: Select Order Type</Text>
            <TouchableOpacity style={[styles.typeCard, orderType === 'lab' && styles.typeCardActive]} onPress={() => setOrderType('lab')}>
              <Ionicons name="flask" size={32} color={orderType === 'lab' ? '#fff' : '#065f46'} />
              <View style={{ marginLeft: 16 }}>
                <Text style={[styles.typeName, orderType === 'lab' && { color: '#fff' }]}>Laboratory Test</Text>
                <Text style={[styles.typeSub, orderType === 'lab' && { color: 'rgba(255,255,255,0.8)' }]}>Blood, urine, panels & more</Text>
              </View>
              {orderType === 'lab' && <Ionicons name="checkmark-circle" size={24} color="#fff" style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.typeCard, styles.typeCardScan, orderType === 'scan' && styles.typeCardScanActive]} onPress={() => setOrderType('scan')}>
              <Ionicons name="radio-outline" size={32} color={orderType === 'scan' ? '#fff' : '#4c1d95'} />
              <View style={{ marginLeft: 16 }}>
                <Text style={[styles.typeName, orderType === 'scan' && { color: '#fff' }]}>Imaging / Scan</Text>
                <Text style={[styles.typeSub, orderType === 'scan' && { color: 'rgba(255,255,255,0.8)' }]}>X-Ray, MRI, CT Scan, Ultrasound</Text>
              </View>
              {orderType === 'scan' && <Ionicons name="checkmark-circle" size={24} color="#fff" style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.nextBtn, !orderType && styles.nextBtnDisabled]}
              disabled={!orderType}
              onPress={() => { setTestType(null); setStep(2); }}
            >
              <Text style={styles.nextBtnText}>Next →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 2: Select Test */}
        {step === 2 && (
          <View>
            <Text style={styles.stepTitle}>Step 2: Select {orderType === 'lab' ? 'Lab Test' : 'Scan Type'}</Text>
            <TouchableOpacity style={styles.addCustomBtn} onPress={() => setShowCustomModal(true)} activeOpacity={0.85}>
              <Ionicons name="add-circle" size={22} color="#fff" />
              <Text style={styles.addCustomBtnText}>Add my own {orderType === 'lab' ? 'test' : 'scan type'}</Text>
            </TouchableOpacity>
            <View style={styles.testGrid}>
              {(orderType === 'lab' ? LAB_TESTS : SCAN_TYPES).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.testChip, testType === t && styles.testChipActive]}
                  onPress={() => setTestType(t)}
                >
                  <Text style={[styles.testChipText, testType === t && styles.testChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
              {customEntries.filter(c => c.category === orderType).map((c) => {
                const label = customEntryLabel(c);
                const display = label || 'Unnamed — tap delete to remove';
                const selected = Boolean(label) && testType === label;
                return (
                  <View key={c.id} style={[styles.customChipWrap, selected && styles.testChipActive]}>
                    <TouchableOpacity
                      style={styles.customChipLabelHit}
                      onPress={() => label && setTestType(label)}
                      activeOpacity={0.85}
                      disabled={!label}
                    >
                      <Text
                        style={[styles.testChipText, selected && styles.testChipTextActive]}
                        numberOfLines={2}
                      >
                        {display}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteCustomEntry(c)} hitSlop={8} style={styles.trashMini}>
                      <Ionicons name="trash-outline" size={16} color={selected ? '#fff' : '#dc2626'} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, !testType && styles.nextBtnDisabled, { flex: 1 }]}
                disabled={!testType}
                onPress={() => { loadPatients(); setStep(3); }}
              >
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 3: Select Patient */}
        {step === 3 && (
          <View>
            <Text style={styles.stepTitle}>Step 3: Select Patient</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search patient…"
              value={patientSearch}
              onChangeText={setPatientSearch}
              placeholderTextColor="#94a3b8"
            />
            {loading ? <ActivityIndicator color={C.primary} style={{ margin: 24 }} /> : (
              filteredPatients.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.listItem, selectedPatient?.id === p.id && styles.listItemActive]}
                  onPress={() => setSelectedPatient(p)}
                >
                  <View style={styles.patientAvatar}>
                    <Text style={styles.patientAvatarText}>{(p.name || p.clientName || 'P')[0].toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.listItemText, selectedPatient?.id === p.id && { color: '#fff' }]}>
                    {p.name || 'Patient'}
                  </Text>
                  {selectedPatient?.id === p.id && <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: 'auto' }} />}
                </TouchableOpacity>
              ))
            )}
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, !selectedPatient && styles.nextBtnDisabled, { flex: 1 }]}
                disabled={!selectedPatient}
                onPress={() => { loadBranchesStaged(); setStep(4); }}
              >
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 4: Select Center */}
        {step === 4 && (
          <View>
            <Text style={styles.stepTitle}>Step 4: Select {orderType === 'lab' ? 'Lab' : 'Scan'} Center</Text>
            {searchPhase?.message ? (
              <View style={styles.phaseBanner}>
                <Text style={styles.phaseBannerTitle}>{searchPhase.message}</Text>
                {searchPhase.sub ? <Text style={styles.phaseBannerSub}>{searchPhase.sub}</Text> : null}
              </View>
            ) : null}
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or address…"
              value={centerSearch}
              onChangeText={setCenterSearch}
              placeholderTextColor="#94a3b8"
            />
            {loading ? <ActivityIndicator color={C.primary} style={{ margin: 24 }} /> : (
              <>
                {nearBranches.length > 0 && (
                  <>
                    <Text style={styles.sectionLabel}>
                      {searchRingKm === Infinity ? 'NEAR PATIENT (BY DISTANCE)'
                        : searchRingKm != null ? `NEAR PATIENT (≤ ${searchRingKm} km)`
                          : 'NEAR PATIENT'}
                    </Text>
                    {nearBranches.map(b => renderBranchItem(b))}
                  </>
                )}
                {farBranches.length > 0 && (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 12 }]}>FURTHER / NO COORDINATES</Text>
                    {farBranches.map(b => renderBranchItem(b))}
                  </>
                )}
                {filteredBranches.length === 0 && (
                  <View style={styles.empty}>
                    <Ionicons name="location-outline" size={40} color="#e2e8f0" />
                    <Text style={styles.emptyText}>No centers match filters</Text>
                    <Text style={[styles.emptyText, { marginTop: 6, fontSize: 12 }]}>
                      Ensure lab/scan branches exist in Admin and are marked active (or leave status unset).
                    </Text>
                  </View>
                )}
              </>
            )}
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(3)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, !selectedBranch && styles.nextBtnDisabled, { flex: 1 }]}
                disabled={!selectedBranch}
                onPress={() => setStep(5)}
              >
                <Text style={styles.nextBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 5: Notes + Submit */}
        {step === 5 && (
          <View>
            <Text style={styles.stepTitle}>Step 5: Add Notes & Submit</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Order Summary</Text>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Type</Text><Text style={styles.summaryValue}>{orderType?.toUpperCase()}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Test</Text><Text style={styles.summaryValue}>{testType}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Patient</Text><Text style={styles.summaryValue}>{selectedPatient?.name || selectedPatient?.clientName}</Text></View>
              <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Center</Text><Text style={styles.summaryValue}>{selectedBranch?.branchName}</Text></View>
              {selectedBranch?.address && (
                <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Address</Text><Text style={styles.summaryValue}>{selectedBranch.address}</Text></View>
              )}
            </View>
            <Text style={styles.fieldLabel}>Instructions for Technician (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Any special instructions, urgency notes, clinical context…"
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.patientNote}>
              <Ionicons name="information-circle-outline" size={18} color={C.primary} />
              <Text style={styles.patientNoteText}>Patient will be notified to visit {selectedBranch?.branchName} with their National ID.</Text>
            </View>
            <TouchableOpacity
              style={[styles.draftBtn, draftSaving && { opacity: 0.6 }]}
              onPress={handleSaveDraft}
              disabled={draftSaving || submitting}
            >
              {draftSaving ? <ActivityIndicator size="small" color={C.primary} /> : (
                <Text style={styles.draftBtnText}>Save as draft</Text>
              )}
            </TouchableOpacity>
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(4)}>
                <Text style={styles.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.nextBtn, submitting && { opacity: 0.6 }, { flex: 1, backgroundColor: '#16a34a' }]}
                disabled={submitting || draftSaving}
                onPress={handleSubmit}
              >
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.nextBtnText}>Submit Order</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={showCustomModal} transparent animationType="fade" onRequestClose={() => setShowCustomModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Custom {orderType === 'lab' ? 'lab test' : 'scan type'}</Text>
            <Text style={styles.modalHint}>Saved only for your account. You can remove it anytime.</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. PET-CT, Hormone panel…"
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowCustomModal(false); setCustomLabel(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSave} onPress={saveCustomTest}>
                <Text style={styles.modalSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  function renderBranchItem(b) {
    const isSelected = selectedBranch?.id === b.id;
    return (
      <TouchableOpacity
        key={b.id}
        style={[styles.branchCard, isSelected && styles.branchCardActive]}
        onPress={() => setSelectedBranch(b)}
      >
        <View style={styles.branchLeft}>
          <Text style={[styles.branchName, isSelected && { color: '#fff' }]}>{b.branchName}</Text>
          {b.address ? <Text style={[styles.branchAddr, isSelected && { color: 'rgba(255,255,255,0.75)' }]}>{b.address}</Text> : null}
        </View>
        <View style={styles.branchRight}>
          {b.distanceKm !== null && b.distanceKm !== undefined && (
            <View style={[styles.distBadge, isSelected && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
              <Text style={[styles.distText, isSelected && { color: '#fff' }]}>
                {b.distanceKm < 1 ? `${(b.distanceKm * 1000).toFixed(0)}m` : `${b.distanceKm.toFixed(1)}km`}
              </Text>
            </View>
          )}
          {isSelected && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  stepBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: C.primary },
  stepNum: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  stepNumActive: { color: '#fff' },
  stepTitle: { fontSize: 18, fontWeight: '800', color: C.text, marginBottom: 16 },
  typeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 2, borderColor: '#065f46' },
  typeCardActive: { backgroundColor: '#065f46' },
  typeCardScan: { backgroundColor: '#f5f3ff', borderColor: '#4c1d95' },
  typeCardScanActive: { backgroundColor: '#4c1d95' },
  typeName: { fontSize: 16, fontWeight: '800', color: C.text },
  typeSub: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  testGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  testChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e2e8f0' },
  testChipActive: { backgroundColor: C.primary, borderColor: C.primary },
  testChipText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  testChipTextActive: { color: '#fff' },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0', gap: 12 },
  listItemActive: { backgroundColor: C.primary, borderColor: C.primary },
  listItemText: { fontSize: 15, fontWeight: '600', color: C.text, flex: 1 },
  patientAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center' },
  patientAvatarText: { fontSize: 14, fontWeight: '800', color: C.primary },
  searchInput: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.text, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.textSecondary, letterSpacing: 0.8, marginBottom: 8 },
  locationNote: { fontSize: 12, color: C.textSecondary, marginBottom: 10 },
  phaseBanner: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 12, marginBottom: 12 },
  phaseBannerTitle: { fontSize: 13, fontWeight: '700', color: '#1e40af' },
  phaseBannerSub: { fontSize: 12, color: '#64748b', marginTop: 4 },
  branchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#e2e8f0' },
  branchCardActive: { backgroundColor: C.primary, borderColor: C.primary },
  branchLeft: { flex: 1 },
  branchName: { fontSize: 15, fontWeight: '700', color: C.text },
  branchAddr: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  branchRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  distBadge: { backgroundColor: C.primaryLight, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  distText: { fontSize: 12, fontWeight: '700', color: C.primary },
  summaryCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: C.text, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  summaryValue: { fontSize: 13, color: C.text, fontWeight: '700' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 8 },
  notesInput: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, color: C.text, borderWidth: 1, borderColor: '#e2e8f0', height: 100, marginBottom: 16 },
  patientNote: { flexDirection: 'row', gap: 8, backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: '#bfdbfe' },
  patientNoteText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 18 },
  draftBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.primary,
    backgroundColor: '#fff',
  },
  draftBtnText: { fontSize: 15, fontWeight: '800', color: C.primary },
  navRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  backBtn: { backgroundColor: '#f1f5f9', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center' },
  backBtnText: { color: C.textSecondary, fontWeight: '700', fontSize: 15 },
  nextBtn: { backgroundColor: C.primary, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 14, color: C.textSecondary, marginTop: 8, textAlign: 'center' },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 14,
  },
  addCustomBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  customChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingLeft: 14,
    paddingVertical: 10,
    paddingRight: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    maxWidth: '100%',
  },
  customChipLabelHit: { flexShrink: 1, paddingRight: 4 },
  trashMini: { padding: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  modalHint: { fontSize: 12, color: '#64748b', marginTop: 6, marginBottom: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: C.text,
    marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 12, backgroundColor: '#f1f5f9' },
  modalCancelText: { fontWeight: '700', color: '#64748b' },
  modalSave: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 12, backgroundColor: C.primary },
  modalSaveText: { fontWeight: '800', color: '#fff' },
});
