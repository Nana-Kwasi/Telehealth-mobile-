import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, storeSession } from '../../../services/apiClient';
import { HomeCareColors as C } from '../../../constants/homeCareColors';
import { buildLegalPrivacyFields, syncPrivacyConsentToUser } from '../../../services/privacyConsentService';
import { isValidEmergencyPhone } from '../../../utils/homeCareUtils';

export default function HomeCareSignUpModalScreen({ navigation, route }) {
  const { returnScreen = 'HomeCareHome', returnParams = {}, message } = route.params || {};
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const close = () => navigation.goBack();

  const submit = async () => {
    setError('');
    if (!name.trim() || !email.trim() || !password) {
      setError('Full name, email, and password are required.');
      return;
    }
    if (!isValidEmergencyPhone(phone)) {
      setError('Enter a valid phone number (at least 8 digits) so nurses can reach you.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      // Declared before the register call that uses it — a `const` read above its
      // declaration is a TDZ crash, not a hoist.
      const phoneTrim = phone.trim();
      const regData = await api('/api/v1/auth/register', {
        method: 'POST', authenticated: false,
        body: { email: email.trim().toLowerCase(), password, fullName: name.trim(), role: 'CLIENT', phone: phoneTrim },
      });
      const uid = regData.userId;
      await storeSession({ token: regData.token, refreshToken: regData.refreshToken, userId: uid, role: 'client' });
      const userProfile = {
        id: uid, uid, name: name.trim(), email: email.trim().toLowerCase(),
        phone: phoneTrim, phoneNumber: phoneTrim, role: 'client', userIntent: 'homecare',
        clientId: uid, status: 'pending',
      };
      await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
      await AsyncStorage.setItem('userIntent', 'homecare');
      await AsyncStorage.setItem('userRole', 'client');
      await AsyncStorage.setItem('isAuthenticated', 'true');
      await AsyncStorage.removeItem('hc.returnAfterAuth');
      await syncPrivacyConsentToUser({ userId: uid, role: 'client', profileId: uid }).catch(() => {});
      navigation.replace(returnScreen, returnParams);
    } catch (e) {
      if (/email.*already|already.*registered/i.test(e.message)) {
        setError('Email already registered. Sign in instead.');
      } else {
        setError(e.message || 'Sign up failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={close} />
      <ScrollView contentContainerStyle={styles.centered} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Sign up for Home Care</Text>
          <Text style={styles.sub}>{message || 'Book nurses and manage visits from your dashboard.'}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.label}>Full name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" />
          <Text style={styles.label}>Email</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.label}>Phone *</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="Country code OK — min 8 digits"
          />
          <Text style={styles.label}>Password</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry />
          <TouchableOpacity style={[styles.btn, loading && { opacity: 0.6 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            close();
            navigation.navigate('Login');
          }}>
            <Text style={styles.link}>Already have an account? Sign in</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={close} style={{ marginTop: 12 }}>
            <Text style={[styles.link, { color: C.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center' },
  centered: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: C.text },
  sub: { fontSize: 13, color: C.textSecondary, marginTop: 6, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: C.text, marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 15 },
  btn: { backgroundColor: C.primary, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '800' },
  link: { color: C.primary, textAlign: 'center', marginTop: 14, fontWeight: '600', fontSize: 13 },
  error: { color: '#dc2626', marginBottom: 8, fontSize: 13 },
});
