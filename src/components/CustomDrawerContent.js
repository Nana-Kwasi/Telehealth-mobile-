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
import { Colors } from '../constants/colors';
import { performLogout } from '../services/authService';

const CustomDrawerContent = ({ navigation, profile }) => {
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
      await AsyncStorage.clear();
      navigation.getParent()?.replace('Welcome');
    } catch (error) {
      console.error('Logout error:', error);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>NessaHub</Text>
        </View>
        <View style={styles.userInfo}>
          {profile?.photoURL ? (
            <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {(profile?.name || 'C')[0].toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.userName}>{profile?.name || 'Client'}</Text>
          <Text style={styles.userRole}>Client</Text>
        </View>
      </View>

      <ScrollView style={styles.menuContainer}>
        {drawerItems.map((item) => (
          <TouchableOpacity
            key={item.name}
            style={styles.menuItem}
            onPress={() => {
              navigation.navigate(item.screen);
              navigation.closeDrawer();
            }}
          >
            <Ionicons name={item.icon} size={24} color={Colors.text} />
            <Text style={styles.menuText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={Colors.surface} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    backgroundColor: Colors.primary,
    padding: 20,
    paddingTop: 50,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 20,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.surface,
  },
  userInfo: {
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 10,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.surface,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 12,
    color: Colors.surface,
    opacity: 0.8,
  },
  menuContainer: {
    flex: 1,
    paddingTop: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    paddingLeft: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  menuText: {
    fontSize: 16,
    color: Colors.text,
    marginLeft: 15,
    fontWeight: '500',
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
    backgroundColor: Colors.error,
    padding: 15,
    borderRadius: 8,
  },
  logoutText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
  },
});

export default CustomDrawerContent;
