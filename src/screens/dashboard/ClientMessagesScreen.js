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
import { Colors } from '../../constants/colors';
import ChatThreadView from '../../components/chat/ChatThreadView';
import { setPresenceOnline, setPresenceOffline, formatLastSeen } from '../../utils/chatUtils';


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
  const presenceRef = useRef(null);

  useEffect(() => {
    loadTherapistAndMessages();
    return () => {
      if (unsubRef.current) clearInterval(unsubRef.current);
      if (presenceRef.current) clearInterval(presenceRef.current);
      AsyncStorage.getItem('th.userId').then(uid => { if (uid) setPresenceOffline(uid); });
    };
  }, []);

  const loadTherapistAndMessages = async () => {
    try {
      setLoading(true);
      const cid = await AsyncStorage.getItem('th.clientId') || await AsyncStorage.getItem('th.userId');
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
        if (!threadId) { setLoading(false); return; }

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
        unsubRef.current = setInterval(pollMessages, 15_000);
        // Presence: announce online + watch the therapist's status.
        setPresenceOnline(userId);
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
    // The endpoint stores `body`/`messageType`; ChatThreadView hands us the
    // Firestore-era `text`/`type` (plus mediaUrl for voice notes and files). Map
    // them explicitly — posting the raw payload left `body` null, which failed the
    // NOT NULL column and surfaced as "Request conflicts with existing data."
    const messageType = payload.type || payload.messageType || 'text';
    const body =
      (payload.text && payload.text.trim())
      || payload.body
      || payload.mediaUrl
      || payload.fileUrl
      || '';
    if (!body) throw new Error('Nothing to send.');
    await api(`/api/v1/care/chats/threads/${thread.id}/messages`, {
      method: 'POST',
      body: { senderId: clientId, messageType, body },
    });
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
        <Text style={[styles.headerStatus, therapistPresence.online && { color: '#22c55e' }]}>
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
