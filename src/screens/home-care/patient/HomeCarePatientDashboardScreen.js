import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, clearSession } from '../../../services/apiClient';
import LocationSummaryCardMobile from '../../../components/LocationSummaryCardMobile';
import { mergeLocationProfile, fetchAuthLocationProfile } from '../../../utils/locationProfile';
import {
  fetchPatientActiveBookings,
  fetchHomeCarePatientProfile,
} from '../../../services/homeCareService';
import { statusLabel, formatGhs, bookingStatusTone } from '../../../utils/homeCareUtils';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import NurseAvatar from '../../../components/home-care/NurseAvatar';

const QUICK_ACTIONS = [
  { id: 'find', label: 'Find nurses', sub: 'Browse verified care', icon: 'search', route: 'HomeCareHome', primary: true },
  { id: 'emergency', label: 'Emergency', sub: 'Urgent at-home care', icon: 'medical', route: 'HomeCareEmergency', danger: true },
  { id: 'ongoing', label: 'Ongoing care', sub: 'Weekly & monthly', icon: 'calendar', route: 'HomeCareOngoingCare' },
  { id: 'history', label: 'Visit history', sub: 'Past visits', icon: 'time', route: 'HomeCareHistory' },
];

function BookingCard({ booking, onPress }) {
  const tone = bookingStatusTone(booking.status);
  const nurse = { fullName: booking.nurseName, photoURL: booking.nursePhotoURL };
  return (
    <TouchableOpacity style={styles.bookingCard} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.bookingTop}>
        <View style={[styles.statusPill, { backgroundColor: tone.bg }]}>
          <Text style={[styles.statusPillText, { color: tone.text }]}>{statusLabel(booking.status)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={C.textLight} />
      </View>
      <View style={styles.bookingBody}>
        <NurseAvatar nurse={nurse} size={52} style={styles.bookingAvatar} />
        <View style={styles.bookingInfo}>
          <Text style={styles.bookingName}>{booking.nurseName || 'Awaiting nurse assignment'}</Text>
          <View style={styles.bookingMetaRow}>
            <Ionicons name="calendar-outline" size={14} color={C.textSecondary} />
            <Text style={styles.bookingMeta}>{booking.startDate || 'Date to be confirmed'}</Text>
          </View>
          <Text style={styles.bookingFee}>
            {formatGhs(booking.referenceFeeAmount)}{' '}
            <Text style={styles.bookingFeeSub}>{booking.referenceFeeLabel || ''}</Text>
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeCarePatientDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState([]);
  const [userName, setUserName] = useState('');
  const [locationProfile, setLocationProfile] = useState(null);

  const load = async () => {
    const uid = await AsyncStorage.getItem('th.userId');
    if (!uid) {
      setActive([]);
      setUserName('');
      setLocationProfile(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [bookings, profile] = await Promise.all([
        fetchPatientActiveBookings(uid),
        fetchHomeCarePatientProfile(uid),
      ]);
      setActive(bookings);

      let name = profile.name;
      if (!name) {
        name = (await AsyncStorage.getItem('userName')) || '';
      }
      setUserName(name || 'Guest');

      const authLoc = await fetchAuthLocationProfile(uid);
      setLocationProfile(mergeLocationProfile(authLoc, profile));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ headerBackVisible: false, title: 'My Home Care' });
      load();
    }, [navigation]),
  );

  const greetingName = userName && userName !== 'Guest' ? userName : 'there';

  const handleLogout = () => {
    Alert.alert('Log out', 'Sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          try {
            // Was `signOut(auth)` — Firebase-era code; neither symbol exists in
            // this file any more, so tapping Log out threw
            // "Property 'signOut' doesn't exist" and the user stayed signed in.
            // clearSession() is how every other screen ends a session: it drops
            // the stored token/refresh token so the API client stops using them.
            api('/api/v1/auth/logout', { method: 'POST' }).catch(() => {});
            await clearSession();
            await AsyncStorage.multiRemove([
              'userIntent', 'userRole', 'isAuthenticated', 'th.clientId', 'userName',
            ]);
            navigation.getParent()?.replace('Intent');
          } catch (e) {
            console.error(e);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#fff"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + 16 }]}>
          {userName && userName !== 'Guest' ? (
            <TouchableOpacity
              style={[styles.logoutBtn, { top: insets.top + 12 }]}
              onPress={handleLogout}
              accessibilityLabel="Log out"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="log-out-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
          <View style={styles.heroOrb} />
          <View style={[styles.heroOrb, styles.heroOrbSm]} />
          <View style={styles.heroBadge}>
            <Ionicons name="home" size={14} color="#ccfbf1" />
            <Text style={styles.heroBadgeText}>Nessa Hub · Home Care</Text>
          </View>
          <Text style={styles.heroTitle}>Hello, {greetingName}</Text>
          <Text style={styles.heroSub}>Track visits and manage your home care in one place.</Text>
        </View>

        <View style={styles.body}>
          <LocationSummaryCardMobile profile={locationProfile} title="Your location" />

          <Text style={styles.sectionTitle}>Quick actions</Text>
          <View style={styles.actionGrid}>
            {QUICK_ACTIONS.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={[
                  styles.actionTile,
                  a.primary && styles.actionTilePrimary,
                  a.danger && styles.actionTileDanger,
                ]}
                onPress={() => navigation.navigate(a.route)}
                activeOpacity={0.9}
              >
                <View
                  style={[
                    styles.actionIconWrap,
                    a.primary && styles.actionIconPrimary,
                    a.danger && styles.actionIconDanger,
                  ]}
                >
                  <Ionicons
                    name={a.icon}
                    size={22}
                    color={a.danger ? C.emergency : a.primary ? '#fff' : C.primary}
                  />
                </View>
                <Text style={[styles.actionLabel, a.danger && { color: C.emergency }]}>{a.label}</Text>
                <Text style={styles.actionSub}>{a.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Active bookings</Text>
            {active.length > 0 ? (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{active.length}</Text>
              </View>
            ) : null}
          </View>

          {loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 24 }} /> : null}

          {!loading && active.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="clipboard-outline" size={32} color={C.primary} />
              </View>
              <Text style={styles.emptyTitle}>No active bookings</Text>
              <Text style={styles.emptySub}>
                When you book a nurse, your request will show here with live status updates.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('HomeCareHome')}>
                <Text style={styles.emptyBtnText}>Find a nurse</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {active.map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              onPress={() => navigation.navigate('HomeCareBookingStatus', { bookingId: b.id })}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  scroll: { paddingBottom: 40 },
  logoutBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 3,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  hero: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: '#0d9488',
    overflow: 'hidden',
    minHeight: 200,
  },
  heroOrb: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)',
    top: -30,
    right: -20,
  },
  heroOrbSm: {
    width: 80,
    height: 80,
    borderRadius: 40,
    top: 40,
    right: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 14,
  },
  heroBadgeText: { color: '#ecfdf5', fontSize: 12, fontWeight: '700' },
  heroTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 4 },
  heroLocationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 10,
    paddingRight: 8,
  },
  heroLocation: { flex: 1, fontSize: 14, color: '#ecfdf5', lineHeight: 20, fontWeight: '600' },
  heroLocationHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 18,
  },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 19, marginTop: 4 },
  body: { paddingHorizontal: 16, marginTop: 28, paddingTop: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  countBadge: {
    backgroundColor: C.primary,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  actionTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '46%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#0d9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  actionTilePrimary: { borderColor: '#5eead4', backgroundColor: '#f0fdfa' },
  actionTileDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionIconPrimary: { backgroundColor: C.primary },
  actionIconDanger: { backgroundColor: '#fee2e2' },
  actionLabel: { fontSize: 14, fontWeight: '800', color: C.text },
  actionSub: { fontSize: 11, color: C.textSecondary, marginTop: 2 },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#134e4a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  bookingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  bookingBody: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bookingAvatar: { flexShrink: 0 },
  bookingInfo: { flex: 1, minWidth: 0 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  bookingName: { fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 6 },
  bookingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  bookingMeta: { fontSize: 13, color: C.textSecondary },
  bookingFee: { fontSize: 14, fontWeight: '700', color: C.primaryDark },
  bookingFeeSub: { fontWeight: '500', color: C.textSecondary, fontSize: 12 },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19 },
  emptyBtn: {
    marginTop: 16,
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
});
