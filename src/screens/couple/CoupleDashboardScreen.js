import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';
import {
  fetchCoupleDashboard,
  canBrowseTherapists,
  isPaymentAllowed,
  isTherapistSelectionUnlocked,
} from '../../services/coupleTherapyService';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../utils/locationProfile';
import { useCoupleSignOutHeader } from '../../hooks/useCoupleSignOutHeader';

export default function CoupleDashboardScreen({ navigation, route }) {
  useCoupleSignOutHeader(navigation);
  const coupleId = route.params?.coupleId;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [locationProfile, setLocationProfile] = useState(null);

  const refresh = useCallback(async () => {
    const id = coupleId || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
    if (!id) return;
    setLoading(true);
    try {
      const profileStr = await AsyncStorage.getItem('userProfile');
      const profile = profileStr ? JSON.parse(profileStr) : null;
      const authLoc = await AsyncStorage.getItem('th.userId') ? await fetchAuthLocationProfile(await AsyncStorage.getItem('th.userId')) : null;
      setLocationProfile(mergeLocationProfile(profile, authLoc));

      const dash = await fetchCoupleDashboard(id);
      setData(dash);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [coupleId, navigation]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (loading && !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const couple = data?.couple;
  const other = data?.otherPartnerName || 'your partner';
  const unlocked = isTherapistSelectionUnlocked(couple);
  const payAllowed = isPaymentAllowed(couple);
  const browse = canBrowseTherapists(couple);
  const proposal = couple?.therapistProposal;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
    >
      <Text style={styles.title}>Couple therapy</Text>
      <Text style={styles.subtitle}>Shared status — your private answers are never shown here.</Text>

      <LocationSummaryCardMobile
        profile={locationProfile}
        onEdit={() => navigation.navigate('Main', { screen: 'Settings' })}
      />

      {data?.waitingForPartner ? (
        <View style={styles.bannerWarn}>
          <Text style={styles.bannerTitle}>Waiting for {other}</Text>
          <Text style={styles.bannerText}>They need to complete their private intake and consent.</Text>
          <TouchableOpacity style={styles.bannerBtn} onPress={() => navigation.navigate('CoupleWaitingPartner', { coupleId: couple.id })}>
            <Text style={styles.bannerBtnText}>View invitation status</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Couple profile</Text>
        <Row label="Relationship" value={couple?.relationshipType} />
        <Row label="Status" value={couple?.status} />
        <Row
          label="Your intake"
          value={data?.myRole === 'partnerA' ? (couple?.partnerA?.intakeComplete ? 'Complete' : 'Incomplete') : couple?.partnerB?.intakeComplete ? 'Complete' : 'Incomplete'}
        />
        <Row
          label="Your consent"
          value={data?.myRole === 'partnerA' ? (couple?.partnerA?.consentComplete ? 'Signed' : 'Pending') : couple?.partnerB?.consentComplete ? 'Signed' : 'Pending'}
        />
        <Row label={`${other} intake`} value={couple?.partnerA?.intakeComplete && couple?.partnerB?.intakeComplete ? 'Complete' : 'Pending'} />
        {couple?.therapistName ? <Row label="Therapist" value={couple.therapistName} /> : null}
      </View>

      {!unlocked ? (
        <Text style={styles.hint}>Therapist browsing unlocks after both partners finish intake and consent.</Text>
      ) : null}

      {payAllowed ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Payment', { coupleId: couple.id, therapyType: 'couples' })}>
          <Text style={styles.primaryBtnText}>Complete couple payment</Text>
        </TouchableOpacity>
      ) : null}

      {browse && !proposal?.therapistId ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('MatchTherapist', { coupleId: couple.id, therapyType: 'couples' })}>
          <Text style={styles.primaryBtnText}>Browse therapists</Text>
        </TouchableOpacity>
      ) : null}

      {proposal?.status === 'pending' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Therapist proposal</Text>
          <Text style={styles.body}>
            {proposal.proposedBy === data?.myRole
              ? `You selected ${proposal.therapistName}. Waiting for ${other} to confirm.`
              : `${other} selected ${proposal.therapistName}. Please confirm.`}
          </Text>
          {proposal.proposedBy !== data?.myRole ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.navigate('MatchTherapist', { coupleId: couple.id, therapyType: 'couples' })}
            >
              <Text style={styles.primaryBtnText}>Review & confirm</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {couple?.therapistId ? (
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.replace('Main')}>
          <Text style={styles.secondaryBtnText}>Go to dashboard</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 20 },
  bannerWarn: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  bannerTitle: { fontWeight: '800', color: '#92400e', marginBottom: 6 },
  bannerText: { color: '#92400e', marginBottom: 12 },
  bannerBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#92400e', borderRadius: 8 },
  bannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rowLabel: { color: Colors.textSecondary, fontSize: 14 },
  rowValue: { color: Colors.text, fontWeight: '600', fontSize: 14, flex: 1, textAlign: 'right' },
  hint: { color: Colors.textSecondary, marginBottom: 16, lineHeight: 20 },
  body: { color: Colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  primaryBtn: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: Colors.surface, fontWeight: '700' },
  secondaryBtn: { padding: 14, alignItems: 'center' },
  secondaryBtnText: { color: Colors.primary, fontWeight: '600' },
});
