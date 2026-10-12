import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { api } from '../services/apiClient';

/**
 * Change password and the clinician account note, for settings screens that
 * did not have them (doctor). The web counterpart is Common/AccountSecurityCards.
 */
export function ChangePasswordCard({ accent = '#2563eb' }) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (next.length < 8) { Alert.alert('Password', 'Choose a password of at least 8 characters.'); return; }
    if (next !== again) { Alert.alert('Password', 'The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/api/v1/auth/password-change', { method: 'POST', body: { currentPassword: cur, newPassword: next } });
      Alert.alert('Password', 'Password changed.');
      setCur(''); setNext(''); setAgain(''); setOpen(false);
    } catch (e) {
      Alert.alert('Password', e?.message || 'Could not change the password.');
    } finally { setBusy(false); }
  };

  return (
    <View style={st.card}>
      <Text style={st.title}>Password</Text>
      {!open ? (
        <TouchableOpacity style={[st.ghost, { borderColor: accent }]} onPress={() => setOpen(true)}>
          <Text style={[st.ghostText, { color: accent }]}>Change password</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ gap: 8 }}>
          <TextInput style={st.input} secureTextEntry placeholder="Current password" value={cur} onChangeText={setCur} autoComplete="password" />
          <TextInput style={st.input} secureTextEntry placeholder="New password (8+ characters)" value={next} onChangeText={setNext} autoComplete="password-new" />
          <TextInput style={st.input} secureTextEntry placeholder="Repeat new password" value={again} onChangeText={setAgain} autoComplete="password-new" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[st.primary, { backgroundColor: accent }, busy && { opacity: 0.6 }]} disabled={busy} onPress={save}>
              <Text style={st.primaryText}>{busy ? 'Saving…' : 'Save password'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[st.ghost, { borderColor: '#cbd5e1' }]} onPress={() => setOpen(false)}>
              <Text style={st.ghostText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

/** Clinician accounts are closed by the admin team, so patients can be handed over safely. */
export function ClinicianAccountNote() {
  return (
    <View style={st.card}>
      <Text style={st.title}>Closing your account</Text>
      <Text style={st.desc}>
        Clinician accounts are closed by the NessaHub admin team so that your patients' care can be handed over
        safely. Contact admin through Support to start this.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  desc: { fontSize: 13.5, color: '#64748b', lineHeight: 19 },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#0f172a' },
  primary: { flex: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  ghost: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  ghostText: { fontWeight: '700', color: '#0f172a' },
});
