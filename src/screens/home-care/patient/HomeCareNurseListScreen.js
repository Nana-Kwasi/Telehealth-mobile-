import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { fetchApprovedNurses, getCurrentLocationMobile } from '../../../services/homeCareService';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NurseCard from '../../../components/home-care/NurseCard';
import { requireHomeCarePatient } from '../../../utils/homeCarePatientAuth';

export default function HomeCareNurseListScreen({ navigation, route }) {
  const { title = 'Nurses', specialty, nurses: preset } = route.params || {};
  const [loading, setLoading] = useState(!preset);
  const [list, setList] = useState(preset || []);

  useEffect(() => {
    if (preset) return;
    (async () => {
      try {
        const loc = await getCurrentLocationMobile();
        setList(await fetchApprovedNurses({
          specialty,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
        }));
      } finally {
        setLoading(false);
      }
    })();
  }, [preset, specialty]);

  const book = (nurse) => {
    if (!requireHomeCarePatient(navigation, {
      returnScreen: 'HomeCareBook',
      returnParams: { nurseId: nurse.id },
    })) return;
    navigation.navigate('HomeCareBook', { nurseId: nurse.id });
  };

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>{title}</Text>
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {list.map((n) => (
        <NurseCard
          key={n.id}
          nurse={n}
          onPressProfile={() => navigation.navigate('HomeCareNurseProfile', { nurseId: n.id })}
          onPressBook={() => book(n)}
        />
      ))}
    </ScrollView>
  );
}
