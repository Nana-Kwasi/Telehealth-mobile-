import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performLogout } from '../services/authService';

import { HomeCareColors as C } from '../constants/homeCareColors';
import { NURSE_PRESENCE } from '../constants/homeCareConstants';
import { useHomeCareNurse } from '../contexts/HomeCareNurseContext';
import NursePhotoPicker from './home-care/NursePhotoPicker';

const MENU = [
  { screen: 'NurseDashboard', icon: 'grid-outline', label: 'Dashboard' },
  { screen: 'NurseBookings', icon: 'mail-unread-outline', label: 'Bookings', countKeys: ['pending', 'emergency', 'ongoing'] },
  { screen: 'NurseAccount', icon: 'person-outline', label: 'Account' },
];

export default function HomeCareNurseDrawerContent({ navigation, profile, state }) {
  const { nurse, pending, emergency, ongoing } = useHomeCareNurse();
  const activeRoute = state?.routes?.[state.index]?.name;
  const bookingCount = pending.length + emergency.length + ongoing.length;
  const online = nurse?.presenceStatus === NURSE_PRESENCE.ONLINE;
  const name = nurse?.fullName || profile?.fullName || 'Nurse';

  const handleLogout = async () => {
    try {
      await performLogout();
      navigation.getParent()?.replace('Intent');
    } catch (e) {
      console.error(e);
    }
  };

  const go = (item) => {
    if (item.screen === 'NurseBookings') {
      navigation.navigate('NurseBookings', { tab: 'requests' });
    } else if (item.screen === 'NurseAccount') {
      navigation.navigate('NurseAccount', { tab: 'profile' });
    } else {
      navigation.navigate(item.screen);
    }
    navigation.closeDrawer();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logoText}>NessaHub</Text>
        <Text style={styles.logoSubtitle}>Home Care Nurse</Text>
        <View style={styles.userInfo}>
          <NursePhotoPicker nurse={nurse || profile} size={68} />
          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userRole}>{nurse?.specialty || 'Home Care'}</Text>
          <View style={[styles.presencePill, online ? styles.presenceOn : styles.presenceOff]}>
            <View style={[styles.presenceDot, { backgroundColor: online ? '#6ee7b7' : '#94a3b8' }]} />
            <Text style={styles.presenceText}>{online ? 'Online' : 'Offline'}</Text>
          </View>
          <Text style={styles.accountStatus}>{nurse?.accountStatus || 'pending'}</Text>
        </View>
      </View>

      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        <Text style={styles.menuLabel}>MAIN MENU</Text>
        {MENU.map((item) => {
          const isActive = activeRoute === item.screen;
          const count = item.screen === 'NurseBookings' ? bookingCount : 0;
          return (
            <TouchableOpacity
              key={item.screen}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => go(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons name={item.icon} size={20} color={isActive ? '#fff' : 'rgba(255,255,255,0.85)'} />
              </View>
              <Text style={[styles.menuText, isActive && styles.menuTextActive]}>{item.label}</Text>
              {count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
              {isActive ? <View style={styles.activeDot} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.trustRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.4)" />
          <Text style={styles.trustText}>Reference fees only · Secure</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.primaryDark },
  header: {
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  logoText: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  logoSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  userInfo: { alignItems: 'center', width: '100%' },
  userName: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  userRole: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8 },
  presencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 6,
  },
  presenceOn: { backgroundColor: 'rgba(16,185,129,0.2)' },
  presenceOff: { backgroundColor: 'rgba(255,255,255,0.08)' },
  presenceDot: { width: 8, height: 8, borderRadius: 4 },
  presenceText: { fontSize: 12, fontWeight: '600', color: '#ecfdf5' },
  accountStatus: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'capitalize' },
  menuLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuContainer: { flex: 1, paddingTop: 12, paddingHorizontal: 12 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  menuItemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: { backgroundColor: C.primary },
  menuText: { fontSize: 15, color: 'rgba(255,255,255,0.75)', fontWeight: '500', flex: 1 },
  menuTextActive: { color: '#fff', fontWeight: '700' },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5eead4' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, paddingHorizontal: 4 },
  trustText: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
  },
  logoutText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
