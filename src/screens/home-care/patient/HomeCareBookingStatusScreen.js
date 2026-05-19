import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchBooking, extendHomeCarePackage } from '../../../services/homeCareService';
import { statusLabel, contactRevealed, formatGhs } from '../../../utils/homeCareUtils';
import { BOOKING_STATUS, PACKAGE_DURATION_TYPES } from '../../../constants/homeCareConstants';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import HomeCareDateField from '../../../components/home-care/HomeCareDateField';
import { resetToHomeCarePatientDashboard } from '../../../utils/homeCareNavigation';

function minDateAfterBookingEnd(bookingEndYmd) {
  if (!bookingEndYmd) return null;
  const [y, m, d] = String(bookingEndYmd).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return dt;
}

export default function HomeCareBookingStatusScreen({ navigation, route }) {
  const { bookingId } = route.params;
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [extEnd, setExtEnd] = useState('');
  const [extDur, setExtDur] = useState('weekly');

  const load = async () => {
    try {
      const b = await fetchBooking(bookingId);
      setBooking(b);
      setExtDur(b?.durationType || 'weekly');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { load(); }, [bookingId]));

  const minExtend = useMemo(
    () => (booking?.endDate ? minDateAfterBookingEnd(booking.endDate) : null),
    [booking?.endDate],
  );

  const revealed = booking && contactRevealed(booking);
  const canFeedback = booking
    && booking.status === BOOKING_STATUS.COMPLETED
    && !booking.patientFeedback;
  const canExtend = booking
    && booking.status === BOOKING_STATUS.COMPLETED
    && PACKAGE_DURATION_TYPES.includes(booking.durationType)
    && !!booking.nurseId;

  const openWa = () => {
    if (!booking) return;
    const num = (booking.nurseWhatsapp || booking.nursePhone || '').replace(/\D/g, '');
    if (!num) return;
    Linking.openURL(`https://wa.me/${num}`);
  };

  const onExtend = async () => {
    if (!booking) return;
    if (!extEnd.trim()) {
      Alert.alert('Date required', 'Choose a new expected end date after your previous period.');
      return;
    }
    if (booking.endDate && extEnd <= booking.endDate) {
      Alert.alert('Invalid', 'Pick a date after your previous expected end.');
      return;
    }
    try {
      await extendHomeCarePackage(
        bookingId,
        extEnd.trim(),
        extDur !== booking.durationType ? extDur : null,
      );
      setExtEnd('');
      await load();
      Alert.alert('Extended', 'Your care window is active again.');
    } catch (e) {
      Alert.alert('Could not extend', e.message || 'Try again.');
    }
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
      <Text style={hc.title}>Booking status</Text>
      <View style={hc.card}>
        <Text style={{ fontWeight: '800', fontSize: 18 }}>{statusLabel(booking.status)}</Text>
        <Text style={hc.sub}>Nurse: {booking.nurseName}</Text>
        <Text style={hc.sub}>Reference: {formatGhs(booking.referenceFeeAmount)} {booking.referenceFeeLabel}</Text>
        <Text style={hc.sub}>Start: {booking.startDate}</Text>
        {booking.endDate ? <Text style={hc.sub}>Expected end: {booking.endDate}</Text> : null}
        {booking.packageClosureReason === 'period_end' ? (
          <Text style={hc.disclaimer}>This package closed automatically when its scheduled dates ended.</Text>
        ) : null}
      </View>

      {revealed ? (
        <View style={hc.card}>
          <Text style={hc.label}>Nurse contact (confirmed)</Text>
          <Text>Phone: {booking.nursePhone || '—'}</Text>
          <TouchableOpacity style={hc.btnOutline} onPress={openWa}>
            <Text style={hc.btnOutlineText}>Open WhatsApp</Text>
          </TouchableOpacity>
          <Text style={hc.disclaimer}>Confirm final fee and care details directly with your nurse before the visit.</Text>
        </View>
      ) : (
        <Text style={hc.sub}>Contact details appear when the nurse accepts your request.</Text>
      )}

      {canExtend ? (
        <View style={hc.card}>
          <Text style={hc.label}>Extend care plan</Text>
          <Text style={hc.disclaimer}>Same nurse • confirm payment privately.</Text>
          <HomeCareDateField
            label="New expected end date *"
            value={extEnd}
            onChange={setExtEnd}
            minimumDate={minExtend || undefined}
          />
          <Text style={[hc.label, { marginTop: 8 }]}>Billing rhythm (optional)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PACKAGE_DURATION_TYPES.map((d) => (
              <TouchableOpacity
                key={d}
                onPress={() => setExtDur(d)}
                style={[hc.btnOutline, extDur === d && { borderColor: C.primary }]}
              >
                <Text style={hc.btnOutlineText}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[hc.btn, { marginTop: 12 }]} onPress={onExtend}>
            <Text style={hc.btnText}>Request extension</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {booking.patientVisitSummary ? (
        <TouchableOpacity
          style={hc.btnOutline}
          onPress={() => navigation.navigate('HomeCareVisitSummary', { bookingId })}
        >
          <Text style={hc.btnOutlineText}>View visit summary</Text>
        </TouchableOpacity>
      ) : null}

      {canFeedback ? (
        <TouchableOpacity style={hc.btn} onPress={() => navigation.navigate('HomeCareFeedback', { bookingId })}>
          <Text style={hc.btnText}>Leave feedback</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={hc.btnOutline}
        onPress={() => navigation.navigate('HomeCareReport', { bookingId, nurseId: booking.nurseId })}
      >
        <Text style={hc.btnOutlineText}>Report nurse</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[hc.btn, { marginTop: 16 }]}
        onPress={() => resetToHomeCarePatientDashboard(navigation)}
      >
        <Text style={hc.btnText}>Back to My Home Care</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
