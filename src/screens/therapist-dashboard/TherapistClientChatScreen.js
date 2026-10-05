import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import {
  findOrCreateThread, sendThreadMessage, threadHasParticipant,
  setPresenceOnline, setPresenceOffline,
} from '../../utils/chatUtils';
import { TherapistColors } from '../../constants/colors';
import ChatThreadView from '../../components/chat/ChatThreadView';

export default function TherapistClientChatScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const clientId = route.params?.clientId;
  const clientName = route.params?.clientName || 'Client';
  const [messages, setMessages] = useState([]);
  const [myId, setMyId] = useState('');
  const listRef = useRef(null);
  const threadIdRef = useRef(null);

  useEffect(() => {
    AsyncStorage.getItem('th.userId').then(id => setMyId(id || ''));
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const init = async () => {
      const therapistId = await AsyncStorage.getItem('th.userId');
      // Find or create thread between therapist and client
      const threads = await api(`/api/v1/care/chats/threads?userId=${therapistId}`).catch(() => []);
      // Threads carry participantA/participantB — matching on a participantIds
      // array never hit, so an existing conversation looked like none at all.
      const thread = (Array.isArray(threads) ? threads : [])
        .find(t => threadHasParticipant(t, clientId));
      if (thread) threadIdRef.current = thread.id;

      const poll = async () => {
        if (cancelled || !threadIdRef.current) return;
        try {
          const msgs = await api(`/api/v1/care/chats/threads/${threadIdRef.current}/messages`);
          if (!cancelled) {
            setMessages(Array.isArray(msgs) ? msgs : []);
            // Mark the CLIENT's messages read.
            //
            // Only the client side did this, so the ticks were one-way: a
            // therapist's messages turned blue, while everything the client
            // sent stayed on grey double ticks no matter how long the therapist
            // had been reading it. Having this open IS reading them.
            api(`/api/v1/care/chats/threads/${threadIdRef.current}/read`, {
              method: 'POST',
              body: {},
            }).catch(() => {});
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
          }
        } catch {}
      };
      poll();

      // Announce, and keep announcing. The server treats presence as stale
      // after 40 seconds, and this screen never announced at all — so a
      // therapist actively replying still showed as offline to her client.
      setPresenceOnline(therapistId);
      const heartbeat = setInterval(() => setPresenceOnline(therapistId), 25_000);
      // 3s, not 15s — a reply should not sit unseen for a quarter of a minute.
      const id = setInterval(poll, 3_000);
      return () => {
        cancelled = true;
        clearInterval(id);
        clearInterval(heartbeat);
        setPresenceOffline(therapistId);
      };
    };

    let cleanup = () => {};
    init().then(fn => { if (fn) cleanup = fn; });
    return () => cleanup();
  }, [clientId]);

  const handleSend = async (payload) => {
    if (!clientId) return;
    const therapistId = await AsyncStorage.getItem('th.userId');
    if (!threadIdRef.current) {
      const thread = await findOrCreateThread(therapistId, clientId, 'therapy');
      if (thread?.id) threadIdRef.current = thread.id;
    }
    if (!threadIdRef.current) throw new Error('Could not open the conversation.');
    await sendThreadMessage(threadIdRef.current, therapistId, payload);
  };

  const initials = clientName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const header = (
    // Without the top inset the bar sits under the status bar / dynamic island —
    // the back arrow and client name were half-hidden behind the clock.
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      <View style={styles.headerAvatar}>
        <Text style={styles.headerAvatarText}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerName} numberOfLines={1}>{clientName}</Text>
        <Text style={styles.headerSub}>Client · Active</Text>
      </View>
    </View>
  );

  if (!clientId) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>Client not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.missingLink}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ChatThreadView
      messages={messages}
      myUid={myId}
      onSend={handleSend}
      storagePrefix={`client-chats/${clientId}`}
      accentColor={TherapistColors.primary}
      lightBg={TherapistColors.primaryLight || '#eef2ff'}
      header={header}
      emptyHint={`Say hello to ${clientName}!`}
      listRef={listRef}
      keyboardVerticalOffset={0}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: TherapistColors.primary,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  headerAvatarText: { color: '#0d0d0d', fontWeight: '800', fontSize: 15 },
  headerName: { fontSize: 16, fontWeight: '700', color: '#0d0d0d' },
  headerSub: { fontSize: 12, color: '#0d0d0d', marginTop: 2 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  missingText: { fontSize: 16, color: '#0d0d0d' },
  missingLink: { fontSize: 15, color: TherapistColors.primary, fontWeight: '600' },
});
