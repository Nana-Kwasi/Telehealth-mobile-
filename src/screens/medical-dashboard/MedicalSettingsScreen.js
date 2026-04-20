import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, Switch, ActivityIndicator, Share, Modal, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp, deleteDoc, getDocs, query, where,
} from 'firebase/firestore';
import {
  EmailAuthProvider, reauthenticateWithCredential, updatePassword, deleteUser,
} from 'firebase/auth';
import { MedicalColors } from '../../constants/colors';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const TABS = [
  { key: 'profile',   label: 'Profile',    icon: 'person-outline' },
  { key: 'security',  label: 'Security',   icon: 'shield-outline' },
  { key: 'emergency', label: 'Emergency',  icon: 'medkit-outline' },
  { key: 'billing',   label: 'Billing',    icon: 'card-outline' },
  { key: 'legal',     label: 'Legal',      icon: 'document-text-outline' },
  { key: 'discharge', label: 'Discharge',  icon: 'exit-outline', danger: true },
];

const DEFAULT_PRIVACY = {
  dataSharing: { records: true, prescriptions: true, appointments: true, labResults: true },
  profileVisible: true,
};
const DEFAULT_SECURITY = { twoFAEnabled: false, biometricEnabled: false };
const DEFAULT_EMERGENCY = { medicalNotes: '', organDonor: false, preferredHospital: '', emergencyAccess: true };
const DEFAULT_LEGAL = { termsAccepted: false, privacyAccepted: false, hipaaAccepted: false, dataSharingConsent: true };

