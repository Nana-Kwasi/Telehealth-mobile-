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
    emergencyContact: '',
  });
  const [saving, setSaving] = useState(false);

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
          emergencyContact: data.emergencyContact || '',
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
        emergencyContact: form.emergencyContact,
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

        {field('Emergency Contact', 'emergencyContact', { placeholder: 'Name · Relationship · Phone' })}
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
});

export default MedicalSettingsScreen;
