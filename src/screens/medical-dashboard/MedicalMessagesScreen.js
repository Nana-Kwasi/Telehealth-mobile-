import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, ScrollView,
  Image, Modal, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId } from '../../services/apiClient';
import { MedicalColors } from '../../constants/colors';
import {
  setPresenceOnline, setPresenceOffline, markMessagesAsSeen,
  formatMsgTime, formatLastSeen, formatAudioDuration, formatFileSize,
  groupWithDateSeparators, uploadMedia, EMOJI_LIST,
} from '../../utils/chatUtils';
import { fetchClientAppointments } from '../../services/doctorDataService';

let Audio = null;
try { Audio = require('expo-av').Audio; } catch (_) {}

const C = MedicalColors;

// ── Tick icon ─────────────────────────────────────────────────────────────────
function TickIcon({ status, isMine }) {
  if (!isMine) return null;
  if (status === 'read' || status === 'seen') {
    return <Ionicons name="checkmark-done" size={14} color="#34B7F1" style={{ marginLeft: 3 }} />;
  }
  if (status === 'delivered') {
    return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 3 }} />;
  }
  return <Ionicons name="checkmark" size={13} color="rgba(255,255,255,0.6)" style={{ marginLeft: 3 }} />;
}

// ── Date separator ────────────────────────────────────────────────────────────
function DateSeparator({ label }) {
  return (
    <View style={sep.row}>
      <View style={sep.line} />
      <Text style={sep.label}>{label}</Text>
      <View style={sep.line} />
    </View>
  );
}
const sep = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 10, paddingHorizontal: 16 },
  line: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  label: {
    fontSize: 11, color: '#94a3b8', fontWeight: '600',
    backgroundColor: '#f0f6fc', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 10, marginHorizontal: 8,
  },
});

