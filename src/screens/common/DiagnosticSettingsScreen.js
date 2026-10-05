import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch, Alert, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';

/**
 * Mobile counterpart of the web DiagnosticBranchSettings / ParentSettings screens.
 *
 * Edits whichever entity is signed in: a branch patches its own branch record, a
 * parent centre patches the organisation. `type` is 'lab' or 'scan'.
 */
export default function DiagnosticSettingsScreen({ profile, type = 'lab', isBranch = false, locationRoute, accent = '#1e6bb8' }) {
  const navigation = useNavigation();
  const [form, setForm] = useState({ name: '', address: '', city: '', country: '' });
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const branchPath = type === 'lab' ? 'lab-branches' : 'scan-branches';
  const parentPath = type === 'lab' ? 'labs' : 'scan-centers';
  const entityId = isBranch ? profile?.id : (profile?.organizationId || profile?.id);
  const endpoint = isBranch ? `/api/v1/${branchPath}/${entityId}` : `/api/v1/${parentPath}/${entityId}`;

  const load = useCallback(async () => {
    if (!entityId) { setLoading(false); return; }
    try {
      const e = await api(endpoint).catch(() => null);
      if (e) {
        setForm({
          name: e.branchName || e.name || '',
          address: e.address || '',
          city: e.city || '',
          country: e.country || '',
        });
        setMfaRequired(e.mfaRequired === true);
      }
    } finally {
      setLoading(false);
    }
  }, [entityId, endpoint]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.name.trim()) {
      Alert.alert('Name required', `The ${isBranch ? 'branch' : 'centre'} needs a name.`);
      return;
    }
    setSaving(true);
    try {
      await api(endpoint, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
        },
      });
      Alert.alert('Saved', 'Profile updated.');
      load();
    } catch {
      Alert.alert('Error', 'Could not save those changes.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMfa = async (next) => {
    setMfaRequired(next);
    try {
      await api(endpoint, { method: 'PATCH', body: { mfaRequired: next } });
      Alert.alert('Saved', `MFA requirement ${next ? 'enabled' : 'disabled'}. Sign in again to refresh your session.`);
    } catch {
      setMfaRequired(!next);
      Alert.alert('Error', 'Could not update the MFA requirement.');
    }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={accent} size="large" /></View>;

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>
        {isBranch ? 'Branch' : type === 'lab' ? 'Laboratory' : 'Scan centre'} preferences
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>{isBranch ? 'Branch name' : 'Centre name'}</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />
        <Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} value={form.address} onChangeText={v => setForm(p => ({ ...p, address: v }))} />
        <Text style={styles.label}>City</Text>
        <TextInput style={styles.input} value={form.city} onChangeText={v => setForm(p => ({ ...p, city: v }))} />
        <Text style={styles.label}>Country</Text>
        <TextInput style={styles.input} value={form.country} onChangeText={v => setForm(p => ({ ...p, country: v }))} />
        <TouchableOpacity onPress={save} disabled={saving} style={[styles.primaryBtn, { backgroundColor: accent }, saving && styles.dim]}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>Require multi-factor authentication</Text>
            <Text style={styles.rowSub}>Staff on this account must confirm a second factor at sign-in.</Text>
          </View>
          <Switch value={mfaRequired} onValueChange={toggleMfa} />
        </View>
      </View>

      {locationRoute ? (
        <TouchableOpacity style={styles.linkCard} onPress={() => navigation.navigate(locationRoute)}>
          <Ionicons name="location-outline" size={18} color={accent} />
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#0f172a' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  primaryBtn: { borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  linkCard: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dim: { opacity: 0.5 },
});
