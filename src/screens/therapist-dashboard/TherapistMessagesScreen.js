import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp, getDocs, doc, getDoc, limit
} from 'firebase/firestore';
import { TherapistColors } from '../../constants/colors';

const TherapistMessagesScreen = ({ navigation, route }) => {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const flatListRef = useRef(null);
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) loadClients();
  }, []);

  // If navigated with a clientId, auto-select
  useEffect(() => {
    if (route?.params?.clientId && clients.length > 0) {
      const c = clients.find(cl => cl.id === route.params.clientId);
      if (c) setSelectedClient(c);
    }
  }, [route?.params?.clientId, clients]);

  const loadClients = async () => {
    try {
      const ref = collection(db, 'therapists', currentUser.uid, 'clients');
      const snap = await getDocs(ref);
      const ids = snap.docs.map(d => d.data().clientId).filter(Boolean);
      const list = [];
      for (const id of ids) {
        try {
          const cSnap = await getDoc(doc(db, 'clients', id));
          if (cSnap.exists()) {
            const cd = cSnap.data();
            list.push({
              id,
              name: cd.name || cd.displayName || cd.email || 'Client',
              email: cd.email || '',
              status: cd.status || 'active',
            });
          }
        } catch (_) {}
      }
      setClients(list);
    } catch (e) {
      console.error('Load clients error:', e);
    } finally {
      setIsLoadingClients(false);
    }
  };

  useEffect(() => {
    if (!selectedClient) return;
    // Path must match the web: client_chats/{clientId}/messages
    const q = query(
      collection(db, 'client_chats', selectedClient.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }, err => console.error('Messages listener error:', err));
    return () => unsub();
  }, [selectedClient]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedClient) return;
    const text = newMessage.trim();
    setNewMessage('');
    setIsSending(true);
    try {
      // Use the same path as web: client_chats/{clientId}/messages
      await addDoc(collection(db, 'client_chats', selectedClient.id, 'messages'), {
        text,
        content: text,
        from: currentUser.uid,
        fromName: auth.currentUser?.displayName || 'Therapist',
        fromType: 'therapist',
        senderId: currentUser.uid,
        senderName: auth.currentUser?.displayName || 'Therapist',
        senderRole: 'therapist',
        createdAt: serverTimestamp(),
        read: false,
      });
    } catch (e) {
      console.error('Send message error:', e);
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const dt = ts.toDate ? ts.toDate() : new Date(ts);
    return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const isMyMessage = (msg) => msg.senderId === currentUser.uid || msg.from === currentUser.uid;

  const getMsgText = (msg) => {
    const raw = msg.text || msg.content || msg.message || '';
    if (typeof raw === 'string') return raw;
    // Object payload (e.g. voice/media message: {url, duration, type})
    if (raw && typeof raw === 'object') {
      const type = raw.type || 'media';
      if (type === 'audio' || raw.duration !== undefined) return '🎵 Voice message';
      if (type === 'image') return '📷 Image';
      if (type === 'video') return '🎥 Video';
      return '📎 Attachment';
    }
    return '';
  };

  // ── Client list ──
  if (!selectedClient) {
    return (
      <View style={styles.container}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Client Messages</Text>
          <Text style={styles.listSubtitle}>{clients.length} client{clients.length !== 1 ? 's' : ''}</Text>
        </View>
        {isLoadingClients ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={TherapistColors.primary} />
          </View>
        ) : clients.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={TherapistColors.textLight} />
            <Text style={styles.emptyTitle}>No clients yet</Text>
            <Text style={styles.emptySubtitle}>Clients assigned to you will appear here</Text>
          </View>
        ) : (
          <FlatList
            data={clients}
            keyExtractor={c => c.id}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item: client }) => (
              <TouchableOpacity
                style={styles.clientRow}
                onPress={() => setSelectedClient(client)}
                activeOpacity={0.7}
              >
                <View style={styles.clientAvatar}>
                  <Text style={styles.clientAvatarText}>{(client.name||'?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientRowName}>{client.name}</Text>
                  <Text style={styles.clientRowEmail}>{client.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={TherapistColors.textLight} />
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  // ── Chat view ──
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      {/* Chat header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setSelectedClient(null)} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={TherapistColors.text} />
        </TouchableOpacity>
        <View style={styles.chatAvatar}>
          <Text style={styles.chatAvatarText}>{(selectedClient.name||'?')[0].toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{selectedClient.name}</Text>
          <Text style={styles.chatStatus}>{selectedClient.status === 'active' ? 'Active Client' : selectedClient.status}</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={m => m.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item: msg }) => {
          const mine = isMyMessage(msg);
          return (
            <View style={[styles.msgWrap, mine ? styles.msgWrapMine : styles.msgWrapOther]}>
              <View style={[styles.msgBubble, mine ? styles.msgBubbleMine : styles.msgBubbleOther]}>
                <Text style={[styles.msgText, mine ? styles.msgTextMine : styles.msgTextOther]}>{getMsgText(msg)}</Text>
              </View>
              <Text style={styles.msgTime}>{formatTime(msg.createdAt)}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubble-ellipses-outline" size={40} color={TherapistColors.textLight} />
            <Text style={styles.emptyChatText}>Start the conversation</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.msgInput}
          placeholder="Type a message…"
          placeholderTextColor={TherapistColors.textLight}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { opacity: !newMessage.trim() || isSending ? 0.5 : 1 }]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || isSending}
        >
          {isSending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={18} color="#fff" />
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TherapistColors.background },
  loadingContainer: { flex:1, justifyContent:'center', alignItems:'center' },

  listHeader: { padding: 20, paddingBottom: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: TherapistColors.border },
  listTitle: { fontSize: 22, fontWeight: '800', color: TherapistColors.text },
  listSubtitle: { fontSize: 13, color: TherapistColors.textSecondary, marginTop: 2 },

  emptyState: { flex:1, alignItems:'center', justifyContent:'center', gap:10, padding:32 },
  emptyTitle: { fontSize:16, fontWeight:'700', color: TherapistColors.text },
  emptySubtitle: { fontSize:13, color: TherapistColors.textLight, textAlign:'center' },

  clientRow: { flexDirection:'row', alignItems:'center', gap:12, backgroundColor:'#fff', borderRadius:14, padding:14, marginBottom:10, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.04, shadowRadius:4, elevation:1 },
  clientAvatar: { width:46, height:46, borderRadius:23, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
  clientAvatarText: { fontSize:18, fontWeight:'700', color:'#fff' },
  clientRowName: { fontSize:15, fontWeight:'700', color: TherapistColors.text },
  clientRowEmail: { fontSize:12, color: TherapistColors.textLight, marginTop:2 },

  chatHeader: { flexDirection:'row', alignItems:'center', gap:12, padding:14, backgroundColor:'#fff', borderBottomWidth:1, borderBottomColor: TherapistColors.border },
  backBtn: { padding:4 },
  chatAvatar: { width:40, height:40, borderRadius:20, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
  chatAvatarText: { fontSize:16, fontWeight:'700', color:'#fff' },
  chatName: { fontSize:16, fontWeight:'700', color: TherapistColors.text },
  chatStatus: { fontSize:12, color: TherapistColors.textSecondary },

  msgWrap: { maxWidth:'80%', gap:3 },
  msgWrapMine: { alignSelf:'flex-end', alignItems:'flex-end' },
  msgWrapOther: { alignSelf:'flex-start', alignItems:'flex-start' },
  msgBubble: { borderRadius:18, paddingHorizontal:14, paddingVertical:10 },
  msgBubbleMine: { backgroundColor: TherapistColors.primary, borderBottomRightRadius:4 },
  msgBubbleOther: { backgroundColor:'#fff', borderBottomLeftRadius:4, shadowColor:'#000', shadowOffset:{width:0,height:1}, shadowOpacity:0.05, shadowRadius:3, elevation:1 },
  msgText: { fontSize:15, lineHeight:20 },
  msgTextMine: { color:'#fff' },
  msgTextOther: { color: TherapistColors.text },
  msgTime: { fontSize:11, color: TherapistColors.textLight },

  emptyChat: { alignItems:'center', paddingTop:60, gap:10 },
  emptyChatText: { fontSize:14, color: TherapistColors.textLight },

  inputBar: { flexDirection:'row', alignItems:'flex-end', gap:10, padding:12, backgroundColor:'#fff', borderTopWidth:1, borderTopColor: TherapistColors.border },
  msgInput: { flex:1, backgroundColor:'#f8fafc', borderRadius:22, paddingHorizontal:16, paddingVertical:10, fontSize:15, color: TherapistColors.text, borderWidth:1.5, borderColor: TherapistColors.border, maxHeight:100 },
  sendBtn: { width:44, height:44, borderRadius:22, backgroundColor: TherapistColors.primary, justifyContent:'center', alignItems:'center' },
});

export default TherapistMessagesScreen;
