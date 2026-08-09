import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { formatAudioDuration } from '../../utils/chatUtils';
import { getMessageMediaUrl, getMessageDuration } from '../../utils/therapistClientChat';

export function getAudioFromMessage(msg) {
  if (!msg) return null;
  const isAudio =
    msg.type === 'audio' ||
    (typeof msg.content === 'object' && msg.content?.duration !== undefined);
  if (!isAudio && msg.type !== 'audio') return null;
  const uri = getMessageMediaUrl(msg);
  if (!uri) return null;
  return { uri, duration: getMessageDuration(msg) };
}

export default function ChatAudioBubble({
  uri,
  duration = 0,
  isMine = false,
  accentColor = '#4f46e5',
  lightBg = '#eef2ff',
}) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const soundRef = useRef(null);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
    };
  }, [uri]);

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
        const { sound } = await Audio.Sound.createAsync({ uri }, {}, (status) => {
          if (status.isLoaded) {
            setCurrentTime(Math.floor((status.positionMillis || 0) / 1000));
          }
          if (status.didJustFinish) {
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
    } catch (e) {
      Alert.alert('Playback error', 'Could not play this voice message.');
    }
  };

  const totalDuration = duration || 0;
  const progress = totalDuration > 0 ? Math.min(currentTime / totalDuration, 1) : 0;

  return (
    <TouchableOpacity style={styles.row} onPress={togglePlay} activeOpacity={0.85}>
      <View
        style={[
          styles.playBtn,
          isMine ? styles.playBtnMine : { backgroundColor: lightBg },
        ]}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color={isMine ? '#fff' : accentColor} />
      </View>
      <View style={styles.waveWrap}>
        <View style={styles.waveform}>
          {Array.from({ length: 24 }).map((_, i) => {
            const h = 4 + Math.abs(Math.sin(i * 0.85)) * 14;
            const filled = i / 24 <= progress;
            return (
              <View
                key={i}
                style={[
                  styles.bar,
                  { height: h },
                  filled
                    ? { backgroundColor: isMine ? '#fff' : accentColor }
                    : { backgroundColor: isMine ? 'rgba(255,255,255,0.35)' : '#cbd5e1' },
                ]}
              />
            );
          })}
        </View>
        <Text style={[styles.dur, isMine && styles.durMine]}>
          {playing ? formatAudioDuration(currentTime) : formatAudioDuration(totalDuration)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 180 },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBtnMine: { backgroundColor: 'rgba(255,255,255,0.22)' },
  waveWrap: { flex: 1, gap: 4 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 24 },
  bar: { width: 3, borderRadius: 2 },
  dur: { fontSize: 10, color: '#94a3b8' },
  durMine: { color: 'rgba(255,255,255,0.75)' },
});