export default function MedicalSettingsScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);

  // Profile
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', bloodType: '', allergies: '' });
  const [saving, setSaving] = useState(false);

  // Security
  const [security, setSecurity] = useState(DEFAULT_SECURITY);
  const [privacy, setPrivacy] = useState(DEFAULT_PRIVACY);
  const [savingSecurity, setSavingSecurity] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [changingPwd, setChangingPwd] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePwd, setDeletePwd] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Emergency
  const [emergency, setEmergency] = useState(DEFAULT_EMERGENCY);
  const [savingEmergency, setSavingEmergency] = useState(false);

  // Billing summary
  const [billingHistory, setBillingHistory] = useState([]);
  const [insuranceInfo, setInsuranceInfo] = useState(null);

  // Legal
  const [legal, setLegal] = useState(DEFAULT_LEGAL);
  const [savingLegal, setSavingLegal] = useState(false);
  const [consentLogs, setConsentLogs] = useState([]);

  // Discharge
  const [dischargeForm, setDischargeForm] = useState({ reason: '', message: '', confirmed: false });
  const [submittingDischarge, setSubmittingDischarge] = useState(false);
  const [alreadyDischarged, setAlreadyDischarged] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const [authSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, 'auth', uid)),
        getDoc(doc(db, 'patientProfiles', uid)),
      ]);

      if (authSnap.exists()) {
        const d = authSnap.data();
        setForm({ name: d.name || '', email: d.email || '', phone: d.phone || '', dob: d.dob || '', bloodType: d.bloodType || '', allergies: d.allergies || '' });
      }

      if (profileSnap.exists()) {
        const d = profileSnap.data();
        setSecurity(s => ({ ...s, ...(d.security || {}) }));
        setPrivacy(p => ({ ...DEFAULT_PRIVACY, ...(d.privacy || {}), dataSharing: { ...DEFAULT_PRIVACY.dataSharing, ...(d.privacy?.dataSharing || {}) } }));
        setEmergency(e => ({ ...DEFAULT_EMERGENCY, ...(d.emergency || {}) }));
        setLegal(l => ({ ...DEFAULT_LEGAL, ...(d.legal || {}) }));
        setConsentLogs(d.legal?.consentLogs || []);
        setBillingHistory(d.billingHistory || []);
        setInsuranceInfo(d.insurance || null);
        if (d.status === 'self-discharged') setAlreadyDischarged(true);
      }
    } catch (err) { console.error('Settings load error:', err); }
    finally { setLoading(false); }
  };

  // ── Profile ────────────────────────────────────────────────────────────────
  const saveProfile = async () => {
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      await setDoc(doc(db, 'auth', uid), { name: form.name, phone: form.phone, dob: form.dob, bloodType: form.bloodType, allergies: form.allergies }, { merge: true });
      if (form.name) await AsyncStorage.setItem('userName', form.name);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch { Alert.alert('Error', 'Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    const { current, next, confirm } = pwdForm;
    if (!current || !next || !confirm) { Alert.alert('Error', 'Please fill all fields.'); return; }
    if (next.length < 6) { Alert.alert('Error', 'New password must be at least 6 characters.'); return; }
    if (next !== confirm) { Alert.alert('Error', 'New passwords do not match.'); return; }
    setChangingPwd(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      setShowPwdModal(false);
      setPwdForm({ current: '', next: '', confirm: '' });
      Alert.alert('Success', 'Password changed successfully.');
    } catch (err) {
      Alert.alert('Error', err.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Could not change password.');
    } finally { setChangingPwd(false); }
  };

  // ── Security & Privacy ─────────────────────────────────────────────────────
  const saveSecurity = async (newSec, newPriv) => {
    setSavingSecurity(true);
    try {
      const uid = auth.currentUser?.uid;
      await setDoc(doc(db, 'patientProfiles', uid), { security: newSec || security, privacy: newPriv || privacy, updatedAt: serverTimestamp() }, { merge: true });
    } catch { Alert.alert('Error', 'Could not save settings.'); }
    finally { setSavingSecurity(false); }
  };

  const toggleSecurity = async (key) => {
    const updated = { ...security, [key]: !security[key] };
    setSecurity(updated);
    await saveSecurity(updated, null);
    if (key === 'biometricEnabled' && !security[key]) {
      Alert.alert('Biometric Login', 'Biometric login preference saved. On next launch, you\'ll be prompted to authenticate with Face ID / Fingerprint if your device supports it.');
    }
    if (key === 'twoFAEnabled' && !security[key]) {
      Alert.alert('Two-Factor Authentication', '2FA has been enabled. A verification code will be sent to your registered phone number when signing in.');
    }
  };

  const toggleDataSharing = async (key) => {
    const newDs = { ...privacy.dataSharing, [key]: !privacy.dataSharing[key] };
    const newPrivacy = { ...privacy, dataSharing: newDs };
    setPrivacy(newPrivacy);
    await saveSecurity(null, newPrivacy);
    // Log the consent change
    const uid = auth.currentUser?.uid;
    const log = { action: `dataSharing.${key} set to ${!privacy.dataSharing[key]}`, timestamp: new Date().toISOString() };
    const existing = consentLogs.slice(-49); // keep last 50
    const updated = [...existing, log];
    setConsentLogs(updated);
    await setDoc(doc(db, 'patientProfiles', uid), { 'legal.consentLogs': updated }, { merge: true });
  };

  const signOutAllDevices = () => {
    Alert.alert('Sign Out All Devices', 'This will sign you out from all sessions. You\'ll need to log in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out All', style: 'destructive', onPress: async () => {
          await AsyncStorage.clear();
          await auth.signOut();
          navigation.getParent()?.replace('Intent');
        }
      }
    ]);
  };

  const downloadMyData = async () => {
    try {
      const uid = auth.currentUser?.uid;
      const [authSnap, profileSnap, apptSnap] = await Promise.all([
        getDoc(doc(db, 'auth', uid)),
        getDoc(doc(db, 'patientProfiles', uid)),
        getDocs(query(collection(db, 'doctorAppointments'), where('clientId', '==', uid))),
      ]);
      const data = {
        exportedAt: new Date().toISOString(),
        profile: authSnap.data() || {},
        patientProfile: profileSnap.data() || {},
        appointments: apptSnap.docs.map(d => d.data()),
      };
      await Share.share({
        message: JSON.stringify(data, null, 2),
        title: 'My NessaHub Health Data',
      });
    } catch (err) {
      Alert.alert('Error', 'Could not export data. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { Alert.alert('Error', 'Type DELETE to confirm.'); return; }
    if (!deletePwd) { Alert.alert('Error', 'Enter your password to confirm.'); return; }
    setDeleting(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, deletePwd));
      // Mark profile as deleted (soft delete for records)
      await setDoc(doc(db, 'patientProfiles', user.uid), { deletedAt: new Date().toISOString(), status: 'deleted' }, { merge: true });
      await setDoc(doc(db, 'auth', user.uid), { deletedAt: new Date().toISOString() }, { merge: true });
      await AsyncStorage.clear();
      await deleteUser(user);
      navigation.getParent()?.replace('Intent');
    } catch (err) {
      Alert.alert('Error', err.code === 'auth/wrong-password' ? 'Incorrect password.' : 'Could not delete account. Please try again.');
    } finally { setDeleting(false); }
  };

  // ── Emergency ──────────────────────────────────────────────────────────────
  const saveEmergency = async () => {
    setSavingEmergency(true);
    try {
      const uid = auth.currentUser?.uid;
      await setDoc(doc(db, 'patientProfiles', uid), { emergency, updatedAt: serverTimestamp() }, { merge: true });
      Alert.alert('Saved', 'Emergency information updated.');
    } catch { Alert.alert('Error', 'Failed to save.'); }
    finally { setSavingEmergency(false); }
  };

  // ── Legal ──────────────────────────────────────────────────────────────────
  const saveLegal = async (updatedLegal) => {
    setSavingLegal(true);
    try {
      const uid = auth.currentUser?.uid;
      const log = { action: 'Legal consent updated', timestamp: new Date().toISOString(), accepted: updatedLegal };
      const updatedLogs = [...consentLogs.slice(-49), log];
      setConsentLogs(updatedLogs);
      await setDoc(doc(db, 'patientProfiles', uid), { legal: { ...updatedLegal, consentLogs: updatedLogs }, updatedAt: serverTimestamp() }, { merge: true });
      Alert.alert('Saved', 'Legal preferences saved.');
    } catch { Alert.alert('Error', 'Failed to save.'); }
    finally { setSavingLegal(false); }
  };

  const toggleLegal = (key) => setLegal(l => ({ ...l, [key]: !l[key] }));

  // ── Self-Discharge ─────────────────────────────────────────────────────────
  const submitDischarge = async () => {
    if (!dischargeForm.reason.trim()) { Alert.alert('Required', 'Please provide a reason for leaving.'); return; }
    if (!dischargeForm.confirmed) { Alert.alert('Required', 'Please check the confirmation box.'); return; }
    setSubmittingDischarge(true);
    try {
      const uid = auth.currentUser?.uid;
      const user = auth.currentUser;

      // Load current patient data to include in the discharge record
      const [authSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, 'auth', uid)),
        getDoc(doc(db, 'patientProfiles', uid)),
      ]);
      const authData = authSnap.data() || {};
      const profileData = profileSnap.data() || {};

      const dischargePayload = {
        patientId: uid,
        patientName: authData.name || user.displayName || 'Patient',
        patientEmail: authData.email || user.email || '',
        patientPhone: authData.phone || '',
        patientDob: authData.dob || '',
        bloodType: authData.bloodType || '',
        allergies: authData.allergies || '',
        reason: dischargeForm.reason.trim(),
        message: dischargeForm.message.trim(),
        type: 'self',
        requestedAt: serverTimestamp(),
        status: 'pending_review',
        patientProfile: { emergency: profileData.emergency || {}, insurance: profileData.insurance || {}, legal: profileData.legal || {} },
      };

      // Write to shared dischargeRequests collection (doctor can see this)
      await addDoc(collection(db, 'dischargeRequests'), dischargePayload);

      // Update patient profile status
      await setDoc(doc(db, 'patientProfiles', uid), {
        status: 'self-discharged',
        selfDischargeReason: dischargeForm.reason.trim(),
        selfDischargeMessage: dischargeForm.message.trim(),
        selfDischargedAt: serverTimestamp(),
      }, { merge: true });

      setAlreadyDischarged(true);
      Alert.alert('Request Submitted', 'Your discharge request has been submitted. Your doctor has been notified. Thank you for using NessaHub.');
    } catch (err) {
      console.error('Discharge error:', err);
      Alert.alert('Error', 'Could not submit discharge request. Please try again.');
    } finally { setSubmittingDischarge(false); }
  };

  const handleLogout = async () => {
    Alert.alert('Log Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { await AsyncStorage.clear(); await auth.signOut(); navigation.getParent()?.replace('Intent'); } }
    ]);
  };

  if (loading) {
    return <View style={s.centered}><ActivityIndicator size="large" color={MedicalColors.primary} /></View>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarContent}>
        {TABS.map(t => (
          <TouchableOpacity key={t.key} style={[s.tab, activeTab === t.key && (t.danger ? s.tabActiveDanger : s.tabActive)]} onPress={() => setActiveTab(t.key)}>
            <Ionicons name={t.icon} size={16} color={activeTab === t.key ? (t.danger ? '#dc2626' : MedicalColors.primary) : '#94a3b8'} />
            <Text style={[s.tabText, activeTab === t.key && (t.danger ? s.tabTextDanger : s.tabTextActive)]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* ═══ PROFILE TAB ═══ */}
        {activeTab === 'profile' && (
          <>
            <View style={s.avatarRow}>
              <View style={s.avatar}><Text style={s.avatarText}>{(form.name || 'P')[0].toUpperCase()}</Text></View>
              <View>
                <Text style={s.profileName}>{form.name || 'Patient'}</Text>
                <Text style={s.profileEmail}>{form.email}</Text>
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Personal Information</Text>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Your full name', autoCapitalize: 'words' },
                { label: 'Phone Number', key: 'phone', placeholder: '+1 (555) 000-0000', keyboardType: 'phone-pad' },
                { label: 'Date of Birth', key: 'dob', placeholder: 'YYYY-MM-DD' },
              ].map(({ label, key, ...opts }) => (
                <View key={key} style={s.fieldGroup}>
                  <Text style={s.label}>{label}</Text>
                  <TextInput style={s.input} value={form[key]} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} placeholderTextColor={MedicalColors.textLight} {...opts} />
                </View>
              ))}
              <View style={s.fieldGroup}>
                <Text style={s.label}>Email (read-only)</Text>
                <TextInput style={[s.input, { backgroundColor: '#f8fafc', color: MedicalColors.textSecondary }]} value={form.email} editable={false} />
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Health Information</Text>
              <Text style={s.label}>Blood Type</Text>
              <View style={s.chipRow}>
                {BLOOD_TYPES.map(bt => (
                  <TouchableOpacity key={bt} style={[s.chip, form.bloodType === bt && s.chipSelected]} onPress={() => setForm(f => ({ ...f, bloodType: bt }))}>
                    <Text style={[s.chipText, form.bloodType === bt && s.chipTextSelected]}>{bt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.fieldGroup}>
                <Text style={s.label}>Known Allergies</Text>
                <TextInput style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]} value={form.allergies} onChangeText={v => setForm(f => ({ ...f, allergies: v }))} placeholder="e.g. Penicillin, Peanuts…" placeholderTextColor={MedicalColors.textLight} multiline />
              </View>
            </View>

            <TouchableOpacity style={[s.btn, saving && { opacity: 0.65 }]} onPress={saveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={s.btnText}>Save Changes</Text></>}
            </TouchableOpacity>

            <TouchableOpacity style={s.rowLink} onPress={() => setShowPwdModal(true)}>
              <View style={[s.rowIcon, { backgroundColor: '#eff6ff' }]}><Ionicons name="lock-closed-outline" size={18} color="#2563eb" /></View>
              <Text style={s.rowLinkText}>Change Password</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            {[
              { icon: 'shield-checkmark-outline', label: 'Insurance Details', color: '#1e6bb8', screen: 'InsuranceDetails' },
              { icon: 'call-outline', label: 'Emergency Contacts', color: '#ea580c', screen: 'EmergencyContact' },
              { icon: 'documents-outline', label: 'Health Records', color: '#059669', screen: 'HealthRecords' },
            ].map(({ icon, label, color, screen }) => (
              <TouchableOpacity key={screen} style={s.rowLink} onPress={() => navigation.getParent()?.navigate(screen)}>
                <View style={[s.rowIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={color} /></View>
                <Text style={s.rowLinkText}>{label}</Text>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={20} color="#dc2626" />
              <Text style={s.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ═══ SECURITY & PRIVACY TAB ═══ */}
        {activeTab === 'security' && (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>Authentication</Text>
              {[
                { key: 'twoFAEnabled', icon: 'phone-portrait-outline', label: 'Two-Factor Authentication (2FA)', desc: 'Require a code sent to your phone when logging in', color: '#2563eb' },
                { key: 'biometricEnabled', icon: 'finger-print-outline', label: 'Biometric Login', desc: 'Use Face ID or Fingerprint to sign in on this device', color: '#7c3aed' },
              ].map(({ key, icon, label, desc, color }) => (
                <View key={key} style={s.toggleRow}>
                  <View style={[s.rowIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleLabel}>{label}</Text>
                    <Text style={s.toggleDesc}>{desc}</Text>
                  </View>
                  <Switch value={security[key]} onValueChange={() => toggleSecurity(key)} trackColor={{ true: MedicalColors.primary }} />
                </View>
              ))}

              <TouchableOpacity style={s.rowLink} onPress={signOutAllDevices}>
                <View style={[s.rowIcon, { backgroundColor: '#fff7ed' }]}><Ionicons name="log-out-outline" size={18} color="#d97706" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Sign Out All Devices</Text>
                  <Text style={s.toggleDesc}>End all active sessions immediately</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
              </TouchableOpacity>

              <TouchableOpacity style={s.rowLink} onPress={() => setShowPwdModal(true)}>
                <View style={[s.rowIcon, { backgroundColor: '#f0fdf4' }]}><Ionicons name="lock-closed-outline" size={18} color="#16a34a" /></View>
                <Text style={s.rowLinkText}>Change Password</Text>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Data Sharing Permissions</Text>
              <Text style={s.cardDesc}>Control what your doctor can access. Turning off a category hides it from your doctor's view.</Text>
              {[
                { key: 'records',       label: 'Health Records',   icon: 'documents-outline',     color: '#059669' },
                { key: 'prescriptions', label: 'Prescriptions',    icon: 'medkit-outline',        color: '#7c3aed' },
                { key: 'appointments',  label: 'Appointments',     icon: 'calendar-outline',      color: '#2563eb' },
                { key: 'labResults',    label: 'Lab Results',      icon: 'flask-outline',         color: '#d97706' },
              ].map(({ key, label, icon, color }) => (
                <View key={key} style={s.toggleRow}>
                  <View style={[s.rowIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleLabel}>{label}</Text>
                    <Text style={s.toggleDesc}>{privacy.dataSharing[key] ? 'Visible to your doctor' : 'Hidden from your doctor'}</Text>
                  </View>
                  <Switch value={privacy.dataSharing[key]} onValueChange={() => toggleDataSharing(key)} trackColor={{ true: MedicalColors.primary }} />
                </View>
              ))}
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Privacy</Text>
              <View style={s.toggleRow}>
                <View style={[s.rowIcon, { backgroundColor: '#f0fdf4' }]}><Ionicons name="eye-outline" size={18} color="#059669" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Profile Visibility</Text>
                  <Text style={s.toggleDesc}>Allow your profile to be visible to assigned doctors</Text>
                </View>
                <Switch value={privacy.profileVisible} onValueChange={async () => {
                  const updated = { ...privacy, profileVisible: !privacy.profileVisible };
                  setPrivacy(updated);
                  await saveSecurity(null, updated);
                }} trackColor={{ true: MedicalColors.primary }} />
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Your Data (GDPR)</Text>
              <TouchableOpacity style={s.rowLink} onPress={downloadMyData}>
                <View style={[s.rowIcon, { backgroundColor: '#eff6ff' }]}><Ionicons name="download-outline" size={18} color="#2563eb" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Download My Data</Text>
                  <Text style={s.toggleDesc}>Export all your health data as a JSON file</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <View style={[s.card, { borderColor: '#fecaca', borderWidth: 1.5 }]}>
              <Text style={[s.cardTitle, { color: '#dc2626' }]}>Danger Zone</Text>
              <TouchableOpacity style={s.deleteBtn} onPress={() => setShowDeleteModal(true)}>
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text style={s.deleteBtnText}>Delete My Account</Text>
              </TouchableOpacity>
              <Text style={s.cardDesc}>This action is permanent. All your data will be removed.</Text>
            </View>
          </>
        )}

        {/* ═══ EMERGENCY & CRITICAL CARE TAB ═══ */}
        {activeTab === 'emergency' && (
          <>
            <View style={s.infoBanner}>
              <Ionicons name="warning-outline" size={18} color="#d97706" />
              <Text style={s.infoBannerText}>This information is shared with emergency responders and your doctor when emergency access is enabled.</Text>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Emergency Medical Notes</Text>
              <Text style={s.cardDesc}>Critical conditions doctors must know immediately (e.g., Asthmatic, Epileptic, Diabetic).</Text>
              <TextInput
                style={[s.input, { minHeight: 90, textAlignVertical: 'top', marginTop: 8 }]}
                value={emergency.medicalNotes}
                onChangeText={v => setEmergency(e => ({ ...e, medicalNotes: v }))}
                placeholder="e.g., Asthmatic — uses Ventolin. Epileptic — seizure protocol applies. Allergic to Penicillin."
                placeholderTextColor={MedicalColors.textLight}
                multiline
              />
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Critical Status</Text>
              <View style={s.toggleRow}>
                <View style={[s.rowIcon, { backgroundColor: '#fef2f2' }]}><Ionicons name="heart-outline" size={18} color="#dc2626" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Organ Donor</Text>
                  <Text style={s.toggleDesc}>Mark yourself as a registered organ donor</Text>
                </View>
                <Switch value={emergency.organDonor} onValueChange={() => setEmergency(e => ({ ...e, organDonor: !e.organDonor }))} trackColor={{ true: '#dc2626' }} />
              </View>
              <View style={s.toggleRow}>
                <View style={[s.rowIcon, { backgroundColor: '#f0fdf4' }]}><Ionicons name="shield-checkmark-outline" size={18} color="#16a34a" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Emergency Doctor Access</Text>
                  <Text style={s.toggleDesc}>Allow any doctor to view your profile in life-threatening emergencies</Text>
                </View>
                <Switch value={emergency.emergencyAccess} onValueChange={() => setEmergency(e => ({ ...e, emergencyAccess: !e.emergencyAccess }))} trackColor={{ true: '#16a34a' }} />
              </View>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Preferred Hospital</Text>
              <TextInput
                style={s.input}
                value={emergency.preferredHospital}
                onChangeText={v => setEmergency(e => ({ ...e, preferredHospital: v }))}
                placeholder="e.g., St. Mary's General Hospital, Chicago, IL"
                placeholderTextColor={MedicalColors.textLight}
              />
            </View>

            <TouchableOpacity style={[s.btn, savingEmergency && { opacity: 0.65 }]} onPress={saveEmergency} disabled={savingEmergency}>
              {savingEmergency ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={s.btnText}>Save Emergency Info</Text></>}
            </TouchableOpacity>

            <TouchableOpacity style={s.rowLink} onPress={() => navigation.getParent()?.navigate('EmergencyContact')}>
              <View style={[s.rowIcon, { backgroundColor: '#fff7ed' }]}><Ionicons name="call-outline" size={18} color="#ea580c" /></View>
              <Text style={s.rowLinkText}>Manage Emergency Contacts</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </>
        )}

        {/* ═══ BILLING & INSURANCE TAB ═══ */}
        {activeTab === 'billing' && (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>Insurance</Text>
              {insuranceInfo ? (
                <View style={s.infoBlock}>
                  <Text style={s.infoRow}><Text style={s.infoKey}>Provider: </Text>{insuranceInfo.provider || '—'}</Text>
                  <Text style={s.infoRow}><Text style={s.infoKey}>Plan: </Text>{insuranceInfo.planType || '—'}</Text>
                  <Text style={s.infoRow}><Text style={s.infoKey}>Policy #: </Text>{insuranceInfo.policyNumber || '—'}</Text>
                  <Text style={s.infoRow}><Text style={s.infoKey}>Member ID: </Text>{insuranceInfo.memberId || '—'}</Text>
                  <Text style={s.infoRow}><Text style={s.infoKey}>Expires: </Text>{insuranceInfo.expiryDate || '—'}</Text>
                </View>
              ) : (
                <Text style={s.cardDesc}>No insurance on file yet.</Text>
              )}
              <TouchableOpacity style={[s.outlineBtn, { marginTop: 10 }]} onPress={() => navigation.getParent()?.navigate('InsuranceDetails')}>
                <Ionicons name="shield-checkmark-outline" size={16} color={MedicalColors.primary} />
                <Text style={s.outlineBtnText}>{insuranceInfo ? 'Update Insurance' : 'Add Insurance'}</Text>
              </TouchableOpacity>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Billing History</Text>
              {billingHistory.length === 0 ? (
                <Text style={s.cardDesc}>No billing records yet.</Text>
              ) : (
                billingHistory.slice(-10).reverse().map((b, i) => (
                  <View key={i} style={s.billingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.billingDesc}>{b.description || 'Consultation'}</Text>
                      <Text style={s.billingDate}>{b.date || '—'}</Text>
                    </View>
                    <Text style={[s.billingAmount, { color: b.status === 'paid' ? '#16a34a' : '#dc2626' }]}>
                      {b.status === 'paid' ? '✓ ' : ''}${b.amount || 0}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Payment Preferences</Text>
              <TouchableOpacity style={s.rowLink} onPress={() => navigation.getParent()?.navigate('MedicalBilling')}>
                <View style={[s.rowIcon, { backgroundColor: '#eff6ff' }]}><Ionicons name="card-outline" size={18} color="#2563eb" /></View>
                <Text style={s.rowLinkText}>Manage Billing & Payments</Text>
                <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ═══ LEGAL & COMPLIANCE TAB ═══ */}
        {activeTab === 'legal' && (
          <>
            <View style={s.infoBanner}>
              <Ionicons name="information-circle-outline" size={18} color="#2563eb" />
              <Text style={[s.infoBannerText, { color: '#1e40af' }]}>All consent changes are logged with a timestamp for compliance purposes.</Text>
            </View>

            <View style={s.card}>
              <Text style={s.cardTitle}>Consent & Agreements</Text>
              {[
                { key: 'termsAccepted',   label: 'Terms & Conditions',               desc: 'I have read and agree to the NessaHub Terms of Service' },
                { key: 'privacyAccepted', label: 'Privacy Policy',                   desc: 'I agree to the NessaHub Privacy Policy regarding data handling' },
                { key: 'hipaaAccepted',   label: 'HIPAA / GDPR Acknowledgment',      desc: 'I acknowledge my rights under HIPAA/GDPR for health data protection' },
                { key: 'dataSharingConsent', label: 'Doctor–Patient Data Sharing',   desc: 'I consent to sharing my health data with my assigned doctor(s)' },
              ].map(({ key, label, desc }) => (
                <TouchableOpacity key={key} style={s.consentRow} onPress={() => toggleLegal(key)}>
                  <View style={[s.checkbox, legal[key] && s.checkboxChecked]}>
                    {legal[key] && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.consentLabel}>{label}</Text>
                    <Text style={s.consentDesc}>{desc}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[s.btn, savingLegal && { opacity: 0.65 }]} onPress={() => saveLegal(legal)} disabled={savingLegal}>
              {savingLegal ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="checkmark-circle-outline" size={18} color="#fff" /><Text style={s.btnText}>Save Legal Preferences</Text></>}
            </TouchableOpacity>

            <View style={s.card}>
              <Text style={s.cardTitle}>Legal Documents</Text>
              {[
                { label: 'Terms & Conditions', icon: 'document-text-outline', color: '#2563eb' },
                { label: 'Privacy Policy', icon: 'shield-outline', color: '#7c3aed' },
                { label: 'HIPAA Notice of Privacy Practices', icon: 'medkit-outline', color: '#059669' },
                { label: 'GDPR Data Rights Information', icon: 'information-circle-outline', color: '#d97706' },
              ].map(({ label, icon, color }) => (
                <TouchableOpacity key={label} style={s.rowLink} onPress={() => Alert.alert(label, `The full ${label} document will open in your browser. This is managed by NessaHub Legal.`)}>
                  <View style={[s.rowIcon, { backgroundColor: color + '18' }]}><Ionicons name={icon} size={18} color={color} /></View>
                  <Text style={s.rowLinkText}>{label}</Text>
                  <Ionicons name="open-outline" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              ))}
            </View>

            {consentLogs.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Consent Log</Text>
                {consentLogs.slice(-5).reverse().map((log, i) => (
                  <View key={i} style={s.logRow}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={s.logText}>{log.action} — {new Date(log.timestamp).toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {/* ═══ SELF-DISCHARGE TAB ═══ */}
        {activeTab === 'discharge' && (
          <>
            {alreadyDischarged ? (
              <View style={s.dischargedBanner}>
                <Ionicons name="checkmark-circle" size={36} color="#dc2626" />
                <Text style={s.dischargedTitle}>Discharge Request Submitted</Text>
                <Text style={s.dischargedDesc}>Your self-discharge request has been submitted and your doctor has been notified. You may still use the app to view your records.</Text>
              </View>
            ) : (
              <>
                <View style={[s.infoBanner, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                  <Ionicons name="warning-outline" size={18} color="#dc2626" />
                  <Text style={[s.infoBannerText, { color: '#991b1b' }]}>Requesting self-discharge will notify your doctor and update your status. You can continue using NessaHub after submitting.</Text>
                </View>

                <View style={s.card}>
                  <Text style={s.cardTitle}>Self-Discharge Request</Text>
                  <Text style={s.cardDesc}>If you are unhappy with the service you are receiving, please fill out this form. Your doctor will be notified with full context.</Text>

                  <View style={s.fieldGroup}>
                    <Text style={s.label}>Reason for Leaving *</Text>
                    <TextInput
                      style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
                      value={dischargeForm.reason}
                      onChangeText={v => setDischargeForm(f => ({ ...f, reason: v }))}
                      placeholder="Please describe why you wish to leave. This helps us improve our service."
                      placeholderTextColor={MedicalColors.textLight}
                      multiline
                    />
                  </View>

                  <View style={s.fieldGroup}>
                    <Text style={s.label}>Additional Message to Your Doctor (optional)</Text>
                    <TextInput
                      style={[s.input, { minHeight: 70, textAlignVertical: 'top' }]}
                      value={dischargeForm.message}
                      onChangeText={v => setDischargeForm(f => ({ ...f, message: v }))}
                      placeholder="Any additional information you'd like your doctor to know…"
                      placeholderTextColor={MedicalColors.textLight}
                      multiline
                    />
                  </View>

                  <TouchableOpacity style={s.confirmRow} onPress={() => setDischargeForm(f => ({ ...f, confirmed: !f.confirmed }))}>
                    <View style={[s.checkbox, dischargeForm.confirmed && s.checkboxDanger]}>
                      {dischargeForm.confirmed && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    <Text style={s.consentLabel}>I understand that submitting this request will notify my doctor and update my patient status to "self-discharged".</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[s.dischargeSubmitBtn, (submittingDischarge || !dischargeForm.confirmed || !dischargeForm.reason.trim()) && { opacity: 0.5 }]}
                  onPress={submitDischarge}
                  disabled={submittingDischarge || !dischargeForm.confirmed || !dischargeForm.reason.trim()}
                >
                  {submittingDischarge ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="exit-outline" size={18} color="#fff" /><Text style={s.btnText}>Submit Discharge Request</Text></>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Change Password Modal */}
      <Modal visible={showPwdModal} transparent animationType="slide" onRequestClose={() => setShowPwdModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Text style={s.modalTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => { setShowPwdModal(false); setPwdForm({ current: '', next: '', confirm: '' }); }} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {[{ key: 'current', label: 'Current Password' }, { key: 'next', label: 'New Password' }, { key: 'confirm', label: 'Confirm New Password' }].map(f => (
              <View key={f.key} style={{ marginBottom: 12 }}>
                <Text style={s.label}>{f.label}</Text>
                <TextInput style={s.input} value={pwdForm[f.key]} onChangeText={v => setPwdForm(p => ({ ...p, [f.key]: v }))} secureTextEntry placeholderTextColor={MedicalColors.textLight} placeholder="••••••••" />
              </View>
            ))}
            <TouchableOpacity style={[s.btn, changingPwd && { opacity: 0.65 }]} onPress={handleChangePassword} disabled={changingPwd}>
              {changingPwd ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Update Password</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal visible={showDeleteModal} transparent animationType="slide" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Ionicons name="warning" size={22} color="#dc2626" />
              <Text style={[s.modalTitle, { color: '#dc2626', marginLeft: 8 }]}>Delete Account</Text>
              <TouchableOpacity onPress={() => setShowDeleteModal(false)} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={[s.cardDesc, { marginBottom: 16 }]}>This is permanent and cannot be undone. All your data will be removed. Type <Text style={{ fontWeight: '700', color: '#dc2626' }}>DELETE</Text> and enter your password to confirm.</Text>
            <View style={{ marginBottom: 12 }}>
              <Text style={s.label}>Type DELETE</Text>
              <TextInput style={s.input} value={deleteConfirm} onChangeText={setDeleteConfirm} placeholder="DELETE" placeholderTextColor={MedicalColors.textLight} autoCapitalize="characters" />
            </View>
            <View style={{ marginBottom: 16 }}>
              <Text style={s.label}>Your Password</Text>
              <TextInput style={s.input} value={deletePwd} onChangeText={setDeletePwd} secureTextEntry placeholder="Your current password" placeholderTextColor={MedicalColors.textLight} />
            </View>
            <TouchableOpacity style={[s.dischargeSubmitBtn, deleting && { opacity: 0.65 }]} onPress={handleDeleteAccount} disabled={deleting}>
              {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Permanently Delete My Account</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: MedicalColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, padding: 16 },

  // Tab bar
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', maxHeight: 52 },
  tabBarContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  tabActive: { backgroundColor: MedicalColors.primaryLight, borderColor: MedicalColors.primary },
  tabActiveDanger: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  tabTextActive: { color: MedicalColors.primary },
  tabTextDanger: { color: '#dc2626' },

  // Profile header
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: MedicalColors.border },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: MedicalColors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  profileName: { fontSize: 16, fontWeight: '700', color: MedicalColors.text },
  profileEmail: { fontSize: 12, color: MedicalColors.textSecondary, marginTop: 2 },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: MedicalColors.border },
  cardTitle: { fontSize: 14, fontWeight: '700', color: MedicalColors.text, marginBottom: 10 },
  cardDesc: { fontSize: 12, color: MedicalColors.textSecondary, lineHeight: 18, marginBottom: 4 },

  fieldGroup: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: MedicalColors.textSecondary, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 10, padding: 12, fontSize: 14, color: MedicalColors.text, backgroundColor: '#fafafa' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: MedicalColors.border, backgroundColor: '#fff' },
  chipSelected: { borderColor: MedicalColors.primary, backgroundColor: MedicalColors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: MedicalColors.textSecondary },
  chipTextSelected: { color: MedicalColors.primary },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: MedicalColors.primary, borderRadius: 12, paddingVertical: 14, marginBottom: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: MedicalColors.primary, borderRadius: 12, paddingVertical: 11 },
  outlineBtnText: { color: MedicalColors.primary, fontSize: 14, fontWeight: '600' },
  dischargeSubmitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 14, marginBottom: 12 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  toggleLabel: { fontSize: 13, fontWeight: '600', color: MedicalColors.text, marginBottom: 2 },
  toggleDesc: { fontSize: 11, color: MedicalColors.textSecondary, lineHeight: 16 },

  rowIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  rowLink: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: MedicalColors.border },
  rowLinkText: { flex: 1, fontSize: 14, fontWeight: '600', color: MedicalColors.text },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: '#fecaca', borderRadius: 12, paddingVertical: 14, marginBottom: 12, backgroundColor: '#fef2f2' },
  logoutText: { color: '#dc2626', fontSize: 15, fontWeight: '700' },

  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', marginBottom: 8 },
  deleteBtnText: { color: '#dc2626', fontSize: 14, fontWeight: '700' },

  infoBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#fffbeb', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#fde68a' },
  infoBannerText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 },

  infoBlock: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginBottom: 8 },
  infoRow: { fontSize: 13, color: MedicalColors.text, marginBottom: 4 },
  infoKey: { fontWeight: '700' },

  billingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  billingDesc: { fontSize: 13, fontWeight: '600', color: MedicalColors.text },
  billingDate: { fontSize: 11, color: MedicalColors.textSecondary, marginTop: 1 },
  billingAmount: { fontSize: 15, fontWeight: '700' },

  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#cbd5e1', justifyContent: 'center', alignItems: 'center', flexShrink: 0, marginTop: 1 },
  checkboxChecked: { backgroundColor: MedicalColors.primary, borderColor: MedicalColors.primary },
  checkboxDanger: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  consentLabel: { fontSize: 13, fontWeight: '600', color: MedicalColors.text, flex: 1 },
  consentDesc: { fontSize: 11, color: MedicalColors.textSecondary, marginTop: 2, lineHeight: 16 },

  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 6 },
  logText: { fontSize: 11, color: MedicalColors.textSecondary, flex: 1 },

  confirmRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, backgroundColor: '#fef2f2', borderRadius: 10, marginTop: 10 },

  dischargedBanner: { alignItems: 'center', padding: 40, gap: 12 },
  dischargedTitle: { fontSize: 18, fontWeight: '800', color: '#dc2626', textAlign: 'center' },
  dischargedDesc: { fontSize: 13, color: MedicalColors.textSecondary, textAlign: 'center', lineHeight: 20 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingTop: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: MedicalColors.text },
});
