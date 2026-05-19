import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchUserNotifications, markNotificationRead } from '../../services/homeCareService';
import { HomeCareColors as C } from '../../constants/homeCareColors';
import { hc } from './homeCareStyles';

export default function NurseNotificationsBell({ profileId }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const unread = list.filter((n) => !n.read).length;

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      setList(await fetchUserNotifications(profileId));
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const openItem = async (n) => {
    if (!n.read) {
      await markNotificationRead(n.id);
      setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
  };

  return (
    <>
      <TouchableOpacity style={styles.bell} onPress={() => setOpen(true)} accessibilityLabel="Notifications">
        <Ionicons name="notifications-outline" size={22} color="#fff" />
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <View style={styles.toolbar}>
              <Text style={styles.toolbarTitle}>Notifications{unread > 0 ? ` (${unread})` : ''}</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <Text style={{ color: C.primary, fontWeight: '700' }}>Close</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {loading ? <Text style={hc.sub}>Loading…</Text> : null}
              {!loading && list.length === 0 ? <Text style={hc.sub}>No notifications yet.</Text> : null}
              {list.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  style={[hc.card, !n.read && styles.unread]}
                  onPress={() => openItem(n)}
                >
                  <Text style={{ fontWeight: '700', color: C.text }}>{n.title}</Text>
                  <Text style={hc.sub}>{n.body}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bell: { padding: 6, marginRight: 4 },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
    padding: 16,
  },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  toolbarTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  unread: { borderColor: C.primary, borderWidth: 2 },
});
