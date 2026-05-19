import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { auth } from '../../../services/firebaseConfig';
import { fetchPatientOngoingBookings, fetchVisitLogs } from '../../../services/homeCareService';
import { statusLabel } from '../../../utils/homeCareUtils';
import { isPackageDuration, packageSpanDaysInclusive } from '../../../utils/homeCarePackage';
import { hc } from '../../../components/home-care/homeCareStyles';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import { HomeCareColors as C } from '../../../constants/homeCareColors';

function EngagementCard({ booking, navigation }) {
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);

  const toggleLogs = async () => {
    if (!open) {
      const next = await fetchVisitLogs(booking.id);
      setLogs(next);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const plannedDays = useMemo(() => {
    if (
      !isPackageDuration(booking.durationType)
      || !booking.startDate
      || !booking.endDate
    ) return null;
    return packageSpanDaysInclusive(booking.startDate, booking.endDate);
  }, [booking]);

  const loggedDays = Array.isArray(booking.loggedVisitDates)
    ? booking.loggedVisitDates.length
    : null;

  return (
    <View style={hc.card}>
      <Text style={{ fontWeight: '800', color: C.text }}>{booking.nurseName}</Text>
      <Text style={hc.sub}>{statusLabel(booking.status)} · {booking.durationType}</Text>
      <Text style={hc.sub}>{booking.address}</Text>
      {plannedDays != null ? (
        <Text style={hc.sub}>
          Plan days 1–{plannedDays} (through {booking.endDate}) · {booking.visitLogCount || 0} visit logs
          {loggedDays != null ? ` · ${loggedDays} calendar day${loggedDays === 1 ? '' : 's'} with visits` : null}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <TouchableOpacity style={hc.btnOutline} onPress={() => navigation.navigate('HomeCareBookingStatus', { bookingId: booking.id })}>
          <Text style={hc.btnOutlineText}>Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={hc.btnOutline} onPress={toggleLogs}>
          <Text style={hc.btnOutlineText}>{open ? 'Hide logs' : 'Visit logs'}</Text>
        </TouchableOpacity>
        {booking.nurseId ? (
          <TouchableOpacity style={hc.btnOutline} onPress={() => navigation.navigate('HomeCareBook', { nurseId: booking.nurseId })}>
            <Text style={hc.btnOutlineText}>Re-book</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open ? (
        logs.length === 0 ? (
          <Text style={[hc.sub, { marginTop: 8 }]}>No visit logs yet.</Text>
        ) : (
          logs.map((l) => (
            <View key={l.id} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border }}>
              <Text style={hc.sub}>
                <Text style={{ fontWeight: '700' }}>{l.visitDate || '—'}</Text>
                {l.packageDayNumber != null ? ` · day ${l.packageDayNumber}` : ''}
                {l.weekOrdinal != null && booking.durationType === 'weekly' ? ` · week ${l.weekOrdinal}` : ''}
                {'\n'}{l.careSummary || 'Visit recorded'}
                {l.planCycleNotes ? `\n${l.planCycleNotes}` : ''}
              </Text>
            </View>
          ))
        )
      ) : null}
    </View>
  );
}

export default function HomeCareOngoingCareScreen({ navigation }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        setList(await fetchPatientOngoingBookings(uid));
        setLoading(false);
      })();
    }, []),
  );

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Ongoing care" subtitle="Weekly, monthly & yearly packages log each visit-day" />
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {!loading && list.length === 0 ? <Text style={hc.sub}>No ongoing care packages.</Text> : null}
      {list.map((b) => (
        <EngagementCard key={b.id} booking={b} navigation={navigation} />
      ))}
    </ScrollView>
  );
}
