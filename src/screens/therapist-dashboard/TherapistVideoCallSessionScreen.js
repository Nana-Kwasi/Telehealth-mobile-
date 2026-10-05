import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { VIDEO_CALL_WEB_BASE } from '../../constants/videoCallConfig';
import { TherapistColors } from '../../constants/colors';

export default function TherapistVideoCallSessionScreen({ navigation, route }) {
  const { roomName, participantName, callInfo } = route.params || {};

  const callUrl = useMemo(() => {
    if (!roomName || !participantName) return null;
    return `${VIDEO_CALL_WEB_BASE}/video-call/${encodeURIComponent(roomName)}/${encodeURIComponent(participantName)}`;
  }, [roomName, participantName]);

  const injectedBeforeLoad = useMemo(() => {
    if (!callInfo) return 'true;';
    const stored = JSON.stringify(JSON.stringify(callInfo));
    return `try { window.localStorage.setItem('videoCallInfo', ${stored}); } catch (e) {} true;`;
  }, [callInfo]);

  if (!callUrl) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Missing call details.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.toolbarTitle} numberOfLines={1}>Video session</Text>
          <Text style={styles.toolbarSub} numberOfLines={1}>{roomName}</Text>
        </View>
      </View>

      <WebView
        source={{ uri: callUrl }}
        injectedJavaScriptBeforeContentLoaded={injectedBeforeLoad}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={TherapistColors.primary} />
            <Text style={styles.loadingText}>Connecting to video room…</Text>
          </View>
        )}
        style={styles.webview}
        onError={() => {}}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(255,255,255,0.72)' },
  errorText: { fontSize: 16, color: '#0d0d0d', marginBottom: 16 },
  backBtn: { backgroundColor: TherapistColors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  backBtnText: { color: '#ffffff', fontWeight: '700' },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: TherapistColors.primaryDark,
  },
  iconBtn: { padding: 4 },
  toolbarTitle: { color: '#0d0d0d', fontSize: 16, fontWeight: '700' },
  toolbarSub: { color: '#0d0d0d', fontSize: 11, marginTop: 2 },
  webview: { flex: 1, backgroundColor: '#000' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 12,
  },
  loadingText: { color: '#3d3d3d', fontSize: 14 },
});
