import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  Image,
  DeviceEventEmitter,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { api, getStoredUserId, uploadFile } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';
import useAddressAutofillMobile from '../../hooks/useAddressAutofillMobile';
import { resolveFileUrl } from '../../utils/mediaUrl';
import SecuritySettingsSection from '../../components/SecuritySettingsSection';

const TABS = ['Profile', 'Availability'];

export default function DoctorSettingsScreen() {
  const [tab, setTab] = useState('Profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();
  const [locationMeta, setLocationMeta] = useState({
    latitude: null,
    longitude: null,
    country: '',
    city: '',
    area: '',
    region: '',
    street: '',
  });

  // Profile
  const [form, setForm] = useState({
    name: '', specialty: '', phone: '', bio: '',
    location: '', consultationFee: '', languages: '',
    experience: '',
    consultationTypes: { video: false, chat: false, inPerson: false },
  });
  const [photoURL, setPhotoURL] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Availability
  const [availSlots, setAvailSlots] = useState([]);
  const [newSlot, setNewSlot] = useState({ date: '', startTime: '09:00', endTime: '17:00' });
  const [doctorName, setDoctorName] = useState('');

  // Password change
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: '', next: '', confirm: '' });
  const [changingPwd, setChangingPwd] = useState(false);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid) return;
      const data = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      if (data) {
        // GET /doctors/{id} returns only fullName/specialization/phone/location/bio
        // as columns — experience, fee, consultation types, languages, photo and
        // location meta are preserved inside metadataJson (a JSON string). Expand it
        // so every field the form edits actually loads back.
        let meta = {};
        try { meta = data.metadataJson ? JSON.parse(data.metadataJson) : {}; } catch { meta = {}; }
        const d = { ...meta, ...data };
        setDoctorName(d.name || d.fullName || '');
        setPhotoURL(d.photoURL || d.photoUrl || null);
        setForm({
          name: d.name || d.fullName || '',
          specialty: d.specialty || d.specialization || '',
          phone: d.phone || '',
          bio: d.bio || '',
          location: (typeof d.location === 'string' ? d.location : '') || d.city || '',
          consultationFee: d.consultationFee != null && d.consultationFee !== '' ? String(d.consultationFee) : '',
          languages: Array.isArray(d.languages) ? d.languages.join(', ') : (d.languages || ''),
          experience: d.experience != null && d.experience !== '' ? String(d.experience) : '',
          consultationTypes: {
            video: !!d.consultationTypes?.video,
            chat: !!d.consultationTypes?.chat,
            inPerson: !!d.consultationTypes?.inPerson,
          },
        });
        setLocationMeta({
          latitude: d.latitude ?? null,
          longitude: d.longitude ?? null,
          country: d.country || '',
          city: d.city || '',
          area: d.area || '',
          region: d.region || '',
          street: d.street || '',
        });
      }
      const avail = await api(`/api/v1/care/doctors/${uid}/availability?all=true`).catch(() => []);
      setAvailSlots((avail || []).sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    } catch (err) {
      console.error('DoctorSettings load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) { Alert.alert('Validation', 'Name is required.'); return; }
    setSaving(true);
    try {
      const uid = await getStoredUserId();
      // The backend PATCH only persists fullName/specialization/phone/location/bio
      // as columns; every other field must ride inside metadataJson or it is
      // silently dropped (and would never load back). Send the columns AND a full
      // metadataJson snapshot.
      const meta = {
        name: form.name.trim(),
        specialty: form.specialty.trim(),
        specialization: form.specialty.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        city: form.location.trim(),
        latitude: locationMeta.latitude ?? null,
        longitude: locationMeta.longitude ?? null,
        country: locationMeta.country || null,
        area: locationMeta.area || null,
        region: locationMeta.region || null,
        street: locationMeta.street || null,
        consultationFee: form.consultationFee ? Number(form.consultationFee) : null,
        languages: form.languages.split(',').map(l => l.trim()).filter(Boolean),
        experience: form.experience ? Number(form.experience) : null,
        consultationTypes: form.consultationTypes,
        photoURL: photoURL || null,
      };
      await api(`/api/v1/doctors/${uid}`, {
        method: 'PATCH',
        body: {
          fullName: form.name.trim(),
          specialization: form.specialty.trim(),
          phone: form.phone.trim(),
          location: form.location.trim(),
          bio: form.bio.trim(),
          metadataJson: JSON.stringify(meta),
        },
      });
      showSuccess('Profile saved successfully.');
    } catch (err) {
      Alert.alert('Error', 'Could not save profile.');
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
      await api('/api/v1/auth/password-change', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      setShowPwdModal(false);
      setPwdForm({ current: '', next: '', confirm: '' });
      showSuccess('Password changed successfully.');
    } catch (err) {
      Alert.alert('Error', err.message?.includes('incorrect') ? 'Current password is incorrect.' : 'Could not change password. Try again.');
    } finally {
      setChangingPwd(false);
    }
  };

  const addAvailability = async () => {
    if (!newSlot.date) { Alert.alert('Validation', 'Please enter a date.'); return; }
    if (newSlot.startTime >= newSlot.endTime) { Alert.alert('Validation', 'End time must be after start time.'); return; }
    setSavingAvail(true);
    try {
      // Build 30-min slots between start and end
      const slots = [];
      let [h, m] = newSlot.startTime.split(':').map(Number);
      const [eh, em] = newSlot.endTime.split(':').map(Number);
      while (h < eh || (h === eh && m < em)) {
        slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        m += 30;
        if (m >= 60) { h += 1; m -= 60; }
      }

      const uid = await getStoredUserId();
      const created = await api(`/api/v1/care/doctors/${uid}/availability`, {
        method: 'POST',
        body: { doctorName: doctorName || form.name, date: newSlot.date, startTime: newSlot.startTime, endTime: newSlot.endTime, slots, booked: [] },
      });
      setAvailSlots(prev => [...prev, { id: created?.id || Date.now().toString(), ...newSlot, slots, booked: [] }].sort((a, b) => (a.date || '').localeCompare(b.date || '')));
      setNewSlot({ date: '', startTime: '09:00', endTime: '17:00' });
      showSuccess('Availability added.');
    } catch (err) {
      Alert.alert('Error', 'Could not add availability.');
    } finally {
      setSavingAvail(false);
    }
  };

  const removeAvailability = async (slotId) => {
    Alert.alert('Remove', 'Remove this availability slot?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          const uid = await getStoredUserId();
          await api(`/api/v1/care/doctors/${uid}/availability/${slotId}`, { method: 'DELETE' });
          setAvailSlots(prev => prev.filter(s => s.id !== slotId));
        } catch {
          Alert.alert('Error', 'Could not remove slot.');
        }
      }},
    ]);
  };

  const pickAndUploadPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to upload a profile picture.');
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
      const uid = await getStoredUserId();
      const uri = result.assets[0].uri;
      const downloadURL = await uploadFile(`doctor-photos/${uid}`, uri, 'image/jpeg');
      // photoURL isn't a doctor column — persist it inside metadataJson (merged with
      // the existing metadata) so it survives and loads back on the profile.
      const cur = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      let meta = {};
      try { meta = cur?.metadataJson ? JSON.parse(cur.metadataJson) : {}; } catch { meta = {}; }
      meta.photoURL = downloadURL;
      await api(`/api/v1/doctors/${uid}`, { method: 'PATCH', body: { metadataJson: JSON.stringify(meta) } });
      setPhotoURL(downloadURL);
      DeviceEventEmitter.emit('refreshProfile');
      showSuccess('Profile photo updated!');
    } catch (err) {
      console.error('Photo upload error:', err);
      Alert.alert('Upload failed', 'Could not upload photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = () => {
    Alert.alert('Remove Photo', 'Remove your profile picture?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setUploadingPhoto(true);
        try {
          const uid = await getStoredUserId();
          await api(`/api/v1/doctors/${uid}`, { method: 'PATCH', body: { photoURL: null } });
          setPhotoURL(null);
          DeviceEventEmitter.emit('refreshProfile');
          showSuccess('Profile photo removed.');
        } catch (err) {
          Alert.alert('Error', 'Could not remove photo.');
        } finally {
          setUploadingPhoto(false);
        }
      }},
    ]);
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const setField = (field, val) => setForm(p => ({ ...p, [field]: val }));
  const setConsultType = (type) => setForm(p => ({
    ...p,
    consultationTypes: { ...p.consultationTypes, [type]: !p.consultationTypes[type] }
  }));

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {successMsg ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={16} color="#15803d" />
          <Text style={styles.successText}>{successMsg}</Text>
        </View>
      ) : null}

      {/* Profile Tab */}
      {tab === 'Profile' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Shared with every role. 2FA and biometric sign-in existed
            only in the medical patient screen, so a clinician could not
            reach either. */}
        <SecuritySettingsSection accent={DoctorColors.primary} />
          {/* Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarWrapper}>
              {photoURL ? (
                <Image source={{ uri: resolveFileUrl(photoURL)}} style={styles.avatarLargeImg} />
              ) : (
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarText}>{(form.name || 'D')[0].toUpperCase()}</Text>
                </View>
              )}
              {uploadingPhoto && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
            </View>

            <Text style={styles.headerName}>Dr. {form.name || 'Doctor'}</Text>
            <Text style={styles.headerSpecialty}>{form.specialty || 'General Practice'}</Text>

            <View style={styles.photoActions}>
              <TouchableOpacity style={styles.photoBtn} onPress={pickAndUploadPhoto} disabled={uploadingPhoto}>
                <Ionicons name={photoURL ? 'camera' : 'camera-outline'} size={15} color={DoctorColors.primary} />
                <Text style={styles.photoBtnText}>{photoURL ? 'Change Photo' : 'Upload Photo'}</Text>
              </TouchableOpacity>
              {photoURL && (
                <TouchableOpacity style={[styles.photoBtn, styles.photoBtnRemove]} onPress={removePhoto} disabled={uploadingPhoto}>
                  <Ionicons name="trash-outline" size={15} color="#ef4444" />
                  <Text style={[styles.photoBtnText, { color: '#ef4444' }]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <Field label="Full Name *" value={form.name} onChange={v => setField('name', v)} placeholder="Dr. Full Name" />
          <Field label="Specialty / Specialization" value={form.specialty} onChange={v => setField('specialty', v)} placeholder="e.g. General Practice" />
          <Field label="Years of Experience" value={form.experience} onChange={v => setField('experience', v)} placeholder="e.g. 10" keyboardType="numeric" />
          <Field label="Consultation Fee (GHS)" value={form.consultationFee} onChange={v => setField('consultationFee', v)} placeholder="e.g. 150" keyboardType="numeric" />
          <Field label="Phone Number" value={form.phone} onChange={v => setField('phone', v)} placeholder="+233..." keyboardType="phone-pad" />
          <Field label="Location / City" value={form.location} onChange={v => setField('location', v)} placeholder="e.g. Accra, Ghana" />
          <View style={{ marginTop: -8, marginBottom: 10 }}>
            <TouchableOpacity style={styles.locBtn} onPress={() => detectAddress((loc) => {
              const display = [loc.city, loc.country].filter(Boolean).join(', ') || loc.address || '';
              if (display) setField('location', display);
              setLocationMeta({
                latitude: loc.latitude ?? null,
                longitude: loc.longitude ?? null,
                country: loc.country || '',
                city: loc.city || '',
                area: loc.area || '',
                region: loc.region || '',
                street: loc.street || '',
              });
            })} disabled={locating}>
              <Ionicons name="locate-outline" size={15} color={DoctorColors.primary} />
              <Text style={styles.locBtnText}>{locating ? 'Detecting location…' : 'Use current location'}</Text>
            </TouchableOpacity>
            {!!locationMsg && <Text style={styles.locMsg}>{locationMsg}</Text>}
          </View>
          <Field label="Languages (comma-separated)" value={form.languages} onChange={v => setField('languages', v)} placeholder="e.g. English, Twi" />
          <Field label="Bio / About" value={form.bio} onChange={v => setField('bio', v)} placeholder="Tell patients about yourself..." multiline />

          {/* Consultation Types */}
          <Text style={styles.sectionLabel}>Consultation Types</Text>
          {[
            { key: 'video',    label: 'Video Consultation' },
            { key: 'chat',     label: 'Chat / Messaging' },
            { key: 'inPerson', label: 'In-Person' },
          ].map(ct => (
            <View key={ct.key} style={styles.switchRow}>
              <Text style={styles.switchLabel}>{ct.label}</Text>
              <Switch
                value={!!form.consultationTypes[ct.key]}
                onValueChange={() => setConsultType(ct.key)}
                trackColor={{ true: DoctorColors.primary, false: '#e2e8f0' }}
                thumbColor="#fff"
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Profile</Text>}
          </TouchableOpacity>

          {/* Change Password */}
          <TouchableOpacity style={styles.changePwdBtn} onPress={() => setShowPwdModal(true)}>
            <Ionicons name="lock-closed-outline" size={18} color={DoctorColors.primary} />
            <Text style={styles.changePwdText}>Change Password</Text>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          {/* Password Modal */}
          {showPwdModal && (
            <KeyboardAvoidingView
        style={styles.pwdOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
              <View style={styles.pwdCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="lock-closed" size={20} color={DoctorColors.primary} />
                  <Text style={[styles.sectionLabel, { marginLeft: 8, marginBottom: 0 }]}>Change Password</Text>
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
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.input}
                      value={pwdForm[f.key]}
                      onChangeText={v => setPwdForm(p => ({ ...p, [f.key]: v }))}
                      placeholder={f.placeholder}
                      placeholderTextColor="#94a3b8"
                      secureTextEntry
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.saveBtn, changingPwd && { opacity: 0.7 }]}
                  onPress={handleChangePassword}
                  disabled={changingPwd}
                >
                  {changingPwd ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Update Password</Text>}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          )}
        </ScrollView>
      )}

      {/* Availability Tab */}
      {tab === 'Availability' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionLabel}>Add Availability</Text>

          <Field
            label="Date (YYYY-MM-DD) *"
            value={newSlot.date}
            onChange={v => setNewSlot(p => ({ ...p, date: v }))}
            placeholder="e.g. 2025-04-20"
          />
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Start Time</Text>
              <TextInput
                style={styles.input}
                value={newSlot.startTime}
                onChangeText={v => setNewSlot(p => ({ ...p, startTime: v }))}
                placeholder="HH:MM"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>End Time</Text>
              <TextInput
                style={styles.input}
                value={newSlot.endTime}
                onChangeText={v => setNewSlot(p => ({ ...p, endTime: v }))}
                placeholder="HH:MM"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addSlotBtn, savingAvail && { opacity: 0.6 }]}
            onPress={addAvailability}
            disabled={savingAvail}
          >
            {savingAvail
              ? <ActivityIndicator color="#fff" size="small" />
              : <><Ionicons name="add-circle-outline" size={18} color="#fff" /><Text style={styles.addSlotText}>Add Availability</Text></>
            }
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Upcoming Availability</Text>

          {availSlots.length === 0 ? (
            <View style={styles.emptyAvail}>
              <Ionicons name="calendar-outline" size={36} color="#cbd5e1" />
              <Text style={styles.emptyAvailText}>No availability slots added yet</Text>
            </View>
          ) : (
            availSlots.map(slot => {
              const available = (slot.slots || []).length - (slot.booked || []).length;
              return (
                <View key={slot.id} style={styles.slotRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.slotDate}>{slot.date}</Text>
                    <Text style={styles.slotTime}>{slot.startTime} – {slot.endTime}</Text>
                    <Text style={styles.slotInfo}>
                      {available} / {(slot.slots || []).length} slots · {(slot.booked || []).length} booked
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeAvailability(slot.id)} style={styles.removeBtn}>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, multiline, keyboardType }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType || 'default'}
        autoCapitalize="none"
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  tabItem: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: DoctorColors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: DoctorColors.textSecondary },
  tabTextActive: { color: DoctorColors.primary },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f0fdf4', padding: 10, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#bbf7d0',
  },
  successText: { fontSize: 13, color: '#0f5628', fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  profileHeader: {
    alignItems: 'center', marginBottom: 24,
    backgroundColor: '#fff', borderRadius: 14, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 1,
  },
  avatarWrapper: { position: 'relative', marginBottom: 10 },
  avatarLargeImg: {
    width: 86, height: 86, borderRadius: 43,
    borderWidth: 3, borderColor: DoctorColors.primaryLight,
  },
  avatarLarge: {
    width: 86, height: 86, borderRadius: 43,
    backgroundColor: DoctorColors.primary,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: DoctorColors.primaryLight,
  },
  avatarOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 43, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  headerName: { fontSize: 17, fontWeight: '800', color: DoctorColors.text, marginBottom: 2 },
  headerSpecialty: { fontSize: 13, color: DoctorColors.textSecondary, marginBottom: 12 },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: DoctorColors.primaryLight,
    borderWidth: 1, borderColor: DoctorColors.primary + '30',
  },
  photoBtnRemove: {
    backgroundColor: '#fff1f2', borderColor: '#fecdd3',
  },
  photoBtnText: { fontSize: 13, color: DoctorColors.primary, fontWeight: '600' },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: DoctorColors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 14,
  },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: DoctorColors.text, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 10, padding: 13,
    fontSize: 15, color: DoctorColors.text,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  inputMulti: { height: 100, textAlignVertical: 'top' },
  locBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: DoctorColors.primary + '40',
    backgroundColor: DoctorColors.primaryLight,
  },
  locBtnText: { fontSize: 12, color: DoctorColors.primary, fontWeight: '700' },
  locMsg: { marginTop: 6, fontSize: 11, color: '#64748b', lineHeight: 16 },
  switchRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#e2e8f0',
  },
  switchLabel: { fontSize: 14, color: DoctorColors.text, fontWeight: '500' },
  saveBtn: {
    backgroundColor: DoctorColors.primary, borderRadius: 12,
    padding: 15, alignItems: 'center', marginTop: 10,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  timeRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  addSlotBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: DoctorColors.primary, borderRadius: 12, padding: 14, marginTop: 8,
  },
  addSlotText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyAvail: { alignItems: 'center', paddingVertical: 30, gap: 8 },
  emptyAvailText: { fontSize: 13, color: '#94a3b8' },
  slotRow: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#f1f5f9',
  },
  slotDate: { fontSize: 14, fontWeight: '700', color: DoctorColors.text },
  slotTime: { fontSize: 13, color: DoctorColors.textSecondary, marginTop: 2 },
  slotInfo: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  removeBtn: { padding: 6 },
  changePwdBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: DoctorColors.primaryLight, borderRadius: 12, padding: 14, marginTop: 8,
    borderWidth: 1, borderColor: DoctorColors.primary + '30',
  },
  changePwdText: { fontSize: 14, fontWeight: '600', color: DoctorColors.text },
  pwdOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  pwdCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%' },
});
