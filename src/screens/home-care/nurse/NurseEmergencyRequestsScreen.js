import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchOpenEmergencyRequests,
  claimEmergencyBooking,
  fetchNurseProfile,
} from '../../../services/homeCareService';
import { maskPatientName } from '../../../utils/homeCareUtils';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import { useHomeCareNurse } from '../../../contexts/HomeCareNurseContext';

export default function NurseEmergencyRequestsScreen({ navigation, profile, embedded = false }) {
  const { refresh } = useHomeCareNurse();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setList(await fetchOpenEmergencyRequests());
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const claim = async (booking) => {
    try {
      const nurse = await fetchNurseProfile(profile.id);
      await claimEmergencyBooking(booking.id, nurse);
      refresh();
      navigation.navigate('NurseActiveVisit', { bookingId: booking.id });
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not claim.');
    }
  };

  const body = (
    <>
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {list.length === 0 && !loading ? <Text style={hc.sub}>No open emergency requests.</Text> : null}
      {list.map((b) => (
        <View key={b.id} style={[hc.card, { borderColor: C.emergency }]}>
          <Text style={{ fontWeight: '800', color: C.emergency }}>🚨 Emergency</Text>
          <Text style={{ fontWeight: '700' }}>{maskPatientName(b.patientName)}</Text>
          <Text style={hc.sub}>{b.careType} · {b.address}</Text>
          <Text style={hc.sub}>{b.specialNotes || 'No details'}</Text>
          <TouchableOpacity style={[hc.btn, { marginTop: 10 }]} onPress={() => claim(b)}>
            <Text style={hc.btnText}>Claim & respond</Text>
          </TouchableOpacity>
        </View>
      ))}
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Emergency requests" subtitle="Unassigned urgent — claim to respond" />
      {body}
    </ScrollView>
  );
}
