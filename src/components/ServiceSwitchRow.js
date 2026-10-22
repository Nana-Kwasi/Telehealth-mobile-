import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { accountServices, chooseService, rootRouteForService } from '../utils/careServices';

/**
 * "Switch to Therapy / Medical" for an account that uses both services. Shown
 * at the top of both patient drawers; hidden when the account has only one.
 * The choice is remembered on this phone and reopens next time.
 */
export default function ServiceSwitchRow({ navigation, profile, current, color = '#5046bd' }) {
  const services = accountServices(profile, profile?.role);
  if (services.length < 2) return null;
  const to = current === 'medical' ? 'therapy' : 'medical';

  const onPress = async () => {
    await chooseService(profile?.id || profile?.uid, to);
    navigation.closeDrawer?.();
    const root = navigation.getParent() || navigation;
    root.reset({ index: 0, routes: [{ name: rootRouteForService(to) }] });
  };

  return (
    <TouchableOpacity style={[styles.row, { borderColor: color }]} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name="swap-horizontal-outline" size={20} color={color} />
      <Text style={[styles.text, { color }]}>
        Switch to {to === 'medical' ? 'Medical' : 'Therapy'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
  text: { fontSize: 15, fontWeight: '600' },
});
