import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBooking, updateBookingStatus, cancelBooking, maybeCloseExpiredHomeCarePackage } from '../../../services/homeCareService';
import { BOOKING_STATUS } from '../../../constants/homeCareConstants';
import { statusLabel, contactRevealed } from '../../../utils/homeCareUtils';
import { isPackageDuration } from '../../../utils/homeCarePackage';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';

export default function NurseActiveVisitScreen({ navigation, route }) {
  const { bookingId } = route.params;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const b = await fetchBooking(bookingId);
      setBooking(b ? await maybeCloseExpiredHomeCarePackage(b) : null);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [bookingId]));

  const setStatus = async (status) => {
    await updateBookingStatus(bookingId, status);
    if (status === BOOKING_STATUS.COMPLETED) {
      navigation.navigate('NurseVisitReport', { bookingId });
      return;
    }
    load();
  };

  const cancel = () => {
    Alert.alert('Cancel visit', 'Cancel this booking?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          await cancelBooking(bookingId, { cancelledBy: 'nurse', reason: 'Cancelled by nurse' });
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading || !booking) {
    return (
      <View style={[hc.screen, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <Text style={hc.title}>Active visit</Text>
      <View style={hc.card}>
        <Text style={{ fontWeight: '800' }}>{booking.patientName}</Text>
        <Text style={hc.sub}>{statusLabel(booking.status)}</Text>
        <Text style={hc.sub}>{booking.address}</Text>
        <Text style={hc.sub}>{booking.specialNotes || 'No special notes'}</Text>
      </View>

      {contactRevealed(booking) ? (
        <View style={hc.card}>
          <Text style={hc.label}>Patient contact</Text>
          <Text>Phone: {booking.patientPhone || '—'}</Text>
          <TouchableOpacity onPress={() => booking.patientPhone && Linking.openURL(`tel:${booking.patientPhone}`)}>
            <Text style={{ color: C.primary, fontWeight: '700' }}>Call patient</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {booking.status === BOOKING_STATUS.ACCEPTED ? (
        <TouchableOpacity style={hc.btn} onPress={() => setStatus(BOOKING_STATUS.EN_ROUTE)}>
          <Text style={hc.btnText}>Mark en route</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === BOOKING_STATUS.EN_ROUTE ? (
        <TouchableOpacity style={hc.btn} onPress={() => setStatus(BOOKING_STATUS.ARRIVED)}>
          <Text style={hc.btnText}>Mark arrived</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === BOOKING_STATUS.ARRIVED ? (
        <TouchableOpacity style={hc.btn} onPress={() => setStatus(BOOKING_STATUS.IN_PROGRESS)}>
          <Text style={hc.btnText}>Start Care</Text>
        </TouchableOpacity>
      ) : null}

      {booking.status === BOOKING_STATUS.IN_PROGRESS ||
      (booking.status === BOOKING_STATUS.ONGOING &&
        isPackageDuration(booking.durationType)) ? (
        <TouchableOpacity style={hc.btn} onPress={() => navigation.navigate('NurseVisitReport', { bookingId })}>
          <Text style={hc.btnText}>
            {booking.status === BOOKING_STATUS.ONGOING &&
            isPackageDuration(booking.durationType)
              ? 'Submit visit log'
              : 'Complete visit (submit report)'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={[hc.btnOutline, { marginTop: 12 }]} onPress={cancel}>
        <Text style={[hc.btnOutlineText, { color: C.emergency }]}>Cancel booking</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
