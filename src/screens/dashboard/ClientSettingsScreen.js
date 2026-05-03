import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { reauthenticateWithCredential, EmailAuthProvider, updatePassword, deleteUser } from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage } from '../../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData } from '../../services/clientDataService';
import { Colors } from '../../constants/colors';
import useAddressAutofillMobile from '../../hooks/useAddressAutofillMobile';

const ClientSettingsScreen = ({ navigation }) => {
  const [clientData, setClientData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('basic');
  const [successMessage, setSuccessMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();

  const sections = [
    { id: 'basic', name: 'Basic Info', icon: 'person-outline' },
    { id: 'therapy', name: 'Therapy', icon: 'heart-outline' },
    { id: 'health', name: 'Health', icon: 'fitness-outline' },
    { id: 'privacy', name: 'Privacy', icon: 'shield-outline' },
    { id: 'security', name: 'Security', icon: 'lock-closed-outline' },
    { id: 'account', name: 'Account', icon: 'trash-outline' },
  ];

  useEffect(() => {
    loadClientData();
  }, []);

  const loadClientData = async () => {
    try {
      setIsLoading(true);
      const clientId = await AsyncStorage.getItem('th.clientId') || auth.currentUser?.uid;
      
      let client = getCachedClientData();
      if (!client) {
        const clientDoc = await getDoc(doc(db, 'clients', clientId));
        if (clientDoc.exists()) {
          client = { id: clientDoc.id, ...clientDoc.data() };
        }
      }
      setClientData(client);
    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!clientData || !auth.currentUser) return;

    try {
      setSaving(true);
      setSuccessMessage('');
      setPasswordError('');

      const clientId = await AsyncStorage.getItem('th.clientId') || auth.currentUser.uid;
      
      const updateData = {
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone || '',
        country: clientData.country || '',
        city: clientData.city || '',
        area: clientData.area || '',
        region: clientData.region || '',
        street: clientData.street || '',
        ghanaDigitalAddress: clientData.ghanaDigitalAddress || '',
        latitude: Number.isFinite(Number(clientData.latitude)) ? Number(clientData.latitude) : null,
        longitude: Number.isFinite(Number(clientData.longitude)) ? Number(clientData.longitude) : null,
        locationMeta: {
          country: clientData.country || '',
          city: clientData.city || '',
          area: clientData.area || '',
          region: clientData.region || '',
          street: clientData.street || '',
          latitude: Number.isFinite(Number(clientData.latitude)) ? Number(clientData.latitude) : null,
          longitude: Number.isFinite(Number(clientData.longitude)) ? Number(clientData.longitude) : null,
        },
        lastModified: new Date(),
        modifiedBy: auth.currentUser.uid
      };

      if (clientData.gender && clientData.gender.trim() !== '') {
        updateData.gender = clientData.gender;
      }
      if (clientData.age && clientData.age.trim() !== '') {
        updateData.age = clientData.age;
      }
      
      await updateDoc(doc(db, 'clients', clientId), updateData);
      
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error saving profile:', error);
      setPasswordError('Failed to save profile: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!auth.currentUser) return;
    
    try {
      setPasswordError('');
      setSuccessMessage('');
      
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordError('New passwords do not match');
        return;
      }
      
      if (passwordForm.newPassword.length < 6) {
        setPasswordError('Password must be at least 6 characters');
        return;
      }
      
      const credential = EmailAuthProvider.credential(
        auth.currentUser.email,
        passwordForm.currentPassword
      );
      
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, passwordForm.newPassword);
      
      setSuccessMessage('Password updated successfully!');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      setShowPasswordForm(false);
      
      setTimeout(() => setSuccessMessage(''), 3000);
      
    } catch (error) {
      console.error('Error updating password:', error);
      if (error.code === 'auth/wrong-password') {
        setPasswordError('Current password is incorrect');
      } else if (error.code === 'auth/weak-password') {
        setPasswordError('Password is too weak');
      } else {
        setPasswordError('Failed to update password: ' + error.message);
      }
    }
  };

  const getPHQ9Score = () => {
    if (!clientData?.phq9) return 'Not assessed';
    const scores = Object.values(clientData.phq9).filter(score => typeof score === 'number');
    const total = scores.reduce((sum, score) => sum + score, 0);
    const severity = total <= 4 ? 'Minimal' :
                     total <= 9 ? 'Mild' :
                     total <= 14 ? 'Moderate' :
                     total <= 19 ? 'Moderately Severe' : 'Severe';
    return `${total}/27 (${severity})`;
  };

  const handleProfilePhotoUpload = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    setUploadingPhoto(true);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const uid = auth.currentUser?.uid;
      const storageRef = ref(storage, `profile-images/${uid}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      const clientId = await AsyncStorage.getItem('th.clientId') || uid;
      await updateDoc(doc(db, 'clients', clientId), { photoURL: downloadURL });
      setClientData(prev => ({ ...prev, photoURL: downloadURL }));
      setSuccessMessage('Profile photo updated!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setPasswordError('Failed to upload photo: ' + err.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSavePreferences = async (updates) => {
    if (!auth.currentUser) return;
    try {
      setSaving(true);
      const clientId = await AsyncStorage.getItem('th.clientId') || auth.currentUser.uid;
      await updateDoc(doc(db, 'clients', clientId), updates);
      setClientData(prev => ({ ...prev, ...updates }));
      setSuccessMessage('Saved!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setPasswordError('Failed to save: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser || !deletePassword) return;
    setDeletingAccount(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      const clientId = await AsyncStorage.getItem('th.clientId') || auth.currentUser.uid;
      await deleteDoc(doc(db, 'clients', clientId));
      await deleteDoc(doc(db, 'auth', auth.currentUser.uid));
      await deleteUser(auth.currentUser);
      await AsyncStorage.clear();
    } catch (err) {
      setPasswordError(err.code === 'auth/wrong-password' ? 'Incorrect password' : 'Failed to delete account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings & Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Navigation Sidebar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.navScroll}
          contentContainerStyle={styles.navContent}
        >
          {sections.map(section => (
            <TouchableOpacity
              key={section.id}
              style={[
                styles.navItem,
                activeSection === section.id && styles.navItemActive
              ]}
              onPress={() => setActiveSection(section.id)}
            >
              <Ionicons
                name={section.icon}
                size={20}
                color={activeSection === section.id ? Colors.surface : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.navText,
                  activeSection === section.id && styles.navTextActive
                ]}
              >
                {section.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content Area */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Success/Error Messages */}
          {successMessage ? (
            <View style={styles.successMessage}>
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}
          
          {passwordError ? (
            <View style={styles.errorMessage}>
              <Ionicons name="alert-circle" size={20} color={Colors.error} />
              <Text style={styles.errorText}>{passwordError}</Text>
            </View>
          ) : null}

          {/* Basic Information Section */}
          {activeSection === 'basic' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Basic Information</Text>
                <Text style={styles.sectionSubtitle}>Your personal details and contact information</Text>
              </View>

              {/* Profile Photo */}
              <TouchableOpacity style={styles.photoContainer} onPress={handleProfilePhotoUpload}>
                {clientData?.photoURL ? (
                  <Image source={{ uri: clientData.photoURL }} style={styles.photoImage} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoInitials}>{clientData?.name ? clientData.name.charAt(0).toUpperCase() : 'C'}</Text>
                  </View>
                )}
                <View style={styles.photoOverlay}>
                  <Ionicons name="camera" size={20} color="#fff" />
                  <Text style={styles.photoOverlayText}>{uploadingPhoto ? 'Uploading...' : 'Change'}</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.form}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Full Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={clientData?.name || ''}
                    onChangeText={(text) => setClientData({...clientData, name: text})}
                    placeholder="Enter your full name"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Email Address *</Text>
                  <TextInput
                    style={styles.input}
                    value={clientData?.email || ''}
                    onChangeText={(text) => setClientData({...clientData, email: text})}
                    placeholder="Enter your email"
                    placeholderTextColor={Colors.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Phone Number</Text>
                  <TextInput
                    style={styles.input}
                    value={clientData?.phone || ''}
                    onChangeText={(text) => setClientData({...clientData, phone: text})}
                    placeholder="Enter your phone number"
                    placeholderTextColor={Colors.textSecondary}
                    keyboardType="phone-pad"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Country</Text>
                  <TextInput
                    style={styles.input}
                    value={clientData?.country || ''}
                    onChangeText={(text) => setClientData({ ...clientData, country: text })}
                    placeholder="e.g. GH"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
                <TouchableOpacity
                  style={[styles.secondaryButton, { marginBottom: 12 }]}
                  onPress={() => detectAddress((loc) => {
                    setClientData({
                      ...clientData,
                      country: loc.countryCode || clientData?.country || '',
                      city: loc.city || clientData?.city || '',
                      area: loc.area || clientData?.area || '',
                      region: loc.region || clientData?.region || '',
                      street: loc.street || clientData?.street || '',
                      latitude: loc.latitude ?? clientData?.latitude ?? null,
                      longitude: loc.longitude ?? clientData?.longitude ?? null,
                    });
                  })}
                  disabled={locating}
                >
                  <Ionicons name="locate-outline" size={16} color={Colors.primary} />
                  <Text style={{ color: Colors.primary, fontWeight: '700' }}>{locating ? 'Detecting location…' : 'Use current location'}</Text>
                </TouchableOpacity>
                {!!locationMsg && <Text style={[styles.helpText, { marginTop: -4, marginBottom: 10 }]}>{locationMsg}</Text>}
                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.label}>City</Text>
                    <TextInput style={styles.input} value={clientData?.city || ''} onChangeText={(text) => setClientData({ ...clientData, city: text })} placeholder="e.g. Accra" placeholderTextColor={Colors.textSecondary} />
                  </View>
                  <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>Area</Text>
                    <TextInput style={styles.input} value={clientData?.area || ''} onChangeText={(text) => setClientData({ ...clientData, area: text })} placeholder="e.g. East Legon" placeholderTextColor={Colors.textSecondary} />
                  </View>
                </View>
                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.label}>Region / State</Text>
                    <TextInput style={styles.input} value={clientData?.region || ''} onChangeText={(text) => setClientData({ ...clientData, region: text })} placeholder="e.g. Greater Accra" placeholderTextColor={Colors.textSecondary} />
                  </View>
                  <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>Street</Text>
                    <TextInput style={styles.input} value={clientData?.street || ''} onChangeText={(text) => setClientData({ ...clientData, street: text })} placeholder="e.g. Liberation Road" placeholderTextColor={Colors.textSecondary} />
                  </View>
                </View>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Ghana Digital Address (optional)</Text>
                  <TextInput style={styles.input} value={clientData?.ghanaDigitalAddress || ''} onChangeText={(text) => setClientData({ ...clientData, ghanaDigitalAddress: text })} placeholder="e.g. GA-123-4567" placeholderTextColor={Colors.textSecondary} />
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.label}>Gender</Text>
                    {clientData?.gender ? (
                      <TextInput
                        style={[styles.input, styles.readonlyInput]}
                        value={clientData.gender}
                        editable={false}
                      />
                    ) : (
                      <TextInput
                        style={styles.input}
                        value={clientData?.gender || ''}
                        onChangeText={(text) => setClientData({...clientData, gender: text})}
                        placeholder="Select gender"
                        placeholderTextColor={Colors.textSecondary}
                      />
                    )}
                  </View>
                  <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.label}>Age</Text>
                    {clientData?.age ? (
                      <TextInput
                        style={[styles.input, styles.readonlyInput]}
                        value={`${clientData.age} years old`}
                        editable={false}
                      />
                    ) : (
                      <TextInput
                        style={styles.input}
                        value={clientData?.age || ''}
                        onChangeText={(text) => setClientData({...clientData, age: text})}
                        placeholder="Enter your age"
                        placeholderTextColor={Colors.textSecondary}
                        keyboardType="numeric"
                      />
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={Colors.surface} />
                  ) : (
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Therapy Details Section */}
          {activeSection === 'therapy' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Therapy Details</Text>
                <Text style={styles.sectionSubtitle}>Your therapy preferences and goals</Text>
              </View>
              
              <View style={styles.infoGrid}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Therapy Type</Text>
                  <Text style={styles.infoValue}>{clientData?.therapyType || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Session Frequency</Text>
                  <Text style={styles.infoValue}>{clientData?.sessionFrequency || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Session Structure</Text>
                  <Text style={styles.infoValue}>{clientData?.sessionStructure || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Communication Preference</Text>
                  <Text style={styles.infoValue}>{clientData?.communicationPreference || 'Not specified'}</Text>
                </View>
              </View>

              <View style={styles.tagsSection}>
                <Text style={styles.tagsTitle}>Therapy Goals</Text>
                <View style={styles.tagsContainer}>
                  {clientData?.therapyGoals?.length > 0 ? (
                    clientData.therapyGoals.map((goal, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{goal}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyTag}>No goals specified</Text>
                  )}
                </View>
              </View>

              <View style={styles.tagsSection}>
                <Text style={styles.tagsTitle}>Reasons for Therapy</Text>
                <View style={styles.tagsContainer}>
                  {clientData?.reasonsForTherapy?.length > 0 ? (
                    clientData.reasonsForTherapy.map((reason, index) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{reason}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyTag}>No reasons specified</Text>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Health Information Section */}
          {activeSection === 'health' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Health Information</Text>
                <Text style={styles.sectionSubtitle}>Your mental and physical health details</Text>
              </View>
              
              <View style={styles.infoGrid}>
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>PHQ-9 Score</Text>
                  <Text style={styles.infoValue}>{getPHQ9Score()}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Anxiety Level</Text>
                  <Text style={styles.infoValue}>{clientData?.anxiety || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Depression Level</Text>
                  <Text style={styles.infoValue}>{clientData?.depression || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Physical Health</Text>
                  <Text style={styles.infoValue}>{clientData?.physicalHealth || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Sleep Quality</Text>
                  <Text style={styles.infoValue}>{clientData?.sleep || 'Not specified'}</Text>
                </View>
                
                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>Exercise</Text>
                  <Text style={styles.infoValue}>{clientData?.exercise || 'Not specified'}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Security Section */}
          {activeSection === 'security' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Security</Text>
                <Text style={styles.sectionSubtitle}>Manage your password and account security</Text>
              </View>
              
              {!showPasswordForm ? (
                <TouchableOpacity
                  style={styles.changePasswordButton}
                  onPress={() => setShowPasswordForm(true)}
                >
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.primary} />
                  <Text style={styles.changePasswordText}>Change Password</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.passwordForm}>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Current Password *</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={passwordForm.currentPassword}
                        onChangeText={(text) => setPasswordForm({...passwordForm, currentPassword: text})}
                        placeholder="Enter current password"
                        placeholderTextColor={Colors.textSecondary}
                        secureTextEntry={!showPasswords.current}
                      />
                      <TouchableOpacity onPress={() => setShowPasswords({...showPasswords, current: !showPasswords.current})}>
                        <Ionicons
                          name={showPasswords.current ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={Colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>New Password *</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={passwordForm.newPassword}
                        onChangeText={(text) => setPasswordForm({...passwordForm, newPassword: text})}
                        placeholder="Enter new password"
                        placeholderTextColor={Colors.textSecondary}
                        secureTextEntry={!showPasswords.new}
                      />
                      <TouchableOpacity onPress={() => setShowPasswords({...showPasswords, new: !showPasswords.new})}>
                        <Ionicons
                          name={showPasswords.new ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={Colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Confirm New Password *</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={styles.passwordInput}
                        value={passwordForm.confirmPassword}
                        onChangeText={(text) => setPasswordForm({...passwordForm, confirmPassword: text})}
                        placeholder="Confirm new password"
                        placeholderTextColor={Colors.textSecondary}
                        secureTextEntry={!showPasswords.confirm}
                      />
                      <TouchableOpacity onPress={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})}>
                        <Ionicons
                          name={showPasswords.confirm ? 'eye-off-outline' : 'eye-outline'}
                          size={20}
                          color={Colors.textSecondary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.passwordFormActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setShowPasswordForm(false);
                        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setPasswordError('');
                      }}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.updatePasswordButton}
                      onPress={handlePasswordChange}
                    >
                      <Text style={styles.updatePasswordButtonText}>Update Password</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Privacy Section */}
          {activeSection === 'privacy' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Privacy & Data</Text>
                <Text style={styles.sectionSubtitle}>Control your profile visibility and data sharing</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Profile Visibility</Text>
                {['therapist-only', 'private', 'public'].map(v => (
                  <TouchableOpacity
                    key={v}
                    style={styles.radioRow}
                    onPress={() => setClientData({ ...clientData, profileVisibility: v })}
                  >
                    <View style={[styles.radioCircle, clientData?.profileVisibility === v && styles.radioCircleSelected]} />
                    <Text style={styles.radioLabel}>{v === 'therapist-only' ? 'Therapist Only (Recommended)' : v.charAt(0).toUpperCase() + v.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Share progress with therapist</Text>
                  <Text style={styles.toggleDesc}>Allow therapist to view mood check-ins</Text>
                </View>
                <Switch
                  value={clientData?.shareProgressWithTherapist !== false}
                  onValueChange={(v) => setClientData({ ...clientData, shareProgressWithTherapist: v })}
                  trackColor={{ false: '#d1d5db', true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Anonymous research data</Text>
                  <Text style={styles.toggleDesc}>Contribute anonymised data to research</Text>
                </View>
                <Switch
                  value={clientData?.allowAnonymousResearch === true}
                  onValueChange={(v) => setClientData({ ...clientData, allowAnonymousResearch: v })}
                  trackColor={{ false: '#d1d5db', true: Colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Language</Text>
                {[['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'], ['ar', 'Arabic']].map(([code, name]) => (
                  <TouchableOpacity
                    key={code}
                    style={styles.radioRow}
                    onPress={() => setClientData({ ...clientData, language: code })}
                  >
                    <View style={[styles.radioCircle, (clientData?.language || 'en') === code && styles.radioCircleSelected]} />
                    <Text style={styles.radioLabel}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={() => handleSavePreferences({
                  profileVisibility: clientData?.profileVisibility || 'therapist-only',
                  shareProgressWithTherapist: clientData?.shareProgressWithTherapist !== false,
                  allowAnonymousResearch: clientData?.allowAnonymousResearch === true,
                  language: clientData?.language || 'en',
                })}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color={Colors.surface} /> : <Text style={styles.saveButtonText}>Save Privacy Settings</Text>}
              </TouchableOpacity>
            </View>
          )}

          {/* Account Section */}
          {activeSection === 'account' && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Account</Text>
                <Text style={styles.sectionSubtitle}>Manage or permanently delete your account</Text>
              </View>

              {!showDeleteConfirm ? (
                <View style={styles.dangerZone}>
                  <View style={styles.dangerInfo}>
                    <Ionicons name="warning" size={24} color="#dc2626" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dangerTitle}>Delete Account</Text>
                      <Text style={styles.dangerDesc}>This permanently deletes your account and all data. Cannot be undone.</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.deleteButton} onPress={() => setShowDeleteConfirm(true)}>
                    <Ionicons name="trash-outline" size={18} color="#fff" />
                    <Text style={styles.deleteButtonText}>Delete My Account</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.deleteWarning}>Enter your password to confirm permanent deletion:</Text>
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Current Password</Text>
                    <TextInput
                      style={styles.input}
                      value={deletePassword}
                      onChangeText={setDeletePassword}
                      placeholder="Enter your password"
                      placeholderTextColor={Colors.textSecondary}
                      secureTextEntry
                    />
                  </View>
                  <View style={styles.passwordFormActions}>
                    <TouchableOpacity style={styles.cancelButton} onPress={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}>
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.deleteButton, (!deletePassword || deletingAccount) && styles.deleteButtonDisabled]}
                      onPress={handleDeleteAccount}
                      disabled={!deletePassword || deletingAccount}
                    >
                      {deletingAccount ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.deleteButtonText}>Confirm Delete</Text>}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
  },
  content: {
    flex: 1,
  },
  navScroll: {
    maxHeight: 60,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: Colors.background,
    gap: 8,
  },
  navItemActive: {
    backgroundColor: Colors.primary,
  },
  navText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  navTextActive: {
    color: Colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d1fae5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  successText: {
    flex: 1,
    fontSize: 14,
    color: '#065f46',
  },
  errorMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: Colors.error,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  form: {
    gap: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  readonlyInput: {
    backgroundColor: '#f8fafc',
    color: Colors.textSecondary,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    backgroundColor: Colors.primary + '12',
  },
  helpText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.surface,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: Colors.text,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  tagsSection: {
    marginBottom: 24,
  },
  tagsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.surface,
  },
  emptyTag: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  changePasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.primary,
    gap: 12,
  },
  changePasswordText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  passwordForm: {
    gap: 16,
  },
  passwordFormActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  updatePasswordButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  updatePasswordButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.surface,
  },
  // Profile photo
  photoContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignSelf: 'center',
    marginBottom: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  photoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoInitials: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
  },
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  photoOverlayText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  // Privacy
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  radioCircleSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  radioLabel: {
    fontSize: 14,
    color: Colors.text,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  toggleDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Danger zone
  dangerZone: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  dangerInfo: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#dc2626',
    marginBottom: 4,
  },
  dangerDesc: {
    fontSize: 13,
    color: '#4b5563',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    padding: 14,
    borderRadius: 10,
    flex: 1,
  },
  deleteButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteWarning: {
    color: '#dc2626',
    fontWeight: '600',
    marginBottom: 16,
    fontSize: 14,
  },
});

export default ClientSettingsScreen;
