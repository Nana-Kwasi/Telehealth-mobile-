import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { performLogout } from '../services/authService';
import { TherapistColors } from '../constants/colors';
import { ImageBackground } from 'react-native';
import { resolveFileUrl } from '../utils/mediaUrl';

const drawerItems = [
  { screen: 'TherapistHome',      icon: 'home-outline',            label: 'Dashboard' },
  { screen: 'TherapistClients',   icon: 'people-outline',          label: 'My Clients' },
  { screen: 'TherapistMessages',  icon: 'people-outline',          label: 'Staff' },
  { screen: 'TherapistVideo',     icon: 'videocam-outline',        label: 'Video Call' },
  { screen: 'TherapistAppointments', icon: 'checkmark-circle-outline', label: 'Appointments' },
  { screen: 'TherapistSchedule',  icon: 'calendar-outline',        label: 'Calendar' },
  { screen: 'TherapistNotes',     icon: 'document-text-outline',   label: 'Notes' },
  { screen: 'TherapistCarePlans', icon: 'clipboard-outline',       label: 'Care Plans' },
  { screen: 'TherapistDocuments', icon: 'document-attach-outline', label: 'Documents' },
  { screen: 'TherapistReferrals', icon: 'share-social-outline',    label: 'Referrals' },
  { screen: 'TherapistMood',      icon: 'happy-outline',           label: 'Client Moods' },
  { screen: 'TherapistResources', icon: 'book-outline',            label: 'Resources' },
  { screen: 'TherapistWellness',  icon: 'leaf-outline',            label: 'Wellness' },
  { screen: 'TherapistAiAssistant', icon: 'sparkles-outline',      label: 'NessaHub Clinical Assistant' },
  { screen: 'TherapistNotificationPrefs', icon: 'notifications-outline', label: 'Notification settings' },
  { screen: 'TherapistReportIssue', icon: 'document-text-outline', label: 'Report Issue' },
  { screen: 'TherapistSettings',  icon: 'settings-outline',        label: 'Settings & Profile' },
];

const TherapistDrawerContent = ({ navigation, profile, state }) => {
  const [photoFailed, setPhotoFailed] = useState(false);
  // Edge-to-edge drawer: without this the brand row sits UNDER the status bar
  // and the clock overprints the tagline.
  //
  // The inset is NOT trusted on its own — a drawer rendered outside a
  // SafeAreaProvider reports 0, which is how this ended up clipped even after
  // asking for it. Fall back to the platform's own status-bar height.
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'ios' ? 47 : StatusBar.currentHeight || 24,
  );
  const activeRoute = state?.routes?.[state.index]?.name;

  const handleLogout = async () => {
    try {
      await performLogout();
    } catch (error) {
      // Never block sign-out on a cleanup failure. The session token is
      // already gone by this point, so stranding the user on the dashboard
      // is strictly worse than a failed tidy-up.
      console.warn('Logout cleanup failed (continuing):', error?.message);
    } finally {
      navigation.getParent()?.replace('Welcome');
    }
  };

  const displayName = profile?.name || 'Therapist';
  const specialization = profile?.specialization || profile?.specialty || 'Mental Health Professional';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.brandRow, { paddingTop: topInset + 14 }]}>
        <Text style={styles.logoText}>NessaHub</Text>
        <Text style={styles.logoSubtitle}>Therapy. Anytime. Anywhere.</Text>
      </View>

      <ImageBackground
        source={require('../../assets/zc-drawer.jpg')}
        resizeMode="cover"
        imageStyle={styles.heroImage}
        style={styles.hero}
      >
        <TouchableOpacity
          style={styles.userInfo}
          activeOpacity={0.85}
          onPress={() => {
            navigation.navigate('TherapistSettings');
            navigation.closeDrawer();
          }}
        >
          {profile?.photoURL && !photoFailed ? (
            <Image
              source={{ uri: resolveFileUrl(profile.photoURL) }}
              style={styles.avatarImage}
              // A stored photo URL can be truthy but unloadable — a stale upload
              // host, or a capability token signed with a different secret.
              // Without this the initials never render and the avatar is just an
              // empty circle.
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{displayName[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.userMeta}>
            <View style={styles.userNameRow}>
              <Text style={styles.userName} numberOfLines={1}>{displayName}</Text>
              <Text style={styles.userRole} numberOfLines={1}>{specialization}</Text>
            </View>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={12} color={TherapistColors.success} />
              <Text style={styles.verifiedText}>Verified Therapist</Text>
            </View>
          </View>
        </TouchableOpacity>
      </ImageBackground>

      {/* Navigation Items */}
      <ScrollView style={styles.menuContainer} contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false}>
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
                  color={isActive ? '#ffffff' : '#5046bd'}
                />
              </View>
              <Text style={[styles.menuText, isActive && styles.menuTextActive]}>
                {item.label}
              </Text>
              <Ionicons name="chevron-forward" size={17} color="#9aa0ac" />
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
  brandRow: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
  },
  hero: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  heroImage: {
    // The stones and foliage sit on the right of the artwork, so the crop is
    // anchored there and the text side stays clear.
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  logoText: {
    fontSize: 21,
    fontWeight: '800',
    color: '#3f3796',
    letterSpacing: -0.4,
  },
  logoSubtitle: {
    fontSize: 11.5,
    color: '#6f6a9c',
    fontWeight: '600',
    marginTop: 2,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(80,70,189,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarText: {
    fontSize: 21,
    fontWeight: '800',
    color: '#3f3796',
  },
  userMeta: {
    flex: 1,
    gap: 6,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#101010',
    flexShrink: 1,
  },
  userRole: {
    fontSize: 12,
    color: '#44474f',
    marginTop: 1,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  verifiedText: {
    fontSize: 11,
    color: TherapistColors.success,
    fontWeight: '600',
    marginLeft: 4,
  },
  menuContent: {
    paddingTop: 6,
  },
  menuContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    // A hairline under each row, as in the reference. It is what makes the list
    // read as navigation rather than as floating chips.
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(16,16,16,0.06)',
  },
  menuItemActive: {
    backgroundColor: 'rgba(80,70,189,0.09)',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    // Pale lavender with a violet OUTLINE glyph — uniform across rows. Solid
    // per-row colours competed with the labels instead of supporting them.
    backgroundColor: 'rgba(80,70,189,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: {
    backgroundColor: '#5046bd',
  },
  menuText: {
    fontSize: 15,
    color: '#101010',
    fontWeight: '600',
    flex: 1,
  },
  menuTextActive: {
    color: '#3f3796',
    fontWeight: '800',
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
