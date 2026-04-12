import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Switch,
  Image, DeviceEventEmitter,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage } from '../../services/firebaseConfig';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  doc, getDoc, updateDoc, serverTimestamp,
  collection, getDocs, addDoc, deleteDoc, query, where, orderBy,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

const TABS = ['Profile', 'Availability'];

export default function DoctorSettingsScreen() {
  const [tab, setTab] = useState('Profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAvail, setSavingAvail] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

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

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;
      const snap = await getDoc(doc(db, 'doctors', cu.uid));
      if (snap.exists()) {
        const data = snap.data();
        setDoctorName(data.name || '');
        setPhotoURL(data.photoURL || null);
        setForm({
          name: data.name || '',
          specialty: data.specialty || data.specialization || '',
          phone: data.phone || '',
          bio: data.bio || '',
          location: data.location || data.city || '',
          consultationFee: data.consultationFee ? String(data.consultationFee) : '',
          languages: Array.isArray(data.languages) ? data.languages.join(', ') : (data.languages || ''),
          experience: data.experience ? String(data.experience) : '',
          consultationTypes: {
            video: !!data.consultationTypes?.video,
            chat: !!data.consultationTypes?.chat,
            inPerson: !!data.consultationTypes?.inPerson,
          },
        });
      }

      // Load availability
      const availSnap = await getDocs(
        query(collection(db, 'doctorAvailability'), where('doctorId', '==', cu.uid), orderBy('date', 'asc'))
      );
      setAvailSlots(availSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
      const cu = auth.currentUser;
      await updateDoc(doc(db, 'doctors', cu.uid), {
        name: form.name.trim(),
        specialty: form.specialty.trim(),
        specialization: form.specialty.trim(),
        phone: form.phone.trim(),
        bio: form.bio.trim(),
        location: form.location.trim(),
        city: form.location.trim(),
        consultationFee: form.consultationFee ? Number(form.consultationFee) : null,
        languages: form.languages.split(',').map(l => l.trim()).filter(Boolean),
        experience: form.experience ? Number(form.experience) : null,
        consultationTypes: form.consultationTypes,
        updatedAt: serverTimestamp(),
      });
      showSuccess('Profile saved successfully.');
    } catch (err) {
      Alert.alert('Error', 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  };

  const addAvailability = async () => {
    if (!newSlot.date) { Alert.alert('Validation', 'Please enter a date.'); return; }
    if (newSlot.startTime >= newSlot.endTime) { Alert.alert('Validation', 'End time must be after start time.'); return; }
    setSavingAvail(true);
    try {
      const cu = auth.currentUser;
      // Build 30-min slots between start and end
      const slots = [];
      let [h, m] = newSlot.startTime.split(':').map(Number);
      const [eh, em] = newSlot.endTime.split(':').map(Number);
      while (h < eh || (h === eh && m < em)) {
        slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        m += 30;
        if (m >= 60) { h += 1; m -= 60; }
      }

      const docRef = await addDoc(collection(db, 'doctorAvailability'), {
        doctorId: cu.uid,
        doctorName: doctorName || form.name,
        date: newSlot.date,
        startTime: newSlot.startTime,
        endTime: newSlot.endTime,
        slots,
        booked: [],
        createdAt: serverTimestamp(),
      });
      setAvailSlots(prev => [...prev, { id: docRef.id, ...newSlot, slots, booked: [] }].sort((a, b) => a.date.localeCompare(b.date)));
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
          await deleteDoc(doc(db, 'doctorAvailability', slotId));
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
      const cu = auth.currentUser;
      const uri = result.assets[0].uri;

      // Upload to Firebase Storage
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `doctor-photos/${cu.uid}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Save to Firestore
      await updateDoc(doc(db, 'doctors', cu.uid), { photoURL: downloadURL, updatedAt: serverTimestamp() });
      setPhotoURL(downloadURL);

      // Notify all screens to refresh profile
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
          const cu = auth.currentUser;
          // Remove from Storage (ignore error if not there)
          try { await deleteObject(ref(storage, `doctor-photos/${cu.uid}`)); } catch (_) {}
          // Clear in Firestore
          await updateDoc(doc(db, 'doctors', cu.uid), { photoURL: null, updatedAt: serverTimestamp() });
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
          {/* Header */}
          <View style={styles.profileHeader}>
            <View style={styles.avatarWrapper}>
              {photoURL ? (
                <Image source={{ uri: photoURL }} style={styles.avatarLargeImg} />
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
  successText: { fontSize: 13, color: '#15803d', fontWeight: '600' },
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
});
