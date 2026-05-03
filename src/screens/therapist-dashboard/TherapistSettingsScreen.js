import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, ActivityIndicator, Alert, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage } from '../../services/firebaseConfig';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut, updatePassword, updateEmail } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TherapistColors } from '../../constants/colors';
import useAddressAutofillMobile from '../../hooks/useAddressAutofillMobile';

const SPECIALIZATIONS = ['CBT','Trauma','Anxiety & Depression','Couples Therapy','Teen & Adolescent','Family Therapy','Substance Abuse','PTSD','Grief & Loss','Other'];
const LANGUAGES = ['English','Spanish','French','Arabic','Mandarin','Portuguese','Other'];

const TherapistSettingsScreen = ({ navigation }) => {
  const [profile, setProfile] = useState({
    name: '', email: '', phone: '', bio: '', specialization: '', experience: '',
    languages: [], photoURL: '', availabilityStatus: 'available',
    location: '', country: '', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: null, longitude: null,
  });
  const [notifications, setNotifications] = useState({ sessionReminders: true, newMessages: true, systemUpdates: true });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();

  const currentUser = auth.currentUser;

  useEffect(() => { if (currentUser) loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const snap = await getDoc(doc(db, 'therapists', currentUser.uid));
      if (snap.exists()) {
        const data = snap.data();
        setProfile(prev => ({ ...prev, ...data, email: data.email || currentUser.email || '' }));
      }
    } catch (e) { console.error('Load profile error:', e); }
    finally { setIsLoading(false); }
  };

  const handleSaveProfile = async () => {
    if (!profile.name.trim()) { Alert.alert('Error', 'Name is required.'); return; }
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'therapists', currentUser.uid), {
        name: profile.name,
        phone: profile.phone,
        bio: profile.bio,
        specialization: profile.specialization,
        experience: profile.experience,
        location: profile.location || '',
        country: profile.country || null,
        city: profile.city || null,
        area: profile.area || null,
        region: profile.region || null,
        street: profile.street || null,
        ghanaDigitalAddress: profile.ghanaDigitalAddress || null,
        latitude: Number.isFinite(Number(profile.latitude)) ? Number(profile.latitude) : null,
        longitude: Number.isFinite(Number(profile.longitude)) ? Number(profile.longitude) : null,
        locationMeta: {
          country: profile.country || null,
          city: profile.city || null,
          area: profile.area || null,
          region: profile.region || null,
          street: profile.street || null,
          latitude: Number.isFinite(Number(profile.latitude)) ? Number(profile.latitude) : null,
          longitude: Number.isFinite(Number(profile.longitude)) ? Number(profile.longitude) : null,
        },
        languages: profile.languages,
        availabilityStatus: profile.availabilityStatus,
        updatedAt: serverTimestamp(),
      });
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile.');
    } finally { setIsSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) { Alert.alert('Error', 'Password must be at least 6 characters.'); return; }
    if (newPassword !== confirmPassword) { Alert.alert('Error', 'Passwords do not match.'); return; }
    try {
      await updatePassword(currentUser, newPassword);
      setNewPassword(''); setConfirmPassword('');
      Alert.alert('Success', 'Password updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update password.');
    }
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission required', 'Photo library access is needed.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) {
      setUploadingPhoto(true);
      try {
        const asset = result.assets[0];
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const storageRef = ref(storage, `therapistPhotos/${currentUser.uid}.jpg`);
        await uploadBytes(storageRef, blob);
        const url = await getDownloadURL(storageRef);
        await updateDoc(doc(db, 'therapists', currentUser.uid), { photoURL: url });
        setProfile(p => ({ ...p, photoURL: url }));
        Alert.alert('Success', 'Profile photo updated.');
      } catch (e) {
        Alert.alert('Error', 'Failed to upload photo.');
      } finally { setUploadingPhoto(false); }
    }
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        await signOut(auth);
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
    <View style={styles.container}>
      {/* Section Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {sections.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.tab, activeSection===s.id && styles.tabActive]}
            onPress={() => setActiveSection(s.id)}
          >
            <Ionicons name={s.icon} size={16} color={activeSection===s.id ? '#fff' : TherapistColors.textSecondary} />
            <Text style={[styles.tabText, activeSection===s.id && styles.tabTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:16, paddingBottom:40 }} showsVerticalScrollIndicator={false}>

        {/* ── Profile Section ── */}
        {activeSection === 'profile' && (
          <View style={{ gap:14 }}>
            {/* Photo */}
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

            <TouchableOpacity style={[styles.saveBtn, {opacity:isSaving?0.7:1}]} onPress={handleSaveProfile} disabled={isSaving}>
              {isSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Security Section ── */}
        {activeSection === 'security' && (
          <View style={{ gap:14 }}>
            <View style={styles.infoCard}>
              <Ionicons name="mail-outline" size={20} color={TherapistColors.primary} />
              <View style={{ flex:1 }}>
                <Text style={styles.infoCardLabel}>Email Address</Text>
                <Text style={styles.infoCardValue}>{profile.email || currentUser?.email}</Text>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionCardTitle}>Change Password</Text>
              <View style={{ gap:10 }}>
                <View>
                  <Text style={styles.fieldLabel}>New Password</Text>
                  <TextInput style={styles.input} secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="At least 6 characters" placeholderTextColor={TherapistColors.textLight} />
                </View>
                <View>
                  <Text style={styles.fieldLabel}>Confirm Password</Text>
                  <TextInput style={styles.input} secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Repeat new password" placeholderTextColor={TherapistColors.textLight} />
                </View>
                <TouchableOpacity style={styles.saveBtn} onPress={handleChangePassword}>
                  <Text style={styles.saveBtnText}>Update Password</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={styles.dangerBtn} onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={18} color={TherapistColors.error} />
              <Text style={styles.dangerBtnText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Availability Section ── */}
        {activeSection === 'availability' && (
          <View style={{ gap:14 }}>
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
          <View style={{ gap:14 }}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex:1, justifyContent:'center', alignItems:'center' },

  tabsScroll: { backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor: TherapistColors.border },
  tabs: { padding:12, gap:8 },
  tab: { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:14, paddingVertical:8, borderRadius:20, backgroundColor:'#f1f5f9' },
  tabActive: { backgroundColor: TherapistColors.primary },
  tabText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },
  tabTextActive: { color:'#fff' },

  photoSection: { alignItems:'center', paddingVertical:16 },
  photoWrap: { position:'relative', marginBottom:8 },
  photo: { width:90, height:90, borderRadius:45 },
  photoPlaceholder: { width:90, height:90, borderRadius:45, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
  photoPlaceholderText: { fontSize:36, fontWeight:'800', color:'#fff' },
  cameraOverlay: { position:'absolute', bottom:0, right:0, width:28, height:28, borderRadius:14, backgroundColor: TherapistColors.secondary, justifyContent:'center', alignItems:'center', borderWidth:2, borderColor:'#fff' },
  photoHint: { fontSize:12, color: TherapistColors.textLight },

  fieldLabel: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary, marginBottom:4 },
  input: { backgroundColor:'#fff', borderRadius:12, borderWidth:1.5, borderColor: TherapistColors.border, padding:12, fontSize:14, color: TherapistColors.text },

  chip: { paddingHorizontal:13, paddingVertical:7, borderRadius:20, borderWidth:1.5, borderColor: TherapistColors.border, backgroundColor:'#f8fafc', marginRight:8 },
  chipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  chipText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },

  langGrid: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8 },
  langChip: { paddingHorizontal:12, paddingVertical:6, borderRadius:20, borderWidth:1.5, borderColor: TherapistColors.border, backgroundColor:'#f8fafc' },
  langChipActive: { backgroundColor: TherapistColors.primary, borderColor: TherapistColors.primary },
  langChipText: { fontSize:13, fontWeight:'600', color: TherapistColors.textSecondary },

  saveBtn: { backgroundColor: TherapistColors.primary, borderRadius:12, paddingVertical:15, alignItems:'center' },
  saveBtnText: { color:'#fff', fontSize:15, fontWeight:'700' },
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

  sectionCard: { backgroundColor:'#fff', borderRadius:14, padding:16, gap:12, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.04, shadowRadius:4, elevation:1 },
  sectionCardTitle: { fontSize:16, fontWeight:'700', color: TherapistColors.text },
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
