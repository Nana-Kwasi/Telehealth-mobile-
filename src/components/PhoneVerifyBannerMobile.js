import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId } from '../services/apiClient';
import PhoneForSmsMobile from './PhoneForSmsMobile';

/**
 * Home-screen banner for patients and clients whose phone is not verified.
 * Mobile twin of web Common/PhoneVerifyBanner.js. "Later" snoozes it for 3 days
 * on this device; it returns until the number is verified. Hidden while SMS is
 * not set up.
 */
const SNOOZE_DAYS = 3;

export default function PhoneVerifyBannerMobile() {
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [key, setKey] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const uid = await getStoredUserId().catch(() => null);
      const k = `nessa.phoneBanner.snoozedUntil.${uid || 'me'}`;
      if (alive) setKey(k);
      let until = 0;
      try { until = Number(await AsyncStorage.getItem(k)) || 0; } catch { /* treat as not snoozed */ }
      if (until > Date.now()) return;
      const st = await api('/api/v1/me/phone').catch(() => null);
      if (alive) { setStatus(st); setHidden(false); }
    })();
    return () => { alive = false; };
  }, []);

  if (hidden || !status?.smsAvailable || status.verified) return null;

  const later = async () => {
    setHidden(true);
    try { if (key) await AsyncStorage.setItem(key, String(Date.now() + SNOOZE_DAYS * 86400000)); } catch { /* hidden for now anyway */ }
  };

  return (
    <View style={s.box}>
      <Text style={s.text}>📱 <Text style={{ fontWeight: '700' }}>Verify your phone number</Text> to get prescription codes and updates by SMS.</Text>
      {open ? (
        <PhoneForSmsMobile embedded onVerified={(st) => setStatus(st)} />
      ) : (
        <View style={s.row}>
          <TouchableOpacity style={s.btn} onPress={() => setOpen(true)}><Text style={s.btnText}>Verify now</Text></TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.outline]} onPress={later}><Text style={[s.btnText, { color: '#92400e' }]}>Later</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fcd34d', borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 12, gap: 8 },
  text: { fontSize: 13.5, color: '#78350f' },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, backgroundColor: '#b45309', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  outline: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fcd34d' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
