import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { submitComplaint, uploadComplaintEvidence } from '../../../services/homeCareService';
import { hc } from '../../../components/home-care/homeCareStyles';

const NATURES = ['No-show', 'Misconduct', 'Unprofessional behaviour', 'Safety concern', 'Fee dispute', 'Other'];

export default function HomeCareReportScreen({ navigation, route }) {
  const { bookingId, nurseId } = route.params;
  const [nature, setNature] = useState(NATURES[0]);
  const [description, setDescription] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState([]);
  const [saving, setSaving] = useState(false);

  const addEvidence = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    try {
      const url = await uploadComplaintEvidence(result.assets[0].uri);
      setEvidenceUrls((prev) => [...prev, url]);
    } catch (e) {
      Alert.alert('Upload failed', e.message || '');
    }
  };

  const submit = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe the issue.');
      return;
    }
    setSaving(true);
    try {
      await submitComplaint({ bookingId, nurseId, nature, description: description.trim(), evidenceUrls });
      Alert.alert('Submitted', 'Your report will be reviewed within 24–48 hours.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not submit.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Report nurse</Text>
      <Text style={hc.sub}>Booking: {bookingId?.slice(0, 8)}…</Text>
      <Text style={hc.label}>Nature of complaint</Text>
      {NATURES.map((n) => (
        <TouchableOpacity key={n} style={[hc.chip, nature === n && hc.chipActive]} onPress={() => setNature(n)}>
          <Text style={[hc.chipText, nature === n && { color: '#fff' }]}>{n}</Text>
        </TouchableOpacity>
      ))}
      <Text style={hc.label}>Description</Text>
      <TextInput style={[hc.input, { minHeight: 120 }]} multiline value={description} onChangeText={setDescription} />
      <TouchableOpacity style={hc.btnOutline} onPress={addEvidence}>
        <Text style={hc.btnOutlineText}>Add photo evidence ({evidenceUrls.length})</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[hc.btn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Text style={hc.btnText}>Submit report</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
