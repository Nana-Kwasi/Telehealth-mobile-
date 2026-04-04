import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, addDoc, serverTimestamp, onSnapshot, orderBy, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { db, auth, storage } from '../../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCachedClientData, getCachedTherapistData } from '../../services/clientDataService';
import { Colors } from '../../constants/colors';

const ClientMessagesScreen = ({ navigation }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [assignedTherapist, setAssignedTherapist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const messagesEndRef = useRef(null);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    loadTherapistAndMessages();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadTherapistAndMessages = async () => {
    try {
      setLoading(true);
      const clientId = await AsyncStorage.getItem('th.clientId');
      const currentUser = auth.currentUser;

      if (!clientId || !currentUser) {
        setLoading(false);
        return;
      }

      // Get therapist from cache or fetch
      let therapist = getCachedTherapistData();
      const clientData = getCachedClientData();
      
      if (!therapist && clientData?.assignedTherapist) {
        const therapistId = clientData.assignedTherapist || clientData.assignedTherapistId;
        try {
          // Try therapistt collection first
          const therapistDoc = await getDoc(doc(db, 'therapistt', therapistId));
          if (therapistDoc.exists()) {
            therapist = { id: therapistDoc.id, ...therapistDoc.data() };
          } else {
            // Try therapists collection
            const therapistDoc2 = await getDoc(doc(db, 'therapists', therapistId));
            if (therapistDoc2.exists()) {
              therapist = { id: therapistDoc2.id, ...therapistDoc2.data() };
            }
          }
        } catch (error) {
          console.error('Error fetching therapist:', error);
        }
      }

      if (therapist) {
        setAssignedTherapist(therapist);
        setupMessageListener(clientId);
      } else {
        Alert.alert('No Therapist', 'You have not been assigned a therapist yet. Please contact support.');
      }
    } catch (error) {
      console.error('Error loading messages:', error);
      Alert.alert('Error', 'Failed to load messages. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const setupMessageListener = (clientId) => {
    // Use the same path structure as web app: client_chats/{clientId}/messages
    const chatPath = `client_chats/${clientId}/messages`;
    const messagesCol = collection(db, chatPath);
    const q = query(messagesCol, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        status: 'sent'
      }));

      setMessages(messagesData);
    }, (error) => {
      console.error('Error in message listener:', error);
    });

    return unsubscribe;
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async (content, type = 'text') => {
    if (!assignedTherapist || (!content && type === 'text')) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const clientId = await AsyncStorage.getItem('th.clientId');
    if (!clientId) return;

    // Create temporary message for optimistic update
    const tempId = `temp_${Date.now()}`;
    const tempMessage = {
      id: tempId,
      content,
      type,
      from: currentUser.uid,
      fromName: currentUser.displayName || 'Client',
      to: assignedTherapist.id,
      toName: assignedTherapist.name,
      createdAt: new Date(),
      read: false,
      status: 'sending'
    };

    setMessages(prev => [...prev, tempMessage]);
    setNewMessage('');

    try {
      const messageData = {
        content,
        type,
        from: currentUser.uid,
        fromName: currentUser.displayName || 'Client',
        to: assignedTherapist.id,
        toName: assignedTherapist.name,
        createdAt: serverTimestamp(),
        read: false
      };

      const chatPath = `client_chats/${clientId}/messages`;
      const messagesCol = collection(db, chatPath);
      const docRef = await addDoc(messagesCol, messageData);

      // Update temporary message with real ID
      setMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? { ...msg, id: docRef.id, status: 'sent', createdAt: docRef.data()?.createdAt || new Date() }
          : msg
      ));
    } catch (error) {
      console.error('Error sending message:', error);
      // Mark as failed
      setMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? { ...msg, status: 'failed', error: error.message }
          : msg
      ));
      Alert.alert('Error', `Failed to send message: ${error.message}`);
    }
  };

  const handleSendText = () => {
    if (newMessage.trim()) {
      sendMessage(newMessage.trim(), 'text');
    }
  };

  const handleImagePicker = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant permission to access your photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadFile(result.assets[0].uri, 'image', result.assets[0].mimeType || 'image/jpeg');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image.');
    }
  };

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadFile(result.assets[0].uri, 'document', result.assets[0].mimeType || 'application/octet-stream');
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document.');
    }
  };

  const uploadFile = async (fileUri, fileType, mimeType) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);

      const clientId = await AsyncStorage.getItem('th.clientId');
      const timestamp = Date.now();
      const fileName = `${timestamp}_${fileType}`;
      const storageRef = ref(storage, `chat-files/${clientId}/${fileName}`);

      // Convert URI to blob for React Native
      const response = await fetch(fileUri);
      const blob = await response.blob();

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Determine message type
      let messageType = 'document';
      if (mimeType.startsWith('image/')) {
        messageType = 'image';
      } else if (mimeType.startsWith('video/')) {
        messageType = 'video';
      }

      await sendMessage({
        name: fileName,
        url: downloadURL,
        type: mimeType,
        storagePath: storageRef.fullPath
      }, messageType);

    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Error', `Failed to upload file: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message) => {
    const currentUser = auth.currentUser;
    const isOwnMessage = message.from === currentUser?.uid;

    return (
      <View
        key={message.id}
        style={[styles.messageContainer, isOwnMessage ? styles.sentMessage : styles.receivedMessage]}
      >
        {!isOwnMessage && (
          <View style={styles.avatarContainer}>
            <Ionicons name="person-circle" size={32} color={Colors.primary} />
          </View>
        )}

        <View style={[styles.messageBubble, isOwnMessage ? styles.sentBubble : styles.receivedBubble]}>
          {message.type === 'text' && (
            <Text style={[styles.messageText, isOwnMessage && styles.sentMessageText]}>
              {message.content}
            </Text>
          )}

          {message.type === 'image' && message.content?.url && (
            <Image
              source={{ uri: message.content.url }}
              style={styles.messageImage}
              resizeMode="cover"
            />
          )}

          {message.type === 'document' && message.content && (
            <View style={styles.documentContainer}>
              <Ionicons name="document" size={24} color={Colors.primary} />
              <Text style={styles.documentName} numberOfLines={1}>
                {message.content.name || 'Document'}
              </Text>
            </View>
          )}

          {message.status === 'sending' && (
            <ActivityIndicator size="small" color={Colors.textSecondary} style={styles.statusIndicator} />
          )}
          {message.status === 'failed' && (
            <Ionicons name="alert-circle" size={16} color={Colors.error} style={styles.statusIndicator} />
          )}

          <Text style={[styles.messageTime, isOwnMessage && styles.sentMessageTime]}>
            {formatTime(message.createdAt)}
          </Text>
        </View>
      </View>
    );
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{assignedTherapist.name}</Text>
          <Text style={styles.headerStatus}>Online</Text>
        </View>
        <TouchableOpacity>
          <Ionicons name="call-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No messages yet</Text>
            <Text style={styles.emptySubtext}>Start a conversation with your therapist</Text>
          </View>
        ) : (
          messages.map(renderMessage)
        )}
      </ScrollView>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={handleImagePicker} style={styles.attachButton}>
          <Ionicons name="image-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDocumentPicker} style={styles.attachButton}>
          <Ionicons name="document-attach-outline" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.textSecondary}
          value={newMessage}
          onChangeText={setNewMessage}
          multiline
          maxLength={1000}
        />
        <TouchableOpacity
          onPress={handleSendText}
          disabled={!newMessage.trim() || isUploading}
          style={[styles.sendButton, (!newMessage.trim() || isUploading) && styles.sendButtonDisabled]}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color={Colors.surface} />
          ) : (
            <Ionicons name="send" size={20} color={Colors.surface} />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  headerStatus: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  sentMessage: {
    flexDirection: 'row-reverse',
  },
  receivedMessage: {
    flexDirection: 'row',
  },
  avatarContainer: {
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
  },
  sentBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: Colors.text,
  },
  sentMessageText: {
    color: Colors.surface,
  },
  messageImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    marginBottom: 8,
  },
  documentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
  },
  documentName: {
    marginLeft: 8,
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  messageTime: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sentMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statusIndicator: {
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  attachButton: {
    padding: 8,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

export default ClientMessagesScreen;
