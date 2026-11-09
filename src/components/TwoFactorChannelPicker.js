import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';
import PhoneForSmsMobile from './PhoneForSmsMobile';

/** Lets a person choose how their sign-in code reaches them. Hidden while SMS is not set up. */
export default function TwoFactorChannelPicker({ accent = '#1e6bb8' }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api('/api/v1/auth/2fa').then(setState).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!state?.smsAvailable) return null;

  const choose = async (channel) => {
    if (channel === state.channel || busy) return;
    setBusy(true);
    try {
      await api('/api/v1/auth/2fa', { method: 'PUT', body: { enabled: true, channel } });
      setState((s) => ({ ...s, channel }));
    } catch (e) {
      Alert.alert('Not changed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const option = (channel, label, disabled) => {
    const on = state.channel === channel;
    return (
      <TouchableOpacity
        accessibilityRole="radio"
        accessibilityState={{ selected: on, disabled }}
        disabled={disabled || busy}
        onPress={() => choose(channel)}
        style={[s.option, disabled && { opacity: 0.5 }]}
      >
        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={accent} />
        <Text style={s.label}>{label}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.box}>
      <Text style={s.title}>Send my sign-in code by</Text>
      {option('email', 'Email', false)}
      {option('sms', state.phone ? `Text message to ${state.phone}` : 'Text message', !state.phoneVerified)}
      {state.phoneVerified ? null : (
        <View style={{ marginTop: 6 }}>
          <Text style={s.hint}>Verify your mobile number to use text messages.</Text>
          <PhoneForSmsMobile embedded onVerified={load} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  box: { paddingVertical: 10 },
  title: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  label: { flex: 1, fontSize: 14, color: '#334155' },
  hint: { fontSize: 12.5, color: '#64748b', marginBottom: 6 },
});
