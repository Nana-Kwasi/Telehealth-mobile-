import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchPendingRequestsForNurse,
  nurseAcceptBooking,
  nurseDeclineBooking,
  fetchNurseProfile,
} from '../../../services/homeCareService';
import { maskPatientName, formatGhs } from '../../../utils/homeCareUtils';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import { useHomeCareNurse } from '../../../contexts/HomeCareNurseContext';

export default function NurseIncomingRequestsScreen({ navigation, profile, embedded = false }) {
  const { refresh } = useHomeCareNurse();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      setList(await fetchPendingRequestsForNurse(profile.id));
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [profile?.id]));

  const accept = async (booking) => {
    try {
      const nurse = await fetchNurseProfile(profile.id);
      await nurseAcceptBooking(booking.id, nurse);
      Alert.alert('Accepted', 'Patient contact details are now available.');
      load();
      refresh();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not accept.');
    }
  };

  const decline = async (id) => {
    await nurseDeclineBooking(id);
    load();
    refresh();
  };

  const body = (
    <>
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {list.length === 0 && !loading ? <Text style={hc.sub}>No pending requests.</Text> : null}
      {list.map((b) => (
        <View key={b.id} style={hc.card}>
          <Text style={{ fontWeight: '800' }}>{maskPatientName(b.patientName)}</Text>
          <Text style={hc.sub}>{b.careType} · {b.durationType}</Text>
          <Text style={hc.sub}>{b.address}</Text>
          <Text style={hc.sub}>Start: {b.startDate}</Text>
          <Text style={{ marginTop: 6, fontWeight: '600', color: C.primaryDark }}>
            Ref. {formatGhs(b.referenceFeeAmount)} {b.referenceFeeLabel}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity style={[hc.btn, { flex: 1 }]} onPress={() => accept(b)}>
              <Text style={hc.btnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[hc.btnOutline, { flex: 1 }]} onPress={() => decline(b.id)}>
              <Text style={hc.btnOutlineText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Incoming requests" subtitle="Accept or decline patient bookings" />
      {body}
    </ScrollView>
  );
}
