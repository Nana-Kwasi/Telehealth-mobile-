import React, { useCallback } from 'react';
import { Alert, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performLogout } from '../services/authService';
import { Colors } from '../constants/colors';

function getRootNavigation(navigation) {
  let nav = navigation;
  while (nav.getParent?.()) {
    nav = nav.getParent();
  }
  return nav;
}

export function resetNavigationToIntro(navigation) {
  const root = getRootNavigation(navigation);
  root.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'IntroHome' }],
    }),
  );
}

export default function CoupleSignOutHeaderButton() {
  const navigation = useNavigation();

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign out',
      "Sign out of your account? When you sign back in, we'll return you to your couple therapy status.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            (async () => {
              try {
                const role = await AsyncStorage.getItem('userRole');
                const profileStr = await AsyncStorage.getItem('userProfile');
                const profile = profileStr ? JSON.parse(profileStr) : null;
                await performLogout({
                  userId: await AsyncStorage.getItem('th.userId'),
                  role,
                  profile,
                  clearCoupleKeys: false,
                });
                await AsyncStorage.multiRemove([
                  'isAuthenticated',
                  'userProfile',
                  'userRole',
                  'userId',
                  'userName',
                ]);
                resetNavigationToIntro(navigation);
              } catch (e) {
                Alert.alert('Could not sign out', e?.message || 'Please try again.');
              }
            })();
          },
        },
      ],
    );
  }, [navigation]);

  return (
    <TouchableOpacity
      onPress={handleSignOut}
      style={styles.btn}
      activeOpacity={0.85}
      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
    >
      <Ionicons name="log-out-outline" size={16} color={Colors.error} style={styles.icon} />
      <Text style={styles.label}>Sign out</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#fecaca',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 3,
  },
  icon: {
    marginRight: 5,
  },
  label: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
