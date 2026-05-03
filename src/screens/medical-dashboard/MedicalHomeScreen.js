import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Image, Dimensions,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, PieChart } from 'react-native-chart-kit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import { doc, getDoc, setDoc, addDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { fetchClientAppointments, fetchClientPrescriptions } from '../../services/doctorDataService';
import { MedicalColors } from '../../constants/colors';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';

const EMPTY_VITALS = { bpSystolic: '', bpDiastolic: '', heartRate: '', respiratoryRate: '', spo2: '', temperature: '', tempUnit: 'C' };

const SCREEN_WIDTH = Dimensions.get('window').width - 32;

function getInitials(name) {
  if (!name) return 'D';
  const p = name.trim().split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// Build last-6-months appointment frequency data for LineChart
function buildMonthlyData(appointments) {
  const months = [];
  const labels = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleString('default', { month: 'short' }));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(appointments.filter(a => (a.date || '').startsWith(key)).length);
  }
  return { labels, data: months };
}

// Build appointment status breakdown for PieChart
function buildStatusData(appointments) {
  const counts = { confirmed: 0, pending: 0, completed: 0, cancelled: 0 };
  appointments.forEach(a => { if (a.status in counts) counts[a.status]++; });
  const colors = { confirmed: '#22c55e', pending: '#f59e0b', completed: '#3b82f6', cancelled: '#ef4444' };
  return Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), population: v, color: colors[k], legendFontColor: MedicalColors.textSecondary, legendFontSize: 12 }));
}

