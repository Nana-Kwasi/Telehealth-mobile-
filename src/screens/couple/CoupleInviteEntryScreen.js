import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';
import { fetchCoupleByInviteToken } from '../../services/coupleTherapyService';

export default function CoupleInviteEntryScreen({ navigation, route }) {
  const initialToken = route.params?.token || '';
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);

  const openWelcome = async (inviteToken) => {
    const trimmed = (inviteToken || '').trim();
    if (!trimmed) {
      Alert.alert('Required', 'Enter your invitation code or open the link from your email.');
      return;
    }

    setLoading(true);
    try {
      const invite = await fetchCoupleByInviteToken(trimmed);
      await AsyncStorage.multiSet([
        [COUPLE_STORAGE_KEYS.coupleId, invite.coupleId],
        [COUPLE_STORAGE_KEYS.partnerRole, 'partnerB'],
        [COUPLE_STORAGE_KEYS.inviteToken, trimmed],
        [COUPLE_STORAGE_KEYS.otherPartnerName, invite.partnerAName || ''],
      ]);

      navigation.replace('CouplePartnerBWelcome', {
        coupleId: invite.coupleId,
        token: trimmed,
        partnerAName: invite.partnerAName,
        partnerBEmail: invite.partnerBEmail,
        partnerBName: invite.partnerBName,
      });
    } catch (e) {
      Alert.alert('Invalid invitation', e.message || 'This link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    if (initialToken) openWelcome(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Partner invitation</Text>
      <Text style={styles.subtitle}>Open the link from your email or paste your invitation code.</Text>
      <TextInput
        style={styles.input}
        placeholder="Invitation code"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity style={styles.btn} onPress={() => openWelcome(token)} disabled={loading}>
        {loading ? <ActivityIndicator color={Colors.surface} /> : <Text style={styles.btnText}>Continue</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: Colors.background, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: Colors.surface,
    marginBottom: 16,
    color: Colors.text,
  },
  btn: { backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  btnText: { color: Colors.surface, fontWeight: '700', fontSize: 16 },
});
