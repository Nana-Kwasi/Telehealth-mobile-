import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { performLogout, wipeLocalData } from '../../services/authService';

/**
 * Side menu shared by the pharmacy, lab and scan dashboards (parent and
 * branch). Smoke-white glass: the NessaHub logo, the account card, then the
 * screens as frosted rows; the current screen is tinted in the role colour.
 */
export default function ProviderDrawer({
  navigation, state, items, accent, accentSoft, roleLabel, accountName, accountKind, location, parentName,
}) {
  const insets = useSafeAreaInsets();
  const active = state?.routes?.[state.index]?.name;

  const logout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          // Clearing the session is not enough: without resetting navigation the
          // dashboard stays mounted and the user appears to still be logged in.
          try { await performLogout(); } catch (_) {}
          await wipeLocalData();
          navigation.getParent()?.replace('Intent');
        },
      },
    ]);
  };

  return (
    <LinearGradient colors={['#f8fafc', '#eef2f7']} style={[s.root, { paddingTop: insets.top + 14 }]}>
      <View style={s.brandRow}>
        <Image source={require('../../../assets/nessahub-logo.png')} style={s.logo} resizeMode="contain" accessibilityLabel="NessaHub" />
        <View style={[s.badge, { backgroundColor: accentSoft, borderColor: accent }]}>
          <View style={[s.badgeDot, { backgroundColor: accent }]} />
          <Text style={[s.badgeText, { color: accent }]}>{roleLabel}</Text>
        </View>
      </View>

      <View style={s.account}>
        <View style={[s.avatar, { backgroundColor: accent }]}>
          <Text style={s.avatarText}>{(accountName || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.accountName} numberOfLines={2}>{accountName}</Text>
          <Text style={s.accountKind}>{accountKind}</Text>
          {parentName ? <Text style={s.accountMeta} numberOfLines={1}>{parentName}</Text> : null}
          {location ? (
            <View style={s.locRow}>
              <Ionicons name="location-outline" size={11} color="#94a3b8" />
              <Text style={s.accountMeta} numberOfLines={1}>{location}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={s.navLabel}>NAVIGATION</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.nav} showsVerticalScrollIndicator={false}>
        {items.map((item) => {
          const on = active === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              activeOpacity={0.75}
              onPress={() => navigation.navigate(item.name)}
              style={[s.item, on && { backgroundColor: accentSoft, borderColor: accent }]}
            >
              <View style={[s.iconWrap, on && { backgroundColor: accent }]}>
                <Ionicons name={on ? item.icon.replace('-outline', '') : item.icon} size={17} color={on ? '#fff' : '#475569'} />
              </View>
              <Text style={[s.itemText, on && { color: accent, fontWeight: '800' }]} numberOfLines={1}>{item.label}</Text>
              {on ? <View style={[s.activeBar, { backgroundColor: accent }]} /> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={s.logout} onPress={logout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={s.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const glass = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  borderWidth: 1,
  borderColor: 'rgba(226,232,240,0.9)',
};

const s = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 14 },
  logo: { width: 132, height: 31 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  account: {
    ...glass, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 16,
    shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  accountName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  accountKind: { fontSize: 10, fontWeight: '800', color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },
  accountMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  navLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.2, paddingHorizontal: 6, marginBottom: 8 },
  nav: { gap: 6, paddingBottom: 12 },
  item: { ...glass, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, overflow: 'hidden' },
  iconWrap: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9' },
  itemText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#334155' },
  activeBar: { position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 2 },
  footer: { paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(226,232,240,0.9)' },
  logout: { ...glass, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12, borderColor: '#fecaca', backgroundColor: 'rgba(254,242,242,0.8)' },
  logoutText: { color: '#dc2626', fontSize: 14, fontWeight: '800' },
});
