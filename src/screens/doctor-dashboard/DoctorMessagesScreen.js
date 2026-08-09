import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, RefreshControl, Image, Modal, Linking, Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { api, getStoredUserId, uploadFile } from '../../services/apiClient';
import { DoctorColors } from '../../constants/colors';
import { enrichPatientNames } from '../../utils/doctorUtils';
import {
  setPresenceOnline, setPresenceOffline, markMessagesAsSeen,
  formatMsgTime, formatDateLabel, formatLastSeen, formatAudioDuration,
  formatFileSize, groupWithDateSeparators, uploadMedia, EMOJI_LIST,
} from '../../utils/chatUtils';

// Try to load expo-av for voice recording
let Audio = null;
try { Audio = require('expo-av').Audio; } catch (_) {}

function getInitials(name) {
  if (!name) return 'P';
  const p = name.trim().split(' ');
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// ── Tick icon for message status ──────────────────────────────────────────────
function TickIcon({ status, isMine }) {
  if (!isMine) return null;
  if (status === 'read' || status === 'seen') {
    return (
      <View style={{ flexDirection: 'row', marginLeft: 3 }}>
        <Ionicons name="checkmark-done" size={14} color="#34B7F1" />
      </View>
    );
  }
  if (status === 'delivered') {
    return <Ionicons name="checkmark-done" size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 3 }} />;
  }
  // sent
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

