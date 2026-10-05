import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Vibration, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { api } from '../services/apiClient';

/**
 * The incoming-call screen on mobile, over whatever screen is open.
 *
 * While the app is in the foreground it checks for a ringing call every few
 * seconds and shows Accept / Decline with vibration. When the app is in the
 * background the backend's push notification ("X is calling you") brings the
 * person back, and this picks the call up as soon as the app is active.
 * Accept opens the shared call screen.
 */
const POLL_MS = 3000;
const CALLEE_ROLES = ['client', 'patient'];
const RINGTONE = require('../../assets/ringtone.wav');

export default function IncomingCallMobile({ navigationRef }) {
  const [call, setCall] = useState(null);
  const [busy, setBusy] = useState(false);
  const dismissed = useRef(new Set());
  const appState = useRef(AppState.currentState);

  const poll = useCallback(async () => {
    if (appState.current !== 'active') return;
    // Read the session each time: login happens inside the app, after mount.
    const [token, role] = await Promise.all([
      AsyncStorage.getItem('th.token'), AsyncStorage.getItem('userRole'),
    ]).catch(() => [null, null]);
    if (!token || !CALLEE_ROLES.includes(role)) { setCall(null); return; }
    const rows = await api('/api/v1/calls/incoming').catch(() => null);
    const next = (Array.isArray(rows) ? rows : []).find((c) => !dismissed.current.has(c.id)) || null;
    setCall((cur) => (cur?.id === next?.id ? cur : next));
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => { appState.current = s; if (s === 'active') poll(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [poll]);

  useEffect(() => {
    if (!call) { Vibration.cancel(); return undefined; }
    Vibration.vibrate([0, 700, 900], true);
    return () => Vibration.cancel();
  }, [call]);

  // Ringtone, looped while the call rings. Plays even with the silent switch
  // on — a missed clinician call costs more than an unexpected ring.
  const callId = call?.id;
  useEffect(() => {
    if (!callId) return undefined;
    let sound = null;
    let stopped = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const created = await Audio.Sound.createAsync(RINGTONE, { isLooping: true, shouldPlay: true, volume: 1.0 });
        sound = created.sound;
        if (stopped) { await sound.stopAsync().catch(() => {}); await sound.unloadAsync().catch(() => {}); }
      } catch { /* vibration still signals the call */ }
    })();
    return () => {
      stopped = true;
      if (sound) { sound.stopAsync().catch(() => {}); sound.unloadAsync().catch(() => {}); }
    };
  }, [callId]);

  const answer = async (accept) => {
    if (!call) return;
    setBusy(true);
    const current = call;
    dismissed.current.add(current.id);
    setCall(null);
    try {
      const res = await api(`/api/v1/calls/${current.id}/answer`, { method: 'POST', body: { accept } });
      if (accept && res?.ok && navigationRef?.current?.isReady()) {
        let myName = 'Patient';
        try {
          const p = JSON.parse((await AsyncStorage.getItem('userProfile')) || '{}');
          myName = p.fullName || p.name || p.email || myName;
        } catch { /* default name */ }
        navigationRef.current.navigate('VideoCallSession', {
          roomName: res.roomName,
          participantName: myName,
          callInfo: { roomName: res.roomName, targetPerson: res.callerName, displayNames: { [current.caller_id]: res.callerName } },
        });
      }
    } catch { /* the call simply ends */ } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!call} transparent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.pulse}><Ionicons name="videocam" size={30} color="#fff" /></View>
          <Text style={styles.kicker}>INCOMING VIDEO CALL</Text>
          <Text style={styles.name}>{call?.caller_name}</Text>
          <Text style={styles.sub}>
            {call?.caller_role === 'DOCTOR' ? 'Doctor' : 'Therapist'} · {call?.kind === 'therapy' ? 'Therapy session' : 'Consultation'}
          </Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <TouchableOpacity style={[styles.round, { backgroundColor: '#dc2626' }]} disabled={busy} onPress={() => answer(false)} accessibilityLabel="Decline">
                <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <Text style={styles.label}>Decline</Text>
            </View>
            <View style={styles.col}>
              <TouchableOpacity style={[styles.round, { backgroundColor: '#16a34a' }]} disabled={busy} onPress={() => answer(true)} accessibilityLabel="Accept">
                <Ionicons name="call" size={26} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.label}>Accept</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 340, backgroundColor: '#0f172a', borderRadius: 26, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center' },
  pulse: { width: 76, height: 76, borderRadius: 38, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  kicker: { fontSize: 11.5, letterSpacing: 1, color: '#94a3b8', fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 6, textAlign: 'center' },
  sub: { fontSize: 13.5, color: '#cbd5e1', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginTop: 28 },
  col: { alignItems: 'center', gap: 6 },
  round: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#cbd5e1', fontSize: 12.5 },
});
