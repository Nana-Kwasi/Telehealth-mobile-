import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNurseProfileComplete, nurseProfileCompleteMessage } from '../../../utils/homeCareProfileComplete';
import { NURSE_PRESENCE } from '../../../constants/homeCareConstants';
import { updateNursePresence } from '../../../services/homeCareService';
import { useHomeCareNurse } from '../../../contexts/HomeCareNurseContext';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { hc } from '../../../components/home-care/homeCareStyles';
import NursePhotoPicker from '../../../components/home-care/NursePhotoPicker';
import { statusLabel } from '../../../utils/homeCareUtils';
import LocationSummaryCardMobile from '../../../components/LocationSummaryCardMobile';
import { mergeLocationProfile } from '../../../utils/locationProfile';

export default function NurseHomeCareDashboardScreen({ navigation, profile }) {
  const { nurse, setNurse, pending, emergency, ongoing, active, loading, refresh } = useHomeCareNurse();
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useFocusEffect(useCallback(() => {
    if (!nurse || isNurseProfileComplete(nurse)) return;
    (async () => {
      const key = `hc.profilePrompt.${profile?.id || nurse.id}`;
      if (await AsyncStorage.getItem(key)) return;
      await AsyncStorage.setItem(key, '1');
      const msg = nurseProfileCompleteMessage(nurse);
      Alert.alert('Complete your profile', msg || 'Finish your account so patients can book you.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Go to Account', onPress: () => navigation.navigate('NurseAccount', { tab: 'profile' }) },
      ]);
    })();
  }, [nurse, profile?.id, navigation]));

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const presence = nurse?.presenceStatus || NURSE_PRESENCE.OFFLINE;
  const isBusy = presence === NURSE_PRESENCE.BUSY;
  const switchOn = presence === NURSE_PRESENCE.ONLINE || isBusy;

  const toggleOnline = async (val) => {
    if (!val && isBusy) {
      Alert.alert(
        'On active booking',
        'You are assigned to a visit. Complete or hand off the booking before going offline.',
      );
      return;
    }
    const next = val ? NURSE_PRESENCE.ONLINE : NURSE_PRESENCE.OFFLINE;
    await updateNursePresence(profile.id, next);
    setNurse((n) => ({ ...n, presenceStatus: next }));
  };

  return (
    <ScrollView
      style={hc.screen}
      contentContainerStyle={hc.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <NursePhotoPicker nurse={nurse} size={56} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: C.text }}>Nurse dashboard</Text>
          <Text style={hc.sub}>{nurse?.fullName || ''} · {nurse?.accountStatus || 'pending'}</Text>
        </View>
      </View>

      <LocationSummaryCardMobile
        profile={mergeLocationProfile(profile, nurse)}
        title="Service location"
        onEdit={() => navigation.navigate('NurseAccount', { tab: 'profile' })}
      />

      <View style={[hc.card, hc.row]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: C.text, fontSize: 16 }}>Go online</Text>
          <Text style={hc.sub}>
            {isBusy ? 'On assignment — not taking new browse requests' : switchOn ? 'Receiving requests' : 'Turn on to appear available'}
          </Text>
        </View>
        <Switch value={switchOn} onValueChange={toggleOnline} trackColor={{ true: C.primary }} />
      </View>

      <View style={hc.statRow}>
        <View style={hc.statCard}>
          <Text style={hc.statValue}>★ {(nurse?.ratingAvg || 0).toFixed(1)}</Text>
          <Text style={hc.statLabel}>{nurse?.ratingCount || 0} reviews</Text>
        </View>
        <View style={hc.statCard}>
          <Text style={hc.statValue}>{nurse?.completedVisits || 0}</Text>
          <Text style={hc.statLabel}>Visits done</Text>
        </View>
        <TouchableOpacity style={hc.statCard} onPress={() => navigation.navigate('NurseBookings', { tab: 'requests' })}>
          <Text style={hc.statValue}>{pending.length}</Text>
          <Text style={hc.statLabel}>Pending</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity style={[hc.btn, { flex: 1 }]} onPress={() => navigation.navigate('NurseBookings', { tab: 'requests' })}>
          <Text style={hc.btnText}>Bookings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[hc.btnOutline, { flex: 1 }]} onPress={() => navigation.navigate('NurseAccount', { tab: 'profile' })}>
          <Text style={hc.btnOutlineText}>Account</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} /> : null}

      <Text style={hc.sectionTitle}>Today&apos;s visits</Text>
      {active.length === 0 ? (
        <Text style={hc.sub}>No active visits.</Text>
      ) : (
        active.slice(0, 8).map((b) => (
          <TouchableOpacity
            key={b.id}
            style={hc.card}
            onPress={() => navigation.navigate('NurseActiveVisit', { bookingId: b.id })}
          >
            <Text style={{ fontWeight: '700', color: C.text }}>{b.patientName}</Text>
            <Text style={hc.sub}>{statusLabel(b.status)} · {b.careType}</Text>
            <Text style={hc.sub} numberOfLines={1}>{b.address}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}
