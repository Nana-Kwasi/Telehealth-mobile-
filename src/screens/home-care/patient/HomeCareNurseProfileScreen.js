import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import { fetchNurseById } from '../../../services/homeCareService';
import { formatGhs, contactRevealed } from '../../../utils/homeCareUtils';
import { FEE_DISCLAIMER } from '../../../constants/homeCareConstants';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NurseAvatar from '../../../components/home-care/NurseAvatar';
import { requireHomeCarePatient } from '../../../utils/homeCarePatientAuth';

export default function HomeCareNurseProfileScreen({ navigation, route }) {
  const { nurseId } = route.params;
  const [nurse, setNurse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setNurse(await fetchNurseById(nurseId));
      } finally {
        setLoading(false);
      }
    })();
  }, [nurseId]);

  if (loading) {
    return (
      <View style={[hc.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (!nurse) {
    return (
      <View style={hc.content}>
        <Text style={hc.title}>Nurse not found</Text>
      </View>
    );
  }

  const fees = nurse.fees || {};

  const book = () => {
    if (!requireHomeCarePatient(navigation, {
      returnScreen: 'HomeCareBook',
      returnParams: { nurseId: nurse.id },
      message: 'Sign up to book this nurse.',
    })) return;
    navigation.navigate('HomeCareBook', { nurseId: nurse.id });
  };

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <View style={[hc.card, { alignItems: 'center' }]}>
        <NurseAvatar nurse={nurse} size={88} />
        <Text style={[hc.title, { marginTop: 12 }]}>{nurse.fullName}</Text>
        <Text style={hc.sub}>{nurse.specialty} · {nurse.yearsExperience || 0} years</Text>
        <Text style={hc.sub}>★ {(nurse.ratingAvg || 0).toFixed(1)} · {nurse.completedVisits || 0} visits completed</Text>
      </View>

      <View style={hc.card}>
        <Text style={hc.label}>About</Text>
        <Text style={{ color: C.textSecondary, lineHeight: 20 }}>{nurse.bio || 'Experienced home-care nurse.'}</Text>
      </View>

      <View style={hc.card}>
        <Text style={hc.label}>Fee structure (reference)</Text>
        <Text>Daily (per visit): {formatGhs(fees.daily)}</Text>
        <Text>Weekly: {formatGhs(fees.weekly)}</Text>
        <Text>Monthly: {formatGhs(fees.monthly)}</Text>
        <Text style={hc.disclaimer}>{FEE_DISCLAIMER}</Text>
      </View>

      {(nurse.languages || []).length > 0 ? (
        <View style={hc.card}>
          <Text style={hc.label}>Languages</Text>
          <Text style={{ color: C.textSecondary }}>{nurse.languages.join(', ')}</Text>
        </View>
      ) : null}

      <Text style={[hc.sub, { marginBottom: 12 }]}>
        Contact details are shown only after your booking is accepted.
      </Text>

      <TouchableOpacity style={hc.btn} onPress={book}>
        <Text style={hc.btnText}>Book nurse</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
