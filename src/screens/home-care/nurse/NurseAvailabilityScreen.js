import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { updateNurseAvailability } from '../../../services/homeCareService';
import { hc } from '../../../components/home-care/homeCareStyles';
import NurseAvatar from '../../../components/home-care/NurseAvatar';
import { useHomeCareNurse } from '../../../contexts/HomeCareNurseContext';
import { HomeCareColors as C } from '../../../constants/homeCareColors';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function NurseAvailabilityScreen({ profile, embedded = false }) {
  const { nurse } = useHomeCareNurse();
  const [days, setDays] = useState(profile?.availability?.workingDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [start, setStart] = useState(profile?.availability?.startHour || '08:00');
  const [end, setEnd] = useState(profile?.availability?.endHour || '17:00');
  const [saving, setSaving] = useState(false);

  const toggleDay = (d) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateNurseAvailability(profile.id, {
        workingDays: days,
        startHour: start,
        endHour: end,
      });
      Alert.alert('Saved', 'Availability updated.');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <>
      {!embedded ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <NurseAvatar nurse={nurse || profile} size={56} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: C.text }}>Availability</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary }}>Working days and hours patients see</Text>
          </View>
        </View>
      ) : null}
      <Text style={hc.label}>Working days</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
        {DAYS.map((d) => (
          <TouchableOpacity key={d} style={[hc.chip, days.includes(d) && hc.chipActive]} onPress={() => toggleDay(d)}>
            <Text style={[hc.chipText, days.includes(d) && { color: '#fff' }]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={hc.label}>Start hour</Text>
      <TextInput style={hc.input} value={start} onChangeText={setStart} />
      <Text style={hc.label}>End hour</Text>
      <TextInput style={hc.input} value={end} onChangeText={setEnd} />
      <TouchableOpacity style={[hc.btn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
        <Text style={hc.btnText}>Save schedule</Text>
      </TouchableOpacity>
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      {body}
    </ScrollView>
  );
}
