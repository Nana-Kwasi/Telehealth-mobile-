import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection, query, where, getDocs, addDoc, onSnapshot,
  orderBy, serverTimestamp, getDoc, doc,
} from 'firebase/firestore';
import { DoctorColors } from '../../constants/colors';

function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DoctorMessagesScreen() {
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [search, setSearch] = useState('');
  const [doctorProfile, setDoctorProfile] = useState(null);
  const listRef = useRef(null);
  const unsubRef = useRef(null);

  useEffect(() => {
    loadPatients();
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, []);

  useEffect(() => {
    if (!activePatient) { setMessages([]); return; }
    subscribeMessages(activePatient.id);
  }, [activePatient]);

  const loadPatients = async () => {
    try {
      const cu = auth.currentUser;
      if (!cu) return;

      const dSnap = await getDoc(doc(db, 'doctors', cu.uid));
      const profile = dSnap.exists() ? { id: cu.uid, ...dSnap.data() } : { id: cu.uid, name: 'Doctor' };
      setDoctorProfile(profile);

      const apptSnap = await getDocs(
        query(collection(db, 'doctorAppointments'), where('doctorId', '==', cu.uid))
      );
      const patMap = new Map();
      apptSnap.docs.forEach(d => {
        const data = d.data();
        if (!data.clientId) return;
        const existing = patMap.get(data.clientId);
        if (!existing || (data.date || '') > (existing.lastVisit || '')) {
          patMap.set(data.clientId, {
            id: data.clientId,
            name: data.clientName || 'Patient',
            email: data.clientEmail || '',
            lastVisit: data.date || '',
          });
        }
      });
      setPatients(Array.from(patMap.values()));
    } catch (err) {
      console.error('DoctorMessages patients error:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const subscribeMessages = (patientId) => {
    if (unsubRef.current) unsubRef.current();
    const cu = auth.currentUser;
    if (!cu) return;

    const chatId = [cu.uid, patientId].sort().join('_');
    const q = query(
      collection(db, 'doctor_chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );
    unsubRef.current = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }, err => {
      console.error('Messages subscribe error:', err);
    });
  };

  const sendMessage = async () => {
    if (!msgText.trim() || !activePatient) return;
    setSending(true);
    const text = msgText.trim();
    setMsgText('');
    try {
      const cu = auth.currentUser;
      const chatId = [cu.uid, activePatient.id].sort().join('_');
      await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
        text,
        from: cu.uid,
        fromName: `Dr. ${doctorProfile?.name || 'Doctor'}`,
        to: activePatient.id,
        toName: activePatient.name,
        timestamp: serverTimestamp(),
        type: 'text',
      });
    } catch (err) {
      console.error('Send message error:', err);
    } finally {
      setSending(false);
    }
  };

  const filteredPatients = patients.filter(p =>
    !search.trim() || (p.name || '').toLowerCase().includes(search.toLowerCase())
  );

  const cu = auth.currentUser;

  if (activePatient) {
    return (
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setActivePatient(null)} style={{ marginRight: 10 }}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{getInitials(activePatient.name)}</Text>
          </View>
          <View>
            <Text style={styles.chatName}>{activePatient.name}</Text>
            <Text style={styles.chatSub}>Patient · Secure channel</Text>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={listRef}
          style={styles.messageList}
          contentContainerStyle={{ padding: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyChatText}>No messages yet. Say hello!</Text>
            </View>
          )}
          {messages.map(msg => {
            const isMine = msg.from === cu?.uid;
            return (
              <View key={msg.id} style={[styles.msgRow, isMine && styles.msgRowMine]}>
                {!isMine && (
                  <View style={styles.msgAvatar}>
                    <Text style={styles.msgAvatarText}>{getInitials(activePatient.name)}</Text>
                  </View>
                )}
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{msg.text}</Text>
                  <Text style={[styles.bubbleTime, isMine && { color: 'rgba(255,255,255,0.65)' }]}>
                    {timeAgo(msg.timestamp)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.msgInput}
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            value={msgText}
            onChangeText={setMsgText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!msgText.trim() || sending) && { opacity: 0.4 }]}
            onPress={sendMessage}
            disabled={!msgText.trim() || sending}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patients..."
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loadingPatients ? (
        <View style={styles.centered}><ActivityIndicator size="large" color={DoctorColors.primary} /></View>
      ) : (
        <FlatList
          data={filteredPatients}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={loadPatients} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.patientRow} onPress={() => setActivePatient(item)}>
              <View style={styles.patientAvatar}>
                <Text style={styles.patientAvatarText}>{getInitials(item.name)}</Text>
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{item.name}</Text>
                <Text style={styles.patientMeta}>
                  {item.email || 'Patient'}{item.lastVisit ? ` · ${item.lastVisit}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="chatbubbles-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyText}>{search ? 'No matching patients' : 'No patients yet'}</Text>
              <Text style={styles.emptySub}>Patients who book appointments will appear here</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DoctorColors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: DoctorColors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: DoctorColors.text },
  patientRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  patientAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  patientAvatarText: { fontSize: 16, fontWeight: '700', color: DoctorColors.primary },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 15, fontWeight: '600', color: DoctorColors.text },
  patientMeta: { fontSize: 12, color: DoctorColors.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#94a3b8' },
  emptySub: { fontSize: 12, color: '#cbd5e1', textAlign: 'center', paddingHorizontal: 32 },
  // Chat
  chatContainer: { flex: 1, backgroundColor: DoctorColors.background },
  chatHeader: {
    backgroundColor: DoctorColors.primaryDark, paddingHorizontal: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 14,
  },
  chatAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  chatAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  chatName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  chatSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  messageList: { flex: 1 },
  emptyChat: { alignItems: 'center', paddingTop: 40, gap: 8 },
  emptyChatText: { fontSize: 14, color: '#94a3b8' },
  msgRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: DoctorColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  msgAvatarText: { fontSize: 10, fontWeight: '700', color: DoctorColors.primary },
  bubble: {
    maxWidth: '75%', padding: 11, borderRadius: 16,
    backgroundColor: '#f1f5f9', borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: DoctorColors.primary, borderBottomLeftRadius: 16, borderBottomRightRadius: 4,
  },
  bubbleTheirs: {},
  bubbleText: { fontSize: 14, color: '#1e293b', lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#94a3b8', marginTop: 3, textAlign: 'right' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  msgInput: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    color: DoctorColors.text, borderWidth: 1, borderColor: '#e2e8f0',
    maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: DoctorColors.primary,
    justifyContent: 'center', alignItems: 'center',
  },
});
