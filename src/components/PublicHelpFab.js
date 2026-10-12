import React, { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStoredToken } from '../services/apiClient';
import HelpCenterModal from './HelpCenterModal';

/**
 * A floating help button on every screen until the person signs in or signs up
 * (welcome, intent, login, sign-up, questionnaires…), matching the website. It
 * opens the help window: Ask Ness and the FAQ.
 *
 * Mounted once beside the navigator. Signed in = a stored session token; that
 * is re-checked on every navigation, so it disappears as soon as an account
 * exists and comes back after sign-out.
 */
const NEVER_ON = new Set(['Faq', 'VideoCallSession']);

export default function PublicHelpFab({ navigationRef }) {
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState(null);
  const [signedIn, setSignedIn] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      const name = navigationRef.current?.getCurrentRoute?.()?.name || null;
      const token = await getStoredToken().catch(() => null);
      if (!alive) return;
      setRoute(name);
      setSignedIn(Boolean(token));
    };
    // The container ref can be empty on the first pass; keep trying briefly.
    let unsub = null;
    const attach = () => {
      if (unsub || !navigationRef.current?.addListener) return;
      unsub = navigationRef.current.addListener('state', sync);
      sync();
    };
    attach();
    const t = setInterval(() => { attach(); if (unsub) clearInterval(t); }, 300);
    return () => { alive = false; clearInterval(t); unsub?.(); };
  }, [navigationRef]);

  if (signedIn || !route || NEVER_ON.has(route)) return null;

  return (
    <>
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          activeOpacity={0.85}
          accessibilityLabel="Help: ask Ness or read the FAQ"
          style={[s.fab, route === 'Intent'
            // The intent screen's cards fill the bottom; its top-right corner,
            // level with the logo, is empty.
            ? { top: 70, right: 18 }
            : { bottom: Math.max(insets.bottom, 16) + (route === 'IntroHome' ? 12 : 84), left: 18 }]}
        >
          <LinearGradient colors={['#5a9a6d', '#2f5e3f']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.disc}>
            <Ionicons name="chatbubble-ellipses" size={26} color="#fff" />
          </LinearGradient>
          <View style={s.dot}><Ionicons name="help" size={12} color="#fff" /></View>
        </TouchableOpacity>
      </View>
      <HelpCenterModal visible={open} onClose={() => setOpen(false)} audience="visitor" />
    </>
  );
}

const s = StyleSheet.create({
  fab: {
    position: 'absolute', width: 58, height: 58, borderRadius: 29,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10,
  },
  disc: { flex: 1, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  dot: {
    position: 'absolute', top: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: '#b8860b',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff',
  },
});
