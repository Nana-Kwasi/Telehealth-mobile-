import React, { useCallback, useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import {
  createEmergencyBooking,
  getCurrentLocationMobile,
  resolveBookingCoords,
  reverseGeocodeMobile,
} from '../../../services/homeCareService';
import { CARE_TYPES, EMERGENCY_DISCLAIMER, BOOKING_FEE_DISCLAIMER } from '../../../constants/homeCareConstants';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import { requireHomeCarePatient } from '../../../utils/homeCarePatientAuth';
import { isValidEmergencyPhone } from '../../../utils/homeCareUtils';
import { api, getStoredUserId } from '../../../services/apiClient';

export default function HomeCareEmergencyScreen({ navigation }) {
  const [careType, setCareType] = useState('general');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locLoading, setLocLoading] = useState(true);
  const [locFailed, setLocFailed] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);

  const detectLocation = useCallback(async () => {
    setLocLoading(true);
    setLocFailed(false);
    try {
      const loc = await getCurrentLocationMobile();
      if (!loc) {
        setLocFailed(true);
        setManualOnly(true);
        return;
      }
      setCoords(loc);
      const label = await reverseGeocodeMobile(loc.latitude, loc.longitude);
      if (label) setAddress(label);
      else {
        setLocFailed(true);
        setManualOnly(true);
      }
    } catch {
      setLocFailed(true);
      setManualOnly(true);
    } finally {
      setLocLoading(false);
    }
  }, []);

  useEffect(() => {
    detectLocation();
  }, [detectLocation]);

  useEffect(() => {
    getStoredUserId().then(uid => {
      if (!uid) return;
      api(`/api/v1/patients/${uid}`).then(d => {
        const p = d?.phone || d?.phoneNumber || '';
        if (p) setPhone(String(p));
      }).catch(() => {});
    });
  }, []);

  const submit = async () => {
    if (!requireHomeCarePatient(navigation, {
      returnScreen: 'HomeCareEmergency',
      message: 'Sign up to send an emergency home-care request.',
    })) return;
    if (!address.trim()) {
      Alert.alert('Address required', 'Where should the nurse come?');
      return;
    }
    const phoneTrim = phone.trim();
    if (!phoneTrim) {
      Alert.alert('Phone required', 'Add your number so the nurse can call you.');
      return;
    }
    if (!isValidEmergencyPhone(phoneTrim)) {
      Alert.alert('Invalid phone', 'Use at least 8 digits (country code ok).');
      return;
    }
    setSaving(true);
    try {
      const resolved = coords || (await resolveBookingCoords(address.trim(), null));
      const id = await createEmergencyBooking({
        careType,
        address: address.trim(),
        patientPhone: phoneTrim,
        latitude: resolved?.latitude ?? null,
        longitude: resolved?.longitude ?? null,
        patientLatitude: resolved?.latitude ?? null,
        patientLongitude: resolved?.longitude ?? null,
        specialNotes: notes.trim(),
        referenceFeeLabel: 'Emergency visit (agreed with nurse)',
        referenceFeeAmount: 0,
        feeDisclaimerAccepted: true,
      });
      navigation.replace('HomeCareBookingStatus', { bookingId: id });
    } catch (e) {
      Alert.alert('Request failed', e.message || 'Try again.');
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
      keyboardShouldPersistTaps="handled" style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Emergency request</Text>
      <Text style={hc.sub}>{EMERGENCY_DISCLAIMER}</Text>
      <View style={[hc.card, { borderColor: C.emergency, backgroundColor: '#fef2f2' }]}>
        <Text style={{ color: C.emergency, fontWeight: '800' }}>Urgent at-home care</Text>
        <Text style={[hc.sub, { color: '#991b1b', marginTop: 4 }]}>
          Broadcast to online nurses within ~25 km. The first nurse to accept is assigned — not a specific nurse.
        </Text>
      </View>

      <Text style={hc.label}>Care needed</Text>
      {CARE_TYPES.map((c) => (
        <TouchableOpacity
          key={c.value}
          style={[hc.chip, careType === c.value && hc.chipActive, { marginBottom: 6 }]}
          onPress={() => setCareType(c.value)}
        >
          <Text style={[hc.chipText, careType === c.value && { color: '#fff' }]}>{c.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={hc.label}>Your location *</Text>
      {locLoading ? (
        <View style={[hc.row, { marginBottom: 8 }]}>
          <ActivityIndicator color={C.primary} />
          <Text style={[hc.sub, { marginLeft: 8 }]}>Detecting your location…</Text>
        </View>
      ) : null}
      {!locLoading && locFailed ? (
        <Text style={[hc.sub, { color: '#b45309', marginBottom: 8 }]}>
          Could not detect location. Enter your address manually or tap retry.
        </Text>
      ) : null}
      {!locLoading && !manualOnly && address ? (
        <Text style={[hc.sub, { marginBottom: 6 }]}>Location detected — edit if needed.</Text>
      ) : null}
      <TextInput
        style={hc.input}
        placeholder="Full address"
        value={address}
        onChangeText={setAddress}
        editable={!locLoading}
      />
      <TouchableOpacity style={hc.btnOutline} onPress={detectLocation} disabled={locLoading}>
        <Text style={hc.btnOutlineText}>{locLoading ? 'Detecting…' : 'Use my location'}</Text>
      </TouchableOpacity>

      <Text style={hc.label}>Your phone number *</Text>
      <TextInput
        style={hc.input}
        placeholder="e.g. +233 24 000 0000"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
      />
      <Text style={[hc.sub, { marginBottom: 10 }]}>Required so an assigned nurse can reach you.</Text>

      <Text style={hc.label}>Describe the emergency</Text>
      <TextInput style={[hc.input, { minHeight: 90 }]} multiline value={notes} onChangeText={setNotes} />

      <Text style={hc.disclaimer}>{BOOKING_FEE_DISCLAIMER}</Text>

      <TouchableOpacity style={[hc.btn, { backgroundColor: C.emergency }, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={hc.btnText}>Send emergency request</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
