import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import NurseTabBar from '../../../components/home-care/NurseTabBar';
import NurseProfileManageScreen from './NurseProfileManageScreen';
import NurseAvailabilityScreen from './NurseAvailabilityScreen';
import NurseDocumentsScreen from './NurseDocumentsScreen';
import NurseEarningsScreen from './NurseEarningsScreen';
import { hc } from '../../../components/home-care/homeCareStyles';
import { HomeCareColors as C } from '../../../constants/homeCareColors';

const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'availability', label: 'Availability' },
  { id: 'documents', label: 'Documents' },
  { id: 'earnings', label: 'Earnings' },
];

export default function NurseAccountScreen({ route, profile }) {
  const initial = route.params?.tab;
  const [tab, setTab] = useState(TABS.some((t) => t.id === initial) ? initial : 'profile');
  const tabs = TABS.map((t) => ({ ...t, count: 0 }));

  useEffect(() => {
    if (route.params?.tab && TABS.some((t) => t.id === route.params.tab)) {
      setTab(route.params.tab);
    }
  }, [route.params?.tab]);

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 4 }}>Account</Text>
      <Text style={[hc.sub, { marginBottom: 12 }]}>Profile, schedule, documents & earnings</Text>
      <NurseTabBar tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'profile' ? <NurseProfileManageScreen profile={profile} embedded /> : null}
      {tab === 'availability' ? <NurseAvailabilityScreen profile={profile} embedded /> : null}
      {tab === 'documents' ? <NurseDocumentsScreen profile={profile} embedded /> : null}
      {tab === 'earnings' ? <NurseEarningsScreen profile={profile} embedded /> : null}
    </ScrollView>
  );
}
