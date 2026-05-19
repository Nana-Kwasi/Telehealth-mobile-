import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import {
  updateNurseProfile, fetchNurseProfile, getCurrentLocationMobile, updateNurseLocation,
} from '../../../services/homeCareService';
import { useHomeCareNurse } from '../../../contexts/HomeCareNurseContext';
import { parseCoords } from '../../../utils/homeCareGeo';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import NursePhotoPicker from '../../../components/home-care/NursePhotoPicker';
import { isNurseProfileComplete } from '../../../utils/homeCareProfileComplete';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function NurseProfileManageScreen({ profile, embedded = false }) {
  const { nurse, setNurse } = useHomeCareNurse();
  const n = nurse || profile;
  const [bio, setBio] = useState(n?.bio || '');
  const [specialty, setSpecialty] = useState(n?.specialty || '');
  const [languages, setLanguages] = useState((n?.languages || ['English']).join(', '));
  const [yearsExperience, setYearsExperience] = useState(String(n?.yearsExperience ?? ''));
  const [phone, setPhone] = useState(n?.phone || '');
  const [licenseNumber, setLicenseNumber] = useState(n?.licenseNumber || '');
  const [feesDaily, setFeesDaily] = useState(String(n?.fees?.daily ?? ''));
  const [feesWeekly, setFeesWeekly] = useState(String(n?.fees?.weekly ?? ''));
  const [feesMonthly, setFeesMonthly] = useState(String(n?.fees?.monthly ?? ''));
  const [feesYearly, setFeesYearly] = useState(String(n?.fees?.yearly ?? ''));
  const [saving, setSaving] = useState(false);
  const [locUpdating, setLocUpdating] = useState(false);
  const hasLocation = parseCoords(nurse || profile);

  const refreshLocation = async () => {
    setLocUpdating(true);
    try {
      const loc = await getCurrentLocationMobile();
      if (!loc) {
        Alert.alert('Location unavailable', 'Allow location access or try again from Dashboard.');
        return;
      }
      await updateNurseLocation(profile.id, loc);
      const fresh = await fetchNurseProfile(profile.id);
      if (fresh) setNurse(fresh);
      Alert.alert('Location updated', 'Your service area is saved for patient distance and emergency matching.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update location.');
    } finally {
      setLocUpdating(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        bio: bio.trim(),
        specialty: specialty.trim(),
        languages: languages.split(',').map((s) => s.trim()).filter(Boolean),
        yearsExperience: Number(yearsExperience) || 0,
        phone: phone.trim(),
        licenseNumber: licenseNumber.trim(),
        fees: {
          daily: Number(feesDaily) || 0,
          weekly: Number(feesWeekly) || 0,
          monthly: Number(feesMonthly) || 0,
          yearly: Number(feesYearly) || 0,
        },
      };
      const merged = { ...n, ...patch };
      patch.profileComplete = isNurseProfileComplete(merged);
      await updateNurseProfile(profile.id, patch);
      const fresh = await fetchNurseProfile(profile.id);
      if (fresh) setNurse(fresh);
      Alert.alert('Saved', patch.profileComplete ? 'Profile is complete.' : 'Saved — finish missing fields so patients can book you.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      <View style={[hc.card, { alignItems: 'center' }]}>
        <NursePhotoPicker nurse={nurse || profile} size={96} />
        <Text style={[hc.sub, { marginTop: 10 }]}>Tap your photo to upload or replace it</Text>
        {hasLocation ? (
          <Text style={[hc.sub, { marginTop: 8, color: '#047857' }]}>
            Service location saved. Refreshes when you open Dashboard or tap below.
          </Text>
        ) : (
          <Text style={[hc.sub, { marginTop: 8, color: '#b45309' }]}>
            No service location yet. Open Dashboard once (GPS) or tap below.
          </Text>
        )}
        <TouchableOpacity
          style={[hc.btnOutline, { marginTop: 10, alignSelf: 'stretch' }]}
          onPress={refreshLocation}
          disabled={locUpdating}
        >
          <Text style={hc.btnOutlineText}>{locUpdating ? 'Updating…' : 'Update service location'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={hc.label}>Bio</Text>
      <TextInput style={[hc.input, { minHeight: 80 }]} multiline value={bio} onChangeText={setBio} />
      <Text style={hc.label}>Specialty</Text>
      <TextInput style={hc.input} value={specialty} onChangeText={setSpecialty} />
      <Text style={hc.label}>Years of experience</Text>
      <TextInput style={hc.input} value={yearsExperience} onChangeText={setYearsExperience} keyboardType="number-pad" />
      <Text style={hc.label}>Phone</Text>
      <TextInput style={hc.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={hc.label}>License number</Text>
      <TextInput style={hc.input} value={licenseNumber} onChangeText={setLicenseNumber} />
      <Text style={hc.label}>Languages (comma-separated)</Text>
      <TextInput style={hc.input} value={languages} onChangeText={setLanguages} />
      <Text style={hc.label}>Fees (GHS) — daily / weekly / monthly / yearly</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TextInput style={[hc.input, { flex: 1 }]} placeholder="Daily" value={feesDaily} onChangeText={setFeesDaily} keyboardType="number-pad" />
        <TextInput style={[hc.input, { flex: 1 }]} placeholder="Weekly" value={feesWeekly} onChangeText={setFeesWeekly} keyboardType="number-pad" />
        <TextInput style={[hc.input, { flex: 1 }]} placeholder="Monthly" value={feesMonthly} onChangeText={setFeesMonthly} keyboardType="number-pad" />
        <TextInput style={[hc.input, { flex: 1 }]} placeholder="Yearly" value={feesYearly} onChangeText={setFeesYearly} keyboardType="number-pad" />
      </View>
      <TouchableOpacity style={[hc.btn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={hc.btnText}>Save profile</Text>
      </TouchableOpacity>
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="My profile" subtitle="Photo, experience, fees & contact" />
      {body}
    </ScrollView>
  );
}
