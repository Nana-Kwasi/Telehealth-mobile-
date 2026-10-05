import { fetchPersonProfile } from '../../utils/clientTherapyMetrics';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import { TherapistColors } from '../../constants/colors';
import { LineChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

const MOOD_EMOJI = { 9:'😄', 8:'😊', 7:'🙂', 6:'😐', 5:'😐', 4:'😰', 3:'😔', 2:'😢', 1:'😭' };
const MOOD_COLOR = (v) => v >= 7 ? '#10B981' : v >= 5 ? '#F59E0B' : '#EF4444';

const chartConfig = {
  backgroundColor: 'rgba(255,255,255,0.72)',
  backgroundGradientFrom: '#fff',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(79,70,229,${opacity})`,
  labelColor: () => TherapistColors.textLight,
  style: { borderRadius: 12 },
  propsForDots: { r: '4', strokeWidth: '2', stroke: TherapistColors.primary },
};

const TherapistMoodScreen = ({ navigation }) => {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [moodEntries, setMoodEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMoodLoading, setIsMoodLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState({ avg: 0, total: 0, trend: 'neutral' });

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(uid => { if (uid) loadClients(uid); });
  }, []);

  const loadClients = async (therapistId) => {
    try {
      setIsLoading(true);
      const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`).catch(() => []);
      const ids = (Array.isArray(assignments) ? assignments : []).map(a => a.clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const data = await fetchPersonProfile(id);
          if (data) list.push({ id, name: data.fullName || data.name || data.email || 'Client', email: data.email || '' });
        } catch {}
      }
      setClients(list);
    } catch (e) { console.error('Load clients error:', e); }
    finally { setIsLoading(false); }
  };

  const loadMoodData = async (client) => {
    setIsMoodLoading(true);
    try {
      const data = await api(`/api/v1/therapy-engagement/clients/${client.id}/moods?limit=30`);
      const entries = (Array.isArray(data) ? data : []).map(e => ({
        ...e,
        moodValue: e.moodScore,
        moodLabel: e.notes ? e.notes.split(':')[0] : '',
      }));
      setMoodEntries(entries);
      computeSummary(entries);
    } catch (e) {
      console.error('Load mood error:', e);
      setMoodEntries([]);
    } finally {
      setIsMoodLoading(false);
    }
  };

  const computeSummary = (entries) => {
    if (!entries.length) { setSummary({ avg: 0, total: 0, trend: 'neutral' }); return; }
    const vals = entries.map(e => Number(e.moodValue) || 5);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const recent = vals.slice(0, 5);
    const older = vals.slice(5, 10);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / (recent.length || 1);
    const olderAvg = older.length ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
    const trend = recentAvg > olderAvg + 0.5 ? 'improving' : recentAvg < olderAvg - 0.5 ? 'declining' : 'stable';
    setSummary({ avg, total: entries.length, trend });
  };

  const selectClient = async (client) => {
    setSelectedClient(client);
    await loadMoodData(client);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedClient) await loadMoodData(selectedClient);
    else await loadClients();
    setRefreshing(false);
  };

  const fmtDate = (val) => {
    if (!val) return '';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const chartData = () => {
    const reversed = [...moodEntries].reverse().slice(-10);
    return {
      labels: reversed.map(e => fmtDate(e.createdAt || e.date)),
      datasets: [{ data: reversed.map(e => Math.max(1, Math.min(10, Number(e.moodValue) || 5))) }],
    };
  };

  const trendIcon = summary.trend === 'improving' ? 'trending-up' : summary.trend === 'declining' ? 'trending-down' : 'remove';
  const trendColor = summary.trend === 'improving' ? '#10B981' : summary.trend === 'declining' ? '#EF4444' : '#6B7280';

  if (isLoading) return (
    <View style={[styles.container, styles.center]}>
      <ActivityIndicator size="large" color={TherapistColors.primary} />
      <Text style={styles.loadingText}>Loading clients…</Text>
    </View>
  );

  // ── Client list ──
  if (!selectedClient) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Client Mood Dashboard</Text>
          <Text style={styles.headerSub}>Track your clients' daily mood check-ins</Text>
        </View>
        {clients.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="happy-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>No clients assigned</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.listContent}>
            {clients.map(c => (
              <TouchableOpacity key={c.id} style={styles.clientCard} onPress={() => selectClient(c)} activeOpacity={0.75}>
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientAvatarText}>{(c.name || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{c.name}</Text>
                  <Text style={styles.clientEmail}>{c.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TherapistColors.textLight} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // ── Mood detail view ──
  return (
    <View style={styles.container}>
      {/* Back header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setSelectedClient(null)} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={TherapistColors.text} />
        </TouchableOpacity>
        <View style={styles.clientAvatar}>
          <Text style={styles.clientAvatarText}>{(selectedClient.name || '?')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{selectedClient.name}</Text>
          <Text style={styles.chatSub}>Mood history</Text>
        </View>
      </View>

      {isMoodLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={TherapistColors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.detailContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[TherapistColors.primary]} />}
        >
          {/* Summary cards */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { borderTopColor: MOOD_COLOR(summary.avg) }]}>
              <Text style={styles.summaryValue}>{summary.avg > 0 ? `${MOOD_EMOJI[summary.avg] || '😐'} ${summary.avg}` : '—'}</Text>
              <Text style={styles.summaryLabel}>Avg Mood</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: TherapistColors.primary }]}>
              <Text style={styles.summaryValue}>{summary.total}</Text>
              <Text style={styles.summaryLabel}>Check-ins</Text>
            </View>
            <View style={[styles.summaryCard, { borderTopColor: trendColor }]}>
              <Ionicons name={trendIcon} size={22} color={trendColor} />
              <Text style={[styles.summaryLabel, { color: trendColor, marginTop: 4 }]}>{summary.trend}</Text>
            </View>
          </View>

          {/* Mood trend chart */}
          {moodEntries.length >= 2 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Mood Trend (last 10)</Text>
              <LineChart
                data={chartData()}
                width={width - 64}
                height={160}
                chartConfig={chartConfig}
                bezier
                style={{ borderRadius: 10, marginTop: 8 }}
                withShadow={false}
                withInnerLines={false}
                fromZero
                yAxisSuffix="/10"
              />
            </View>
          )}

          {/* Entry list */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recent Check-ins ({moodEntries.length})</Text>
            {moodEntries.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="happy-outline" size={32} color={TherapistColors.textLight} />
                <Text style={styles.emptyTitle}>No mood check-ins yet</Text>
              </View>
            ) : moodEntries.map(entry => {
              const val = Number(entry.moodValue) || 5;
              return (
                <View key={entry.id} style={styles.entryRow}>
                  <View style={[styles.moodBadge, { backgroundColor: `${MOOD_COLOR(val)}18` }]}>
                    <Text style={styles.moodEmoji}>{MOOD_EMOJI[val] || '😐'}</Text>
                    <Text style={[styles.moodVal, { color: MOOD_COLOR(val) }]}>{val}/10</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryLabel}>{entry.moodLabel || entry.mood || 'Check-in'}</Text>
                    {entry.journalEntry ? (
                      <Text style={styles.entryJournal} numberOfLines={2}>{entry.journalEntry}</Text>
                    ) : null}
                    {entry.challenges ? (
                      <Text style={styles.entryChallenge} numberOfLines={1}>⚡ {entry.challenges}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.entryDate}>{fmtDate(entry.createdAt || entry.date)}</Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  loadingText: { color: TherapistColors.textSecondary, fontSize: 14 },

  header: {
    backgroundColor: TherapistColors.primaryDark,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20,
    borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0d0d0d' },
  headerSub: { fontSize: 13, color: '#0d0d0d', marginTop: 4 },

  listContent: { padding: 16 },
  clientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  clientAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: TherapistColors.primary, justifyContent: 'center', alignItems: 'center' },
  clientAvatarText: { fontSize: 18, fontWeight: '700', color: '#fff' },
  clientName: { fontSize: 15, fontWeight: '700', color: TherapistColors.text },
  clientEmail: { fontSize: 12, color: TherapistColors.textLight, marginTop: 2 },

  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: 'rgba(255,255,255,0.72)', borderBottomWidth: 1, borderBottomColor: TherapistColors.border,
  },
  chatName: { fontSize: 16, fontWeight: '700', color: TherapistColors.text },
  chatSub: { fontSize: 12, color: TherapistColors.textSecondary },

  detailContent: { padding: 16 },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 14, padding: 14,
    alignItems: 'center', borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  summaryValue: { fontSize: 20, fontWeight: '800', color: TherapistColors.text, marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: TherapistColors.textSecondary, fontWeight: '600', textTransform: 'capitalize' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: TherapistColors.text, marginBottom: 8 },

  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  emptyTitle: { fontSize: 14, color: TherapistColors.textLight, fontWeight: '500' },

  entryRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  moodBadge: { borderRadius: 10, padding: 8, alignItems: 'center', minWidth: 52 },
  moodEmoji: { fontSize: 20 },
  moodVal: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  entryLabel: { fontSize: 14, fontWeight: '600', color: TherapistColors.text },
  entryJournal: { fontSize: 12, color: TherapistColors.textSecondary, marginTop: 3 },
  entryChallenge: { fontSize: 12, color: '#EF4444', marginTop: 3 },
  entryDate: { fontSize: 11, color: TherapistColors.textLight, marginTop: 2 },
});

export default TherapistMoodScreen;
