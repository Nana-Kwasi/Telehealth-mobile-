import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';
import useAddressAutofillMobile from '../hooks/useAddressAutofillMobile';

function roleTarget(role, profile) {
  const id = profile?.id || auth.currentUser?.uid || null;
  if (!id) return null;
  if (role === 'admin') return { collection: 'admins', id };
  if (role === 'doctor') return { collection: 'doctors', id };
  if (role === 'therapist') return { collection: 'therapists', id };
  if (role === 'pharmacy') return { collection: 'pharmacies', id };
  if (role === 'branch_user') return { collection: 'pharmacyBranches', id };
  if (role === 'lab') return { collection: 'labs', id };
  if (role === 'scan') return { collection: 'scanCenters', id };
  if (role === 'lab_branch') return { collection: 'labBranches', id };
  if (role === 'scan_branch') return { collection: 'scanBranches', id };
  return { collection: 'auth', id: auth.currentUser?.uid || id };
}

function hasLocationData(data) {
  if (!data) return false;
  const lat = Number(data?.latitude ?? data?.locationMeta?.latitude ?? data?.location?.latitude);
  const lng = Number(data?.longitude ?? data?.locationMeta?.longitude ?? data?.location?.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return true;
  return !!(data?.country || data?.city || data?.area || data?.region || data?.street);
}

export default function DashboardLocationGateMobile({ role, profile, userIntent, active = false }) {
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();
  const [form, setForm] = useState({
    country: '', city: '', area: '', region: '', street: '', ghanaDigitalAddress: '', latitude: '', longitude: '',
  });
  const target = useMemo(() => roleTarget(role, profile), [role, profile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!active || !target) {
        setChecking(false);
        setRequired(false);
        return;
      }
      setChecking(true);
      try {
        const snap = await getDoc(doc(db, target.collection, target.id));
        const data = snap.exists() ? snap.data() : {};
        if (!cancelled) {
          setForm((f) => ({
            ...f,
            country: data?.country || data?.locationMeta?.country || '',
            city: data?.city || data?.locationMeta?.city || '',
            area: data?.area || data?.locationMeta?.area || '',
            region: data?.region || data?.locationMeta?.region || '',
            street: data?.street || data?.locationMeta?.street || '',
            ghanaDigitalAddress: data?.ghanaDigitalAddress || '',
            latitude: data?.latitude ?? data?.locationMeta?.latitude ?? '',
            longitude: data?.longitude ?? data?.locationMeta?.longitude ?? '',
          }));
          setRequired(!hasLocationData(data));
        }
      } catch {
        if (!cancelled) setRequired(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active, target]);

  const saveLocation = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      const latitude = Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : null;
      const longitude = Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : null;
      const payload = {
        country: form.country || null,
        city: form.city || null,
        area: form.area || null,
        region: form.region || null,
        street: form.street || null,
        ghanaDigitalAddress: form.ghanaDigitalAddress || null,
        latitude,
        longitude,
        locationMeta: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude,
          longitude,
        },
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, target.collection, target.id), payload, { merge: true });
      if (role === 'client' || userIntent === 'medical') {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await setDoc(doc(db, 'auth', uid), payload, { merge: true }).catch(() => {});
          await setDoc(doc(db, 'patientProfiles', uid), payload, { merge: true }).catch(() => {});
        }
      }
      setRequired(false);
    } catch {
      setError('Could not save location. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (checking || !required) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>Complete Location Setup</Text>
          <Text style={s.sub}>
            Location access helps us provide better services like nearby pharmacies, labs, and doctors. You can continue manually, but some features may be limited.
          </Text>
          <TouchableOpacity style={s.locBtn} onPress={() => detectAddress((loc) => {
            setForm((f) => ({
              ...f,
              country: loc.countryCode || f.country,
              city: loc.city || f.city,
              area: loc.area || f.area,
              region: loc.region || f.region,
              street: loc.street || f.street,
              latitude: loc.latitude ?? f.latitude,
              longitude: loc.longitude ?? f.longitude,
            }));
          })} disabled={locating}>
            <Text style={s.locBtnText}>{locating ? 'Detecting…' : 'Use current location'}</Text>
          </TouchableOpacity>
          {!!locationMsg && <Text style={s.msg}>{locationMsg}</Text>}

          <ScrollView style={{ maxHeight: 280 }}>
            {[
              ['Country', 'country', 'e.g. GH'],
              ['City', 'city', 'e.g. Accra'],
              ['Area / Locality', 'area', 'e.g. East Legon'],
              ['Region / State', 'region', 'e.g. Greater Accra'],
              ['Street', 'street', 'e.g. Liberation Road'],
              ['Ghana Digital Address (optional)', 'ghanaDigitalAddress', 'e.g. GA-123-4567'],
              ['Latitude', 'latitude', 'Auto-detected'],
              ['Longitude', 'longitude', 'Auto-detected'],
            ].map(([label, key, placeholder]) => (
              <View key={key} style={{ marginBottom: 10 }}>
                <Text style={s.label}>{label}</Text>
                <TextInput value={String(form[key] ?? '')} onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))} placeholder={placeholder} placeholderTextColor="#94a3b8" style={s.input} />
              </View>
            ))}
          </ScrollView>
          {!!error && <Text style={s.err}>{error}</Text>}
          <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={saveLocation} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.saveBtnText}>Save Location</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.62)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  sub: { fontSize: 12, color: '#64748b', lineHeight: 18, marginBottom: 8 },
  locBtn: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#93c5fd', backgroundColor: '#eff6ff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6 },
  locBtnText: { color: '#1d4ed8', fontWeight: '700', fontSize: 12 },
  msg: { color: '#64748b', fontSize: 11, marginBottom: 6 },
  label: { fontSize: 12, color: '#475569', fontWeight: '700', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  err: { color: '#b91c1c', fontSize: 12, marginTop: 4 },
  saveBtn: { marginTop: 10, backgroundColor: '#2563eb', borderRadius: 10, alignItems: 'center', paddingVertical: 12 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
