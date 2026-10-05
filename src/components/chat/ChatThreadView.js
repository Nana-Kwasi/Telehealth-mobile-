import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Modal,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as DocumentPicker from 'expo-document-picker';
import { Audio } from 'expo-av';
import {
  formatMsgTime,
  formatAudioDuration,
  formatFileSize,
  uploadMedia,
  EMOJI_LIST,
} from '../../utils/chatUtils';
import {
  getMessageMediaUrl,
  getMessageText,
  getMessageFileName,
  getMessageFileSize,
  getMessageDuration,
  normalizeMessageType,
  isOwnChatMessage,
} from '../../utils/therapistClientChat';

function EmojiPicker({ onSelect, onClose }) {
  return (
    <View style={emojiS.container}>
      <View style={emojiS.header}>
        <Text style={emojiS.title}>Emojis</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={20} color="#64748b" />
        </TouchableOpacity>
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
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: 280,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    paddingBottom: 8,
  },
  title: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8 },
  cell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
});

function AudioBubble({ uri, duration, isMine, accentColor, lightBg }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const soundRef = useRef(null);

  const togglePlay = async () => {
    if (!uri) return;
    try {
      if (playing) {
        await soundRef.current?.pauseAsync();
        setPlaying(false);
        return;
      }
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri }, {}, (st) => {
          if (st.isLoaded) setCurrentTime(Math.floor((st.positionMillis || 0) / 1000));
          if (st.didJustFinish) {
            setPlaying(false);
            setCurrentTime(0);
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        });
        soundRef.current = sound;
      }
      await soundRef.current.playAsync();
      setPlaying(true);
    } catch (err) {
      // Log the real reason — this used to swallow it, so a playback failure gave
      // no clue whether it was the url, the codec or the network.
      console.error('Voice playback failed:', uri, err?.message || err);
      Alert.alert('Playback error', 'Could not play this voice message.');
    }
  };

  const dur = duration || 0;
  const progress = dur > 0 ? Math.min(currentTime / dur, 1) : 0;

  return (
    <TouchableOpacity style={ab.row} onPress={togglePlay} activeOpacity={0.85}>
      <View style={[ab.playBtn, isMine ? ab.playBtnMine : { backgroundColor: lightBg }]}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={isMine ? '#fff' : accentColor} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={ab.waveform}>
          {Array.from({ length: 28 }).map((_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.8)) * 14;
            const filled = i / 28 <= progress;
            return (
              <View
                key={i}
                style={[
                  ab.bar,
                  { height: h },
                  filled
                    ? { backgroundColor: isMine ? '#fff' : accentColor }
                    : { backgroundColor: isMine ? 'rgba(255,255,255,0.35)' : '#cbd5e1' },
                ]}
              />
            );
          })}
        </View>
        <Text style={[ab.dur, isMine && { color: 'rgba(255,255,255,0.75)' }]}>
          {playing ? formatAudioDuration(currentTime) : formatAudioDuration(dur)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const ab = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  playBtnMine: { backgroundColor: 'rgba(255,255,255,0.22)' },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  bar: { width: 3, borderRadius: 2 },
  dur: { fontSize: 10, color: '#94a3b8' },
});

function FileBubble({ item, isMine, accentColor }) {
  const url = getMessageMediaUrl(item);
  const ext = (getMessageFileName(item) || '').split('.').pop().toUpperCase();
  const extColor = { PDF: '#ef4444', DOC: '#3b82f6', DOCX: '#3b82f6', XLS: '#22c55e', XLSX: '#22c55e' };
  const color = extColor[ext] || accentColor;

  return (
    <TouchableOpacity style={fb.row} onPress={() => url && Linking.openURL(url)} activeOpacity={0.85}>
      <View style={[fb.icon, { backgroundColor: color + '22' }]}>
        <Text style={[fb.ext, { color }]}>{ext || 'FILE'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[fb.name, isMine && { color: '#fff' }]} numberOfLines={1}>
          {getMessageFileName(item)}
        </Text>
        <Text style={[fb.size, isMine && { color: 'rgba(255,255,255,0.65)' }]}>
          {formatFileSize(getMessageFileSize(item))} · Tap to open
        </Text>
      </View>
      <Ionicons name="download-outline" size={18} color={isMine ? 'rgba(255,255,255,0.7)' : '#94a3b8'} />
    </TouchableOpacity>
  );
}

