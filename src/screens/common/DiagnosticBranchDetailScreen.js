import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Switch, Alert,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { normalizeDiagnosticOrderStatus } from '../../utils/diagnosticOrderStatus';

/**
 * Mobile counterpart of the web ParentBranchDetail screen for lab / scan centres:
 * the parent's admin view of one branch — profile edit, order volume, MFA,
 * one-time password reset, enable/disable and delete.
 *
 * Mirrors PharmacyBranchDetailScreen; the pharmacy one counts prescriptions where
 * this counts diagnostic orders.
 */
export default function DiagnosticBranchDetailScreen({ profile, type = 'lab', accent = '#1e6bb8' }) {
  const route = useRoute();
  const navigation = useNavigation();
  const branchId = route.params?.branchId;
  const path = type === 'lab' ? 'lab-branches' : 'scan-branches';

  const [branch, setBranch] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState(null);
  const [form, setForm] = useState({ name: '', address: '', city: '', country: '' });

  const load = useCallback(async () => {
    if (!branchId) { setLoading(false); return; }
    try {
      const b = await api(`/api/v1/${path}/${branchId}`).catch(() => null);
      if (b) {
        setBranch(b);
        setForm({
          name: b.branchName || '',
          address: b.address || '',
          city: b.city || '',
          country: b.country || '',
        });
      }
      const list = await api(`/api/v1/diagnostics/operations/orders?branchId=${branchId}`).catch(() => []);
      setOrders((list || []).filter(o => !o.centerType || o.centerType === type));
    } finally {
      setLoading(false);
    }
  }, [branchId, path, type]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const patch = async (body, okMsg) => {
    setBusy(true);
    try {
      await api(`/api/v1/${path}/${branchId}`, { method: 'PATCH', body });
      await load();
      if (okMsg) Alert.alert('Saved', okMsg);
    } catch {
      Alert.alert('Error', 'Could not apply that change.');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    if (!form.name.trim()) { Alert.alert('Name required', 'The branch needs a name.'); return; }
    setSaving(true);
    try {
      await api(`/api/v1/${path}/${branchId}`, {
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
      next === 'active' ? 'Enable branch' : 'Disable branch',
      next === 'active'
        ? 'This branch will receive new orders again.'
        : 'A disabled branch can no longer be routed new orders.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => patch({ status: next }, `Branch ${next === 'active' ? 'enabled' : 'disabled'}.`) },
      ],
    );
  };

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
              if (!pw) { Alert.alert('Error', 'Could not generate a password.'); return; }
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
    if (orders.length > 0) {
      Alert.alert('Cannot delete', `${orders.length} order(s) are linked to this branch. Disable it instead.`);
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
            await api(`/api/v1/${path}/${branchId}`, { method: 'DELETE' });
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

  if (loading) return <View style={styles.centered}><ActivityIndicator color={accent} size="large" /></View>;
  if (!branch) return <View style={styles.centered}><Text style={styles.muted}>Branch not found.</Text></View>;

  const status = branch.status || 'active';
  const completed = orders.filter(o => normalizeDiagnosticOrderStatus(o.status) === 'COMPLETED').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>{branch.branchName || 'Branch'}</Text>
      <Text style={styles.sub}>{branch.email || 'No login email'}</Text>
      <View style={[styles.pill, status === 'active' ? styles.pillOk : styles.pillWarn]}>
        <Text style={[styles.pillText, { color: status === 'active' ? '#166534' : '#92400e' }]}>{status}</Text>
      </View>

      {tempPassword && (
        <View style={styles.credsBox}>
          <Text style={styles.credsLabel}>One-time password — shown once</Text>
          <Text style={styles.credsValue}>{tempPassword}</Text>
          <Text style={styles.credsHint}>Write this down now — it is not retrievable once dismissed.</Text>
          <TouchableOpacity onPress={() => setTempPassword(null)}>
            <Text style={styles.credsBtn}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.tileRow}>
        <View style={styles.tile}><Text style={[styles.tileNum, { color: accent }]}>{orders.length}</Text><Text style={styles.tileLabel}>orders</Text></View>
        <View style={styles.tile}><Text style={[styles.tileNum, { color: accent }]}>{completed}</Text><Text style={styles.tileLabel}>completed</Text></View>
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
        <TouchableOpacity onPress={saveProfile} disabled={saving} style={[styles.primaryBtn, { backgroundColor: accent }, saving && styles.dim]}>
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
          <Switch value={branch.mfaRequired === true} onValueChange={v => patch({ mfaRequired: v }, `MFA ${v ? 'enabled' : 'disabled'}.`)} disabled={busy} />
        </View>
        <TouchableOpacity onPress={resetPassword} disabled={busy} style={[styles.outlineBtn, { borderColor: accent }, busy && styles.dim]}>
          <Ionicons name="key-outline" size={16} color={accent} />
          <Text style={[styles.outlineText, { color: accent }]}>Reset branch password</Text>
        </TouchableOpacity>
        {branch.mustChangePassword ? (
          <Text style={styles.pendingNote}>⚠️ This branch still has a password change pending.</Text>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Danger zone</Text>
      <View style={styles.card}>
        {status === 'active' ? (
          <TouchableOpacity onPress={() => changeStatus('suspended')} disabled={busy} style={[styles.warnBtn, busy && styles.dim]}>
            <Text style={styles.warnText}>Disable branch</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => changeStatus('active')} disabled={busy} style={[styles.okBtn, busy && styles.dim]}>
            <Text style={styles.okText}>Enable branch</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={removeBranch} disabled={busy} style={[styles.dangerBtn, busy && styles.dim]}>
          <Text style={styles.dangerText}>Remove branch</Text>
        </TouchableOpacity>
        {orders.length > 0 && (
          <Text style={styles.rowSub}>
            Deleting is blocked while {orders.length} order(s) reference this branch — disable it instead.
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
  pill: { alignSelf: 'flex-start', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, marginTop: 8, borderWidth: 1 },
  pillOk: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  pillWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  pillText: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  credsBox: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, padding: 14, marginTop: 14 },
  credsLabel: { fontSize: 11, fontWeight: '800', color: '#0369a1', textTransform: 'uppercase' },
  credsValue: { fontSize: 20, fontWeight: '900', color: '#0c4a6e', letterSpacing: 1, marginTop: 6 },
  credsHint: { fontSize: 12, color: '#0369a1', marginTop: 6 },
  credsBtn: { fontSize: 13, fontWeight: '800', color: '#64748b', marginTop: 10 },
  tileRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  tile: { flex: 1, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, alignItems: 'center' },
  tileNum: { fontSize: 22, fontWeight: '800' },
  tileLabel: { fontSize: 11, color: '#64748b', marginTop: 3 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 14 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginTop: 10, marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#0f172a' },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  primaryBtn: { borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 16 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  outlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, borderWidth: 1, borderRadius: 8, paddingVertical: 10 },
  outlineText: { fontWeight: '800', fontSize: 13 },
  pendingNote: { fontSize: 12, color: '#b45309', marginTop: 10, fontWeight: '600' },
  warnBtn: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  warnText: { color: '#92400e', fontWeight: '800', fontSize: 13 },
  okBtn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  okText: { color: '#166534', fontWeight: '800', fontSize: 13 },
  dangerBtn: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3', borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  dangerText: { color: '#be123c', fontWeight: '800', fontSize: 13 },
  muted: { fontSize: 13, color: '#94a3b8' },
  dim: { opacity: 0.5 },
});
