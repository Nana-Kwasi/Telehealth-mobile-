import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';

/**
 * Mobile counterpart of the web BranchSettings / PharmacySettings screens.
 *
 * Both settings live in the branch/organisation metadata blob (there are no columns
 * for them), and the PATCH endpoint merges them — see the backend
 * BranchPatchRequest.mfaRequired / transferApprovalTtlHours.
 */
export default function PharmacySettingsScreen({ profile, isBranch = false, locationRoute }) {
  const navigation = useNavigation();
  const [mfaRequired, setMfaRequired] = useState(profile?.mfaRequired === true);
  const [ttl, setTtl] = useState(String(profile?.transferApprovalTtlHours || 6));
  const [saving, setSaving] = useState(false);

  const endpoint = isBranch
    ? `/api/v1/pharmacy-branches/${profile?.id}`
    : `/api/v1/pharmacies/${profile?.organizationId || profile?.id}`;

  const patch = async (body, okMessage) => {
    if (!profile?.id) return;
    setSaving(true);
    try {
      await api(endpoint, { method: 'PATCH', body });
      Alert.alert('Saved', okMessage);
    } catch {
      Alert.alert('Error', 'Could not save that setting. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMfa = (next) => {
    setMfaRequired(next);
    patch({ mfaRequired: next }, `MFA requirement ${next ? 'enabled' : 'disabled'}. Sign in again to refresh your session.`);
  };

  const saveTtl = () => {
    const hours = Math.max(1, Math.min(72, parseInt(ttl, 10) || 6));
    setTtl(String(hours));
    patch({ transferApprovalTtlHours: hours }, `Transfer approval window set to ${hours} hour${hours > 1 ? '' : ''}.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>{isBranch ? 'Branch preferences' : 'Pharmacy preferences'}</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>Require multi-factor authentication</Text>
            <Text style={styles.rowSub}>Staff on this account must confirm a second factor at sign-in.</Text>
          </View>
          <Switch value={mfaRequired} onValueChange={toggleMfa} disabled={saving} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.rowTitle}>Transfer approval window</Text>
        <Text style={styles.rowSub}>
          How long a patient has to approve a drug transfer before it expires (1–72 hours).
        </Text>
        <View style={styles.ttlRow}>
          <TextInput
            style={styles.input}
            value={ttl}
            onChangeText={setTtl}
            keyboardType="number-pad"
            placeholder="6"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity onPress={saveTtl} disabled={saving} style={[styles.saveBtn, saving && { opacity: 0.5 }]}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {locationRoute ? (
        <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate(locationRoute)}>
          <Ionicons name="location-outline" size={18} color={C.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Location settings</Text>
            <Text style={styles.rowSub}>Update the address patients and doctors see.</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 17 },
  ttlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 9, fontSize: 14, color: '#0f172a', width: 90,
  },
  saveBtn: { backgroundColor: C.primary, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  linkCard: {
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0',
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
});
