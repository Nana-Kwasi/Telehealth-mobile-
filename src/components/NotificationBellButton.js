import React, { useCallback, useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/apiClient';

/**
 * The header bell, for any drawer navigator.
 *
 * Notifications existed on the server for every module, and the screen was
 * registered in three navigators — but nothing anywhere linked to it, so no
 * user could actually reach their notifications. This goes in `headerRight`,
 * which puts it on every screen inside a navigator in one line.
 *
 * `screen` is the route name because navigators register it under different
 * names (TherapistNotifications / Notifications / MedicalNotifications).
 */
/**
 * `tint` defaults to WHITE because every header this sits in is a coloured
 * bar — medical and doctor are blue, therapist violet. The old #101010
 * default rendered a near-black bell on blue: about 2.2:1, effectively
 * invisible. A caller on a light header passes its own tint.
 */
export default function NotificationBellButton({ screen = 'Notifications', tint = '#ffffff' }) {
  const navigation = useNavigation();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    const res = await api('/api/v1/notifications/mine/unread-count').catch(() => null);
    const n = typeof res === 'number' ? res : res?.count ?? res?.unread ?? 0;
    setUnread(Number(n) || 0);
  }, []);

  // Refresh whenever the screen regains focus — coming back from the list
  // should clear the badge without a manual reload.
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  useEffect(() => {
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate(screen)}
      style={styles.btn}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Ionicons name="notifications-outline" size={22} color={tint} />
      {unread > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 14, paddingVertical: 6 },
  badge: {
    position: 'absolute', top: 2, right: 8,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#c0392b',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
});
