import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import LocationSummaryCardMobile from '../../components/LocationSummaryCardMobile';

export default function BranchHomeScreen({ profile, navigation }) {
  const [stats, setStats] = useState({ incoming: 0, active: 0, ready: 0, delivered: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try {
      const list = await api(`/api/v1/medical/prescriptions/branch/${profile?.id}`).catch(() => []) || [];
      setStats({
        incoming:  list.filter(r => r.pharmacyStatus === 'sent').length,
        active:    list.filter(r => ['accepted', 'partially_fulfilled'].includes(r.pharmacyStatus)).length,
        ready:     list.filter(r => r.pharmacyStatus === 'ready').length,
        delivered: list.filter(r => r.pharmacyStatus === 'delivered').length,
      });
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const STATS = [
    { label: 'Incoming',  value: stats.incoming,   icon: 'arrow-down-circle', color: '#7c3aed' },
    { label: 'Active',    value: stats.active,      icon: 'time', color: '#d97706' },
    { label: 'Ready',     value: stats.ready,       icon: 'checkmark-circle', color: '#16a34a' },
    { label: 'Delivered', value: stats.delivered,   icon: 'bag-check', color: '#475569' },
  ];

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadStats(); }} tintColor={C.primary} />}
      >
        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>{profile?.branchName || profile?.pharmacyName || 'Branch'}</Text>
          <Text style={styles.welcomeSub}>Branch Dashboard</Text>
        </View>
        <LocationSummaryCardMobile profile={profile} onEdit={() => navigation.navigate('BranchSettings')} />

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ margin: 32 }} />
        ) : (
          <View style={styles.statsGrid}>
            {STATS.map(s => (
              <View key={s.label} style={styles.statCard}>
                <Ionicons name={s.icon} size={28} color={s.color} />
                <Text style={[styles.statValue, { color: s.color }]}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  welcome: { padding: 20, paddingTop: 24 },
  welcomeTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  welcomeSub: { fontSize: 14, color: C.textSecondary, marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12 },
  statCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, alignItems: 'center', width: '45%', flexGrow: 1, borderWidth: 1, borderColor: C.border, gap: 6 },
  statValue: { fontSize: 28, fontWeight: '900' },
  statLabel: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
});