const fb = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  icon: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  ext: { fontSize: 10, fontWeight: '800' },
  name: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  size: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
});

/**
 * Shared chat thread UI (doctor/medical pattern).
 * @param {object} props
 * @param {Array} props.messages
 * @param {string} props.myUid
 * @param {function} props.onSend - async (payload) => void; payload includes type, text, mediaUrl, etc.
 * @param {string} props.storagePrefix - e.g. client-chats/xyz or staff-chat/uid
 * @param {string} props.accentColor
 * @param {string} props.lightBg
 * @param {React.ReactNode} props.header
 * @param {string} props.emptyHint
 */
// WhatsApp-style delivery tick for own messages: single grey (sent), double grey
// (delivered), double blue (read).
function ThreadTick({ status }) {
  if (status === 'read' || status === 'seen') {
    return <Ionicons name="checkmark-done" size={14} color="#34B7F1" />;
  }
  if (status === 'delivered') {
    return <Ionicons name="checkmark-done" size={14} color="#94a3b8" />;
  }
  return <Ionicons name="checkmark" size={13} color="#94a3b8" />;
}

export default function ChatThreadView({
  messages,
  myUid,
  onSend,
  storagePrefix,
  accentColor = '#4f46e5',
  lightBg = '#eef2ff',
  header,
  emptyHint = 'Say hello!',
  listRef: externalListRef,
  keyboardVerticalOffset = 90,
}) {
  const [msgText, setMsgText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [viewingImage, setViewingImage] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const recordingRef = useRef(null);
  const recordTimerRef = useRef(null);
  const listRef = externalListRef || useRef(null);

  const sendText = async () => {
    const text = msgText.trim();
    if (!text) return;
    setMsgText('');
    try {
      await onSend({ text, type: 'text', content: text });
    } catch {
      setMsgText(text);
      Alert.alert('Error', 'Could not send message.');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      // Always upload JPEG. iPhone photos are HEIC, which iOS renders natively but
      // NO desktop browser can decode — so an image sent from the phone arrived on
      // the web as a broken image. Re-encoding here fixes it at the source and
      // keeps the attachment viewable everywhere.
      let uri = asset.uri;
      try {
        const converted = await ImageManipulator.manipulateAsync(asset.uri, [], {
          compress: 0.8,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        if (converted?.uri) uri = converted.uri;
      } catch (convErr) {
        // Fall back to the original rather than blocking the send.
        console.warn('Image convert failed, sending original:', convErr?.message);
      }
      const baseName = (asset.fileName || 'image').replace(/\.[^.]+$/, '');
      const fileName = `${baseName}.jpg`;
      const url = await uploadMedia(
        uri,
        `${storagePrefix}/media/${Date.now()}.jpg`,
        'image/jpeg'
      );
      await onSend({
        type: 'image',
        mediaUrl: url,
        fileUrl: url,
        fileName,
        mimeType: 'image/jpeg',
        text: '',
        content: { url, name: fileName, type: 'image/jpeg' },
      });
    } catch (e) {
      console.error('Image upload error:', e);
      Alert.alert('Error', 'Could not send image.');
    } finally {
      setUploading(false);
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      const url = await uploadMedia(
        asset.uri,
        `${storagePrefix}/files/${Date.now()}_${asset.name}`,
        asset.mimeType || 'application/octet-stream'
      );
      await onSend({
        type: 'file',
        mediaUrl: url,
        fileUrl: url,
        fileName: asset.name,
        fileSize: asset.size || 0,
        mimeType: asset.mimeType || '',
        text: '',
        content: { url, name: asset.name, size: asset.size, type: asset.mimeType },
      });
    } catch (e) {
      console.error('File upload error:', e);
      Alert.alert('Error', 'Could not send file.');
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
      setRecordingDuration(0);
      recordTimerRef.current = setInterval(() => setRecordingDuration((p) => p + 1), 1000);
    } catch {
      Alert.alert('Error', 'Could not start recording.');
    }
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
      if (!uri) return;
      setUploading(true);
      const url = await uploadMedia(uri, `${storagePrefix}/voice/${Date.now()}.m4a`, 'audio/mp4');
      await onSend({
        type: 'audio',
        mediaUrl: url,
        fileUrl: url,
        duration,
        text: '',
        content: { url, duration, type: 'audio/m4a' },
      });
    } catch (e) {
      console.error('Voice upload error:', e);
      Alert.alert('Error', 'Could not send voice message.');
    } finally {
      setUploading(false);
    }
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

  const renderBody = useCallback(
    (item, isMine) => {
      const type = normalizeMessageType(item);
      const url = getMessageMediaUrl(item);
      const textStyle = [styles.bubbleText, isMine && styles.bubbleTextMine];

      if (type === 'image' && url) {
        return (
          <TouchableOpacity onPress={() => setViewingImage(url)}>
            <Image source={{ uri: url }} style={styles.bubbleImage} resizeMode="cover" />
          </TouchableOpacity>
        );
      }
      if (type === 'audio' && url) {
        return (
          <AudioBubble
            uri={url}
            duration={getMessageDuration(item)}
            isMine={isMine}
            accentColor={accentColor}
            lightBg={lightBg}
          />
        );
      }
      if (type === 'file' && url) {
        return <FileBubble item={item} isMine={isMine} accentColor={accentColor} />;
      }
      return <Text style={textStyle}>{getMessageText(item)}</Text>;
    },
    [accentColor, lightBg]
  );

  const ts = (msg) => msg.createdAt || msg.timestamp;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {header}
      <ScrollView
        ref={listRef}
        style={styles.messageList}
        contentContainerStyle={{ paddingVertical: 8, paddingHorizontal: 12 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Ionicons name="chatbubbles-outline" size={40} color="#cbd5e1" />
            <Text style={styles.emptyChatText}>{emptyHint}</Text>
          </View>
        ) : (
          messages.map((item) => {
            const isMine = isOwnChatMessage(item, myUid);
            return (
              <View key={item.id} style={[styles.msgRow, isMine && styles.msgRowMine]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {renderBody(item, isMine)}
                  <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 3 }}>
                    <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>
                      {formatMsgTime(ts(item))}
                    </Text>
                    {isMine && <ThreadTick status={item.status} />}
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.uploadingText}>Uploading...</Text>
        </View>
      )}

      {showEmoji && (
        <EmojiPicker
          onSelect={(e) => {
            setMsgText((p) => p + e);
            setShowEmoji(false);
          }}
          onClose={() => setShowEmoji(false)}
        />
      )}

      {isRecording && (
        <View style={styles.recordingBar}>
          <TouchableOpacity onPress={cancelRecording} style={styles.cancelRecBtn}>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
          <View style={styles.recordingPulse}>
            <Ionicons name="mic" size={14} color="#ef4444" />
            <Text style={styles.recordingText}>
              Recording {formatAudioDuration(recordingDuration)}
            </Text>
          </View>
          <TouchableOpacity style={styles.sendRecBtn} onPress={stopAndSendRecording}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {!isRecording && (
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachBtn} onPress={() => setShowEmoji((p) => !p)}>
            <Text style={{ fontSize: 20 }}>😊</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickImage} disabled={uploading}>
            <Ionicons name="image-outline" size={22} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachBtn} onPress={pickFile} disabled={uploading}>
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
              style={[styles.sendBtn, { backgroundColor: accentColor }]}
              onPress={sendText}
              disabled={uploading}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: accentColor }]}
              onPress={startRecording}
              disabled={uploading}
            >
              <Ionicons name="mic-outline" size={18} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef2f8' },
  messageList: { flex: 1 },
  emptyChat: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyChatText: { fontSize: 14, color: '#94a3b8' },
  msgRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-end' },
  msgRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '82%',
    padding: 10,
    borderRadius: 18,
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
  },
  bubbleMine: {
    backgroundColor: '#4f46e5',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  bubbleTheirs: {},
  bubbleText: { fontSize: 14, color: '#1e293b', lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleImage: { width: 200, height: 160, borderRadius: 12 },
  bubbleTime: { fontSize: 10, color: '#94a3b8', marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.65)' },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    paddingVertical: 6,
  },
  uploadingText: { fontSize: 13, color: '#0f5628', fontWeight: '600' },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  cancelRecBtn: { padding: 6 },
  recordingPulse: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff1f2',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  recordingText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  sendRecBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    gap: 4,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  attachBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  msgInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  imageViewerClose: { position: 'absolute', top: 50, right: 20, zIndex: 10, padding: 8 },
  imageViewerImg: { width: '100%', height: '80%' },
});