// ── Emoji Picker ──────────────────────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }) {
  return (
    <View style={emojiStyles.container}>
      <View style={emojiStyles.header}>
        <Text style={emojiStyles.title}>Emojis</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={20} color="#64748b" /></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={emojiStyles.grid}>
        {EMOJI_LIST.map((e, i) => (
          <TouchableOpacity key={i} style={emojiStyles.cell} onPress={() => onSelect(e)}>
            <Text style={emojiStyles.emoji}>{e}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
const emojiStyles = StyleSheet.create({
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

export default function DoctorMessagesScreen({ route }) {
  const [patients, setPatients] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [messages, setMessages] = useState([]);
  const [grouped, setGrouped] = useState([]);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [search, setSearch] = useState('');
  const [doctorProfile, setDoctorProfile] = useState(null);

  // Presence
  const [otherPresence, setOtherPresence] = useState({ online: false, lastSeen: null });

  // Media
  const [uploading, setUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);

  // Emoji
  const [showEmoji, setShowEmoji] = useState(false);

  // Audio recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordTimerRef = useRef(null);

  const listRef = useRef(null);
  const unsubRef = useRef(null);
  const presenceUnsubRef = useRef(null);

  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    getStoredUserId().then(uid => {
      setCurrentUserId(uid);
      loadPatients(uid);
      if (uid) setPresenceOnline(uid);
    });
    return () => {
      getStoredUserId().then(uid => { if (uid) setPresenceOffline(uid); });
      if (unsubRef.current) clearInterval(unsubRef.current);
      if (presenceUnsubRef.current) clearInterval(presenceUnsubRef.current);
    };
  }, []);

  // Auto-open chat if navigated with patientId
  useEffect(() => {
    const { patientId, patientName } = route?.params || {};
    if (patientId && patients.length > 0) {
      const found = patients.find(p => p.id === patientId);
      setActivePatient(found || { id: patientId, name: patientName || 'Patient' });
    }
  }, [patients, route?.params?.patientId]);

  useEffect(() => {
    if (!activePatient) { setMessages([]); setGrouped([]); return; }
    subscribeMessages(activePatient.id);
    subscribePresence(activePatient.id);
  }, [activePatient]);

  useEffect(() => {
    setGrouped(groupWithDateSeparators(messages));
    if (activePatient && currentUserId && messages.length > 0) {
      const chatId = [currentUserId, activePatient.id].sort().join('_');
      markMessagesAsSeen(chatId, messages, currentUserId);
    }
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  const loadPatients = async (uid) => {
    const doctorId = uid || currentUserId;
    try {
      if (!doctorId) return;
      const profile = await api(`/api/v1/doctors/${doctorId}`).catch(() => null);
      setDoctorProfile(profile ? { id: doctorId, ...profile } : { id: doctorId, name: 'Doctor' });

      const appts = await api(`/api/v1/medical/appointments/doctor/${doctorId}`).catch(() => []) || [];
      const patMap = new Map();
      appts.forEach(a => {
        if (!a.clientId) return;
        const existing = patMap.get(a.clientId);
        if (!existing || (a.date || '') > (existing.lastVisit || '')) {
          patMap.set(a.clientId, { id: a.clientId, name: a.clientName || '', lastVisit: a.date || '' });
        }
      });
      const enriched = await enrichPatientNames(patMap);
      setPatients(Array.from(enriched.values()));
    } catch (err) { console.error('DoctorMessages load error:', err); }
    finally { setLoadingPatients(false); }
  };

  const subscribeMessages = (patientId) => {
    if (unsubRef.current) clearInterval(unsubRef.current);
    if (!currentUserId) return;
    const chatId = [currentUserId, patientId].sort().join('_');
    const fetchMessages = () => {
      api(`/api/v1/doctor-chats/${chatId}/messages`).then(msgs => {
        setMessages(msgs || []);
      }).catch(() => {});
    };
    fetchMessages();
    unsubRef.current = setInterval(fetchMessages, 3000);
  };

  const subscribePresence = (userId) => {
    if (presenceUnsubRef.current) clearInterval(presenceUnsubRef.current);
    const fetchPresence = () => {
      api(`/api/v1/realtime/presence/${userId}`).then(data => {
        setOtherPresence(data || { online: false, lastSeen: null });
      }).catch(() => setOtherPresence({ online: false, lastSeen: null }));
    };
    fetchPresence();
    presenceUnsubRef.current = setInterval(fetchPresence, 10000);
  };

  const getInitialStatus = async (recipientId) => {
    try {
      const data = await api(`/api/v1/realtime/presence/${recipientId}`);
      return data?.online ? 'delivered' : 'sent';
    } catch (_) { return 'sent'; }
  };

  const sendMessage = async (overrides = {}) => {
    if (!activePatient || !currentUserId) return;
    const text = (overrides.text ?? msgText).trim();
    if (!overrides.type && !text) return;
    setSending(true);
    if (!overrides.type) setMsgText('');
    try {
      const chatId = [currentUserId, activePatient.id].sort().join('_');
      const status = await getInitialStatus(activePatient.id);
      await api(`/api/v1/doctor-chats/${chatId}/messages`, {
        method: 'POST',
        body: {
          text: text || '',
          from: currentUserId,
          fromName: `Dr. ${doctorProfile?.name || 'Doctor'}`,
          to: activePatient.id,
          toName: activePatient.name,
          type: 'text',
          status,
          ...overrides,
        },
      });
    } catch (err) { console.error('Send error:', err); }
    finally { setSending(false); }
  };

  // ── Image picker ────────────────────────────────────────────────────────────
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Allow access to photos.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
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

  // ── File picker ─────────────────────────────────────────────────────────────
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

  // ── Voice recording ─────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (!Audio) { Alert.alert('Not available', 'Install expo-av to enable voice messages:\nnpx expo install expo-av'); return; }
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

  // ── Render message ──────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }) => {
    if (item.isSeparator) return <DateSeparator label={item.label} />;

    const isMine = item.from === currentUserId;
    return (
      <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
        {!isMine && (
          <View style={styles.msgAvatar}>
            <Text style={styles.msgAvatarText}>{getInitials(activePatient?.name)}</Text>
          </View>
        )}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
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
  }, [currentUserId, activePatient]);

  const filteredPatients = patients.filter(p =>
    !search.trim() || (p.name || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── Chat view ───────────────────────────────────────────────────────────────
  if (activePatient) {
    const statusText = otherPresence.online
      ? 'Online'
      : formatLastSeen(otherPresence.lastSeen);

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
          <View style={styles.chatAvatarWrap}>
            <View style={styles.chatAvatar}>
              <Text style={styles.chatAvatarText}>{getInitials(activePatient.name)}</Text>
            </View>
            {otherPresence.online && <View style={styles.onlineDot} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.chatName}>{activePatient.name}</Text>
            <Text style={[styles.chatSub, otherPresence.online && { color: '#86efac' }]}>
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
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={40} color="#cbd5e1" />
              <Text style={styles.emptyChatText}>Say hello to {activePatient.name}!</Text>
            </View>
          )}
          {grouped.map(item => (
            <React.Fragment key={item.id}>
              {renderItem({ item })}
            </React.Fragment>
          ))}
        </ScrollView>

        {/* Uploading indicator */}
        {uploading && (
          <View style={styles.uploadingBar}>
            <ActivityIndicator size="small" color={DoctorColors.primary} />
            <Text style={styles.uploadingText}>Uploading...</Text>
          </View>
        )}

        {/* Emoji picker */}
        {showEmoji && (
          <EmojiPicker
            onSelect={e => { setMsgText(p => p + e); setShowEmoji(false); }}
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

        {/* Input row */}
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
              style={styles.msgInput}
              placeholder="Type a message..."
              placeholderTextColor="#94a3b8"
              value={msgText}
              onChangeText={setMsgText}
              multiline
              maxLength={2000}
            />
            {msgText.trim() ? (
              <TouchableOpacity
                style={[styles.sendBtn, sending && { opacity: 0.5 }]}
                onPress={() => sendMessage()}
                disabled={sending}
              >
                <Ionicons name="send" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.sendBtn} onPress={startRecording}>
                <Ionicons name="mic-outline" size={18} color="#fff" />
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
  }

  // ── Patient list view ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
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
                  {item.lastVisit ? `Last visit · ${item.lastVisit}` : 'Patient'}
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

// ── Audio bubble ──────────────────────────────────────────────────────────────
function AudioBubble({ item, isMine }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const soundRef = useRef(null);

  const togglePlay = async () => {
    if (!Audio) { Alert.alert('Not available', 'Install expo-av: npx expo install expo-av'); return; }
    try {
      if (playing) {
        await soundRef.current?.pauseAsync();
        setPlaying(false);
      } else {
        if (!soundRef.current) {
          const { sound } = await Audio.Sound.createAsync({ uri: item.mediaUrl }, {}, (status) => {
            if (status.isLoaded) setCurrentTime(Math.floor((status.positionMillis || 0) / 1000));
            if (status.didJustFinish) { setPlaying(false); setCurrentTime(0); soundRef.current = null; }
          });
          soundRef.current = sound;
        }
        await soundRef.current.playAsync();
        setPlaying(true);
      }
    } catch (e) { console.error('Audio play error:', e); }
  };

  const duration = item.duration || 0;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  return (
    <TouchableOpacity style={audioBubble.row} onPress={togglePlay} activeOpacity={0.85}>
      <View style={[audioBubble.playBtn, isMine ? audioBubble.playBtnMine : audioBubble.playBtnTheirs]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={isMine ? '#fff' : DoctorColors.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        {/* Waveform bars */}
        <View style={audioBubble.waveform}>
          {Array.from({ length: 28 }).map((_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.8)) * 14;
            const filled = i / 28 <= progress;
            return (
              <View
                key={i}
                style={[audioBubble.bar, { height: h },
                  filled
                    ? (isMine ? audioBubble.barFilledMine : audioBubble.barFilledTheirs)
                    : (isMine ? audioBubble.barEmptyMine : audioBubble.barEmptyTheirs),
                ]}
              />
            );
          })}
        </View>
        <Text style={[audioBubble.dur, isMine && { color: 'rgba(255,255,255,0.75)' }]}>
          {playing ? formatAudioDuration(currentTime) : formatAudioDuration(duration)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
const audioBubble = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  playBtnMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  playBtnTheirs: { backgroundColor: DoctorColors.primaryLight },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  bar: { width: 3, borderRadius: 2 },
  barFilledMine: { backgroundColor: '#fff' },
  barEmptyMine: { backgroundColor: 'rgba(255,255,255,0.35)' },
  barFilledTheirs: { backgroundColor: DoctorColors.primary },
  barEmptyTheirs: { backgroundColor: '#cbd5e1' },
  dur: { fontSize: 10, color: '#94a3b8' },
});

// ── File bubble ───────────────────────────────────────────────────────────────
function FileBubble({ item, isMine }) {
  const ext = (item.fileName || '').split('.').pop().toUpperCase();
  const extColor = { PDF: '#ef4444', DOC: '#3b82f6', DOCX: '#3b82f6', XLS: '#22c55e', XLSX: '#22c55e', PNG: '#a855f7', JPG: '#a855f7' };
  const color = extColor[ext] || '#64748b';

  return (
    <TouchableOpacity
      style={[fileBubble.row, isMine && fileBubble.rowMine]}
      onPress={() => Linking.openURL(item.mediaUrl)}
      activeOpacity={0.85}
    >
      <View style={[fileBubble.icon, { backgroundColor: color + '22' }]}>
        <Text style={[fileBubble.ext, { color }]}>{ext || 'FILE'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[fileBubble.name, isMine && { color: '#fff' }]} numberOfLines={1}>{item.fileName || 'File'}</Text>
        <Text style={[fileBubble.size, isMine && { color: 'rgba(255,255,255,0.65)' }]}>
          {formatFileSize(item.fileSize)} · Tap to open
        </Text>
      </View>
      <Ionicons name="download-outline" size={18} color={isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8'} />
    </TouchableOpacity>
  );
}
const fileBubble = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  rowMine: {},
  icon: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  ext: { fontSize: 10, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  size: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
});

// ── Styles ────────────────────────────────────────────────────────────────────
const C = DoctorColors;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', margin: 12, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: C.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.text },
  patientRow: {
    backgroundColor: '#fff', borderRadius: 12, padding: 13, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  patientAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  patientAvatarText: { fontSize: 16, fontWeight: '700', color: C.primary },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 15, fontWeight: '600', color: C.text },
  patientMeta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#94a3b8' },
  emptySub: { fontSize: 12, color: '#cbd5e1', textAlign: 'center', paddingHorizontal: 32 },
  // Chat
  chatContainer: { flex: 1, backgroundColor: '#eef2f8' },
  chatHeader: {
    backgroundColor: C.primaryDark, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 54 : 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 4,
  },
  chatAvatarWrap: { position: 'relative', marginRight: 10 },
  chatAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  chatAvatarText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 11, height: 11, borderRadius: 6,
    backgroundColor: '#22c55e', borderWidth: 2, borderColor: C.primaryDark,
  },
  chatName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  chatSub: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },
  messageList: { flex: 1 },
  emptyChat: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyChatText: { fontSize: 14, color: '#94a3b8' },
  msgRow: { flexDirection: 'row', marginBottom: 6, alignItems: 'flex-end', paddingHorizontal: 12 },
  msgRowMine: { justifyContent: 'flex-end' },
  msgAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: C.primaryLight, justifyContent: 'center', alignItems: 'center', marginRight: 6, marginBottom: 2,
  },
  msgAvatarText: { fontSize: 9, fontWeight: '700', color: C.primary },
  bubble: {
    maxWidth: '78%', padding: 10, borderRadius: 18,
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  bubbleMine: {
    backgroundColor: C.primary, borderBottomLeftRadius: 18, borderBottomRightRadius: 4,
  },
  bubbleText: { fontSize: 14, color: '#1e293b', lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleImage: { width: 200, height: 160, borderRadius: 12 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3, gap: 2 },
  bubbleTime: { fontSize: 10, color: '#94a3b8' },
  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 8, gap: 4,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9',
  },
  attachBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  msgInput: {
    flex: 1, backgroundColor: '#f8fafc', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8, fontSize: 15,
    color: C.text, borderWidth: 1, borderColor: '#e2e8f0', maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center',
  },
  uploadingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center',
    backgroundColor: '#f0fdf4', paddingVertical: 6,
  },
  uploadingText: { fontSize: 13, color: '#15803d', fontWeight: '600' },
  recordingBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9',
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
