import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import useAddressAutofillMobile from '../../hooks/useAddressAutofillMobile';
import { api } from '../../services/apiClient';

export default function EntityLocationSettingsScreen({ profile, collectionName = 'auth', title = 'Location Settings' }) {
  const [saving, setSaving] = useState(false);
  const { detectAddress, loading: locating, message: locationMsg } = useAddressAutofillMobile();

  const initial = useMemo(() => ({
    country: profile?.country || profile?.locationMeta?.country || profile?.location?.country || '',
    city: profile?.city || profile?.locationMeta?.city || profile?.location?.city || '',
    area: profile?.area || profile?.locationMeta?.area || profile?.location?.area || '',
    region: profile?.region || profile?.locationMeta?.region || profile?.location?.region || '',
    street: profile?.street || profile?.locationMeta?.street || profile?.location?.street || '',
    ghanaDigitalAddress: profile?.ghanaDigitalAddress || '',
    latitude: Number.isFinite(Number(profile?.latitude ?? profile?.locationMeta?.latitude ?? profile?.location?.latitude))
      ? String(profile?.latitude ?? profile?.locationMeta?.latitude ?? profile?.location?.latitude)
      : '',
    longitude: Number.isFinite(Number(profile?.longitude ?? profile?.locationMeta?.longitude ?? profile?.location?.longitude))
      ? String(profile?.longitude ?? profile?.locationMeta?.longitude ?? profile?.location?.longitude)
      : '',
  }), [profile]);

  const [form, setForm] = useState(initial);

  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!profile?.id) return;
    setSaving(true);
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
        location: {
          country: form.country || null,
          city: form.city || null,
          area: form.area || null,
          region: form.region || null,
          street: form.street || null,
          latitude,
          longitude,
        },
      };
      await api(`/api/v1/entity-operations/${collectionName}/${profile.id}/location`, { method: 'PATCH', body: payload });
      Alert.alert('Saved', 'Location updated successfully.');
    } catch {
      Alert.alert('Error', 'Could not save location. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={s.container} contentContainerStyle={s.content}>
      <Text style={s.title}>{title}</Text>
      <Text style={s.subtitle}>Keep this updated for accurate nearby assignment and routing.</Text>

      <TouchableOpacity
        style={[s.detectBtn, locating && { opacity: 0.7 }]}
        onPress={() => detectAddress((loc) => {
          setForm(prev => ({
            ...prev,
            country: loc.countryCode || prev.country || '',
            city: loc.city || prev.city || '',
            area: loc.area || prev.area || '',
            region: loc.region || prev.region || '',
            street: loc.street || prev.street || '',
            latitude: Number.isFinite(Number(loc.latitude)) ? String(loc.latitude) : prev.latitude,
            longitude: Number.isFinite(Number(loc.longitude)) ? String(loc.longitude) : prev.longitude,
          }));
        })}
        disabled={locating}
      >
        <Text style={s.detectBtnText}>{locating ? 'Detecting...' : 'Use current location'}</Text>
      </TouchableOpacity>
      {!!locationMsg && <Text style={s.help}>{locationMsg}</Text>}

      {[
        ['country', 'Country'],
        ['city', 'City'],
        ['area', 'Area / Locality'],
        ['region', 'Region / State'],
        ['street', 'Street'],
        ['ghanaDigitalAddress', 'Ghana Digital Address (optional)'],
        ['latitude', 'Latitude'],
        ['longitude', 'Longitude'],
      ].map(([key, label]) => (
        <View key={key} style={s.group}>
          <Text style={s.label}>{label}</Text>
          <TextInput
            value={form[key]}
            onChangeText={(v) => update(key, v)}
            style={s.input}
            autoCapitalize="none"
            keyboardType={key === 'latitude' || key === 'longitude' ? 'decimal-pad' : 'default'}
          />
        </View>
      ))}

      <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Location</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 24 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { marginTop: 4, marginBottom: 12, fontSize: 12, color: '#64748b' },
  detectBtn: {
    backgroundColor: '#e0e7ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  detectBtnText: { color: '#3730a3', fontWeight: '700', fontSize: 13 },
  help: { marginTop: 6, marginBottom: 4, fontSize: 11, color: '#64748b' },
  group: { marginTop: 10 },
  label: { marginBottom: 5, fontSize: 12, color: '#334155', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
