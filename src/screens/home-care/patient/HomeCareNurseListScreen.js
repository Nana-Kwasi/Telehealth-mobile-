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
  // Set when the nearby search found nobody and we widened it — the screen has to
  // explain an empty/odd result rather than just rendering nothing.
  const [outsideRadius, setOutsideRadius] = useState(false);
  const [radiusKm, setRadiusKm] = useState(null);

  useEffect(() => {
    if (preset) return;
    (async () => {
      try {
        const loc = await getCurrentLocationMobile();
        const found = await fetchApprovedNurses({
          specialty,
          latitude: loc?.latitude,
          longitude: loc?.longitude,
        });
        setList(found);
        setOutsideRadius(!!found.outsideRadius);
        setRadiusKm(found.searchRadiusKm || null);
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

      {!loading && outsideRadius ? (
        <Text style={hc.sub}>
          No nurses within {radiusKm || 50} km of your current location. Showing all
          available nurses instead — check the distance on each card before booking.
        </Text>
      ) : null}

      {!loading && list.length === 0 ? (
        <Text style={hc.sub}>
          No nurses are available right now. A nurse must be approved and online to
          appear here.
        </Text>
      ) : null}

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
