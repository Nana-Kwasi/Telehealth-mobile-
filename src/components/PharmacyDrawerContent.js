import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { PharmacyColors as C } from '../constants/colors';

const PHARMACY_NAV = [
  { name: 'PharmacyHome',          label: 'Dashboard',     icon: 'grid-outline' },
  { name: 'PharmacyPrescriptions', label: 'Prescriptions', icon: 'medical-outline' },
  { name: 'PharmacyBranches',      label: 'Branches',      icon: 'storefront-outline' },
  { name: 'PharmacyWalkIn',        label: 'Walk-in Verify',icon: 'search-outline' },
];

const BRANCH_NAV = [
  { name: 'BranchHome',          label: 'Dashboard',     icon: 'grid-outline' },
  { name: 'BranchPrescriptions', label: 'Prescriptions', icon: 'medical-outline' },
  { name: 'BranchWalkIn',        label: 'Walk-in Verify',icon: 'search-outline' },
];

export default function PharmacyDrawerContent({ navigation, state, profile, isBranch = false }) {
  const navItems = isBranch ? BRANCH_NAV : PHARMACY_NAV;
  const activeRoute = state?.routes?.[state.index]?.name;

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => { try { await signOut(auth); } catch (_) {} } },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Ionicons name="medical" size={22} color="#fff" />
          <Text style={styles.logoText}>NessaHub</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{isBranch ? 'Branch' : 'Pharmacy'}</Text></View>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(profile?.pharmacyName || profile?.branchName || 'P')[0].toUpperCase()}</Text>
        </View>
        <Text style={styles.pharmacyName}>{profile?.pharmacyName || profile?.branchName || 'Pharmacy'}</Text>
        <Text style={styles.pharmacyRole}>{isBranch ? 'Branch Account' : 'Parent Account'}</Text>
      </View>

      {/* Nav items */}
      <ScrollView style={styles.nav} showsVerticalScrollIndicator={false}>
        {navItems.map(item => {
          const isActive = activeRoute === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => navigation.navigate(item.name)}
            >
              <Ionicons name={item.icon} size={20} color={isActive ? '#fff' : C.textSecondary} />
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.primary },
  header: { padding: 20, paddingTop: 54, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.15)' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  logoText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  pharmacyName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pharmacyRole: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  nav: { flex: 1, padding: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, marginBottom: 4 },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  navLabel: { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
  navLabelActive: { color: '#fff' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  logoutText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
});
