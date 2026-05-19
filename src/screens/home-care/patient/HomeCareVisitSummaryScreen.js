import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { fetchBooking } from '../../../services/homeCareService';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function HomeCareVisitSummaryScreen({ route }) {
  const { bookingId } = route.params;
  const [booking, setBooking] = useState(null);

  useEffect(() => {
    fetchBooking(bookingId).then(setBooking);
  }, [bookingId]);

  if (!booking) {
    return (
      <View style={[hc.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  const s = booking.patientVisitSummary || {};

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Visit summary</Text>
      <View style={hc.card}>
        <Text style={hc.label}>Care provided</Text>
        <Text style={{ color: C.textSecondary, lineHeight: 20 }}>{s.careSummary || '—'}</Text>
        {s.vitals ? (
          <>
            <Text style={[hc.label, { marginTop: 12 }]}>Vitals</Text>
            <Text style={{ color: C.textSecondary }}>{JSON.stringify(s.vitals, null, 2)}</Text>
          </>
        ) : null}
        {s.incidentsFlagged ? (
          <Text style={{ color: C.error, marginTop: 8 }}>An incident was flagged during this visit.</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
