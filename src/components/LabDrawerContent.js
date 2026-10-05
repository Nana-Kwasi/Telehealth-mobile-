import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performLogout, wipeLocalData } from '../services/authService';
import { api } from '../services/apiClient';
import { LabColors as C } from '../constants/colors';

const LAB_NAV = [
  { name: 'LabHome',    label: 'Dashboard',     icon: 'grid-outline' },
  { name: 'LabOrders',  label: 'Orders',        icon: 'flask-outline' },
  { name: 'LabVerify',  label: 'Verify Patient',icon: 'search-outline' },
  { name: 'LabResults', label: 'Results',       icon: 'document-text-outline' },
  { name: 'LabBranches',    label: 'Branches',      icon: 'business-outline' },
  { name: 'LabReportIssue', label: 'Report Issue',  icon: 'mail-outline' },
  { name: 'LabPreferences', label: 'Settings',      icon: 'settings-outline' },
];

const LAB_BRANCH_NAV = [
  { name: 'LabBranchHome',    label: 'Dashboard',     icon: 'grid-outline' },
  { name: 'LabBranchOrders',  label: 'Orders',        icon: 'flask-outline' },
  { name: 'LabBranchVerify',  label: 'Verify Patient',icon: 'search-outline' },
  { name: 'LabBranchResults', label: 'Results',       icon: 'document-text-outline' },
  { name: 'LabBranchReportIssue', label: 'Report Issue',  icon: 'mail-outline' },
  { name: 'LabBranchPreferences', label: 'Settings',      icon: 'settings-outline' },
];

export default function LabDrawerContent({ navigation, state, profile, isBranch = false }) {
  const navItems = isBranch ? LAB_BRANCH_NAV : LAB_NAV;
  const activeRoute = state?.routes?.[state.index]?.name;
  const [parentLabName, setParentLabName] = useState('');

  useEffect(() => {
    if (!isBranch || !profile?.labId) return;
    api(`/api/v1/admin/users/${profile.labId}`).then((data) => {
      if (data?.labName || data?.name) setParentLabName(data.labName || data.name || '');
    }).catch(() => {});
  }, [isBranch, profile?.labId]);

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
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

  const centerName = profile?.labName || profile?.branchName || 'Lab Center';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Ionicons name="flask" size={22} color="#fff" />
          <Text style={styles.logoText}>NessaHub</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>{isBranch ? 'Branch' : 'Lab'}</Text></View>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{centerName[0].toUpperCase()}</Text>
        </View>
        <Text style={styles.centerName}>{centerName}</Text>
        {isBranch && parentLabName ? (
          <Text style={styles.parentOrgName} numberOfLines={2}>{parentLabName}</Text>
        ) : null}
        <Text style={styles.centerRole}>{isBranch ? 'Branch Account' : 'Laboratory Center'}</Text>
      </View>

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
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  avatarText: { color: '#ffffff', fontSize: 20, fontWeight: '800' },
  centerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  parentOrgName: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700', marginTop: 4 },
  centerRole: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },
  nav: { flex: 1, padding: 12 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, marginBottom: 4 },
  navItemActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  navLabel: { fontSize: 15, color: C.textSecondary, fontWeight: '600' },
  navLabelActive: { color: '#fff' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' },
  logoutText: { color: '#ef4444', fontSize: 15, fontWeight: '700' },
});
