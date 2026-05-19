import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../../services/firebaseConfig';
import { fetchPatientBookings } from '../../../services/homeCareService';
import { statusLabel } from '../../../utils/homeCareUtils';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function HomeCareHistoryScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) {
          setLoading(false);
          return;
        }
        try {
          setList(await fetchPatientBookings(uid));
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Visit history</Text>
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {!loading && list.length === 0 ? <Text style={hc.sub}>No bookings yet.</Text> : null}
      {list.map((b) => (
        <TouchableOpacity
          key={b.id}
          style={hc.card}
          onPress={() => navigation.navigate('HomeCareBookingStatus', { bookingId: b.id })}
        >
          <Text style={{ fontWeight: '800', color: C.text }}>{b.nurseName}</Text>
          <Text style={hc.sub}>{statusLabel(b.status)} · {b.startDate}</Text>
          {b.status === 'completed' ? (
            <TouchableOpacity
              style={{ marginTop: 8 }}
              onPress={() => navigation.navigate('HomeCareBook', { nurseId: b.nurseId })}
            >
              <Text style={{ color: C.primary, fontWeight: '700' }}>Re-book nurse</Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
