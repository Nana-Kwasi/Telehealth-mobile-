import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../../services/apiClient';
import { getCachedClientData, getCachedTherapistData } from '../../services/clientDataService';
import { TherapyColors as Colors } from '../../constants/colors';
import ChatThreadView from '../../components/chat/ChatThreadView';
import { setPresenceOnline, setPresenceOffline, formatLastSeen, sendThreadMessage } from '../../utils/chatUtils';


/** Threads expose participantA/participantB (not a participantIds array). */
function threadHasParticipant(thread, userId) {
  if (!thread || !userId) return false;
  if (Array.isArray(thread.participantIds)) return thread.participantIds.includes(userId);
  return thread.participantA === userId || thread.participantB === userId;
}

const ClientMessagesScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [assignedTherapist, setAssignedTherapist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState(null);
  const [therapistPresence, setTherapistPresence] = useState({ online: false, lastSeen: null });
  const listRef = useRef(null);
  const unsubRef = useRef(null);
  const heartbeatRef = useRef(null);
  const presenceRef = useRef(null);

  useEffect(() => {
    loadTherapistAndMessages();
    return () => {
      if (unsubRef.current) clearInterval(unsubRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (presenceRef.current) clearInterval(presenceRef.current);
      AsyncStorage.getItem('th.userId').then(uid => { if (uid) setPresenceOffline(uid); });
    };
  }, []);

  /**
   * Begin polling a thread, replacing any existing loop.
   *
   * Separated out because the thread may not exist when the screen first
   * loads — a new client creates it with their first message — and that
   * message has to appear without a manual reload.
   */
  const startPolling = (threadId) => {
    if (!threadId) return;
    if (unsubRef.current) clearInterval(unsubRef.current);
    const pollMessages = async () => {
      try {
        const msgs = await api(`/api/v1/care/chats/threads/${threadId}/messages`);
        setMessages(Array.isArray(msgs) ? msgs : []);
        // Mark the therapist's messages read (blue ticks on their side).
        api(`/api/v1/care/chats/threads/${threadId}/read`, { method: 'POST', body: {} }).catch(() => {});
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
      } catch {}
    };
    pollMessages();
    // 3s, not 15s. At fifteen seconds a reply could sit unseen for a quarter
    // of a minute, which in a conversation reads as the app being broken.
    unsubRef.current = setInterval(pollMessages, 3_000);
  };

  const loadTherapistAndMessages = async () => {
    try {
      setLoading(true);
      // Chat threads are keyed by USER id: chat_threads.participant_a/b are
      // foreign keys to users(id). `th.clientId` is the client_profiles_v2 ROW
      // id, which is a different uuid entirely — querying threads with it
      // returned an empty list, so the client saw "Start a conversation" while
      // the therapist could read everything they had sent.
      //
      // The profile id still has its uses elsewhere; it is simply not a chat
      // participant. Fall back to it only if there is no user id at all.
      const cid = await AsyncStorage.getItem('th.userId') || await AsyncStorage.getItem('th.clientId');
      setClientId(cid);
      const userId = await AsyncStorage.getItem('th.userId');
      if (!cid || !userId) { setLoading(false); return; }

      let therapist = getCachedTherapistData();
      const clientData = getCachedClientData();

      if (!therapist && clientData?.assignedTherapist) {
        const therapistId = clientData.assignedTherapist || clientData.assignedTherapistId;
        try {
          const data = await api(`/api/v1/therapists/${therapistId}`);
          if (data) therapist = { id: therapistId, ...data };
        } catch {}
      }

      if (therapist) {
        setAssignedTherapist(therapist);
        // Find or create chat thread
        const threads = await api(`/api/v1/care/chats/threads?userId=${cid}`).catch(() => []);
        const thread = Array.isArray(threads) ? threads.find(t => threadHasParticipant(t, therapist.id)) : null;
        const threadId = thread?.id;
        // NOTE: no early return here any more. A brand-new client has no thread
        // until their first message, and returning meant polling never started:
        // they sent a message, it saved correctly, and the screen kept showing
        // "Start a conversation" because nothing ever re-read it. The rest of
        // the screen (presence, the composer) must come up regardless.
        if (threadId) startPolling(threadId);
        // Presence: announce online + watch the therapist's status.
        // Heartbeat, not a one-off. The server only counts someone online if
        // their presence was refreshed within the last 40 seconds, so a single
        // call on load showed "last seen" while they were actively chatting.
        setPresenceOnline(userId);
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => setPresenceOnline(userId), 25_000);
        const fetchPresence = () => api(`/api/v1/realtime/presence/${therapist.id}`)
          .then(p => setTherapistPresence(p || { online: false, lastSeen: null })).catch(() => {});
        fetchPresence();
        presenceRef.current = setInterval(fetchPresence, 10_000);
      } else {
        Alert.alert('No Therapist', 'You have not been assigned a therapist yet.');
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert('Error', 'Failed to load messages.');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (payload) => {
    if (!assignedTherapist || !clientId) return;
    const threads = await api(`/api/v1/care/chats/threads?userId=${clientId}`).catch(() => []);
    let thread = Array.isArray(threads) ? threads.find(t => threadHasParticipant(t, assignedTherapist.id)) : null;
    // First message: no thread exists yet → create one. If creation 400s because a
    // thread already exists (the unique index is on channel+participants), re-read
    // the list rather than giving up — swallowing that error meant the send just
    // stopped, with nothing shown to the user.
    if (!thread?.id) {
      thread = await api('/api/v1/care/chats/threads', {
        method: 'POST',
        body: { channel: 'therapy', participantA: clientId, participantB: assignedTherapist.id },
      }).catch(() => null);
      if (!thread?.id) {
        const retry = await api(`/api/v1/care/chats/threads?userId=${clientId}`).catch(() => []);
        thread = Array.isArray(retry)
          ? retry.find(t => threadHasParticipant(t, assignedTherapist.id))
          : null;
      }
    }
    if (!thread?.id) throw new Error('Could not open the conversation.');
    // Use the shared sender the therapist screens already use. This screen had its
    // own inline copy that posted only {senderId, messageType, body}, so a file's
    // URL landed in `body` and attachment_json stayed NULL — the receiver got no
    // name, type or size, and the therapist's web chat fell through to its generic
    // "Attachment" label. sendThreadMessage forwards the metadata.
    await sendThreadMessage(thread.id, clientId, payload);

    // Show it straight away rather than waiting for the next poll. Even at a
    // 3-second interval, watching your own message not appear reads as a failed
    // send — so the bubble goes up immediately and the poll reconciles it.
    // Keyed with a temporary id so the real row replaces it rather than
    // duplicating when it arrives.
    setMessages((prev) => ([
      ...prev,
      {
        id: `pending-${Date.now()}`,
        threadId: thread.id,
        senderId: clientId,
        body: typeof payload === 'string' ? payload : (payload?.body ?? payload?.text ?? ''),
        messageType: (typeof payload === 'object' && payload?.messageType) || 'text',
        sentAt: new Date().toISOString(),
        status: 'sending',
        pending: true,
      },
    ]));
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);

    // The thread may have just been created by this very send, in which case
    // nothing is watching it yet. Start now so the message appears immediately
    // rather than after the next visit to the screen.
    startPolling(thread.id);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading messages...</Text>
      </View>
    );
  }

  if (!assignedTherapist) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Ionicons name="person-remove-outline" size={64} color={Colors.textSecondary} />
        <Text style={styles.emptyText}>No therapist assigned</Text>
        <Text style={styles.emptySubtext}>Please contact support to get assigned to a therapist</Text>
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color={Colors.text} />
      </TouchableOpacity>
      <View style={styles.headerInfo}>
        <Text style={styles.headerName}>{assignedTherapist.name}</Text>
        <Text style={[styles.headerStatus, therapistPresence.online && { color: '#2f7d5f' }]}>
          {therapistPresence.online ? '● Online' : (formatLastSeen(therapistPresence.lastSeen) || 'Your therapist')}
        </Text>
      </View>
    </View>
  );

  return (
    <ChatThreadView
      messages={messages}
      myUid={clientId}
      onSend={handleSend}
      storagePrefix={`client-chats/${clientId}`}
      accentColor={Colors.primary}
      lightBg={Colors.primaryLight || '#eef2ff'}
      header={header}
      emptyHint={`Start a conversation with ${assignedTherapist.name}`}
      listRef={listRef}
      keyboardVerticalOffset={90}
    />
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centerContent: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: Colors.textSecondary, fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerInfo: { flex: 1, marginLeft: 12 },
  headerName: { fontSize: 18, fontWeight: '600', color: Colors.text },
  headerStatus: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  emptyText: { fontSize: 18, fontWeight: '600', color: Colors.text, marginTop: 16 },
  emptySubtext: { fontSize: 14, color: Colors.textSecondary, marginTop: 8, textAlign: 'center' },
});

export default ClientMessagesScreen;
