import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, STORAGE_KEYS } from '../../services/apiClient';

/**
 * The video call, for every role — patients, clients, doctors and therapists.
 *
 * The call runs on the web call page (Twilio Video), so the in-call features —
 * transcription with consent, ring status — are the same on phone and browser.
 * Two things make that work on a phone:
 *
 *  1. ADDRESS. Phones allow camera and microphone only on HTTPS pages. The
 *     current HTTPS address is asked of the backend at call time (a local
 *     tunnel in development, the real domain in production), so it never has
 *     to be rebuilt into the app. The old hard-coded address pointed at the
 *     pre-migration Firebase site.
 *  2. SESSION. The page is signed in as this user by placing their session in
 *     the page's storage before it loads; without that, everything inside the
 *     call that talks to the API was refused.
 */
export default function VideoCallSessionScreen({ navigation, route }) {
  const { roomName, participantName, callInfo } = route.params || {};
  const [base, setBase] = useState(null);
  const [inject, setInject] = useState(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api('/api/v1/calls/web-base').catch(() => null);
        const b = (r?.base || '').replace(/\/+$/, '');
        if (!b) { if (!cancelled) setProblem(r?.message || 'Video calls are not available right now.'); return; }
        const [token, refreshToken, userId, role, profile] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.token), AsyncStorage.getItem(STORAGE_KEYS.refreshToken),
          AsyncStorage.getItem(STORAGE_KEYS.userId), AsyncStorage.getItem(STORAGE_KEYS.role),
          AsyncStorage.getItem('userProfile'),
        ]);
        const session = {
          'nessa.token': token || '', 'nessa.refreshToken': refreshToken || '', 'nessa.userId': userId || '',
          'nessa.role': String(role || '').toLowerCase(), 'nessa.profile': profile || '{}',
        };
        // JSON-encoded twice so it is a safe string literal inside the injected script.
        const js = `try {
            var s = ${JSON.stringify(JSON.stringify(session))}; s = JSON.parse(s);
            Object.keys(s).forEach(function (k) { if (s[k]) window.sessionStorage.setItem(k, s[k]); });
            ${callInfo ? `window.localStorage.setItem('videoCallInfo', ${JSON.stringify(JSON.stringify(callInfo))});` : ''}
          } catch (e) {} true;`;
        if (!cancelled) { setBase(b); setInject(js); }
      } catch {
        if (!cancelled) setProblem('Video calls are not available right now.');
      }
    })();
    return () => { cancelled = true; };
  }, [callInfo]);

  if (!roomName || !participantName) {
    return <Message text="Missing call details." onBack={() => navigation.goBack()} />;
  }
  if (problem) return <Message text={problem} onBack={() => navigation.goBack()} />;
  if (!base || !inject) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#2b5ce6" /></View>;
  }

  const callUrl = `${base}/video-call/${encodeURIComponent(roomName)}/${encodeURIComponent(participantName)}`;
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn} accessibilityLabel="Leave call">
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.toolbarTitle} numberOfLines={1}>Video call</Text>
      </View>
      <WebView
        source={{ uri: callUrl }}
        injectedJavaScriptBeforeContentLoaded={inject}
        // The call page posts this on hang-up; window.close() does nothing in a web view.
        onMessage={(e) => { if (e?.nativeEvent?.data === 'nessa:call-ended' && navigation.canGoBack()) navigation.goBack(); }}
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        mediaCapturePermissionGrantType="grant"
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}><ActivityIndicator size="large" color="#2b5ce6" /></View>
        )}
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

function Message({ text, onBack }) {
  return (
    <SafeAreaView style={styles.center}>
      <Ionicons name="videocam-off-outline" size={36} color="#64748b" />
      <Text style={styles.message}>{text}</Text>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}><Text style={styles.backText}>Go back</Text></TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#0f172a' },
  iconBtn: { padding: 4 },
  toolbarTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  webview: { flex: 1, backgroundColor: '#000' },
  loading: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12, backgroundColor: '#f8fafc' },
  message: { fontSize: 15, color: '#0f172a', textAlign: 'center', lineHeight: 22 },
  backBtn: { backgroundColor: '#2b5ce6', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  backText: { color: '#fff', fontWeight: '700' },
});
