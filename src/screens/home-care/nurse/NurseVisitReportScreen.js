import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert, Switch } from 'react-native';
import {
  fetchBooking,
  submitVisitReport,
  maybeCloseExpiredHomeCarePackage,
} from '../../../services/homeCareService';
import { isPackageDuration, localTodayYmd, packageInclusiveDayNumber, packageWeekOrdinal } from '../../../utils/homeCarePackage';
import HomeCareDateField from '../../../components/home-care/HomeCareDateField';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function NurseVisitReportScreen({ navigation, route }) {
  const { bookingId } = route.params;
  const [booking, setBooking] = useState(null);
  const [visitDate, setVisitDate] = useState('');
  const [planCycleNotes, setPlanCycleNotes] = useState('');
  const [careProvided, setCareProvided] = useState('');
  const [temp, setTemp] = useState('');
  const [bp, setBp] = useState('');
  const [pulse, setPulse] = useState('');
  const [concerns, setConcerns] = useState('');
  const [incident, setIncident] = useState(false);
  const [incidentDesc, setIncidentDesc] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBooking(bookingId).then(async (b) => {
      const b2 = b ? await maybeCloseExpiredHomeCarePackage(b) : null;
      setBooking(b2);
      if (b2 && isPackageDuration(b2.durationType)) {
        setVisitDate((v) => v || localTodayYmd());
      }
    });
  }, [bookingId]);

  const isPackage = booking && isPackageDuration(booking.durationType);

  const planCaption = useMemo(() => {
    if (!booking) return '';
    if (booking.durationType === 'weekly') return 'This week’s priorities / focus (optional)';
    if (booking.durationType === 'monthly') return 'Continuity notes (optional)';
    if (booking.durationType === 'yearly') return 'Long-term continuity notes (optional)';
    return 'Plan notes (optional)';
  }, [booking]);

  const startObj = useMemo(() => {
    if (!booking?.startDate) return null;
    const [y, m, d] = booking.startDate.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [booking?.startDate]);

  const pkgMeta = useMemo(() => {
    if (!isPackage || !booking?.startDate || !visitDate) return '';
    const dayNum = packageInclusiveDayNumber(booking.startDate, visitDate);
    const wk = packageWeekOrdinal(booking.startDate, visitDate);
    const parts = [`Day ${dayNum ?? '—'} of plan`];
    if (booking.durationType === 'weekly' && wk != null) parts.push(`week ${wk}`);
    if (booking.endDate) parts.push(`ends ${booking.endDate}`);
    return parts.join(' · ');
  }, [booking, isPackage, visitDate]);

  const submit = async () => {
    if (!careProvided.trim()) {
      Alert.alert('Required', 'Care summary is required.');
      return;
    }
    if (isPackage && (!visitDate || visitDate.trim().length !== 10)) {
      Alert.alert('Required', 'Choose the calendar visit date.');
      return;
    }
    setSaving(true);
    try {
      await submitVisitReport(bookingId, {
        vitals: { temperature: temp, bloodPressure: bp, pulse },
        careProvided: careProvided.trim(),
        concerns: concerns.trim(),
        visitDate: isPackage ? visitDate.trim() : undefined,
        planCycleNotes: isPackage ? planCycleNotes.trim() : undefined,
        incidentFlag: incident,
        incidentDescription: incident ? incidentDesc.trim() : '',
      });
      const refreshed = await fetchBooking(bookingId);
      const pkg = refreshed && isPackageDuration(refreshed.durationType);
      Alert.alert('Done', pkg ? 'Visit log saved for the patient.' : 'Visit marked completed.', [
        {
          text: 'OK',
          onPress: () => navigation.navigate('NurseDashboard'),
        },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not submit.');
    } finally {
      setSaving(false);
    }
  };

  if (!booking) {
    return (
      <ScrollView style={hc.screen}>
        <Text style={hc.sub}>Loading…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>{isPackage ? 'Visit log' : 'Visit report'}</Text>
      <Text style={hc.sub}>
        {isPackage ? 'Pick the calendar day you attended. Each submission appears in the patient’s visit timeline.' : 'Add care notes and vitals.'}
      </Text>
      {isPackage ? <Text style={[hc.sub, { marginTop: 4 }]}>{pkgMeta}</Text> : null}

      {isPackage ? (
        <>
          <HomeCareDateField
            label="Visit date *"
            value={visitDate}
            onChange={setVisitDate}
            minimumDate={startObj || undefined}
            placeholder="Visit date"
          />
          <Text style={hc.label}>{planCaption}</Text>
          <TextInput style={hc.input} multiline value={planCycleNotes} onChangeText={setPlanCycleNotes} />
        </>
      ) : null}

      <Text style={hc.label}>Vitals (optional)</Text>
      <TextInput style={hc.input} placeholder="Temperature" value={temp} onChangeText={setTemp} />
      <TextInput style={hc.input} placeholder="Blood pressure" value={bp} onChangeText={setBp} />
      <TextInput style={hc.input} placeholder="Pulse" value={pulse} onChangeText={setPulse} />

      <Text style={hc.label}>Care provided *</Text>
      <TextInput style={[hc.input, { minHeight: 100 }]} multiline value={careProvided} onChangeText={setCareProvided} />

      <Text style={hc.label}>Follow-up / concerns</Text>
      <TextInput style={hc.input} multiline value={concerns} onChangeText={setConcerns} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12, gap: 12 }}>
        <Text style={{ flex: 1, fontWeight: '600', color: '#334155' }}>Incident to flag?</Text>
        <Switch
          value={incident}
          onValueChange={setIncident}
          trackColor={{ false: '#cbd5e1', true: '#99f6e4' }}
          thumbColor={incident ? '#0d9488' : '#f4f4f5'}
          ios_backgroundColor="#cbd5e1"
        />
      </View>
      {incident ? (
        <TextInput style={hc.input} placeholder="Describe incident" value={incidentDesc} onChangeText={setIncidentDesc} />
      ) : null}

      <TouchableOpacity style={[hc.btn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
        <Text style={hc.btnText}>
          {saving ? 'Saving…' : isPackage ? 'Submit visit log' : 'Submit & complete'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
