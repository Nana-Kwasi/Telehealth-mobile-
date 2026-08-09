import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import {
  fetchNurseById, createBooking, resolveBookingCoords, getHomeCareAuthUser, fetchHomeCarePatientProfile,
} from '../../../services/homeCareService';
import { CARE_TYPES, DURATION_TYPES, BOOKING_FEE_DISCLAIMER, PACKAGE_DURATION_TYPES } from '../../../constants/homeCareConstants';
import { feeForDuration, formatGhs, isValidEmergencyPhone } from '../../../utils/homeCareUtils';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import HomeCareDateField from '../../../components/home-care/HomeCareDateField';
import HomeCareAddressField from '../../../components/home-care/HomeCareAddressField';

export default function HomeCareBookScreen({ navigation, route }) {
  const { nurseId } = route.params;
  const [nurse, setNurse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [durationType, setDurationType] = useState('daily');
  const [careType, setCareType] = useState('general');
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [feeOk, setFeeOk] = useState(false);
  const [cancelOk, setCancelOk] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const startDateObj = useMemo(() => {
    if (!startDate) return null;
    const [y, m, d] = startDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [startDate]);

  useEffect(() => {
    (async () => {
      try {
        setNurse(await fetchNurseById(nurseId));
      } finally {
        setLoading(false);
      }
    })();
  }, [nurseId]);

  useEffect(() => {
    (async () => {
      const uid = await AsyncStorage.getItem('th.userId');
      if (!uid) return;
      try {
        const p = await fetchHomeCarePatientProfile(uid);
        if (p.phone) setPatientPhone(p.phone);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (durationType === 'daily') setEndDate('');
  }, [durationType]);

  const fee = nurse ? feeForDuration(nurse, durationType) : { amount: 0, label: '' };

  const submit = async () => {
    if (!address.trim() || !startDate.trim()) {
      Alert.alert('Missing fields', 'Address and start date are required.');
      return;
    }
    if (PACKAGE_DURATION_TYPES.includes(durationType) && !endDate.trim()) {
      Alert.alert('Missing fields', 'Please select an expected end date.');
      return;
    }
    if (endDate && endDate < startDate) {
      Alert.alert('Invalid dates', 'End date must be on or after the start date.');
      return;
    }
    if (!isValidEmergencyPhone(patientPhone)) {
      Alert.alert('Phone required', 'Enter a valid phone number (at least 8 digits) so your nurse can reach you.');
      return;
    }
    if (!feeOk || !cancelOk) {
      Alert.alert('Acknowledgement', 'Please accept the fee and cancellation policy.');
      return;
    }
    setSaving(true);
    try {
      const user = await getHomeCareAuthUser();
      if (!user) {
        Alert.alert('Session expired', 'Please sign in again to complete your booking.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign in', onPress: () => navigation.navigate('Login') },
        ]);
        return;
      }
      const coords = addressCoords || (await resolveBookingCoords(address.trim(), null));
      const id = await createBooking({
        nurseId: nurse.id,
        nurseName: nurse.fullName,
        durationType,
        careType,
        address: address.trim(),
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        patientLatitude: coords?.latitude ?? null,
        patientLongitude: coords?.longitude ?? null,
        startDate: startDate.trim(),
        endDate: endDate.trim() || null,
        specialNotes: notes.trim(),
        referenceFeeAmount: fee.amount,
        referenceFeeLabel: fee.label,
        feeDisclaimerAccepted: true,
        cancellationPolicyAccepted: true,
        patientPhone: patientPhone.trim(),
      });
      navigation.replace('HomeCareBookingStatus', { bookingId: id });
    } catch (e) {
      Alert.alert('Booking failed', e.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[hc.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Book {nurse?.fullName}</Text>

      <Text style={hc.label}>Duration</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
        {DURATION_TYPES.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[hc.chip, durationType === d.value && hc.chipActive]}
            onPress={() => setDurationType(d.value)}
          >
            <Text style={[hc.chipText, durationType === d.value && { color: '#fff' }]}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={hc.label}>Type of care</Text>
      {CARE_TYPES.map((c) => (
        <TouchableOpacity
          key={c.value}
          style={[hc.chip, careType === c.value && hc.chipActive, { marginBottom: 6 }]}
          onPress={() => setCareType(c.value)}
        >
          <Text style={[hc.chipText, careType === c.value && { color: '#fff' }]}>{c.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={hc.label}>Your phone *</Text>
      <TextInput
        style={hc.input}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        placeholder="Phone — shared with nurse when they accept"
        value={patientPhone}
        onChangeText={setPatientPhone}
      />

      <HomeCareDateField
        label="Start date *"
        value={startDate}
        onChange={setStartDate}
        minimumDate={today}
        placeholder="Tap to choose start date"
      />

      {PACKAGE_DURATION_TYPES.includes(durationType) ? (
        <HomeCareDateField
          label="Expected end date *"
          value={endDate}
          onChange={setEndDate}
          minimumDate={startDateObj || today}
          placeholder="Tap to choose end date"
        />
      ) : null}

      <HomeCareAddressField
        address={address}
        onAddressChange={setAddress}
        coords={addressCoords}
        onCoordsChange={setAddressCoords}
        detectOnMount
      />

      <Text style={hc.label}>Special instructions</Text>
      <TextInput style={[hc.input, { minHeight: 80 }]} multiline value={notes} onChangeText={setNotes} />

      <View style={hc.card}>
        <Text style={hc.label}>Reference fee</Text>
        <Text style={{ fontWeight: '800', fontSize: 18, color: C.primaryDark }}>
          {formatGhs(fee.amount)} {fee.label}
        </Text>
        <Text style={hc.disclaimer}>{BOOKING_FEE_DISCLAIMER}</Text>
      </View>

      <TouchableOpacity style={hc.row} onPress={() => setFeeOk(!feeOk)}>
        <Text style={{ flex: 1, fontSize: 13, color: C.text }}>I understand this is a reference rate and will confirm payment with the nurse.</Text>
        <Text>{feeOk ? '☑' : '☐'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={hc.row} onPress={() => setCancelOk(!cancelOk)}>
        <Text style={{ flex: 1, fontSize: 13, color: C.text }}>I agree to the cancellation policy.</Text>
        <Text>{cancelOk ? '☑' : '☐'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[hc.btn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Text style={hc.btnText}>{saving ? 'Submitting…' : 'Confirm booking'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