const MedicalHomeScreen = ({ navigation }) => {
  const [appointments, setAppointments] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [userName, setUserName] = useState('');
  const [userPhotoURL, setUserPhotoURL] = useState(null);
  const [locationProfile, setLocationProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newBookingDoctor, setNewBookingDoctor] = useState(null);
  const [primaryDoctor, setPrimaryDoctor] = useState(null);
  const [patientStatus, setPatientStatus] = useState('active'); // 'active' | 'discharged'

  // "Tell doctor what's wrong" — for patients who skipped onboarding
  const [showIntakeBtn, setShowIntakeBtn] = useState(false);
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [intakeForm, setIntakeForm] = useState({ complaint: '', duration: '', severity: '', symptoms: '', notes: '' });
  const [submittingIntake, setSubmittingIntake] = useState(false);

  // Daily feeling modal
  const [showFeelingModal, setShowFeelingModal] = useState(false);
  const [feelingForm, setFeelingForm] = useState({ mood: '', painLevel: '', symptoms: '', medications: '', notes: '' });
  const [submittingFeeling, setSubmittingFeeling] = useState(false);

  // Vitals modal
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({ ...EMPTY_VITALS });
  const [submittingVitals, setSubmittingVitals] = useState(false);

  // Quick log dropdown (+ button)
  const [hasLoggedVitals, setHasLoggedVitals] = useState(false);
  const [showLogDropdown, setShowLogDropdown] = useState(false);
  const [latestFeeling, setLatestFeeling] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const name = await AsyncStorage.getItem('userName');
      setUserName(name || 'Patient');

      const currentUser = auth.currentUser;
      // Load patient profile photo: Firebase Auth photoURL or Firestore auth doc
      if (currentUser) {
        const photoFromAuth = currentUser.photoURL;
        if (photoFromAuth) {
          setUserPhotoURL(photoFromAuth);
        } else {
          try {
            const authSnap = await getDoc(doc(db, 'auth', currentUser.uid));
            if (authSnap.exists()) {
              const authData = authSnap.data() || {};
              const pd = authData.photoURL || null;
              if (pd) setUserPhotoURL(pd);
              setLocationProfile(prev => prev || authData);
            }
          } catch (_) {}
        }
      }
      if (currentUser) {
        const clientId = currentUser.uid;
        const [appts, rxs] = await Promise.all([
          fetchClientAppointments(clientId),
          fetchClientPrescriptions(clientId),
        ]);
        setAppointments(appts);
        setPrescriptions(rxs);

        // Fetch patient status + check if vitals already logged
        try {
          const profSnap = await getDoc(doc(db, 'patientProfiles', clientId));
          if (profSnap.exists()) {
            const pd = profSnap.data();
            setLocationProfile(pd);
            setPatientStatus(pd.status || 'active');
            setHasLoggedVitals(!!pd.vitals?.latest);
          }
        } catch (_) {}

        // Load latest daily feeling for pre-fill
        try {
          const feelSnap = await getDocs(query(
            collection(db, 'patientDailyFeelings'),
            where('patientId', '==', clientId)
          ));
          if (!feelSnap.empty) {
            const sorted = feelSnap.docs.map(d => d.data())
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            setLatestFeeling(sorted[0]);
          }
        } catch (_) {}

        // Derive primary doctor from most recent non-cancelled appointment
        const withDoc = appts
          .filter(a => a.doctorId && a.status !== 'cancelled')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (withDoc.length > 0) {
          const pd = {
            id: withDoc[0].doctorId,
            name: withDoc[0].doctorName || 'Doctor',
            spec: withDoc[0].doctorSpecialization || 'Medical Doctor',
            photoURL: null,
          };
          try {
            const drSnap = await getDoc(doc(db, 'doctors', pd.id));
            if (drSnap.exists()) pd.photoURL = drSnap.data().photoURL || null;
          } catch (_) {}
          setPrimaryDoctor(pd);
          await AsyncStorage.removeItem('th.newBookingDoctor');
          setNewBookingDoctor(null);
        } else {
          const cached = await AsyncStorage.getItem('th.newBookingDoctor');
          if (cached) setNewBookingDoctor(JSON.parse(cached));
        }
      }
      // Check if intake button should show
      if (currentUser) {
        try {
          const intakeSnap = await getDoc(doc(db, 'patientIntake', currentUser.uid));
          const intakeDone = await AsyncStorage.getItem('intakeSubmitted');
          setShowIntakeBtn(!intakeSnap.exists() && !intakeDone);
        } catch (_) {}
      }

      // Check daily feeling (show if > 24 hours since last submission)
      try {
        const lastFeeling = await AsyncStorage.getItem('lastDailyFeeling');
        if (!lastFeeling || Date.now() - parseInt(lastFeeling) > 24 * 60 * 60 * 1000) {
          // Delay 2s so screen loads first
          setTimeout(() => setShowFeelingModal(true), 2000);
        }
      } catch (_) {}
    } catch (error) {
      console.error('Error loading medical home data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const submitIntake = async () => {
    if (!intakeForm.complaint.trim()) { Alert.alert('Required', 'Please describe your main complaint.'); return; }
    setSubmittingIntake(true);
    try {
      const uid = auth.currentUser?.uid;
      await setDoc(doc(db, 'patientIntake', uid), {
        ...intakeForm,
        patientId: uid,
        submittedAt: serverTimestamp(),
      });
      await AsyncStorage.setItem('intakeSubmitted', '1');
      setShowIntakeBtn(false);
      setShowIntakeModal(false);
      Alert.alert('Submitted', 'Your doctor has been notified. They will review your complaint soon.');
    } catch { Alert.alert('Error', 'Could not submit. Please try again.'); }
    finally { setSubmittingIntake(false); }
  };

  const submitFeeling = async () => {
    if (!feelingForm.mood) { Alert.alert('Required', 'Please select how you are feeling.'); return; }
    setSubmittingFeeling(true);
    try {
      const uid = auth.currentUser?.uid;
      await addDoc(collection(db, 'patientDailyFeelings'), {
        patientId: uid,
        mood: feelingForm.mood,
        painLevel: parseInt(feelingForm.painLevel) || 0,
        symptoms: feelingForm.symptoms.split(',').map(s => s.trim()).filter(Boolean),
        medications: feelingForm.medications,
        notes: feelingForm.notes,
        createdAt: serverTimestamp(),
      });
      await AsyncStorage.setItem('lastDailyFeeling', String(Date.now()));
      // Update latestFeeling so next open is pre-filled with what was just submitted
      setLatestFeeling({
        mood: feelingForm.mood,
        painLevel: parseInt(feelingForm.painLevel) || 0,
        symptoms: feelingForm.symptoms.split(',').map(s => s.trim()).filter(Boolean),
        medications: feelingForm.medications,
        notes: feelingForm.notes,
      });
      setShowFeelingModal(false);
      setFeelingForm({ mood: '', painLevel: '', symptoms: '', medications: '', notes: '' });
      Alert.alert('Thank you!', 'Your daily check-in has been recorded and shared with your doctor.');
    } catch { Alert.alert('Error', 'Could not submit. Please try again.'); }
    finally { setSubmittingFeeling(false); }
  };

  const submitVitals = async () => {
    const hasData = Object.entries(vitalsForm).some(([k, v]) => k !== 'tempUnit' && v.trim() !== '');
    if (!hasData) { Alert.alert('Required', 'Please enter at least one vital sign.'); return; }
    setSubmittingVitals(true);
    try {
      const uid = auth.currentUser?.uid;
      const payload = {
        bpSystolic: vitalsForm.bpSystolic.trim(),
        bpDiastolic: vitalsForm.bpDiastolic.trim(),
        heartRate: vitalsForm.heartRate.trim(),
        respiratoryRate: vitalsForm.respiratoryRate.trim(),
        spo2: vitalsForm.spo2.trim(),
        temperature: vitalsForm.temperature.trim(),
        tempUnit: vitalsForm.tempUnit,
        recordedAt: serverTimestamp(),
      };
      await setDoc(
        doc(db, 'patientProfiles', uid),
        { vitals: { latest: payload }, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setHasLoggedVitals(true);
      setShowVitalsModal(false);
      setVitalsForm({ ...EMPTY_VITALS });
      Alert.alert('Saved', 'Your vitals have been recorded and shared with your doctor.');
    } catch { Alert.alert('Error', 'Could not save vitals. Please try again.'); }
    finally { setSubmittingVitals(false); }
  };

  const openDailyCheckIn = () => {
    setShowLogDropdown(false);
    if (latestFeeling) {
      setFeelingForm({
        mood: latestFeeling.mood || '',
        painLevel: latestFeeling.painLevel != null ? String(latestFeeling.painLevel) : '',
        symptoms: Array.isArray(latestFeeling.symptoms)
          ? latestFeeling.symptoms.join(', ')
          : (latestFeeling.symptoms || ''),
        medications: latestFeeling.medications || '',
        notes: latestFeeling.notes || '',
      });
    } else {
      setFeelingForm({ mood: '', painLevel: '', symptoms: '', medications: '', notes: '' });
    }
    setShowFeelingModal(true);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const upcomingAppointments = appointments.filter(
    (a) => a.status !== 'completed' && a.status !== 'cancelled'
  );
  const completedCount = appointments.filter((a) => a.status === 'completed').length;

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed': return MedicalColors.success;
      case 'pending': return MedicalColors.warning;
      case 'cancelled': return MedicalColors.error;
      case 'completed': return MedicalColors.textLight;
      default: return MedicalColors.textSecondary;
    }
  };

  // Recent activity: merge appointments + prescriptions, sort by most recent
  const recentActivity = [
    ...appointments.slice(0, 5).map(a => ({
      id: 'appt_' + a.id,
      type: 'appointment',
      title: `Appointment with Dr. ${a.doctorName || 'Doctor'}`,
      subtitle: a.date ? `${a.date}${a.time ? ' at ' + a.time : ''}` : 'Date TBD',
      status: a.status,
      date: a.date || '',
      icon: 'calendar-outline',
      iconColor: MedicalColors.primary,
      iconBg: '#eff6ff',
    })),
    ...prescriptions.slice(0, 5).map(rx => ({
      id: 'rx_' + rx.id,
      type: 'prescription',
      title: rx.medication || rx.medicationName || 'Prescription',
      subtitle: `Dr. ${rx.doctorName || 'Doctor'}${rx.dosage ? ' · ' + rx.dosage : ''}`,
      status: 'active',
      date: rx.date || '',
      icon: 'medkit-outline',
      iconColor: '#059669',
      iconBg: '#f0fdf4',
    })),
  ]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 6);

  const monthlyData = buildMonthlyData(appointments);
  const pieData = buildStatusData(appointments);

  const quickActions = [
    primaryDoctor
      ? { icon: 'calendar-outline', label: 'Book Appt', color: MedicalColors.primary, bg: '#eff6ff', onPress: () => navigation.navigate('MedicalAppointments') }
      : { icon: 'search-outline', label: 'Find Doctor', color: MedicalColors.primary, bg: '#eff6ff', onPress: () => navigation.getParent()?.navigate('DoctorSearch') },
    { icon: 'list-outline', label: 'Appointments', color: MedicalColors.success, bg: '#f0fdf4', onPress: () => navigation.navigate('MedicalAppointments') },
    { icon: 'chatbubbles-outline', label: 'Messages', color: MedicalColors.warning, bg: '#fef3c7', onPress: () => navigation.navigate('MedicalMessages') },
    { icon: 'medkit-outline', label: 'Prescriptions', color: '#059669', bg: '#f0fdf4', onPress: () => navigation.navigate('MedicalPrescriptions') },
    { icon: 'folder-outline', label: 'History', color: MedicalColors.accent, bg: '#f3e8ff', onPress: () => navigation.navigate('MedicalHistory') },
    { icon: 'videocam-outline', label: 'Video Calls', color: '#7c3aed', bg: '#ede9fe', onPress: () => navigation.navigate('MedicalVideo') },
    { icon: 'card-outline', label: 'Billing', color: '#be185d', bg: '#fdf2f8', onPress: () => navigation.navigate('MedicalBilling') },
    { icon: 'shield-checkmark-outline', label: 'Insurance', color: MedicalColors.primary, bg: '#eff6ff', onPress: () => navigation.getParent()?.navigate('InsuranceDetails') },
    { icon: 'call-outline', label: 'Emergency', color: '#ea580c', bg: '#fff7ed', onPress: () => navigation.getParent()?.navigate('EmergencyContact') },
    { icon: 'documents-outline', label: 'Records', color: MedicalColors.success, bg: '#f0fdf4', onPress: () => navigation.getParent()?.navigate('HealthRecords') },
    { icon: 'alert-circle-outline', label: 'Support', color: '#dc2626', bg: '#fef2f2', onPress: () => navigation.getParent()?.navigate('Support') },
    { icon: 'settings-outline', label: 'Settings', color: '#64748b', bg: '#f1f5f9', onPress: () => navigation.navigate('MedicalSettings') },
    { icon: 'medical-outline', label: 'E-Pharmacy', color: '#7c3aed', bg: '#ede9fe', onPress: () => navigation.getParent()?.navigate('EPharmacy') },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={MedicalColors.primary} />
      }
    >
      {/* Welcome Banner */}
      <View style={styles.welcomeCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeGreeting}>Hello, {userName.split(' ')[0]}</Text>
          <Text style={styles.welcomeSubtitle}>How are you feeling today?</Text>
        </View>
        <View style={{ alignItems: 'center', gap: 8 }}>
          {userPhotoURL ? (
            <Image source={{ uri: userPhotoURL }} style={styles.welcomeAvatar} />
          ) : (
            <View style={styles.welcomeAvatarPlaceholder}>
              <Text style={styles.welcomeAvatarInitials}>
                {(userName || 'P')[0].toUpperCase()}
              </Text>
            </View>
          )}
          {/* Patient status badge */}
          <View style={[
            styles.statusBadgeWelcome,
            patientStatus === 'discharged' && styles.statusBadgeDischarged,
          ]}>
            <Ionicons
              name={patientStatus === 'discharged' ? 'close-circle-outline' : 'checkmark-circle-outline'}
              size={13}
              color={patientStatus === 'discharged' ? '#dc2626' : '#16a34a'}
            />
            <Text style={[
              styles.statusBadgeText,
              patientStatus === 'discharged' && { color: '#dc2626' },
            ]}>
              {patientStatus === 'discharged' ? 'Discharged' : 'Active'}
            </Text>
          </View>
          {!primaryDoctor && (
            <TouchableOpacity
              style={styles.findDoctorButton}
              onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
            >
              <Ionicons name="search" size={18} color="#FFFFFF" />
              <Text style={styles.findDoctorText}>Find Doctor</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <LocationSummaryCardMobile profile={locationProfile} onEdit={() => navigation.navigate('MedicalSettings')} />

      {/* Find Doctor CTA Banner */}
      {!primaryDoctor && !newBookingDoctor && (
        <TouchableOpacity
          style={styles.findDoctorBanner}
          onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
          activeOpacity={0.85}
        >
          <View style={styles.fdbIconWrap}>
            <Ionicons name="person-circle-outline" size={30} color={MedicalColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fdbTitle}>You haven't found a doctor yet</Text>
            <Text style={styles.fdbSub}>Tap to search our network of licensed physicians →</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Vitals row — big button (first time only) + always-visible "+" quick log button */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, zIndex: 50 }}>
        {!hasLoggedVitals ? (
          <TouchableOpacity style={[styles.vitalsBtn, { flex: 1, marginBottom: 0 }]} onPress={() => setShowVitalsModal(true)} activeOpacity={0.85}>
            <View style={styles.vitalsBtnIcon}>
              <Ionicons name="pulse" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.vitalsBtnTitle}>Log Your Vitals</Text>
              <Text style={styles.vitalsBtnSub}>Blood pressure, heart rate, SpO2, temperature</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f0fdf4', borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: '#bbf7d0' }}>
            <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d' }}>Vitals logged</Text>
              <Text style={{ fontSize: 11, color: '#86efac', marginTop: 1 }}>Tap + to update your readings</Text>
            </View>
          </View>
        )}

        {/* + Quick Log dropdown button */}
        <View style={{ position: 'relative' }}>
          <TouchableOpacity
            style={styles.plusLogBtn}
            onPress={() => setShowLogDropdown(v => !v)}
            activeOpacity={0.8}
          >
            <Ionicons name={showLogDropdown ? 'close' : 'add'} size={22} color="#fff" />
          </TouchableOpacity>

          {showLogDropdown && (
            <View style={styles.logDropdown}>
              <TouchableOpacity
                style={styles.logDropdownItem}
                onPress={() => { setShowLogDropdown(false); setShowVitalsModal(true); }}
                activeOpacity={0.7}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#fef2f2', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="pulse-outline" size={16} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logDropdownTitle}>Log Vitals</Text>
                  <Text style={styles.logDropdownSub}>Update your readings</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.logDropdownDivider} />

              <TouchableOpacity
                style={styles.logDropdownItem}
                onPress={openDailyCheckIn}
                activeOpacity={0.7}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center' }}>
                  <Ionicons name="happy-outline" size={16} color={MedicalColors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.logDropdownTitle}>Log Daily Check-In</Text>
                  <Text style={styles.logDropdownSub}>{latestFeeling ? 'Pre-filled from last entry' : 'How are you feeling?'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Tell doctor what's wrong — for patients who skipped onboarding */}
      {showIntakeBtn && primaryDoctor && (
        <TouchableOpacity style={styles.intakeBtn} onPress={() => setShowIntakeModal(true)}>
          <View style={styles.intakeBtnIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.intakeBtnTitle}>Tell your doctor what's wrong</Text>
            <Text style={styles.intakeBtnSub}>Let Dr. {primaryDoctor?.name} know your symptoms</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#dc2626" />
        </TouchableOpacity>
      )}

      {/* New booking banner */}
      {newBookingDoctor && (
        <View style={styles.bookingBanner}>
          <View style={styles.bookingBannerAvatar}>
            <Text style={styles.bookingBannerAvatarText}>
              {(newBookingDoctor.doctorName || 'D')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bookingBannerTitle}>
              Appointment booked with Dr. {newBookingDoctor.doctorName}
            </Text>
            {newBookingDoctor.date ? (
              <Text style={styles.bookingBannerSub}>
                {newBookingDoctor.date}{newBookingDoctor.time ? ' at ' + newBookingDoctor.time : ''} · Awaiting confirmation
              </Text>
            ) : null}
          </View>
          <View style={styles.bookingBannerBadge}>
            <Text style={styles.bookingBannerBadgeText}>Pending</Text>
          </View>
        </View>
      )}

      {/* Your Doctor Card */}
      {primaryDoctor && (
        <View style={styles.yourDoctorCard}>
          <View style={styles.ydLabelRow}>
            <Ionicons name="heart" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.ydLabel}>Your Doctor</Text>
          </View>
          <TouchableOpacity
            style={styles.ydBody}
            activeOpacity={0.8}
            onPress={() => navigation.getParent()?.navigate('DoctorDetail', { doctorId: primaryDoctor.id })}
          >
            <View style={styles.ydAvatar}>
              {primaryDoctor.photoURL ? (
                <Image source={{ uri: primaryDoctor.photoURL }} style={{ width: '100%', height: '100%', borderRadius: 24 }} />
              ) : (
                <Text style={styles.ydAvatarText}>{getInitials(primaryDoctor.name)}</Text>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ydName}>Dr. {primaryDoctor.name}</Text>
              <Text style={styles.ydSpec}>{primaryDoctor.spec}</Text>
              <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Tap to view profile →</Text>
            </View>
            <View style={styles.ydActions}>
              <TouchableOpacity
                style={styles.ydBtnPrimary}
                onPress={() => navigation.navigate('MedicalAppointments')}
              >
                <Ionicons name="calendar-outline" size={14} color="#fff" />
                <Text style={styles.ydBtnPrimaryText}>Schedule</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.ydBtnOutline}
                onPress={() => navigation.navigate('MedicalMessages')}
              >
                <Ionicons name="chatbubbles-outline" size={14} color="rgba(255,255,255,0.85)" />
                <Text style={styles.ydBtnOutlineText}>Message</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="calendar-outline" size={24} color={MedicalColors.primary} />
          <Text style={styles.statNumber}>{upcomingAppointments.length}</Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="checkmark-circle-outline" size={24} color={MedicalColors.success} />
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="document-text-outline" size={24} color={MedicalColors.accent} />
          <Text style={styles.statNumber}>{prescriptions.length}</Text>
          <Text style={styles.statLabel}>Prescriptions</Text>
        </View>
      </View>

      {/* Quick Actions — horizontal scrollable row */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.actionsScroll}
        contentContainerStyle={styles.actionsScrollContent}
      >
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.actionCard}
            onPress={action.onPress}
          >
            <View style={[styles.actionIcon, { backgroundColor: action.bg }]}>
              <Ionicons name={action.icon} size={22} color={action.color} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Charts Section */}
    

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Recent Activity</Text>
          <View style={styles.activityCard}>
            {recentActivity.map((item, idx) => (
              <View
                key={item.id}
                style={[styles.activityRow, idx < recentActivity.length - 1 && styles.activityRowBorder]}
              >
                <View style={[styles.activityIcon, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon} size={18} color={item.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.activitySub} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                {item.type === 'appointment' && (
                  <View style={[styles.activityBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                    <Text style={[styles.activityBadgeText, { color: getStatusColor(item.status) }]}>
                      {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Pending'}
                    </Text>
                  </View>
                )}
                {item.type === 'prescription' && (
                  <View style={[styles.activityBadge, { backgroundColor: '#f0fdf4' }]}>
                    <Text style={[styles.activityBadgeText, { color: '#059669' }]}>Active</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </>
      )}

      {/* Upcoming Appointments */}
      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Upcoming Appointments</Text>
      {upcomingAppointments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="calendar-outline" size={40} color={MedicalColors.textLight} />
          <Text style={styles.emptyText}>No upcoming appointments</Text>
          {primaryDoctor ? (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.navigate('MedicalAppointments')}
            >
              <Text style={styles.emptyButtonText}>Book Appointment</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => navigation.getParent()?.navigate('DoctorSearch')}
            >
              <Text style={styles.emptyButtonText}>Find a Doctor</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        upcomingAppointments.slice(0, 3).map((appt) => (
          <View key={appt.id} style={styles.appointmentCard}>
            <View style={styles.apptLeft}>
              <View style={styles.apptAvatar}>
                <Text style={styles.apptAvatarText}>
                  {(appt.doctorName || 'D')[0].toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={styles.apptDoctorName}>Dr. {appt.doctorName}</Text>
                <Text style={styles.apptSpecialty}>{appt.doctorSpecialization || 'Doctor'}</Text>
                <View style={styles.apptDateTime}>
                  <Ionicons name="calendar-outline" size={13} color={MedicalColors.textSecondary} />
                  <Text style={styles.apptDateText}>{appt.date}</Text>
                  <Ionicons name="time-outline" size={13} color={MedicalColors.textSecondary} />
                  <Text style={styles.apptDateText}>{appt.time}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.apptStatusBadge, { backgroundColor: getStatusColor(appt.status) + '20' }]}>
              <Text style={[styles.apptStatusText, { color: getStatusColor(appt.status) }]}>
                {(appt.status || 'pending').charAt(0).toUpperCase() + (appt.status || 'pending').slice(1)}
              </Text>
            </View>
          </View>
        ))
      )}
  {appointments.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Health Overview</Text>

          {/* Line Chart — monthly appointment frequency */}
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Appointments (Last 6 Months)</Text>
            <LineChart
              data={{
                labels: monthlyData.labels,
                datasets: [{ data: monthlyData.data.length > 0 ? monthlyData.data : [0] }],
              }}
              width={SCREEN_WIDTH - 32}
              height={180}
              chartConfig={{
                backgroundColor: MedicalColors.surface,
                backgroundGradientFrom: MedicalColors.surface,
                backgroundGradientTo: MedicalColors.surface,
                decimalPlaces: 0,
                color: (opacity = 1) => `rgba(30, 107, 184, ${opacity})`,
                labelColor: () => MedicalColors.textSecondary,
                style: { borderRadius: 12 },
                propsForDots: { r: '4', strokeWidth: '2', stroke: MedicalColors.primary },
              }}
              bezier
              style={styles.chart}
            />
          </View>

          {/* Pie Chart — appointment status breakdown */}
          {pieData.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Appointment Status Breakdown</Text>
              <PieChart
                data={pieData}
                width={SCREEN_WIDTH - 32}
                height={180}
                chartConfig={{
                  color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
                }}
                accessor="population"
                backgroundColor="transparent"
                paddingLeft="16"
                absolute
              />
            </View>
          )}
        </>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>

    {/* Intake Modal — Tell doctor what's wrong */}
    <Modal visible={showIntakeModal} transparent animationType="slide" onRequestClose={() => setShowIntakeModal(false)}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={[styles.modalCard, { height: '88%' }]}>
          {/* Fixed header */}
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#dc2626" />
            <Text style={styles.modalTitle}>Tell Your Doctor What's Wrong</Text>
            <TouchableOpacity onPress={() => setShowIntakeModal(false)} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.modalSub, { flexShrink: 0 }]}>Describe your symptoms so Dr. {primaryDoctor?.name} can prepare for your visit.</Text>

          {/* Scrollable fields */}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {[
              { key: 'complaint', label: 'Main Complaint *', placeholder: 'e.g. Chest pain, headache, fatigue...', multiline: true },
              { key: 'duration', label: 'How long?', placeholder: 'e.g. 3 days, 2 weeks...' },
              { key: 'severity', label: 'Severity (1–10)', placeholder: 'e.g. 7', keyboardType: 'numeric' },
              { key: 'symptoms', label: 'Other Symptoms', placeholder: 'e.g. Nausea, dizziness...', multiline: true },
              { key: 'notes', label: 'Additional Notes', placeholder: 'Anything else your doctor should know...', multiline: true },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 12 }}>
                <Text style={styles.modalFieldLabel}>{f.label}</Text>
                <TextInput
                  style={[styles.modalInput, f.multiline && { minHeight: 70, textAlignVertical: 'top' }]}
                  value={intakeForm[f.key]}
                  onChangeText={v => setIntakeForm(p => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor="#94a3b8"
                  multiline={f.multiline}
                  keyboardType={f.keyboardType || 'default'}
                />
              </View>
            ))}
            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Fixed submit button */}
          <TouchableOpacity
            style={[styles.modalSubmitBtn, { marginTop: 12, flex: 0 }, submittingIntake && { opacity: 0.6 }]}
            onPress={submitIntake}
            disabled={submittingIntake}
          >
            {submittingIntake ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>Submit to Doctor</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Vitals Modal */}
    <Modal visible={showVitalsModal} transparent animationType="slide" onRequestClose={() => setShowVitalsModal(false)}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}>
        <View style={[styles.modalCard, { height: '88%' }]}>
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="pulse" size={20} color="#dc2626" />
            <Text style={[styles.modalTitle, { color: '#dc2626' }]}>  Log Vitals</Text>
            <TouchableOpacity onPress={() => setShowVitalsModal(false)} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.modalSub, { flexShrink: 0 }]}>Your readings will be shared with your doctor.</Text>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Blood Pressure */}
            <Text style={[styles.modalFieldLabel, { marginTop: 10, color: '#dc2626', fontWeight: '700' }]}>Blood Pressure</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalFieldLabel}>Systolic (mmHg)</Text>
                <TextInput style={styles.modalInput} placeholder="120" placeholderTextColor="#94a3b8" keyboardType="numeric" value={vitalsForm.bpSystolic} onChangeText={v => setVitalsForm(p => ({ ...p, bpSystolic: v }))} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalFieldLabel}>Diastolic (mmHg)</Text>
                <TextInput style={styles.modalInput} placeholder="80" placeholderTextColor="#94a3b8" keyboardType="numeric" value={vitalsForm.bpDiastolic} onChangeText={v => setVitalsForm(p => ({ ...p, bpDiastolic: v }))} />
              </View>
            </View>

            <Text style={styles.modalFieldLabel}>Heart Rate (bpm)</Text>
            <TextInput style={styles.modalInput} placeholder="72" placeholderTextColor="#94a3b8" keyboardType="numeric" value={vitalsForm.heartRate} onChangeText={v => setVitalsForm(p => ({ ...p, heartRate: v }))} />

            <Text style={styles.modalFieldLabel}>Respiratory Rate (breaths/min)</Text>
            <TextInput style={styles.modalInput} placeholder="16" placeholderTextColor="#94a3b8" keyboardType="numeric" value={vitalsForm.respiratoryRate} onChangeText={v => setVitalsForm(p => ({ ...p, respiratoryRate: v }))} />

            <Text style={styles.modalFieldLabel}>Oxygen Saturation / SpO2 (%)</Text>
            <TextInput style={styles.modalInput} placeholder="98" placeholderTextColor="#94a3b8" keyboardType="numeric" value={vitalsForm.spo2} onChangeText={v => setVitalsForm(p => ({ ...p, spo2: v }))} />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
              <Text style={styles.modalFieldLabel}>Temperature</Text>
              <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' }}>
                {['C', 'F'].map(u => (
                  <TouchableOpacity key={u} style={[{ paddingVertical: 4, paddingHorizontal: 12 }, vitalsForm.tempUnit === u && { backgroundColor: '#dc2626' }]} onPress={() => setVitalsForm(p => ({ ...p, tempUnit: u }))}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: vitalsForm.tempUnit === u ? '#fff' : '#94a3b8' }}>°{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TextInput style={styles.modalInput} placeholder={vitalsForm.tempUnit === 'C' ? '37.2' : '98.9'} placeholderTextColor="#94a3b8" keyboardType="decimal-pad" value={vitalsForm.temperature} onChangeText={v => setVitalsForm(p => ({ ...p, temperature: v }))} />
            <View style={{ height: 8 }} />
          </ScrollView>

          <TouchableOpacity style={[styles.modalSubmitBtn, { backgroundColor: '#dc2626', marginTop: 12, flex: 0 }, submittingVitals && { opacity: 0.6 }]} onPress={submitVitals} disabled={submittingVitals}>
            {submittingVitals ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>Save Vitals</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {/* Daily Feeling Modal */}
    <Modal visible={showFeelingModal} transparent animationType="slide" onRequestClose={() => setShowFeelingModal(false)}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <View style={[styles.modalCard, { height: '90%' }]}>
          {/* Fixed header */}
          <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="happy-outline" size={20} color={MedicalColors.primary} />
            <Text style={styles.modalTitle}>Daily Check-In</Text>
            <TouchableOpacity onPress={() => setShowFeelingModal(false)} style={{ marginLeft: 'auto' }}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.modalSub, { flexShrink: 0 }]}>
            {latestFeeling ? 'Pre-filled from your last check-in — update and submit a new entry.' : 'Tell your doctor how you\'re feeling today.'}
          </Text>

          {/* Scrollable fields */}
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Mood selector */}
            <Text style={styles.modalFieldLabel}>How are you feeling? *</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {['Great', 'Good', 'Okay', 'Poor', 'Bad'].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.moodChip, feelingForm.mood === m && styles.moodChipActive]}
                  onPress={() => setFeelingForm(p => ({ ...p, mood: m }))}
                >
                  <Text style={[styles.moodChipText, feelingForm.mood === m && styles.moodChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {[
              { key: 'painLevel', label: 'Pain Level (0–10)', placeholder: '0 = no pain, 10 = severe', keyboardType: 'numeric' },
              { key: 'symptoms', label: 'Symptoms Today', placeholder: 'e.g. Headache, nausea (comma-separated)' },
              { key: 'medications', label: 'Medications Taken Today', placeholder: 'e.g. Amoxicillin 500mg' },
              { key: 'notes', label: 'Additional Notes', placeholder: 'Any other concerns for your doctor...', multiline: true },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 10 }}>
                <Text style={styles.modalFieldLabel}>{f.label}</Text>
                <TextInput
                  style={[styles.modalInput, f.multiline && { minHeight: 60, textAlignVertical: 'top' }]}
                  value={feelingForm[f.key]}
                  onChangeText={v => setFeelingForm(p => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor="#94a3b8"
                  multiline={f.multiline}
                  keyboardType={f.keyboardType || 'default'}
                />
              </View>
            ))}
            <View style={{ height: 8 }} />
          </ScrollView>

          {/* Fixed action buttons */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[styles.modalSkipBtn]} onPress={() => setShowFeelingModal(false)}>
              <Text style={styles.modalSkipText}>Skip for Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSubmitBtn, { flex: 2 }, submittingFeeling && { opacity: 0.6 }]}
              onPress={submitFeeling}
              disabled={submittingFeeling}
            >
              {submittingFeeling ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSubmitText}>Submit Check-In</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MedicalColors.background,
  },

  /* Welcome */
  welcomeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MedicalColors.primary,
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
  },
  welcomeGreeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  welcomeAvatar: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  welcomeAvatarPlaceholder: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  welcomeAvatarInitials: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statusBadgeWelcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeDischarged: {
    backgroundColor: 'rgba(254,226,226,0.95)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16a34a',
  },
  findDoctorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  findDoctorText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  /* Find Doctor Banner */
  findDoctorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  fdbIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  fdbTitle: {
    fontWeight: '700',
    color: '#1e3a5f',
    fontSize: 14,
    marginBottom: 3,
  },
  fdbSub: {
    fontSize: 12,
    color: '#3b82f6',
    lineHeight: 17,
  },

  /* Booking Banner */
  bookingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  bookingBannerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: MedicalColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  bookingBannerAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  bookingBannerTitle: {
    fontWeight: '700',
    color: '#1e3a5f',
    fontSize: 14,
    marginBottom: 2,
  },
  bookingBannerSub: {
    fontSize: 12,
    color: '#2563eb',
  },
  bookingBannerBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  bookingBannerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },

  /* Your Doctor Card */
  yourDoctorCard: {
    backgroundColor: MedicalColors.primary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  ydLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  ydLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
  },
  ydBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ydAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  ydAvatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
  },
  ydName: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
    marginBottom: 2,
  },
  ydSpec: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  ydActions: {
    gap: 6,
    alignItems: 'flex-end',
  },
  ydBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  ydBtnPrimaryText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  ydBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  ydBtnOutlineText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
  },

  /* Stats */
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: MedicalColors.text,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: MedicalColors.textSecondary,
    marginTop: 2,
  },

  /* Section title */
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 12,
  },

  /* Quick Actions — horizontal scroll */
  actionsScroll: {
    marginBottom: 24,
    marginHorizontal: -16,
  },
  actionsScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  actionCard: {
    width: 76,
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 7,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: MedicalColors.text,
    textAlign: 'center',
  },

  /* Charts */
  chartCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  chartTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MedicalColors.textSecondary,
    marginBottom: 12,
  },
  chart: {
    borderRadius: 10,
  },

  /* Recent Activity */
  activityCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.text,
    marginBottom: 2,
  },
  activitySub: {
    fontSize: 11,
    color: MedicalColors.textSecondary,
  },
  activityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  activityBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },

  /* Empty */
  emptyCard: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  emptyText: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
    marginTop: 12,
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: MedicalColors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },

  /* Appointment Cards */
  appointmentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  apptLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  apptAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  apptAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  apptDoctorName: {
    fontSize: 15,
    fontWeight: '600',
    color: MedicalColors.text,
  },
  apptSpecialty: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    marginBottom: 4,
  },
  apptDateTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  apptDateText: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    marginRight: 6,
  },
  apptStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  apptStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Intake button
  vitalsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#dc2626', borderRadius: 14, padding: 14, marginBottom: 12,
  },
  vitalsBtnIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  vitalsBtnTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  vitalsBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  intakeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#fca5a5',
  },
  intakeBtnIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff1f2',
    justifyContent: 'center', alignItems: 'center',
  },
  intakeBtnTitle: { fontSize: 14, fontWeight: '700', color: '#dc2626' },
  intakeBtnSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '90%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginLeft: 8 },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 },
  modalFieldLabel: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 5 },
  modalInput: {
    backgroundColor: '#f8fafc', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1e293b', borderWidth: 1, borderColor: '#e2e8f0',
  },
  modalSubmitBtn: {
    flex: 1, backgroundColor: MedicalColors.primary, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  modalSubmitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  modalSkipBtn: {
    flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  modalSkipText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  // Mood chips
  moodChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0',
  },
  moodChipActive: { backgroundColor: MedicalColors.primary, borderColor: MedicalColors.primary },
  moodChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  moodChipTextActive: { color: '#fff' },

  // Quick log "+" button + dropdown
  plusLogBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#dc2626',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
  },
  logDropdown: {
    position: 'absolute',
    top: 52,
    right: 0,
    width: 210,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
    zIndex: 200,
  },
  logDropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  logDropdownTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  logDropdownSub: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  logDropdownDivider: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 14 },
});

export default MedicalHomeScreen;
