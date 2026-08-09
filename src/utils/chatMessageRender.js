import React from 'react';
import { View, Text, Image, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ChatAudioBubble, { getAudioFromMessage } from '../components/chat/ChatAudioBubble';
import { getMessageMediaUrl, getMessageFileName } from './therapistClientChat';

export function getTextFromMessage(msg) {
  const raw = msg.text || msg.content || msg.message || '';
  if (typeof raw === 'string') return raw;
  return '';
}

export function renderChatMessageBody(msg, { isMine, accentColor, lightBg, textStyle, imageStyle }) {
  const audio = getAudioFromMessage(msg);
  if (audio?.uri) {
    return (
      <ChatAudioBubble
        uri={audio.uri}
        duration={audio.duration}
        isMine={isMine}
        accentColor={accentColor}
        lightBg={lightBg}
      />
    );
  }

  if (msg.type === 'image' || getMessageMediaUrl(msg)) {
    const url = getMessageMediaUrl(msg);
    if (url) {
      return <Image source={{ uri: url }} style={imageStyle || defaultStyles.msgImage} resizeMode="cover" />;
    }
    return <Text style={textStyle}>📷 Image</Text>;
  }

  if (msg.type === 'document' || msg.type === 'file') {
    const url = getMessageMediaUrl(msg);
    const name = getMessageFileName(msg);
    return (
      <TouchableOpacity style={defaultStyles.docRow} onPress={() => url && Linking.openURL(url)}>
        <Ionicons name="document-text-outline" size={20} color={accentColor} />
        <Text style={[defaultStyles.docName, isMine && defaultStyles.docNameMine]} numberOfLines={2}>
          {name}
        </Text>
      </TouchableOpacity>
    );
  }

  const text = getTextFromMessage(msg);
  if (text) {
    return <Text style={textStyle}>{text}</Text>;
  }

  const raw = msg.content ?? msg.text;
  if (raw && typeof raw === 'object') {
    if (raw.url) return <Text style={textStyle}>📎 Attachment</Text>;
  }

  return null;
}

const defaultStyles = StyleSheet.create({
  msgImage: { width: 200, height: 150, borderRadius: 10 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 220 },
  docName: { fontSize: 13, color: '#4f46e5', fontWeight: '600', flex: 1 },
  docNameMine: { color: '#fff' },
});
