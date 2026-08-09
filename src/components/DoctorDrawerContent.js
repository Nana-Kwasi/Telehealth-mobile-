import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { performLogout } from '../services/authService';
import { api, getStoredUserId } from '../services/apiClient';
import { DoctorColors } from '../constants/colors';

const drawerItems = [
  { screen: 'DoctorHome',               icon: 'home-outline',            label: 'Dashboard' },
  { screen: 'DoctorPatients',           icon: 'people-outline',          label: 'My Patients' },
  { screen: 'DoctorPatientPanel',       icon: 'grid-outline',            label: 'Patient Panel' },
  { screen: 'DoctorAppointments',       icon: 'calendar-outline',        label: 'Appointments' },
  { screen: 'DoctorVideo',              icon: 'videocam-outline',        label: 'Video Calls' },
  { screen: 'DoctorMessages',           icon: 'chatbubbles-outline',     label: 'Messages' },
  { screen: 'DoctorNotes',              icon: 'document-text-outline',   label: 'Notes' },
  { screen: 'DoctorPrescriptions',      icon: 'medkit-outline',          label: 'Prescriptions' },
  { stackScreen: 'DoctorDiagnosticOrder', icon: 'add-circle-outline',    label: 'Order Lab / Scan' },
  { screen: 'DoctorDiagnosticResults',  icon: 'flask-outline',           label: 'Lab & Scan Results' },
  { screen: 'DoctorReviews',            icon: 'star-outline',            label: 'Reviews' },
  { screen: 'DoctorAnalytics',          icon: 'bar-chart-outline',       label: 'Analytics' },
  { screen: 'DoctorSettings',           icon: 'settings-outline',        label: 'Profile & Settings' },
];

const DoctorDrawerContent = ({ navigation, profile, state }) => {
  const activeRoute = state?.routes?.[state.index]?.name;

  // Self-heal: the cached login profile can be stale, so fetch the live doctor
  // record and prefer its name/specialization for the sidebar.
  const [freshProfile, setFreshProfile] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = profile?.id || (await getStoredUserId());
      if (!uid) return;
      const d = await api(`/api/v1/doctors/${uid}`).catch(() => null);
      if (d && !cancelled) setFreshProfile(d);
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  const handleLogout = async () => {
    try {
      await performLogout();
      await AsyncStorage.clear();
      navigation.getParent()?.replace('Intent');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const displayName = freshProfile?.name || freshProfile?.fullName || profile?.name || 'Doctor';
  const specialty = freshProfile?.specialization || profile?.specialty || profile?.specialization || 'General Practice';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logoText}>NessaHub</Text>
        <Text style={styles.logoSubtitle}>Doctor Portal</Text>

        <View style={styles.userInfo}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{displayName[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.userName}>Dr. {displayName}</Text>
          <Text style={styles.userSpecialty}>{specialty}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#10b981" />
            <Text style={styles.verifiedText}>Verified Doctor</Text>
          </View>
        </View>
      </View>

      {/* Navigation */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {drawerItems.map(item => {
          const key = item.stackScreen || item.screen;
          const isActive = item.stackScreen ? false : activeRoute === item.screen;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => {
                if (item.stackScreen) {
                  navigation.getParent()?.navigate(item.stackScreen);
                } else {
                  navigation.navigate(item.screen);
                }
                navigation.closeDrawer();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={isActive ? '#fff' : DoctorColors.textSecondary}
                />
              </View>
              <Text style={[styles.menuText, isActive && styles.menuTextActive]}>
                {item.label}
              </Text>
              {isActive && <View style={styles.activeDot} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.divider} />
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#f43f5e" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: DoctorColors.primaryDark,
    padding: 20, paddingTop: 54,
    alignItems: 'center',
    borderBottomRightRadius: 24, borderBottomLeftRadius: 24,
  },
  logoText: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  logoSubtitle: {
    fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 16,
  },
  userInfo: { alignItems: 'center' },
  avatar: {
    width: 68, height: 68, borderRadius: 34, marginBottom: 10,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarPlaceholder: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: DoctorColors.primary,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarInitial: { fontSize: 26, fontWeight: '800', color: '#fff' },
  userName: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 3 },
  userSpecialty: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 8, textAlign: 'center' },
  verifiedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
  },
  verifiedText: { fontSize: 11, color: '#10b981', fontWeight: '600', marginLeft: 4 },
  menuContainer: { flex: 1, paddingTop: 16, paddingHorizontal: 12 },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, borderRadius: 12, marginBottom: 4, gap: 12,
  },
  menuItemActive: { backgroundColor: DoctorColors.primaryLight },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
  },
  iconWrapActive: { backgroundColor: DoctorColors.primary },
  menuText: { fontSize: 15, color: DoctorColors.textSecondary, fontWeight: '500', flex: 1 },
  menuTextActive: { color: DoctorColors.primary, fontWeight: '700' },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DoctorColors.primary },
  footer: { padding: 16 },
  divider: { height: 1, backgroundColor: '#e2e8f0', marginBottom: 12 },
  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 14, borderRadius: 12,
    backgroundColor: '#fff0f3', borderWidth: 1.5, borderColor: '#fecdd3',
  },
  logoutText: { color: '#f43f5e', fontSize: 15, fontWeight: '700' },
});

export default DoctorDrawerContent;
