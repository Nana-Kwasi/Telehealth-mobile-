import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ImageBackground,
  Platform,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TherapyColors as Colors } from '../constants/colors';
import { performLogout } from '../services/authService';
import { api } from '../services/apiClient';
import { resolveFileUrl } from '../utils/mediaUrl';

const CustomDrawerContent = ({ navigation, profile, state }) => {
  // Second Opinion clients see a narrower drawer: one case, one consultation,
  // no programme. Schedule and Resources describe ongoing care they have not
  // bought, so they are hidden rather than shown empty.
  //
  // Resolved from the SERVER, like the navigator: a profile cached before the
  // tier existed (or before an upgrade) is stale, and this drawer was showing
  // Resources to people who had not bought it because the cached value was
  // simply undefined.
  const [tier, setTier] = useState(profile?.membershipTier || profile?.tier || null);
  useEffect(() => {
    let alive = true;
    api('/api/v1/medpsych/me')
      .then((r) => { if (alive && r?.membershipTier) setTier(r.membershipTier); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const isSecondOpinion = tier === 'second_opinion';
  // Matches TherapistDrawerContent: the inset is not trusted on its own,
  // because a drawer outside a SafeAreaProvider reports 0 and the brand row
  // ends up under the status bar.
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'ios' ? 47 : StatusBar.currentHeight || 24,
  );
  const activeRoute = state?.routes?.[state.index]?.name;
  const handleLogout = async () => {
    try {
      const role = await AsyncStorage.getItem('userRole');
      const profileStr = await AsyncStorage.getItem('userProfile');
      const parsedProfile = profileStr ? JSON.parse(profileStr) : profile;
      await performLogout({
        userId: await AsyncStorage.getItem('th.userId'),
        role,
        profile: parsedProfile,
        clearCoupleKeys: true,
      });
    } catch (error) {
      // Never block sign-out on a cleanup failure. The session token is
      // already gone by this point, so stranding the user on the dashboard
      // is strictly worse than a failed tidy-up.
      console.warn('Logout cleanup failed (continuing):', error?.message);
    } finally {
      navigation.getParent()?.replace('Welcome');
    }
  };

  const drawerItems = [
    {
      name: 'Home',
      icon: 'home-outline',
      label: 'Home',
      screen: 'Home',
    },
    {
      name: 'Messages',
      icon: 'chatbubbles-outline',
      label: 'Therapist',
      screen: 'Messages',
    },
    {
      name: 'Video',
      icon: 'videocam-outline',
      label: 'Schedule',
      screen: 'Video',
    },
    {
      name: 'Schedule',
      icon: 'calendar-outline',
      label: 'Calendar',
      screen: 'Schedule',
    },
    {
      name: 'Resources',
      icon: 'book-outline',
      label: 'Resources',
      screen: 'Resources',
    },
    {
      name: 'Billing',
      icon: 'card-outline',
      label: 'Billing',
      screen: 'Billing',
    },
    {
      name: 'MyCare',
      icon: 'medkit-outline',
      label: 'My Care',
      screen: 'TherapyCare',
    },
    {
      name: 'CarePlan',
      icon: 'clipboard-outline',
      label: 'My Care Plan',
      screen: 'TherapyCarePlan',
    },
    {
      name: 'Records',
      icon: 'search-outline',
      label: 'My Records',
      screen: 'TherapyRecords',
    },
    {
      name: 'Wellness',
      icon: 'leaf-outline',
      label: 'Wellness',
      screen: 'TherapyWellness',
    },
    {
      name: 'AiAssistant',
      icon: 'sparkles-outline',
      label: 'NessaHub Assistant',
      screen: 'TherapyAiAssistant',
    },
    {
      name: 'NotificationPrefs',
      icon: 'notifications-outline',
      label: 'Notification settings',
      screen: 'TherapyNotificationPrefs',
    },
    {
      name: 'Settings',
      icon: 'settings-outline',
      label: 'Settings',
      screen: 'Settings',
    },
    {
      name: 'Support',
      icon: 'help-circle-outline',
      label: 'Support',
      screen: 'Support',
    },
  ];

  const visibleItems = (isSecondOpinion
    ? drawerItems.filter((i) => !['Schedule', 'Resources', 'TherapyWellness', 'TherapyCarePlan'].includes(i.screen))
    : drawerItems
  ).map((i) => (isSecondOpinion && i.screen === 'Home'
    ? { ...i, label: 'My case' }
    : i));

  return (
    <View style={styles.container}>
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
        <View style={styles.userInfo}>
          {profile?.photoURL ? (
            <Image source={{ uri: resolveFileUrl(profile.photoURL)}} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(profile?.name || 'C')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <View style={styles.userMeta}>
            <Text style={styles.userName} numberOfLines={1}>{profile?.name || 'Client'}</Text>
            <Text style={styles.userRole}>Client</Text>
          </View>
        </View>
      </ImageBackground>

      <ScrollView style={styles.menuContainer}>
        {visibleItems.map((item) => (
          <TouchableOpacity
            key={item.name}
            style={[styles.menuItem, activeRoute === item.screen && styles.menuItemActive]}
            onPress={() => {
              navigation.navigate(item.screen);
              navigation.closeDrawer();
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.iconWrap, activeRoute === item.screen && styles.iconWrapActive]}>
              <Ionicons
                name={item.icon}
                size={20}
                color={activeRoute === item.screen ? '#ffffff' : '#5046bd'}
              />
            </View>
            <Text style={[styles.menuText, activeRoute === item.screen && styles.menuTextActive]}>
              {item.label}
            </Text>
            <Ionicons name="chevron-forward" size={17} color="#9aa0ac" />
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#8c322d" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  menuTextActive: {
    color: '#3f3796',
    fontWeight: '800',
  },
  iconWrapActive: {
    backgroundColor: '#5046bd',
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(80,70,189,0.10)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemActive: {
    backgroundColor: 'rgba(80,70,189,0.09)',
  },
  userMeta: {
    flex: 1,
  },
  heroImage: {
    resizeMode: 'cover',
  },
  hero: {
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  logoSubtitle: {
    fontSize: 11.5,
    color: '#6f6a9c',
    fontWeight: '600',
    marginTop: 2,
  },
  brandRow: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: '#ffffff',
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
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
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
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#101010',
  },
  userRole: {
    fontSize: 12,
    color: '#44474f',
    marginTop: 1,
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(16,16,16,0.06)',
  },
  menuText: {
    fontSize: 15,
    color: '#101010',
    fontWeight: '600',
    flex: 1,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#e3b3b0',
  },
  logoutText: {
    color: '#8c322d',
    fontSize: 15,
    fontWeight: '800',
  },
});

export default CustomDrawerContent;
