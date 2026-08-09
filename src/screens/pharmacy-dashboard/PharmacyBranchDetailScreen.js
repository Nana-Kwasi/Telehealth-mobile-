import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';

/**
 * Mobile counterpart of the web PharmacyBranchDetail screen: the parent pharmacy's
 * admin view of one branch — profile edit, prescription volume, recent activity,
 * one-time password reset, MFA toggle, suspend/activate and delete.
 */
export default function PharmacyBranchDetailScreen({ profile }) {
  const route = useRoute();
  const navigation = useNavigation();
  const branchId = route.params?.branchId;

  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [rx, setRx] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState({ name: '', address: '', city: '', country: '' });

  const load = useCallback(async () => {
    if (!branchId) { setLoading(false); return; }
    try {
      const b = await api(`/api/v1/pharmacy-branches/${branchId}`).catch(() => null);
      if (b) {
        setBranch(b);
        setForm({
          name: b.branchName || '',
          address: b.address || '',
          city: b.city || '',
          country: b.country || '',
        });
      }
      const [rxList, evList] = await Promise.all([
        api(`/api/v1/medical/prescriptions/branch/${branchId}`).catch(() => []),
        api(`/api/v1/entity-operations/pharmacy/events?branchId=${branchId}`).catch(() => []),
      ]);
      setRx(rxList || []);
      setEvents((evList || []).slice(0, 10));
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const patch = async (body, okMsg) => {
    setBusy(true);
    try {
      await api(`/api/v1/pharmacy-branches/${branchId}`, { method: 'PATCH', body });
      await load();
      if (okMsg) Alert.alert('Saved', okMsg);
    } catch {
      Alert.alert('Error', 'Could not apply that change.');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) {
      Alert.alert('Name required', 'The branch needs a name.');
      return;
    }
    setSaving(true);
    try {
      await api(`/api/v1/pharmacy-branches/${branchId}`, {
        method: 'PATCH',
        body: {
          name: form.name.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          country: form.country.trim(),
        },
      });
      await load();
      Alert.alert('Saved', 'Branch profile updated.');
    } catch {
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (next) => {
    Alert.alert(
      next === 'active' ? 'Activate branch' : 'Suspend branch',
      next === 'active'
        ? 'This branch will be able to receive and dispense prescriptions again.'
        : 'A suspended branch can no longer be routed new prescriptions.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => patch({ status: next }, `Branch ${next === 'active' ? 'activated' : 'suspended'}.`) },
      ],
    );
  };

  const toggleMfa = (next) => patch(
    { mfaRequired: next },
    `MFA requirement ${next ? 'enabled' : 'disabled'} for this branch operator.`,
  );

  const resetPassword = () => {
    Alert.alert(
      'Reset branch password',
      `Generate a new one-time password for "${branch?.branchName || 'this branch'}"? The operator must change it at next sign-in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await api(`/api/v1/registrations/branches/${branchId}/reset-password`, { method: 'POST', body: {} });
              const pw = res?.temporaryPassword || res?.data?.temporaryPassword;
              if (!pw) { Alert.alert('Error', 'Could not generate a password. Please try again.'); return; }
              setTempPassword(pw);
              await load();
            } catch {
              Alert.alert('Error', 'Failed to reset the branch password.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const removeBranch = () => {
    // Mirrors the web guard: a branch with prescriptions on it must be suspended,
    // never deleted, or those prescriptions lose their dispensing location.
    if (rx.length > 0) {
      Alert.alert('Cannot delete', `${rx.length} prescription(s) are linked to this branch. Suspend it instead.`);
      return;
    }
    Alert.alert('Delete branch', `Delete "${branch?.branchName}"? This removes the branch profile only.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api(`/api/v1/pharmacy-branches/${branchId}`, { method: 'DELETE' });
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to delete the branch.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator color={C.primary} size="large" /></View>;
  if (!branch) return <View style={styles.centered}><Text style={styles.muted}>Branch not found.</Text></View>;

  const status = branch.status || 'active';
  const delivered = rx.filter(r => (r.pharmacyStatus || '') === 'delivered').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>{branch.branchName || 'Branch'}</Text>
      <Text style={styles.sub}>{branch.email || 'No login email'}</Text>
      <View style={[styles.statusPill, status === 'active' ? styles.pillOk : styles.pillWarn]}>
        <Text style={[styles.statusText, { color: status === 'active' ? '#166534' : '#92400e' }]}>{status}</Text>
      </View>

      {tempPassword && (
        <View style={styles.credsBox}>
          <Text style={styles.credsLabel}>One-time password — shown once</Text>
          <Text style={styles.credsValue}>{tempPassword}</Text>
          <Text style={styles.credsHint}>
            Write this down now — it is not retrievable once dismissed.
          </Text>
          <View style={styles.credsActions}>
            <TouchableOpacity onPress={() => setTempPassword(null)}>
              <Text style={[styles.credsBtn, { color: '#64748b' }]}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.tileRow}>
        <View style={styles.tile}><Text style={styles.tileNum}>{rx.length}</Text><Text style={styles.tileLabel}>prescriptions</Text></View>
        <View style={styles.tile}><Text style={styles.tileNum}>{delivered}</Text><Text style={styles.tileLabel}>delivered</Text></View>
      </View>

      <Text style={styles.sectionTitle}>Branch profile</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Branch name</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={v => setForm(p => ({ ...p, name: v }))} />
        <Text style={styles.label}>Address</Text>
        <TextInput style={styles.input} value={form.address} onChangeText={v => setForm(p => ({ ...p, address: v }))} />
        <Text style={styles.label}>City</Text>
        <TextInput style={styles.input} value={form.city} onChangeText={v => setForm(p => ({ ...p, city: v }))} />
        <Text style={styles.label}>Country</Text>
        <TextInput style={styles.input} value={form.country} onChangeText={v => setForm(p => ({ ...p, country: v }))} />
        <TouchableOpacity onPress={saveProfile} disabled={saving} style={[styles.primaryBtn, saving && styles.dim]}>
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save changes'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Access</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>Require MFA</Text>
            <Text style={styles.rowSub}>The branch operator must confirm a second factor at sign-in.</Text>
          </View>
          <Switch value={branch.mfaRequired === true} onValueChange={toggleMfa} disabled={busy} />
        </View>
        <TouchableOpacity onPress={resetPassword} disabled={busy} style={[styles.outlineBtn, busy && styles.dim]}>
          <Ionicons name="key-outline" size={16} color={C.primary} />
          <Text style={styles.outlineText}>Reset branch password</Text>
        </TouchableOpacity>
        {branch.mustChangePassword ? (
          <Text style={styles.pendingNote}>⚠️ This branch still has a password change pending.</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Recent activity</Text>
      {events.length === 0 ? (
        <Text style={styles.muted}>No activity recorded for this branch yet.</Text>
      ) : (
        events.map(e => (
          <View key={e.id} style={styles.eventCard}>
            <Text style={styles.eventAction}>{String(e.action || e.eventType || 'Activity').replace(/_/g, ' ')}</Text>
            <Text style={styles.muted}>
              {e.createdAt ? new Date(e.createdAt).toLocaleString() : '—'}
              {e.toStatus ? ` · → ${e.toStatus}` : ''}
            </Text>
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Danger zone</Text>
      <View style={styles.card}>
        {status === 'active' ? (
          <TouchableOpacity onPress={() => changeStatus('suspended')} disabled={busy} style={[styles.warnBtn, busy && styles.dim]}>
            <Text style={styles.warnText}>Suspend branch</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => changeStatus('active')} disabled={busy} style={[styles.okBtn, busy && styles.dim]}>
            <Text style={styles.okText}>Activate branch</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={removeBranch} disabled={busy} style={[styles.dangerBtn, busy && styles.dim]}>
          <Text style={styles.dangerText}>Remove branch</Text>
        </TouchableOpacity>
        {rx.length > 0 && (
          <Text style={styles.rowSub}>
            Deleting is blocked while {rx.length} prescription(s) reference this branch — suspend it instead.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  sub: { fontSize: 13, color: '#64748b', marginTop: 2 },
  statusPill: { alignSelf: 'flex-start', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, marginTop: 8, borderWidth: 1 },
  pillOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  pillWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  statusText: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  credsBox: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, padding: 14, marginTop: 14 },
  credsLabel: { fontSize: 11, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.3 },
  credsValue: { fontSize: 20, fontWeight: '900', color: '#0c4a6e', letterSpacing: 1, marginTop: 6 },
  credsHint: { fontSize: 12, color: '#0369a1', marginTop: 6 },
  credsActions: { flexDirection: 'row', gap: 20, marginTop: 10 },
  credsBtn: { fontSize: 13, fontWeight: '800', color: '#0369a1' },
  tileRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, alignItems: 'center' },
  tileNum: { fontSize: 22, fontWeight: '800', color: C.primary },
  tileLabel: { fontSize: 11, color: '#64748b', marginTop: 3 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#0f172a' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14,
    borderWidth: 1, borderColor: C.primary, borderRadius: 8, paddingVertical: 10,
  },
  outlineText: { color: C.primary, fontWeight: '800', fontSize: 13 },
  pendingNote: { fontSize: 12, color: '#b45309', marginTop: 10, fontWeight: '600' },
  eventCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, marginBottom: 8 },
  eventAction: { fontSize: 13, fontWeight: '700', color: '#0f172a', textTransform: 'capitalize' },
  warnBtn: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  warnText: { color: '#92400e', fontWeight: '800', fontSize: 13 },
  okBtn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  okText: { color: '#166534', fontWeight: '800', fontSize: 13 },
  dangerBtn: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  dangerText: { color: '#be123c', fontWeight: '800', fontSize: 13 },
  muted: { fontSize: 13, color: '#94a3b8' },
  dim: { opacity: 0.5 },
});
