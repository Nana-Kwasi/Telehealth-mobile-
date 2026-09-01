import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchNotifications, fetchNotification, markNotificationRead,
  markAllNotificationsRead, iconForEvent, timeAgo,
} from '../services/notificationService';

/**
 * The notification list, and the detail view for one of them.
 *
 * Detail is rendered in place rather than as a second route: the list is short,
 * the detail is a few lines, and pushing a screen for it would mean a navigator
 * entry every dashboard would have to register separately.
 */
export default function NotificationsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    const list = await fetchNotifications();
    setItems(list);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Re-read whenever the screen comes back into focus — a push may have landed
  // while the user was elsewhere in the app.
  useEffect(() => {
    if (!navigation?.addListener) return undefined;
    return navigation.addListener('focus', load);
  }, [navigation, load]);

  const openDetail = async (item) => {
    setDetail(item);
    if (!item.readAt) {
      // Optimistic: the badge should drop the moment it is opened.
      setItems((prev) => prev.map((n) => (n.id === item.id
        ? { ...n, readAt: new Date().toISOString() } : n)));
      markNotificationRead(item.id);
    }
    const full = await fetchNotification(item.id);
    if (full) setDetail(full);
  };

  const markAll = async () => {
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    await markAllNotificationsRead();
  };

  const unread = items.filter((n) => !n.readAt).length;

  if (detail) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setDetail(null)} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={22} color="#0f172a" />
            <Text style={styles.headerBackText}>All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.detailBody}>
          <View style={styles.detailIcon}>
            <Ionicons name={iconForEvent(detail.eventType)} size={24} color="#2563eb" />
          </View>
          <Text style={styles.detailTitle}>{detail.title}</Text>
          <Text style={styles.detailTime}>{new Date(detail.createdAt).toLocaleString()}</Text>
          {detail.body ? <Text style={styles.detailText}>{detail.body}</Text> : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unread > 0 && (
          <TouchableOpacity onPress={markAll}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          ListEmptyComponent={(
            <View style={styles.center}>
              <Ionicons name="notifications-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>You are all caught up</Text>
              <Text style={styles.emptySub}>New activity will appear here.</Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, !item.readAt && styles.rowUnread]}
              onPress={() => openDetail(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.rowIcon, !item.readAt && styles.rowIconUnread]}>
                <Ionicons
                  name={iconForEvent(item.eventType)}
                  size={17}
                  color={item.readAt ? '#64748b' : '#1d4ed8'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
                {item.body ? (
                  <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>
                ) : null}
              </View>
              <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  headerBtn: { flexDirection: 'row', alignItems: 'center' },
  headerBackText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  markAll: { fontSize: 13, fontWeight: '700', color: '#2563eb' },

  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 6 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#64748b', marginTop: 8 },
  emptySub: { fontSize: 12, color: '#94a3b8' },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  // Unread differs by tint and a rail, not weight alone — weight is easy to
  // miss when every row is short.
  rowUnread: { backgroundColor: '#eff6ff', borderLeftWidth: 3, borderLeftColor: '#2563eb' },
  rowIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },
  rowIconUnread: { backgroundColor: '#dbeafe' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowBody: { fontSize: 12.5, color: '#64748b', marginTop: 2, lineHeight: 17 },
  rowTime: { fontSize: 11, color: '#94a3b8' },

  detailBody: { padding: 20 },
  detailIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  detailTitle: { fontSize: 19, fontWeight: '800', color: '#0f172a', lineHeight: 26 },
  detailTime: { fontSize: 12, color: '#94a3b8', marginTop: 4, marginBottom: 16 },
  detailText: { fontSize: 15, color: '#334155', lineHeight: 23 },
});
