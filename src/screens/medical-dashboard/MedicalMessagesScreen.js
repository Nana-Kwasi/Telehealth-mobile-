import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../services/firebaseConfig';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { MedicalColors } from '../../constants/colors';

const MedicalMessagesScreen = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [activeDoctorId, setActiveDoctorId] = useState(null);
  const [activeDoctorName, setActiveDoctorName] = useState('');
  const flatListRef = useRef(null);

  useEffect(() => {
    loadActiveDoctor();
  }, []);

  useEffect(() => {
    if (!activeDoctorId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const chatId = [currentUser.uid, activeDoctorId].sort().join('_');
    const q = query(
      collection(db, 'doctor_chats', chatId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [activeDoctorId]);

  const loadActiveDoctor = async () => {
    try {
      // Try to get the most recent appointment's doctor
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setIsLoading(false);
        return;
      }
      const clientId = currentUser.uid;
      const { fetchClientAppointments } = require('../../services/doctorDataService');
      const appointments = await fetchClientAppointments(clientId);

      if (appointments.length > 0) {
        const recent = appointments[appointments.length - 1];
        setActiveDoctorId(recent.doctorId);
        setActiveDoctorName(recent.doctorName || 'Doctor');
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading active doctor:', error);
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeDoctorId) return;
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const chatId = [currentUser.uid, activeDoctorId].sort().join('_');
    const clientName = (await AsyncStorage.getItem('userName')) || 'Patient';

    try {
      await addDoc(collection(db, 'doctor_chats', chatId, 'messages'), {
        text: newMessage.trim(),
        from: currentUser.uid,
        fromName: clientName,
        to: activeDoctorId,
        toName: activeDoctorName,
        timestamp: serverTimestamp(),
        type: 'text',
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const renderMessage = ({ item }) => {
    const isOwn = item.from === auth.currentUser?.uid;
    return (
      <View style={[styles.messageBubble, isOwn ? styles.ownBubble : styles.otherBubble]}>
        {!isOwn && <Text style={styles.senderName}>{item.fromName || 'Doctor'}</Text>}
        <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>{item.text}</Text>
        <Text style={[styles.messageTime, isOwn && styles.ownTimeText]}>
          {item.timestamp?.toDate
            ? item.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : ''}
        </Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  if (!activeDoctorId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="chatbubbles-outline" size={56} color={MedicalColors.textLight} />
        <Text style={styles.emptyTitle}>No active conversations</Text>
        <Text style={styles.emptySubtitle}>
          Book an appointment with a doctor to start messaging.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Doctor Header */}
      <View style={styles.chatHeader}>
        <View style={styles.headerAvatar}>
          <Text style={styles.headerAvatarText}>{(activeDoctorName || 'D')[0].toUpperCase()}</Text>
        </View>
        <View>
          <Text style={styles.headerName}>Dr. {activeDoctorName}</Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={styles.emptyMessages}>
            <Text style={styles.emptyMessagesText}>
              Start a conversation with Dr. {activeDoctorName}
            </Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor={MedicalColors.textLight}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!newMessage.trim()}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MedicalColors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: MedicalColors.background,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: MedicalColors.text,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 13,
    color: MedicalColors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: MedicalColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: MedicalColors.border,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: MedicalColors.primary,
  },
  headerName: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
  },
  headerStatus: {
    fontSize: 12,
    color: MedicalColors.success,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  ownBubble: {
    alignSelf: 'flex-end',
    backgroundColor: MedicalColors.primary,
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: MedicalColors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '600',
    color: MedicalColors.primary,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    color: MedicalColors.text,
    lineHeight: 20,
  },
  ownMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 10,
    color: MedicalColors.textLight,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  ownTimeText: {
    color: 'rgba(255,255,255,0.7)',
  },
  emptyMessages: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyMessagesText: {
    fontSize: 14,
    color: MedicalColors.textLight,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    backgroundColor: MedicalColors.surface,
    borderTopWidth: 1,
    borderTopColor: MedicalColors.border,
  },
  input: {
    flex: 1,
    backgroundColor: MedicalColors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: MedicalColors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: MedicalColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

export default MedicalMessagesScreen;
