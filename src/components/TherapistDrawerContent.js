import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { performLogout } from '../services/authService';
import { TherapistColors } from '../constants/colors';

const drawerItems = [
  { screen: 'TherapistHome',      icon: 'home-outline',            label: 'Dashboard' },
  { screen: 'TherapistClients',   icon: 'people-outline',          label: 'My Clients' },
  { screen: 'TherapistMessages',  icon: 'people-outline',          label: 'Staff' },
  { screen: 'TherapistVideo',     icon: 'videocam-outline',        label: 'Video Call' },
  { screen: 'TherapistAppointments', icon: 'checkmark-circle-outline', label: 'Appointments' },
  { screen: 'TherapistSchedule',  icon: 'calendar-outline',        label: 'Calendar' },
  { screen: 'TherapistNotes',     icon: 'document-text-outline',   label: 'Notes' },
  { screen: 'TherapistMood',      icon: 'happy-outline',           label: 'Client Moods' },
  { screen: 'TherapistResources', icon: 'book-outline',            label: 'Resources' },
  { screen: 'TherapistReportIssue', icon: 'document-text-outline', label: 'Report Issue' },
  { screen: 'TherapistSettings',  icon: 'settings-outline',        label: 'Settings & Profile' },
];

const TherapistDrawerContent = ({ navigation, profile, state }) => {
  const activeRoute = state?.routes?.[state.index]?.name;

  const handleLogout = async () => {
    try {
      await performLogout();
      await AsyncStorage.clear();
      navigation.getParent()?.replace('Welcome');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const displayName = profile?.name || 'Therapist';
  const specialization = profile?.specialization || profile?.specialty || 'Mental Health Professional';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.logoText}>NessaHub</Text>
        <Text style={styles.logoSubtitle}>Therapist Portal</Text>

        <TouchableOpacity
          style={styles.userInfo}
          activeOpacity={0.85}
          onPress={() => {
            navigation.navigate('TherapistSettings');
            navigation.closeDrawer();
          }}
        >
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{displayName[0]?.toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.userName}>{displayName}</Text>
          <Text style={styles.userRole}>{specialization}</Text>
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-circle" size={12} color={TherapistColors.success} />
            <Text style={styles.verifiedText}>Verified Therapist</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Navigation Items */}
      <ScrollView style={styles.menuContainer} showsVerticalScrollIndicator={false}>
        {drawerItems.map((item) => {
          const isActive = activeRoute === item.screen;
          return (
            <TouchableOpacity
              key={item.screen}
              style={[styles.menuItem, isActive && styles.menuItemActive]}
              onPress={() => {
                navigation.navigate(item.screen);
                navigation.closeDrawer();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={isActive ? '#fff' : TherapistColors.textSecondary}
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
          <Ionicons name="log-out-outline" size={20} color={TherapistColors.error} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TherapistColors.surface,
  },
  header: {
    backgroundColor: TherapistColors.primaryDark,
    padding: 20,
    paddingTop: 54,
    alignItems: 'center',
    borderBottomRightRadius: 24,
    borderBottomLeftRadius: 24,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  logoSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  userInfo: {
    alignItems: 'center',
  },
  avatarImage: {
    width: 68,
    height: 68,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: TherapistColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  userName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 3,
  },
  userRole: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 8,
    textAlign: 'center',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  verifiedText: {
    fontSize: 11,
    color: TherapistColors.success,
    fontWeight: '600',
    marginLeft: 4,
  },
  menuContainer: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 4,
    gap: 12,
  },
  menuItemActive: {
    backgroundColor: TherapistColors.primaryLight,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    backgroundColor: TherapistColors.primary,
  },
  menuText: {
    fontSize: 15,
    color: TherapistColors.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  menuTextActive: {
    color: TherapistColors.primary,
    fontWeight: '700',
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TherapistColors.primary,
  },
  footer: {
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: TherapistColors.border,
    marginBottom: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#fff0f3',
    borderWidth: 1.5,
    borderColor: '#fecdd3',
  },
  logoutText: {
    color: TherapistColors.error,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default TherapistDrawerContent;
