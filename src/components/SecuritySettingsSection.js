import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/apiClient';
import {
  biometricCapability,
  enableBiometricLogin,
  disableBiometricLogin,
  isBiometricLoginEnabled,
} from '../services/biometricAuth';

/**
 * Sign-in security, shared by every role.
 *
 * Two-factor and biometric sign-in were built only into the medical patient
 * settings screen, so a doctor, therapist or therapy client had no way to turn
 * either on — the account-level protection existed but was unreachable for
 * most of the people using the app.
 *
 * One component rather than four copies: the 2FA state lives on the user row
 * and the biometric token in the device keychain, and neither is role-specific.
 */
export default function SecuritySettingsSection({ accent = '#1e6bb8', onChangePassword }) {
  const [twoFactor, setTwoFactor] = useState(false);
  const [biometric, setBiometric] = useState(false);
  const [capability, setCapability] = useState({ available: false, label: 'Biometrics' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [state, cap, bio] = await Promise.all([
        api('/api/v1/auth/2fa').catch(() => null),
        biometricCapability(),
        isBiometricLoginEnabled(),
      ]);
      setTwoFactor(!!state?.enabled);
      setCapability(cap);
      setBiometric(bio);
    } catch {
      /* leave the defaults; the switches simply show as off */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleTwoFactor = async (next) => {
    setBusy('2fa');
    setTwoFactor(next);
    try {
      await api('/api/v1/auth/2fa', { method: 'PUT', body: { enabled: next } });
      if (next) {
        Alert.alert('Two-factor authentication on',
          'From now on, signing in will ask for a 6-digit code sent to your email address.');
      }
    } catch {
      setTwoFactor(!next);
      Alert.alert('Could not update', 'Two-factor authentication was not changed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const toggleBiometric = async (next) => {
    setBusy('bio');
    try {
      if (next) {
        // Enrolment needs a live refresh token — that is what gets stored, not
        // a password. Without one there is nothing to unlock later.
        const refreshToken = await AsyncStorage.getItem('th.refreshToken');
        if (!refreshToken) {
          Alert.alert(`${capability.label} sign-in`,
            'Please sign in with your password once on this device first.');
          return;
        }
        const ok = await enableBiometricLogin(refreshToken, await AsyncStorage.getItem('th.email'));
        if (!ok) throw new Error('enable failed');
        setBiometric(true);
      } else {
        await disableBiometricLogin();
        setBiometric(false);
      }
    } catch {
      Alert.alert(`${capability.label} sign-in`, 'Could not update. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Sign-in security</Text>

      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${accent}1a` }]}>
          <Ionicons name="mail-unread-outline" size={18} color={accent} />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>Two-factor authentication</Text>
          <Text style={styles.rowDesc}>Require a code emailed to you when signing in</Text>
        </View>
        {busy === '2fa'
          ? <ActivityIndicator color={accent} />
          : <Switch value={twoFactor} onValueChange={toggleTwoFactor}
              trackColor={{ true: accent, false: '#d8dce6' }} />}
      </View>

      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${accent}1a` }]}>
          <Ionicons
            name={capability.label === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
            size={18}
            color={accent}
          />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowLabel}>{capability.label} sign-in</Text>
          <Text style={styles.rowDesc}>
            {capability.available
              ? `Use ${capability.label} instead of your password. Your password is never stored on this device.`
              : 'Not available on this device.'}
          </Text>
        </View>
        {busy === 'bio'
          ? <ActivityIndicator color={accent} />
          : <Switch
              value={biometric}
              onValueChange={toggleBiometric}
              disabled={!capability.available}
              trackColor={{ true: accent, false: '#d8dce6' }} />}
      </View>

      {onChangePassword ? (
        <TouchableOpacity style={styles.passwordBtn} onPress={onChangePassword} activeOpacity={0.8}>
          <Ionicons name="key-outline" size={17} color={accent} />
          <Text style={[styles.passwordText, { color: accent }]}>Change password</Text>
          <Ionicons name="chevron-forward" size={16} color="#9aa0b2" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    marginHorizontal: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#e4e7ee',
  },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a', marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#f1f3f8',
  },
  icon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  // flex:1 on the text only — on the row it would stretch the icon and switch.
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: '700', color: '#15173a' },
  rowDesc: { fontSize: 11.5, lineHeight: 16, color: '#656b7d', marginTop: 2 },
  passwordBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f3f8',
  },
  passwordText: { flex: 1, fontSize: 14, fontWeight: '700' },
});
