import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { MedicalColors } from '../../constants/colors';

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const MedicalSettingsScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    dob: '',
    bloodType: '',
    allergies: '',
  });
  const [saving, setSaving] = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      const snap = await getDoc(doc(db, 'auth', currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setForm({
          name: data.name || '',
          email: data.email || '',
          phone: data.phone || '',
          dob: data.dob || '',
          bloodType: data.bloodType || '',
          allergies: data.allergies || '',
        });
        if (data.name) await AsyncStorage.setItem('userName', data.name);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) return;
      await setDoc(doc(db, 'auth', currentUser.uid), {
        name: form.name,
        phone: form.phone,
        dob: form.dob,
        bloodType: form.bloodType,
        allergies: form.allergies,
      }, { merge: true });
      if (form.name) await AsyncStorage.setItem('userName', form.name);
      Alert.alert('Saved', 'Your profile has been updated successfully.');
    } catch (err) {
      Alert.alert('Error', 'Failed to save. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    const { current, next, confirm } = pwdForm;
    if (!current || !next || !confirm) { Alert.alert('Error', 'Please fill all password fields.'); return; }
    if (next.length < 6) { Alert.alert('Error', 'New password must be at least 6 characters.'); return; }
    if (next !== confirm) { Alert.alert('Error', 'New passwords do not match.'); return; }
    setChangingPwd(true);
    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, next);
      setShowPwdModal(false);
      setPwdForm({ current: '', next: '', confirm: '' });
      Alert.alert('Success', 'Password changed successfully.');
    } catch (err) {
      Alert.alert('Error', err.code === 'auth/wrong-password' ? 'Current password is incorrect.' : 'Could not change password. Try again.');
    } finally {
      setChangingPwd(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.clear();
          await auth.signOut();
          navigation.getParent()?.replace('Intent');
        },
      },
    ]);
  };

  const field = (label, key, opts = {}) => (
    <View style={styles.fieldGroup} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={form[key]}
        onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
        placeholderTextColor={MedicalColors.textLight}
        {...opts}
      />
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Avatar / name header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>
            {(form.name || 'P')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.profileName}>{form.name || 'Patient'}</Text>
        <Text style={styles.profileEmail}>{form.email}</Text>
      </View>

      {/* Personal Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Personal Information</Text>
        {field('Full Name', 'name', { placeholder: 'Your full name', autoCapitalize: 'words' })}
        {field('Email', 'email', { placeholder: 'Email address', keyboardType: 'email-address', editable: false, style: [styles.input, { backgroundColor: '#f8fafc', color: MedicalColors.textSecondary }] })}
        {field('Phone Number', 'phone', { placeholder: '+1 (555) 000-0000', keyboardType: 'phone-pad' })}
        {field('Date of Birth', 'dob', { placeholder: 'YYYY-MM-DD' })}
      </View>

      {/* Health Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Health Information</Text>

        <Text style={styles.label}>Blood Type</Text>
        <View style={styles.bloodTypeGrid}>
          {BLOOD_TYPES.map((bt) => (
            <TouchableOpacity
              key={bt}
              style={[styles.bloodTypeBtn, form.bloodType === bt && styles.bloodTypeBtnSelected]}
              onPress={() => setForm((f) => ({ ...f, bloodType: bt }))}
            >
              <Text style={[styles.bloodTypeBtnText, form.bloodType === bt && styles.bloodTypeBtnTextSelected]}>
                {bt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Known Allergies</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={form.allergies}
            onChangeText={(v) => setForm((f) => ({ ...f, allergies: v }))}
            placeholder="e.g. Penicillin, Peanuts…"
            placeholderTextColor={MedicalColors.textLight}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.7 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
      </TouchableOpacity>

      {/* Change Password */}
      <TouchableOpacity style={styles.changePwdBtn} onPress={() => setShowPwdModal(true)}>
        <Ionicons name="lock-closed-outline" size={18} color={MedicalColors.primary} />
        <Text style={styles.changePwdText}>Change Password</Text>
        <Ionicons name="chevron-forward" size={16} color={MedicalColors.textLight} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {/* My Records */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Records</Text>
        {[
          { icon: 'shield-checkmark-outline', label: 'Insurance Details', color: '#1e6bb8', screen: 'InsuranceDetails' },
          { icon: 'call-outline', label: 'Emergency Contacts', color: '#ea580c', screen: 'EmergencyContact' },
          { icon: 'documents-outline', label: 'Health Records', color: '#059669', screen: 'HealthRecords' },
        ].map(({ icon, label, color, screen }) => (
          <TouchableOpacity
            key={screen}
            style={styles.recordLink}
            onPress={() => navigation.getParent()?.navigate(screen)}
          >
            <View style={[styles.recordLinkIcon, { backgroundColor: color + '15' }]}>
              <Ionicons name={icon} size={20} color={color} />
            </View>
            <Text style={styles.recordLinkText}>{label}</Text>
            <Ionicons name="chevron-forward" size={16} color={MedicalColors.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color={MedicalColors.error} />
        <Text style={styles.logoutBtnText}>Log Out</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />

      {/* Password Change Modal */}
      {showPwdModal && (
        <View style={styles.pwdOverlay}>
          <View style={styles.pwdCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="lock-closed" size={20} color={MedicalColors.primary} />
              <Text style={styles.pwdTitle}>Change Password</Text>
              <TouchableOpacity onPress={() => { setShowPwdModal(false); setPwdForm({ current: '', next: '', confirm: '' }); }} style={{ marginLeft: 'auto' }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            {[
              { key: 'current', label: 'Current Password', placeholder: 'Enter current password' },
              { key: 'next',    label: 'New Password',     placeholder: 'At least 6 characters' },
              { key: 'confirm', label: 'Confirm New Password', placeholder: 'Repeat new password' },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 12 }}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={pwdForm[f.key]}
                  onChangeText={v => setPwdForm(p => ({ ...p, [f.key]: v }))}
                  placeholder={f.placeholder}
                  placeholderTextColor={MedicalColors.textLight}
                  secureTextEntry
                />
              </View>
            ))}
            <TouchableOpacity
              style={[styles.saveBtn, changingPwd && { opacity: 0.7 }]}
              onPress={handleChangePassword}
              disabled={changingPwd}
            >
              <Text style={styles.saveBtnText}>{changingPwd ? 'Changing…' : 'Update Password'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 20,
    paddingVertical: 24,
    backgroundColor: MedicalColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  avatarWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: MedicalColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: 'white',
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 3,
  },
  profileEmail: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
  },
  card: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
    marginBottom: 14,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: MedicalColors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: MedicalColors.text,
    backgroundColor: MedicalColors.surface,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  bloodTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
    marginTop: 4,
  },
  bloodTypeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: MedicalColors.border,
    backgroundColor: MedicalColors.surface,
  },
  bloodTypeBtnSelected: {
    borderColor: MedicalColors.primary,
    backgroundColor: MedicalColors.primaryLight,
  },
  bloodTypeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: MedicalColors.textSecondary,
  },
  bloodTypeBtnTextSelected: {
    color: MedicalColors.primary,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: MedicalColors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 12,
  },
  saveBtnText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  recordLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  recordLinkIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  recordLinkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: MedicalColors.text,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: MedicalColors.error,
    borderRadius: 14,
    paddingVertical: 15,
  },
  logoutBtnText: {
    color: MedicalColors.error,
    fontSize: 16,
    fontWeight: '600',
  },
  changePwdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  changePwdText: {
    fontSize: 14,
    fontWeight: '600',
    color: MedicalColors.text,
  },
  pwdOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pwdCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
  },
  pwdTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.text,
    marginLeft: 8,
  },
});

export default MedicalSettingsScreen;
