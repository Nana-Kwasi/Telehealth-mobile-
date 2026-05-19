import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchOngoingEngagements } from '../../../services/homeCareService';
import { statusLabel } from '../../../utils/homeCareUtils';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NursePageHeader from '../../../components/home-care/NursePageHeader';

export default function NurseOngoingEngagementsScreen({ navigation, profile, embedded = false }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setList(await fetchOngoingEngagements(profile.id));
        } finally {
          setLoading(false);
        }
      })();
    }, [profile?.id]),
  );

  const body = (
    <>
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {list.length === 0 && !loading ? <Text style={hc.sub}>No ongoing engagements.</Text> : null}
      {list.map((b) => (
        <TouchableOpacity
          key={b.id}
          style={hc.card}
          onPress={() => navigation?.navigate('NurseActiveVisit', { bookingId: b.id })}
        >
          <Text style={{ fontWeight: '800' }}>{b.patientName}</Text>
          <Text style={hc.sub}>{statusLabel(b.status)} · {b.durationType}</Text>
          <Text style={hc.sub}>{b.address}</Text>
        </TouchableOpacity>
      ))}
    </>
  );

  if (embedded) return <View>{body}</View>;

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Ongoing engagements" subtitle="Weekly / monthly care in progress" />
      {body}
    </ScrollView>
  );
}
