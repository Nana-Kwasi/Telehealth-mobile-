import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, TextInput, RefreshControl, ActivityIndicator, Alert, Share, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import { PageHeader, Section, Row, Pill, Empty, Button, Notice, KpiGrid, ui } from '../../components/provider/ProviderUI';

/**
 * Manage branches — the mobile twin of web PharmacyBranches.js: every branch
 * with its email, location, phone, status and password-reset state, a search,
 * and "New branch", which creates the branch's own login (it must change the
 * temporary password at first sign-in).
 */
const EMPTY = { branchName: '', email: '', contactNumber: '', country: '', city: '', address: '', tempPassword: '' };
const COUNTRIES = [['GH', 'Ghana'], ['NG', 'Nigeria'], ['KE', 'Kenya'], ['ZA', 'South Africa']];

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const locationLine = (b) => [b.area || b.street, b.city, b.country].filter(Boolean).join(', ') || b.address || '';

export default function PharmacyBranchesScreen({ profile }) {
  const navigation = useNavigation();
  const orgId = profile?.organizationId || profile?.id;
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api(`/api/v1/pharmacy-branches?pharmacyId=${orgId}`).catch(() => []);
      setBranches((Array.isArray(data) ? data : []).sort((a, b) => (a.branchName || '').localeCompare(b.branchName || '')));
    } finally { setLoading(false); setRefreshing(false); }
  }, [orgId]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? branches.filter(b => `${b.branchName} ${b.email} ${b.city} ${b.address}`.toLowerCase().includes(q)) : branches;
  }, [branches, search]);

  const create = async () => {
    const name = form.branchName.trim();
    const email = form.email.trim().toLowerCase();
    if (!name || !email) { Alert.alert('New branch', 'Branch name and email are required.'); return; }
    const password = form.tempPassword.trim() || genPassword();
    if (password.length < 8) { Alert.alert('New branch', 'The temporary password must be at least 8 characters.'); return; }
    setSaving(true);
    try {
      // 1 — the branch's own login. 2 — attach it to this pharmacy; the server
      // checks this pharmacy owns the organisation and sets the branch role.
      const reg = await api('/api/v1/auth/register', {
        method: 'POST',
        body: { email, password, fullName: name, role: 'CLIENT', ...(form.contactNumber.trim() ? { phone: form.contactNumber.trim() } : {}) },
      });
      const userId = reg?.userId || reg?.user?.uid || reg?.id;
      if (!userId) throw new Error('The login account could not be created.');
      await api('/api/v1/registrations/branches/for-user', {
        method: 'POST',
        body: {
          userId, organizationId: orgId, type: 'PHARMACY', email, branchName: name,
          country: form.country || profile?.country || null, city: form.city.trim() || null, address: form.address.trim() || null,
        },
      });
      setCreated({ name, email, password });
      setForm(null);
      load();
    } catch (e) {
      Alert.alert('Could not create branch', e?.message || 'Please check the details and try again.');
    } finally { setSaving(false); }
  };

  const shareLogin = () => {
    if (!created) return;
    Share.share({
      title: `${created.name} sign-in`,
      message: `NessaHub branch sign-in for ${created.name}\nEmail: ${created.email}\nTemporary password: ${created.password}\nYou will be asked to choose a new password the first time you sign in.`,
    }).catch(() => {});
  };

  const input = (key, label, opts = {}) => (
    <View key={key}>
      <Text style={ui.label}>{label}</Text>
      <TextInput style={ui.input} value={form[key]} onChangeText={(v) => setForm(f => ({ ...f, [key]: v }))} placeholderTextColor="#94a3b8" {...opts} />
    </View>
  );

  const active = branches.filter(b => (b.status || 'active') === 'active').length;
  const pwPending = branches.filter(b => b.mustChangePassword).length;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}>
      <PageHeader title="Manage branches" subtitle={`${branches.length} branch${branches.length === 1 ? '' : 'es'} · tap one to manage it`}
        right={!form ? <Button accent={C.primary} icon="add" label="New branch" onPress={() => { setCreated(null); setForm({ ...EMPTY, country: profile?.country || 'GH' }); }} /> : null} />

      {created ? (
        <Section title="Branch created" subtitle="Give these details to the branch. They must choose a new password at first sign-in." accent={C.primary}>
          <Row icon="storefront-outline" title={created.name} />
          <Row icon="mail-outline" title={created.email} />
          <Row icon="key-outline" title={created.password} subtitle="Temporary password — shown only now" last />
          <View style={st.actions}>
            <Button accent={C.primary} icon="share-outline" label="Share sign-in" onPress={shareLogin} style={{ flex: 1 }} />
            <Button accent={C.primary} variant="outline" label="Done" onPress={() => setCreated(null)} style={{ flex: 1 }} />
          </View>
        </Section>
      ) : null}

      {form ? (
        <Section title="New branch" subtitle="Creates the branch and its own sign-in." accent={C.primary}>
          {input('branchName', 'Branch name *', { placeholder: 'e.g. Osu Branch' })}
          {input('email', 'Branch login email *', { autoCapitalize: 'none', keyboardType: 'email-address', placeholder: 'osu@yourpharmacy.com' })}
          {input('contactNumber', 'Contact number', { keyboardType: 'phone-pad', placeholder: '+233 XX XXX XXXX' })}
          <Text style={ui.label}>Country</Text>
          <View style={st.chips}>
            {COUNTRIES.map(([code, label]) => (
              <TouchableOpacity key={code} onPress={() => setForm(f => ({ ...f, country: code }))}
                style={[st.chip, form.country === code && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[st.chipText, form.country === code && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {input('city', 'City', { placeholder: 'e.g. Accra' })}
          {input('address', 'Address', { placeholder: 'Street, area or landmark' })}
          {input('tempPassword', 'Temporary password', { autoCapitalize: 'none', placeholder: 'Leave blank to generate one' })}
          <Text style={[ui.muted, { marginTop: 8 }]}>The branch can set its map pin later from its own Location settings.</Text>
          <View style={st.actions}>
            <Button accent={C.primary} label={saving ? 'Creating…' : 'Create branch'} onPress={create} disabled={saving} style={{ flex: 1 }} />
            <Button accent={C.primary} variant="outline" label="Cancel" onPress={() => setForm(null)} style={{ flex: 1 }} />
          </View>
        </Section>
      ) : null}

      {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} /> : (
        <>
          {branches.length ? (
            <KpiGrid items={[
              { label: 'Active', value: active, icon: 'checkmark-circle-outline', color: '#15803d', bg: '#dcfce7' },
              { label: 'Password change pending', value: pwPending, icon: 'key-outline', color: pwPending ? '#b45309' : '#64748b', bg: '#fef3c7' },
            ]} />
          ) : null}
          {branches.length > 3 ? (
            <TextInput style={ui.input} value={search} onChangeText={setSearch} placeholder="Search branches" placeholderTextColor="#94a3b8" />
          ) : null}
          {branches.length === 0 && !form ? (
            <Section><Empty icon="storefront-outline" text="No branches yet. Add one so doctors can route prescriptions to it." actionLabel="+ New branch" accent={C.primary} onAction={() => setForm({ ...EMPTY, country: profile?.country || 'GH' })} /></Section>
          ) : null}
          {shown.length ? (
            <Section accent={C.primary}>
              {shown.map((b, i) => {
                const on = (b.status || 'active') === 'active';
                return (
                  <Row key={b.id} title={b.branchName || b.name || 'Branch'}
                    subtitle={[b.email, locationLine(b), b.contactNumber || b.phone].filter(Boolean).join(' · ') || 'No contact details yet'}
                    right={(
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Pill label={b.status || 'active'} color={on ? '#15803d' : '#b91c1c'} bg={on ? '#dcfce7' : '#fee2e2'} />
                        {b.mustChangePassword ? <Pill label="Pw reset" color="#92400e" bg="#fef3c7" /> : null}
                      </View>
                    )}
                    onPress={() => navigation.navigate('PharmacyBranchDetail', { branchId: b.id })}
                    last={i === shown.length - 1} />
                );
              })}
            </Section>
          ) : null}
          {branches.length && !shown.length ? <Notice text="No branches match that search." /> : null}
        </>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
});
