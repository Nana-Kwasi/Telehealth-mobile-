// ─── ResourceMedia ───────────────────────────────────────────────────────────
// Renders whatever a resource actually is: an image to look at, a document to
// download, audio to play, a video to watch, or a link to open.
//
// Picking "Image" or "Audio" on the therapist form used to change nothing but a
// label — there was no attachment field, and nothing on the client side that
// could open one. This is the client-facing half of that.

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, Video, ResizeMode } from 'expo-av';
import { Colors } from '../../constants/colors';

function fmtTime(millis) {
  const s = Math.floor((millis || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Play/pause with elapsed time — the audio equivalent of a download button. */
function AudioPlayer({ uri }) {
  const soundRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // Unload on unmount, otherwise the clip keeps playing after the sheet closes.
  useEffect(() => () => { soundRef.current?.unloadAsync?.(); }, []);

  const toggle = async () => {
    try {
      if (!soundRef.current) {
        setLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true },
          (status) => {
            if (!status.isLoaded) return;
            setPosition(status.positionMillis || 0);
            setDuration(status.durationMillis || 0);
            setPlaying(status.isPlaying);
            if (status.didJustFinish) { setPlaying(false); setPosition(0); }
          },
        );
        soundRef.current = sound;
        setLoading(false);
        return;
      }
      const status = await soundRef.current.getStatusAsync();
      if (status.isPlaying) await soundRef.current.pauseAsync();
      else await soundRef.current.playAsync();
    } catch {
      setLoading(false);
      setPlaying(false);
    }
  };

  return (
    <View style={styles.audioBar}>
      <TouchableOpacity style={styles.audioBtn} onPress={toggle} disabled={loading}>
        {loading
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />}
      </TouchableOpacity>
      <View style={styles.audioMeta}>
        <Text style={styles.audioLabel}>Audio</Text>
        <Text style={styles.audioTime}>
          {duration ? `${fmtTime(position)} / ${fmtTime(duration)}` : 'Tap play'}
        </Text>
      </View>
    </View>
  );
}

export default function ResourceMedia({ resource }) {
  const [lightbox, setLightbox] = useState(false);
  if (!resource) return null;

  const type = String(resource.type || '').toLowerCase();
  const fileUrl = resource.fileUrl || '';
  const linkUrl = resource.linkUrl || resource.url || '';

  if (type === 'image' && fileUrl) {
    return (
      <>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setLightbox(true)}>
          <Image source={{ uri: fileUrl }} style={styles.image} resizeMode="cover" />
          <Text style={styles.hint}>Tap to view full size</Text>
        </TouchableOpacity>
        <Modal visible={lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(false)}>
          <View style={styles.lightbox}>
            <TouchableOpacity style={styles.lightboxClose} onPress={() => setLightbox(false)}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <Image source={{ uri: fileUrl }} style={styles.lightboxImg} resizeMode="contain" />
          </View>
        </Modal>
      </>
    );
  }

  if (type === 'audio' && fileUrl) return <AudioPlayer uri={fileUrl} />;

  if (type === 'video') {
    // An uploaded video plays inline; a YouTube/Vimeo link has to open externally.
    if (fileUrl) {
      return (
        <Video
          source={{ uri: fileUrl }}
          style={styles.video}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
        />
      );
    }
    if (linkUrl) {
      return (
        <TouchableOpacity style={styles.fileRow} onPress={() => Linking.openURL(linkUrl).catch(() => {})}>
          <Ionicons name="play-circle-outline" size={22} color={Colors.primary} />
          <Text style={styles.fileName} numberOfLines={1}>Watch video</Text>
          <Ionicons name="open-outline" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      );
    }
  }

  if (fileUrl) {
    return (
      <TouchableOpacity style={styles.fileRow} onPress={() => Linking.openURL(fileUrl).catch(() => {})}>
        <Ionicons name="document-outline" size={22} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.fileName} numberOfLines={1}>{resource.fileName || 'Attachment'}</Text>
          {resource.fileSize ? <Text style={styles.fileMeta}>{fmtSize(resource.fileSize)}</Text> : null}
        </View>
        <Ionicons name="download-outline" size={20} color={Colors.primary} />
      </TouchableOpacity>
    );
  }

  if (linkUrl) {
    return (
      <TouchableOpacity style={styles.fileRow} onPress={() => Linking.openURL(linkUrl).catch(() => {})}>
        <Ionicons name="link-outline" size={22} color={Colors.primary} />
        <Text style={styles.fileName} numberOfLines={1}>{linkUrl}</Text>
        <Ionicons name="open-outline" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  image: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#e2e8f0' },
  hint: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 6 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  lightboxImg: { width: '100%', height: '80%' },
  lightboxClose: { position: 'absolute', top: 50, right: 20, zIndex: 2, padding: 8 },
  video: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#000' },
  audioBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 12, borderRadius: 12, backgroundColor: '#f1f5f9',
  },
  audioBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  audioMeta: { flex: 1 },
  audioLabel: { fontSize: 14, fontWeight: '600', color: Colors.text },
  audioTime: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, backgroundColor: '#f1f5f9',
  },
  fileName: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  fileMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
});