// ── Emoji picker ──────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }) {
  return (
    <View style={emojiS.container}>
      <View style={emojiS.header}>
        <Text style={emojiS.title}>Emojis</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={20} color="#64748b" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={emojiS.grid}>
        {EMOJI_LIST.map((e, i) => (
          <TouchableOpacity key={i} style={emojiS.cell} onPress={() => onSelect(e)}>
            <Text style={emojiS.emoji}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
const emojiS = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: 280, paddingBottom: 8,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, paddingBottom: 8 },
  title: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
});

// ── Audio bubble ──────────────────────────────────────────────────────────────
function AudioBubble({ item, isMine }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const soundRef = useRef(null);

  const togglePlay = async () => {
    if (!Audio) { Alert.alert('Not available', 'Install expo-av:\nnpx expo install expo-av'); return; }
    try {
      if (playing) {
        await soundRef.current?.pauseAsync();
        setPlaying(false);
      } else {
        if (!soundRef.current) {
          const { sound } = await Audio.Sound.createAsync({ uri: item.mediaUrl }, {}, (st) => {
            if (st.isLoaded) setCurrentTime(Math.floor((st.positionMillis || 0) / 1000));
            if (st.didJustFinish) { setPlaying(false); setCurrentTime(0); soundRef.current = null; }
          });
          soundRef.current = sound;
        }
        await soundRef.current.playAsync();
        setPlaying(true);
      }
    } catch (e) { console.error('Audio error:', e); }
  };

  const dur = item.duration || 0;
  const progress = dur > 0 ? Math.min(currentTime / dur, 1) : 0;

  return (
    <TouchableOpacity style={abS.row} onPress={togglePlay} activeOpacity={0.85}>
      <View style={[abS.playBtn, isMine ? abS.playBtnMine : abS.playBtnTheirs]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={isMine ? '#fff' : C.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={abS.waveform}>
          {Array.from({ length: 28 }).map((_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.8)) * 14;
            const filled = i / 28 <= progress;
            return (
              <View key={i} style={[abS.bar, { height: h },
                filled
                  ? (isMine ? abS.barFilledMine : abS.barFilledTheirs)
                  : (isMine ? abS.barEmptyMine : abS.barEmptyTheirs),
              ]} />
            );
          })}
        </View>
        <Text style={[abS.dur, isMine && { color: 'rgba(255,255,255,0.75)' }]}>
          {playing ? formatAudioDuration(currentTime) : formatAudioDuration(dur)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
const abS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  playBtnMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  playBtnTheirs: { backgroundColor: C.primaryLight },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  bar: { width: 3, borderRadius: 2 },
  barFilledMine: { backgroundColor: '#fff' },
  barEmptyMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  barFilledTheirs: { backgroundColor: C.primary },
  barEmptyTheirs: { backgroundColor: '#cbd5e1' },
  dur: { fontSize: 10, color: '#94a3b8' },
});

// ── File bubble ───────────────────────────────────────────────────────────────
function FileBubble({ item, isMine }) {
  const ext = (item.fileName || '').split('.').pop().toUpperCase();
  const extColor = { PDF: '#ef4444', DOC: '#3b82f6', DOCX: '#3b82f6', XLS: '#22c55e', XLSX: '#22c55e' };
  const color = extColor[ext] || '#64748b';
  return (
    <TouchableOpacity
      style={[fbS.row]}
      onPress={() => Linking.openURL(item.mediaUrl)}
      activeOpacity={0.85}
    >
      <View style={[fbS.icon, { backgroundColor: color + '22' }]}>
        <Text style={[fbS.ext, { color }]}>{ext || 'FILE'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[fbS.name, isMine && { color: '#fff' }]} numberOfLines={1}>{item.fileName || 'File'}</Text>
        <Text style={[fbS.size, isMine && { color: 'rgba(255,255,255,0.65)' }]}>
          {formatFileSize(item.fileSize)} · Tap to open
        </Text>
      </View>
      <Ionicons name="download-outline" size={18} color={isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8'} />
    </TouchableOpacity>
  );
}
const fbS = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  icon: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  ext: { fontSize: 10, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  size: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
const MedicalMessagesScreen = () => {
  const [messages, setMessages] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [activeDoctorId, setActiveDoctorId] = useState(null);
  const [activeDoctorName, setActiveDoctorName] = useState('');
  const [doctorPhotoURL, setDoctorPhotoURL] = useState(null);
  const [userName, setUserName] = useState('Patient');

  // Presence
  const [doctorPresence, setDoctorPresence] = useState({ online: false, lastSeen: null });

  // Media
  const [uploading, setUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);

  // Emoji / audio
  const [showEmoji, setShowEmoji] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordTimerRef = useRef(null);

  const listRef = useRef(null);
  const unsubMsgRef = useRef(null);
  const unsubPresRef = useRef(null);
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    getStoredUserId().then(uid => {
      setCurrentUserId(uid);
      loadActiveDoctor(uid);
      if (uid) setPresenceOnline(uid);
    });
    return () => {
      getStoredUserId().then(uid => { if (uid) setPresenceOffline(uid); });
      if (unsubMsgRef.current) clearInterval(unsubMsgRef.current);
      if (unsubPresRef.current) clearInterval(unsubPresRef.current);
      clearInterval(recordTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setGrouped(groupWithDateSeparators(messages));
    if (activeDoctorId && currentUserId && messages.length > 0) {
      const chatId = [currentUserId, activeDoctorId].sort().join('_');
      markMessagesAsSeen(chatId, messages, currentUserId);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  const loadActiveDoctor = async (uid) => {
    const myUid = uid || currentUserId;
    try {
      if (!myUid) { setIsLoading(false); return; }
      const name = await AsyncStorage.getItem('userName');
      setUserName(name || 'Patient');

      const appointments = await fetchClientAppointments(myUid);
      if (appointments.length > 0) {
        const sorted = [...appointments]
          .filter(a => a.doctorId && a.status !== 'cancelled')
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const recent = sorted[0] || appointments[appointments.length - 1];
        const docId = recent.doctorId;
        const docName = recent.doctorName || 'Doctor';
        setActiveDoctorId(docId);
        setActiveDoctorName(docName);
        const drData = await api(`/api/v1/doctors/${docId}`).catch(() => null);
        if (drData) setDoctorPhotoURL(drData.photoURL || null);
        subscribeMessages(docId, myUid);
        subscribePresence(docId);
      }
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading active doctor:', error);
      setIsLoading(false);
    }
  };

  const subscribeMessages = (docId, uid) => {
    if (unsubMsgRef.current) clearInterval(unsubMsgRef.current);
    const myUid = uid || currentUserId;
    if (!myUid) return;
    const chatId = [myUid, docId].sort().join('_');
    const fetchMsgs = () => {
      api(`/api/v1/doctor-chats/${chatId}/messages`).then(msgs => setMessages(msgs || [])).catch(() => {});
    };
    fetchMsgs();
    unsubMsgRef.current = setInterval(fetchMsgs, 3000);
  };

  const subscribePresence = (docId) => {
    if (unsubPresRef.current) clearInterval(unsubPresRef.current);
    const fetchPres = () => {
      api(`/api/v1/realtime/presence/${docId}`).then(data => setDoctorPresence(data || { online: false, lastSeen: null })).catch(() => {});
    };
    fetchPres();
    unsubPresRef.current = setInterval(fetchPres, 10000);
  };

  const getInitialStatus = async (recipientId) => {
    try {
      const data = await api(`/api/v1/realtime/presence/${recipientId}`);
      return data?.online ? 'delivered' : 'sent';
    } catch (_) { return 'sent'; }
  };

  const sendMessage = async (overrides = {}) => {
    if (!activeDoctorId || !currentUserId) return;
    const text = (overrides.text ?? newMessage).trim();
    if (!overrides.type && !text) return;
    setSending(true);
    if (!overrides.type) setNewMessage('');
    try {
      const chatId = [currentUserId, activeDoctorId].sort().join('_');
      const status = await getInitialStatus(activeDoctorId);
      await api(`/api/v1/doctor-chats/${chatId}/messages`, {
        method: 'POST',
        body: { text: text || '', from: currentUserId, fromName: userName, to: activeDoctorId, toName: `Dr. ${activeDoctorName}`, type: 'text', status, ...overrides },
      });
    } catch (error) { console.error('Send error:', error); }
    finally { setSending(false); }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow access to your photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop();
      const url = await uploadMedia(asset.uri, `chat-media/${currentUserId}/${Date.now()}.${ext}`);
      await sendMessage({ type: 'image', mediaUrl: url, text: '' });
    } catch { Alert.alert('Error', 'Could not send image.'); }
    finally { setUploading(false); }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: false });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      const url = await uploadMedia(asset.uri, `chat-files/${currentUserId}/${Date.now()}_${asset.name}`);
      await sendMessage({
        type: 'file', mediaUrl: url, fileName: asset.name,
        fileSize: asset.size || 0, mimeType: asset.mimeType || '', text: '',
      });
    } catch { Alert.alert('Error', 'Could not send file.'); }
    finally { setUploading(false); }
  };

  const startRecording = async () => {
    if (!Audio) { Alert.alert('Not available', 'Install expo-av:\nnpx expo install expo-av'); return; }
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
      setRecordingDuration(0);
      recordTimerRef.current = setInterval(() => setRecordingDuration(p => p + 1), 1000);
    } catch (e) { Alert.alert('Error', 'Could not start recording: ' + e.message); }
  };

  const stopAndSendRecording = async () => {
    if (!recordingRef.current) return;
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    const duration = recordingDuration;
    setRecordingDuration(0);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setUploading(true);
      const url = await uploadMedia(uri, `chat-audio/${currentUserId}/${Date.now()}.m4a`);
      await sendMessage({ type: 'audio', mediaUrl: url, duration, text: '' });
    } catch { Alert.alert('Error', 'Could not send voice message.'); }
    finally { setUploading(false); }
  };

  const cancelRecording = async () => {
    clearInterval(recordTimerRef.current);
    setIsRecording(false);
    setRecordingDuration(0);
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
    } catch (_) {}
  };

  const renderItem = useCallback(({ item }) => {
    if (item.isSeparator) return <DateSeparator label={item.label} />;
    const isMine = item.from === currentUserId;
    return (
      <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
        {!isMine && (
          <View style={styles.msgAvatarWrap}>
            {doctorPhotoURL ? (
              <Image source={{ uri: doctorPhotoURL }} style={styles.msgAvatarImg} />
            ) : (
              <View style={styles.msgAvatar}>
                <Text style={styles.msgAvatarText}>{(activeDoctorName || 'D')[0].toUpperCase()}</Text>
              </View>
            )}
          </View>
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
          {!isMine && <Text style={styles.senderName}>Dr. {activeDoctorName}</Text>}
          {item.type === 'image' ? (
            <TouchableOpacity onPress={() => setViewingImage(item.mediaUrl)}>
              <Image source={{ uri: item.mediaUrl }} style={styles.bubbleImage} resizeMode="cover" />
            </TouchableOpacity>
          ) : item.type === 'audio' ? (
            <AudioBubble item={item} isMine={isMine} />
          ) : item.type === 'file' ? (
            <FileBubble item={item} isMine={isMine} />
          ) : (
            <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.text}</Text>
          )}
          <View style={styles.bubbleFooter}>
            <Text style={[styles.bubbleTime, isMine && { color: 'rgba(255,255,255,0.6)' }]}>
              {formatMsgTime(item.timestamp)}
            </Text>
            <TickIcon status={item.status} isMine={isMine} />
          </View>
        </View>
      </View>
    );
  }, [currentUserId, activeDoctorName, doctorPhotoURL]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  if (!activeDoctorId) {
    return (
      <View style={styles.center}>
        <Ionicons name="chatbubbles-outline" size={56} color={C.textLight} />
        <Text style={styles.emptyTitle}>No active conversations</Text>
        <Text style={styles.emptySub}>Book an appointment with a doctor to start messaging.</Text>
      </View>
    );
  }

  const statusText = doctorPresence.online ? 'Online' : formatLastSeen(doctorPresence.lastSeen);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      {/* Doctor Header */}
      <View style={styles.chatHeader}>
        <View style={styles.avatarWrap}>
          {doctorPhotoURL ? (
            <Image source={{ uri: doctorPhotoURL }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarText}>{(activeDoctorName || 'D')[0].toUpperCase()}</Text>
            </View>
          )}
          {doctorPresence.online && <View style={styles.onlineDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName}>Dr. {activeDoctorName}</Text>
          <Text style={[styles.headerStatus, doctorPresence.online && { color: '#22c55e' }]}>
            {statusText}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={listRef}
        style={styles.messageList}
        contentContainerStyle={{ paddingVertical: 8 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {grouped.length === 0 && (
          <View style={styles.emptyMessages}>
            <Ionicons name="chatbubbles-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyMessagesText}>Start a conversation with Dr. {activeDoctorName}</Text>
          </View>
        )}
        {grouped.map(item => (
          <React.Fragment key={item.id}>
            {renderItem({ item })}
          </React.Fragment>
        ))}
      </ScrollView>

      {/* Uploading bar */}
      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={C.primary} />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}

      {/* Emoji picker */}
      {showEmoji && (
        <EmojiPicker
          onSelect={e => { setNewMessage(p => p + e); setShowEmoji(false); }}
          onClose={() => setShowEmoji(false)}
        />
      )}

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingBar}>
          <TouchableOpacity onPress={cancelRecording} style={styles.cancelRecBtn}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          <View style={styles.recordingPulse}>
            <Ionicons name="mic" size={14} color="#ef4444" />
            <Text style={styles.recordingText}>Recording {formatAudioDuration(recordingDuration)}</Text>
          </View>
          <TouchableOpacity style={styles.sendRecBtn} onPress={stopAndSendRecording}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      {!isRecording && (
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachBtn} onPress={() => setShowEmoji(p => !p)}>
            <Text style={{ fontSize: 20 }}>😊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={22} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickFile}>
            <Ionicons name="attach-outline" size={22} color="#64748b" />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={C.textLight}
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={2000}
          />
          {newMessage.trim() ? (
            <TouchableOpacity
              style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
              onPress={() => sendMessage()}
              disabled={!newMessage.trim() || sending}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sendButton} onPress={startRecording}>
              <Ionicons name="mic-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Full-screen image viewer */}
      <Modal visible={!!viewingImage} transparent animationType="fade" onRequestClose={() => setViewingImage(null)}>
        <View style={styles.imageViewerBg}>
          <TouchableOpacity style={styles.imageViewerClose} onPress={() => setViewingImage(null)}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {viewingImage && (
            <Image source={{ uri: viewingImage }} style={styles.imageViewerImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef2f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: C.background },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.text, marginTop: 14 },
  emptySub: { fontSize: 13, color: C.textSecondary, textAlign: 'center', marginTop: 6 },
  // Header
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    backgroundColor: C.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  avatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
  },
  headerAvatarPlaceholder: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarText: { fontSize: 16, fontWeight: '700', color: C.primary },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#22c55e', borderWidth: 2, borderColor: C.primary,
  },
  headerName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  headerStatus: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  // Messages
  messageList: { flex: 1 },
  emptyMessages: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyMessagesText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingHorizontal: 32 },
  msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end', paddingHorizontal: 12 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgAvatarWrap: { marginRight: 6, marginBottom: 2 },
  msgAvatarImg: { width: 28, height: 28, borderRadius: 14 },
  msgAvatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center',
  },
  msgAvatarText: { fontSize: 11, fontWeight: '700', color: C.primary },
  bubble: {
    maxWidth: '78%', padding: 10, borderRadius: 18,
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  bubbleMine: { backgroundColor: C.primary, borderBottomLeftRadius: 18, borderBottomRightRadius: 4 },
  bubbleTheirs: {},
  senderName: { fontSize: 11, fontWeight: '700', color: C.primary, marginBottom: 3 },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleImage: { width: 200, height: 160, borderRadius: 12 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 2 },
  bubbleTime: { fontSize: 10, color: '#94a3b8' },
  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 8, paddingHorizontal: 8, gap: 4,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.border,
  },
  attachBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  input: {
    flex: 1, backgroundColor: C.background, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 14,
    color: C.text, maxHeight: 100, borderWidth: 1, borderColor: C.border,
  },
  sendButton: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  // Uploading / recording
  uploadingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: '#f0fdf4', paddingVertical: 6,
  },
  uploadingText: { fontSize: 13, color: '#15803d', fontWeight: '600' },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.border,
  },
  cancelRecBtn: { padding: 6 },
  recordingPulse: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff1f2', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  recordingText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  sendRecBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#22c55e', justifyContent: 'center', alignItems: 'center',
  },
  // Image viewer
  imageViewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  imageViewerImg: { width: '100%', height: '80%' },
});

export default MedicalMessagesScreen;
