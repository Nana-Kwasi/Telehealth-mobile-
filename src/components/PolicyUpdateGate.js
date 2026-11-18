import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Linking, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { POLICY_VERSION, POLICY_VERSION_KEY, recordDevicePrivacyConsent, syncPrivacyConsentToUser } from '../services/privacyConsentService';
import { NESSA_HUB_POLICY_LINKS } from '../constants/nessaHubPolicies';
import { IconBubbleMobile } from './EmptyStateMobile';

/*
 * Signed-in people accepted the policies on the intro screen, which they never
 * see again. When the policies change materially (POLICY_VERSION), this asks
 * them once to review and accept the new version. The acceptance is recorded
 * in the consent ledger like the first one, then linked to their account.
 */
export default function PolicyUpdateGate({ userId, role }) {
  const [needed, setNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(POLICY_VERSION_KEY)
      .then((v) => { if (alive) setNeeded(v !== POLICY_VERSION); })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const accept = async () => {
    setSaving(true); setError('');
    try {
      await recordDevicePrivacyConsent();
      if (userId) syncPrivacyConsentToUser({ userId, role, profileId: userId }).catch(() => {});
      setNeeded(false);
    } catch (e) {
      setError('Your acceptance could not be saved. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const open = (url) => Linking.openURL(url).catch(() => {});
  return (
    <Modal visible={needed} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={st.backdrop}>
        <View style={st.card} accessibilityViewIsModal>
          <View style={{ alignItems: 'center', marginBottom: 10 }}><IconBubbleMobile icon="HealthDataSecurity" tone="indigo" size={34} /></View>
          <Text style={st.title}>Our policies have changed</Text>
          <Text style={st.body}>We have updated our policies for new features. Please review and accept them to keep using NessaHub.</Text>
          <Text style={st.point}>• New: the{' '}
            <Text style={st.link} onPress={() => open(NESSA_HUB_POLICY_LINKS.communityGroups)}>Community Groups Policy</Text> and the{' '}
            <Text style={st.link} onPress={() => open(NESSA_HUB_POLICY_LINKS.journal)}>My Journal Policy</Text>.
          </Text>
          <Text style={st.point}>• Updated: what we collect and share, reminder texts and calls, safety alerts, therapy records and clinician terms.</Text>
          <Text style={[st.link, { marginTop: 10 }]} onPress={() => open(NESSA_HUB_POLICY_LINKS.policiesHome)}>Read all NessaHub policies</Text>
          {error ? <Text style={st.error}>{error}</Text> : null}
          <TouchableOpacity style={[st.btn, saving && { opacity: 0.6 }]} onPress={accept} disabled={saving} accessibilityRole="button">
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>I accept</Text>}
          </TouchableOpacity>
          <Text style={st.foot}>Your acceptance is recorded with the date and policy version ({POLICY_VERSION}).</Text>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 440 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginBottom: 8 },
  body: { fontSize: 15, color: '#334155', lineHeight: 22, marginBottom: 8 },
  point: { fontSize: 14, color: '#334155', lineHeight: 21, marginTop: 4 },
  link: { color: '#2b5ce6', fontWeight: '700' },
  error: { color: '#b91c1c', marginTop: 10 },
  btn: { marginTop: 16, backgroundColor: '#2b5ce6', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  foot: { marginTop: 10, fontSize: 12, color: '#64748b', textAlign: 'center' },
});
