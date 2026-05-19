import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useHomeCareNurse } from '../../../contexts/HomeCareNurseContext';
import NurseTabBar from '../../../components/home-care/NurseTabBar';
import NurseIncomingRequestsScreen from './NurseIncomingRequestsScreen';
import NurseEmergencyRequestsScreen from './NurseEmergencyRequestsScreen';
import NurseOngoingEngagementsScreen from './NurseOngoingEngagementsScreen';
import { hc } from '../../../components/home-care/homeCareStyles';
import { HomeCareColors as C } from '../../../constants/homeCareColors';

const TABS = [
  { id: 'requests', label: 'Requests', countKey: 'pending' },
  { id: 'emergency', label: 'Emergency', countKey: 'emergency', urgent: true },
  { id: 'ongoing', label: 'Ongoing', countKey: 'ongoing' },
];

export default function NurseBookingsScreen({ navigation, route, profile }) {
  const initial = route.params?.tab;
  const [tab, setTab] = useState(TABS.some((t) => t.id === initial) ? initial : 'requests');

  useEffect(() => {
    if (route.params?.tab && TABS.some((t) => t.id === route.params.tab)) {
      setTab(route.params.tab);
    }
  }, [route.params?.tab]);
  const { pending, emergency, ongoing } = useHomeCareNurse();
  const counts = { pending: pending.length, emergency: emergency.length, ongoing: ongoing.length };
  const tabs = TABS.map((t) => ({ ...t, count: counts[t.countKey] || 0 }));

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 }}>Bookings</Text>
      <Text style={[hc.sub, { marginBottom: 12 }]}>Requests, emergency & ongoing care</Text>
      <NurseTabBar tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'requests' ? <NurseIncomingRequestsScreen profile={profile} embedded /> : null}
      {tab === 'emergency' ? <NurseEmergencyRequestsScreen navigation={navigation} profile={profile} embedded /> : null}
      {tab === 'ongoing' ? <NurseOngoingEngagementsScreen navigation={navigation} profile={profile} embedded /> : null}
    </ScrollView>
  );
}
