import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, uploadFile } from '../../services/apiClient';
import { performLogout } from '../../services/authService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TherapistColors } from '../../constants/colors';
import { pickAndUploadAvatar } from '../../utils/profileImage';
import useAddressAutofillMobile from '../../hooks/useAddressAutofillMobile';
import {
  changeTherapistLoginEmail,
  changeTherapistPassword,
  mapEmailChangeError,
  mapPasswordChangeError,
} from '../../services/therapistEmailChangeService';

const SPECIALIZATIONS = ['CBT','Trauma','Anxiety & Depression','Couples Therapy','Teen & Adolescent','Family Therapy','Substance Abuse','PTSD','Grief & Loss','Other'];
const LANGUAGES = ['English','Spanish','French','Arabic','Mandarin','Portuguese','Other'];

const TherapistSettingsScreen = ({ navigation }) => {
  const [profile, setProfile] = useState({
    name: '', email: '', phone: '', bio: '', specialization: '', experience: '',
    languages: [], photoURL: '', availabilityStatus: 'available', sessionRate: '',
    location: '', country: '', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: null, longitude: null,
  });
  const [notifications, setNotifications] = useState({ sessionReminders: true, newMessages: true, systemUpdates: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();

  const [therapistId, setTherapistId] = React.useState('');
  const loginEmail = profile.email || '';

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(uid => {
      if (uid) { setTherapistId(uid); loadProfile(uid); }
    });
  }, []);

  const handleChangeLoginEmail = async () => {
    setEmailErr('');
    setEmailMsg('');
    setEmailSaving(true);
    try {
      const result = await changeTherapistLoginEmail(newEmail, emailPassword, loginEmail);
      setEmailMsg(result.message);
      if (result.type === 'updated' && result.email) {
        setProfile((p) => ({ ...p, email: result.email }));
        setNewEmail('');
        setEmailPassword('');
      } else if (result.type === 'verification_sent') {
        setNewEmail('');
        setEmailPassword('');
      }
    } catch (e) {
      setEmailErr(mapEmailChangeError(e));
    } finally {
      setEmailSaving(false);
    }
  };

  const loadProfile = async (uid) => {
    try {
      const data = await api(`/api/v1/therapists/${uid || therapistId}`);
      if (data) setProfile(prev => ({ ...prev, ...data, name: data.fullName || data.name || prev.name }));
    } catch (e) { console.error('Load profile error:', e); }
    finally { setIsLoading(false); }
  };

  const handleSaveProfile = async () => {
    if (!profile.name.trim()) { Alert.alert('Error', 'Name is required.'); return; }
    setIsSaving(true);
    try {
      // Only fullName/email/phone/specialization/bio/metadataJson exist on
      // TherapistPatchRequest — every other key sent flat is dropped by Jackson.
      // Everything else (experience, languages, location, availabilityStatus,
      // sessionRate) has to ride in metadataJson, which the backend re-hoists to
      // the top level on read. That is also how the client-facing session rate
      // reaches the therapist cards and the payment screen.
      // Spread the metadata already on the profile first: it also carries keys this
      // screen has no field for (licenseNumber, specialties, therapyType, religion,
      // gender, mustChangePassword). Rebuilding the object from scratch would erase
      // them, since metadataJson is stored as a whole-value replace.
      const rate = Number(profile.sessionRate);
      const metadata = {
        ...(profile.metadata && typeof profile.metadata === 'object' ? profile.metadata : {}),
        name: profile.name,
        experience: profile.experience,
        yearsExperience: profile.experience,
        languages: profile.languages,
        location: profile.location || '',
        country: profile.country || null,
        city: profile.city || null,
        area: profile.area || null,
        region: profile.region || null,
        street: profile.street || null,
        ghanaDigitalAddress: profile.ghanaDigitalAddress || null,
        availabilityStatus: profile.availabilityStatus,
        photoURL: profile.photoURL || null,
        sessionRate: Number.isFinite(rate) && rate > 0 ? rate : null,
        latitude: Number.isFinite(Number(profile.latitude)) ? Number(profile.latitude) : null,
        longitude: Number.isFinite(Number(profile.longitude)) ? Number(profile.longitude) : null,
      };
      await api(`/api/v1/therapists/${therapistId}`, {
        method: 'PATCH',
        body: {
          fullName: profile.name, phone: profile.phone, bio: profile.bio,
          specialization: profile.specialization,
          metadataJson: JSON.stringify(metadata),
        },
      });
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile.');
    } finally { setIsSaving(false); }
  };

  const handleChangePassword = async () => {
    setPasswordErr('');
    setPasswordMsg('');
    setPasswordSaving(true);
    try {
      const result = await changeTherapistPassword(
        currentPassword,
        newPassword,
        confirmPassword,
        loginEmail
      );
      setPasswordMsg(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordErr(mapPasswordChangeError(e));
    } finally {
      setPasswordSaving(false);
    }
  };

  const handlePickPhoto = async () => {
    setUploadingPhoto(true);
    try {
      // The photo used to be PATCHed to /therapists/{id} as `photoURL`, but
      // TherapistPatchRequest binds only six fields and none of them is a photo —
      // Jackson dropped it every time, so the upload succeeded and the picture
      // was gone on reload. pickAndUploadAvatar saves it on the user record,
      // which is what every avatar in the app now reads.
      const url = await pickAndUploadAvatar(therapistId);
      if (url) {
        setProfile(p => ({ ...p, photoURL: url, avatarUrl: url }));
        Alert.alert('Success', 'Profile photo updated.');
      }
    } catch (e) {
      Alert.alert('Could not update photo', e?.message || 'Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await performLogout();
        await AsyncStorage.clear();
        navigation.getParent()?.replace('Welcome');
      }},
    ]);
  };

  const toggleLanguage = (lang) => {
    setProfile(p => ({
      ...p,
      languages: p.languages.includes(lang)
        ? p.languages.filter(l => l !== lang)
        : [...p.languages, lang]
    }));
  };

  if (isLoading) return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
    </View>
  );

  const sections = [
    { id:'profile', label:'Profile', icon:'person-outline' },
    { id:'security', label:'Security', icon:'shield-outline' },
    { id:'availability', label:'Availability', icon:'calendar-outline' },
    { id:'notifications', label:'Notifications', icon:'notifications-outline' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabsContent}
      >
        {sections.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.tab, activeSection === s.id && styles.tabActive]}
            onPress={() => setActiveSection(s.id)}
            activeOpacity={0.85}
          >
            <Ionicons
              name={s.icon}
              size={16}
              color={activeSection === s.id ? '#fff' : TherapistColors.textSecondary}
            />
            <Text style={[styles.tabText, activeSection === s.id && styles.tabTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Profile Section ── */}
        {activeSection === 'profile' && (
          <View style={styles.sectionCard}>
            <View style={styles.photoSection}>
              <TouchableOpacity onPress={handlePickPhoto} style={styles.photoWrap} disabled={uploadingPhoto}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="large" color={TherapistColors.primary} />
                ) : profile.photoURL ? (
                  <Image source={{ uri: profile.photoURL }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Text style={styles.photoPlaceholderText}>{(profile.name||'T')[0].toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.cameraOverlay}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={styles.photoHint}>Tap to change photo</Text>
            </View>

            {/* Name */}
            <View>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <TextInput style={styles.input} value={profile.name} onChangeText={v=>setProfile(p=>({...p,name:v}))} placeholder="Your full name" placeholderTextColor={TherapistColors.textLight} />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Login email</Text>
              <TextInput
                style={[styles.input, styles.inputReadonly]}
                value={loginEmail}
                editable={false}
                placeholder="—"
                placeholderTextColor={TherapistColors.textLight}
              />
              <Text style={styles.fieldHint}>To change your sign-in email, use Security → Login email.</Text>
            </View>

            {/* Phone */}
            <View>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput style={styles.input} value={profile.phone} onChangeText={v=>setProfile(p=>({...p,phone:v}))} placeholder="+1 (555) 000-0000" placeholderTextColor={TherapistColors.textLight} keyboardType="phone-pad" />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput style={styles.input} value={profile.location || ''} onChangeText={v=>setProfile(p=>({...p,location:v}))} placeholder="City, State" placeholderTextColor={TherapistColors.textLight} />
              <TouchableOpacity style={[styles.locBtn, { opacity: locating ? 0.7 : 1 }]} onPress={() => detectAddress((loc) => {
                setProfile(p => ({
                  ...p,
                  location: loc.address || [loc.city, loc.country].filter(Boolean).join(', '),
                  country: loc.countryCode || p.country || '',
                  city: loc.city || p.city || '',
                  area: loc.area || p.area || '',
                  region: loc.region || p.region || '',
                  street: loc.street || p.street || '',
                  latitude: loc.latitude ?? p.latitude ?? null,
                  longitude: loc.longitude ?? p.longitude ?? null,
                }));
              })} disabled={locating}>
                <Ionicons name="locate-outline" size={14} color={TherapistColors.primary} />
                <Text style={styles.locBtnText}>{locating ? 'Detecting location…' : 'Use current location'}</Text>
              </TouchableOpacity>
              {!!locationMsg && <Text style={styles.locMsg}>{locationMsg}</Text>}
            </View>
            <View>
              <Text style={styles.fieldLabel}>City</Text>
              <TextInput style={styles.input} value={profile.city || ''} onChangeText={v=>setProfile(p=>({...p,city:v}))} placeholder="e.g. Accra" placeholderTextColor={TherapistColors.textLight} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Area / Locality</Text>
              <TextInput style={styles.input} value={profile.area || ''} onChangeText={v=>setProfile(p=>({...p,area:v}))} placeholder="e.g. East Legon" placeholderTextColor={TherapistColors.textLight} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Region / State</Text>
              <TextInput style={styles.input} value={profile.region || ''} onChangeText={v=>setProfile(p=>({...p,region:v}))} placeholder="e.g. Greater Accra" placeholderTextColor={TherapistColors.textLight} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Street</Text>
              <TextInput style={styles.input} value={profile.street || ''} onChangeText={v=>setProfile(p=>({...p,street:v}))} placeholder="e.g. Liberation Road" placeholderTextColor={TherapistColors.textLight} />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Ghana Digital Address (optional)</Text>
              <TextInput style={styles.input} value={profile.ghanaDigitalAddress || ''} onChangeText={v=>setProfile(p=>({...p,ghanaDigitalAddress:v}))} placeholder="e.g. GA-123-4567" placeholderTextColor={TherapistColors.textLight} />
            </View>

            {/* Bio */}
            <View>
              <Text style={styles.fieldLabel}>Professional Bio</Text>
              <TextInput style={[styles.input,{minHeight:90,textAlignVertical:'top'}]} multiline value={profile.bio} onChangeText={v=>setProfile(p=>({...p,bio:v}))} placeholder="Brief professional bio…" placeholderTextColor={TherapistColors.textLight} />
            </View>

            {/* Specialization */}
            <View>
              <Text style={styles.fieldLabel}>Specialization</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:8}}>
                {SPECIALIZATIONS.map(s => (
                  <TouchableOpacity key={s} style={[styles.chip, profile.specialization===s && styles.chipActive]} onPress={()=>setProfile(p=>({...p,specialization:s}))}>
                    <Text style={[styles.chipText, profile.specialization===s && {color:'#fff'}]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Experience */}
            <View>
              <Text style={styles.fieldLabel}>Years of Experience</Text>
              <TextInput style={styles.input} value={profile.experience} onChangeText={v=>setProfile(p=>({...p,experience:v}))} placeholder="e.g. 5" placeholderTextColor={TherapistColors.textLight} keyboardType="numeric" />
            </View>

            {/* Session rate — what a client is charged on the payment screen
                after choosing this therapist. Left blank, the payment screen
                shows "Rate not set" rather than a generic plan price. */}
            <View>
              <Text style={styles.fieldLabel}>Session Rate (GHS)</Text>
              <TextInput
                style={styles.input}
                value={String(profile.sessionRate ?? '')}
                onChangeText={v=>setProfile(p=>({...p,sessionRate:v.replace(/[^0-9.]/g,'')}))}
                placeholder="e.g. 150"
                placeholderTextColor={TherapistColors.textLight}
                keyboardType="numeric"
              />
            </View>

            {/* Languages */}
            <View>
              <Text style={styles.fieldLabel}>Languages</Text>
              <View style={styles.langGrid}>
                {LANGUAGES.map(l => (
                  <TouchableOpacity key={l} style={[styles.langChip, profile.languages?.includes(l) && styles.langChipActive]} onPress={()=>toggleLanguage(l)}>
                    <Text style={[styles.langChipText, profile.languages?.includes(l) && {color:'#fff'}]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
              onPress={handleSaveProfile}
              disabled={isSaving}
            >
              {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Security Section ── */}
        {activeSection === 'security' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionCardTitle}>Login email</Text>
            <Text style={styles.fieldHint}>
              Current: <Text style={styles.fieldHintStrong}>{loginEmail || '—'}</Text>. Changing this
              updates Firebase Authentication and your therapist profile.
            </Text>
            {emailErr ? (
              <View style={styles.alertErr}>
                <Text style={styles.alertErrText}>{emailErr}</Text>
              </View>
            ) : null}
            {emailMsg ? (
              <View style={styles.alertOk}>
                <Text style={styles.alertOkText}>{emailMsg}</Text>
              </View>
            ) : null}
            <View>
              <Text style={styles.fieldLabel}>New login email</Text>
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="new.email@example.com"
                placeholderTextColor={TherapistColors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
            <View>
              <Text style={styles.fieldLabel}>Current password</Text>
              <TextInput
                style={styles.input}
                value={emailPassword}
                onChangeText={setEmailPassword}
                placeholder="Confirm with your password"
                placeholderTextColor={TherapistColors.textLight}
                secureTextEntry
                autoComplete="password"
              />
            </View>
            <TouchableOpacity
              style={[styles.saveBtn, emailSaving && styles.saveBtnDisabled]}
              onPress={handleChangeLoginEmail}
              disabled={emailSaving}
            >
              {emailSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Update login email</Text>
              )}
            </TouchableOpacity>

            <View style={styles.subsection}>
              <Text style={styles.sectionCardTitle}>Change password</Text>
              <Text style={styles.fieldHint}>Enter your current password, then choose a new one (min. 6 characters).</Text>
              {passwordErr ? (
                <View style={styles.alertErr}>
                  <Text style={styles.alertErrText}>{passwordErr}</Text>
                </View>
              ) : null}
              {passwordMsg ? (
                <View style={styles.alertOk}>
                  <Text style={styles.alertOkText}>{passwordMsg}</Text>
                </View>
              ) : null}
              <View>
                <Text style={styles.fieldLabel}>Current password</Text>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Your current password"
                  placeholderTextColor={TherapistColors.textLight}
                  autoComplete="password"
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>New password</Text>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={TherapistColors.textLight}
                  autoComplete="new-password"
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Confirm new password</Text>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat new password"
                  placeholderTextColor={TherapistColors.textLight}
                  autoComplete="new-password"
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, passwordSaving && styles.saveBtnDisabled]}
                onPress={handleChangePassword}
                disabled={passwordSaving}
              >
                {passwordSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Update password</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={TherapistColors.error} />
              <Text style={styles.dangerBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Availability Section ── */}
        {activeSection === 'availability' && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Current Status</Text>
            {['available','busy','away','offline'].map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.statusOption, profile.availabilityStatus===s && styles.statusOptionActive]}
                onPress={() => setProfile(p=>({...p, availabilityStatus:s}))}
              >
                <View style={[styles.statusDot, { backgroundColor: s==='available'?TherapistColors.success : s==='busy'?TherapistColors.error : s==='away'?TherapistColors.warning : TherapistColors.textLight }]} />
                <Text style={[styles.statusOptionText, profile.availabilityStatus===s && {color:TherapistColors.primary, fontWeight:'700'}]}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </Text>
                {profile.availabilityStatus===s && <Ionicons name="checkmark-circle" size={18} color={TherapistColors.primary} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.saveBtn,{marginTop:8,opacity:isSaving?0.7:1}]} onPress={handleSaveProfile} disabled={isSaving}>
              {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Status</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Notifications Section ── */}
        {activeSection === 'notifications' && (
          <View style={styles.sectionCard}>
            {[
              { key:'sessionReminders', label:'Session Reminders', desc:'Get notified before upcoming sessions' },
              { key:'newMessages', label:'New Messages', desc:'Notifications for client messages' },
              { key:'systemUpdates', label:'System Updates', desc:'Platform updates and announcements' },
            ].map(({ key, label, desc }) => (
              <View key={key} style={styles.toggleRow}>
                <View style={{ flex:1 }}>
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Text style={styles.toggleDesc}>{desc}</Text>
                </View>
                <Switch
                  value={notifications[key]}
                  onValueChange={v => setNotifications(p=>({...p,[key]:v}))}
                  trackColor={{ false:'#e2e8f0', true: TherapistColors.primary }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  tabsScroll: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: TherapistColors.border,
    maxHeight: 56,
  },
  tabsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabActive: {
    backgroundColor: TherapistColors.primary,
    borderColor: TherapistColors.primary,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  tabTextActive: { color: '#fff' },

  contentScroll: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: TherapistColors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
    }),
  },

  photoSection: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 16,
  },
  photoWrap: { position: 'relative' },
  photo: { width: 88, height: 88, borderRadius: 44 },
  photoPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPlaceholderText: { fontSize: 32, fontWeight: '800', color: '#fff' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TherapistColors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  photoHint: { fontSize: 12, color: TherapistColors.textLight, marginTop: 10 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TherapistColors.textSecondary,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    color: TherapistColors.textLight,
    lineHeight: 18,
    marginBottom: 8,
  },
  fieldHintStrong: { fontWeight: '700', color: TherapistColors.textSecondary },
  inputReadonly: { backgroundColor: '#eef2f7', color: TherapistColors.textSecondary },
  alertErr: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fca5a5',
    marginBottom: 8,
  },
  alertErrText: { fontSize: 13, color: '#b91c1c', lineHeight: 18 },
  alertOk: {
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#86efac',
    marginBottom: 8,
  },
  alertOkText: { fontSize: 13, color: '#15803d', lineHeight: 18 },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: TherapistColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: TherapistColors.text,
  },

  chip: { paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1.5, borderColor: TherapistColors.border, backgroundColor:'#f8fafc', marginRight:8 },
  chipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  chipText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },

  langGrid: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 },
  langChip: { paddingHorizontal:12, paddingVertical:6, borderRadius:20, borderWidth:1.5, borderColor: TherapistColors.border, backgroundColor:'#f8fafc' },
  langChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  langChipText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },

  saveBtn: {
    backgroundColor: TherapistColors.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  locBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TherapistColors.primary + '40',
    backgroundColor: TherapistColors.primary + '14',
  },
  locBtnText: { color: TherapistColors.primary, fontWeight: '700', fontSize: 12 },
  locMsg: { marginTop: 6, color: TherapistColors.textSecondary, fontSize: 12, lineHeight: 16 },

  infoCard: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#fff', borderRadius:12, padding:14, borderWidth:1.5, borderColor: TherapistColors.border },
  infoCardLabel: { fontSize:12, color: TherapistColors.textLight, marginBottom:2 },
  infoCardValue: { fontSize:14, fontWeight:'600', color: TherapistColors.text },

  subsection: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#eef2f7',
  },
  sectionCardTitle: { fontSize: 16, fontWeight: '700', color: TherapistColors.text, marginBottom: 4 },
  sectionTitle: { fontSize:16, fontWeight:'700', color: TherapistColors.text },

  dangerBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, backgroundColor:'#fff0f3', borderRadius:12, paddingVertical:14, borderWidth:1.5, borderColor:'#fecdd3' },
  dangerBtnText: { color: TherapistColors.error, fontSize:15, fontWeight:'700' },

  statusOption: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#fff', borderRadius:12, padding:14, borderWidth:1.5, borderColor: TherapistColors.border },
  statusOptionActive: { borderColor: TherapistColors.primary, backgroundColor:'#eff6ff' },
  statusDot: { width:10, height:10, borderRadius:5 },
  statusOptionText: { flex:1, fontSize:14, color: TherapistColors.text, fontWeight:'500', textTransform:'capitalize' },

  toggleRow: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#fff', borderRadius:12, padding:14, borderWidth:1, borderColor: TherapistColors.border },
  toggleLabel: { fontSize:14, fontWeight:'600', color: TherapistColors.text, marginBottom:2 },
  toggleDesc: { fontSize:12, color: TherapistColors.textLight },
});

export default TherapistSettingsScreen;
