import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUserNotifications, markNotificationRead } from '../../../services/homeCareService';
import NursePageHeader from '../../../components/home-care/NursePageHeader';
import { hc } from '../../../components/home-care/homeCareStyles';
import { HomeCareColors as C } from '../../../constants/homeCareColors';

export default function NurseNotificationsScreen({ profile }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setList(await fetchUserNotifications(profile.id));
        setLoading(false);
      })();
    }, [profile?.id]),
  );

  return (
    <ScrollView style={hc.screen} contentContainerStyle={hc.content}>
      <NursePageHeader title="Notifications" subtitle="Bookings, emergencies & updates" />
      {loading ? <ActivityIndicator color={C.primary} /> : null}
      {list.length === 0 && !loading ? <Text style={hc.sub}>No notifications yet.</Text> : null}
      {list.map((n) => (
        <TouchableOpacity
          key={n.id}
          style={[hc.card, !n.read && { borderColor: C.primary, borderWidth: 2 }]}
          onPress={() => markNotificationRead(n.id)}
        >
          <Text style={{ fontWeight: '700' }}>{n.title}</Text>
          <Text style={hc.sub}>{n.body}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}
