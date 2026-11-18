import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { getStoredUserId } from '../services/apiClient';
import { chooseService, rootRouteForService, useAccountServices, chooserNeeded, markChooserShown } from '../utils/careServices';
import { IconBubbleMobile } from './EmptyStateMobile';

/*
 * For an account with both medical care and therapy: right after signing in
 * (password or Face ID), ask which dashboard to open. Asked once per sign-in;
 * the drawer's "Switch to" row changes it after that. The chosen dashboard
 * loads its own data, exactly as when switching.
 */
const CHOICES = [
  { service: 'medical', icon: 'Stethoscope', tone: 'blue', color: '#1e6bb8', title: 'Medical', text: 'Doctors, prescriptions, lab and scan results, your health record.' },
  { service: 'therapy', icon: 'MentalHealthTherapy', tone: 'violet', color: '#7c3aed', title: 'Therapy', text: 'Your therapist, sessions, journal, community and wellbeing.' },
];

export default function ServiceChooserMobile({ navigation, profile, current }) {
  const { services, name } = useAccountServices(profile, profile?.role);
  const [uid, setUid] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { getStoredUserId().then(setUid).catch(() => {}); }, []);
  useEffect(() => {
    if (uid && services.length > 1 && chooserNeeded(uid)) setOpen(true);
  }, [uid, services.length]);

  const pick = async (service) => {
    markChooserShown(uid);
    setOpen(false);
    if (service === current) return;
    await chooseService(uid, service);
    navigation.closeDrawer?.();
    const root = navigation.getParent?.() || navigation;
    root.reset({ index: 0, routes: [{ name: rootRouteForService(service) }] });
  };
  const first = String(name || '').trim().split(/\s+/)[0];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => pick(current)}>
      <View style={st.back}>
        <View style={st.card} accessibilityViewIsModal>
          <Text style={st.title}>{first ? `Welcome back, ${first}` : 'Welcome back'}</Text>
          <Text style={st.lead}>Where would you like to go?</Text>
          {CHOICES.map((c) => (
            <TouchableOpacity key={c.service} onPress={() => pick(c.service)} activeOpacity={0.8} accessibilityRole="button"
              accessibilityLabel={`${c.title} dashboard`} style={[st.choice, { borderColor: c.service === current ? c.color : '#e2e8f0' }]}>
              <IconBubbleMobile icon={c.icon} tone={c.tone} size={26} />
              <View style={{ flex: 1 }}>
                <Text style={st.choiceTitle}>{c.title}</Text>
                <Text style={st.choiceText}>{c.text}</Text>
              </View>
              {c.service === current ? <Text style={st.last}>Last used</Text> : null}
            </TouchableOpacity>
          ))}
          <Text style={st.foot}>You can switch at any time from the menu.</Text>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 18 },
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 20 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  lead: { fontSize: 15, color: '#475569', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderRadius: 18, padding: 14, marginBottom: 12 },
  choiceTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  choiceText: { fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 18 },
  last: { fontSize: 11, fontWeight: '700', color: '#475569', backgroundColor: '#f1f5f9', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  foot: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
});
