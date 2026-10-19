import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, Alert, Share, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { api } from '../../services/apiClient';
import { performLogout, wipeLocalData } from '../../services/authService';
import { PharmacyColors as C } from '../../constants/colors';
import { InsuranceNetworksMobile } from '../../components/InsuranceMobile';
import SecuritySettingsSection from '../../components/SecuritySettingsSection';
import { ChangePasswordCard } from '../../components/AccountSecurityExtras';
import { PageHeader, Section, Tabs, KpiGrid, KeyValue, Row, Button, Notice, Pill, ui, toMillis, formatWhen } from '../../components/provider/ProviderUI';

/**
 * Pharmacy Settings on mobile — the same six sections as web PharmacySettings.js:
 * Overview, Preferences, Business, Insurance, Security, Data & session.
 * A branch login gets the same screen without Business (its address lives in
 * Location settings) and saves its transfer window on the branch itself.
 */
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'business', label: 'Business' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'security', label: 'Security' },
  { id: 'data', label: 'Data & session' },
];
const COUNTRIES = [['GH', 'Ghana'], ['NG', 'Nigeria'], ['KE', 'Kenya'], ['ZA', 'South Africa'], ['GB', 'United Kingdom'], ['US', 'United States']];
const deviceTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

export default function PharmacySettingsScreen({ profile, isBranch = false, locationRoute }) {
  const navigation = useNavigation();
  const orgId = profile?.organizationId || profile?.id;
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState(null);
  const [me, setMe] = useState(null);
  const [stats, setStats] = useState({ branches: 0, active: 0, suspended: 0, rx: 0 });
  const [biz, setBiz] = useState({});
  const [ttl, setTtl] = useState(String(profile?.transferApprovalTtlHours || 6));
  const [saving, setSaving] = useState(null);
  const [email, setEmail] = useState({ next: '', password: '' });
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      const [o, account, branches, rx] = await Promise.all([
        isBranch ? api(`/api/v1/pharmacy-branches/${profile?.id}`).catch(() => null) : api(`/api/v1/registrations/organizations/${orgId}`).catch(() => null),
        api('/api/v1/auth/me').catch(() => null),
        isBranch ? Promise.resolve([]) : api(`/api/v1/pharmacy-branches?pharmacyId=${orgId}`).catch(() => []),
        api(isBranch ? `/api/v1/medical/prescriptions/branch/${profile?.id}` : `/api/v1/medical/prescriptions/pharmacy/${orgId}`).catch(() => []),
      ]);
      setOrg(o);
      setMe(account);
      const br = Array.isArray(branches) ? branches : [];
      setStats({
        branches: br.length,
        active: br.filter(b => (b.status || 'active') === 'active').length,
        suspended: br.filter(b => b.status === 'suspended').length,
        rx: Array.isArray(rx) ? rx.length : 0,
      });
      if (o) {
        setBiz({
          name: o.name || profile?.pharmacyName || '', registrationNumber: o.registrationNumber || '', contactPhone: o.contactPhone || '',
          country: o.country || 'GH', city: o.city || '', area: o.area || '', region: o.region || '', street: o.street || '',
          address: o.address || '', ghanaDigitalAddress: o.ghanaDigitalAddress || '', licenseNote: o.licenseNote || '',
        });
        if (o.transferApprovalTtlHours) setTtl(String(o.transferApprovalTtlHours));
      }
    } finally { setLoading(false); }
  }, [orgId, isBranch, profile?.id, profile?.pharmacyName]);
  useEffect(() => { load(); }, [load]);

  // Keep the stored timezone matched to the device, as the web screen does.
  useEffect(() => {
    if (isBranch || !org || org.timezone === deviceTimezone()) return;
    api(`/api/v1/registrations/organizations/${orgId}`, { method: 'PATCH', body: { timezone: deviceTimezone() } })
      .then(setOrg).catch(() => {});
  }, [org, orgId, isBranch]);

  useEffect(() => {
    if (tab !== 'preferences') return undefined;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [tab]);

  // No clipboard module in this app: the share sheet offers Copy, and every
  // value is also selectable with a long press.
  const copy = (label, value) => {
    if (!value) return;
    Share.share({ title: label, message: String(value) }).catch(() => {});
  };

  const saveOrg = async (body, ok, key) => {
    setSaving(key);
    try {
      const saved = await api(`/api/v1/registrations/organizations/${orgId}`, { method: 'PATCH', body });
      setOrg(saved);
      Alert.alert('Saved', ok);
    } catch (e) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally { setSaving(null); }
  };

  const saveTtl = async () => {
    const hours = Math.max(1, Math.min(72, parseInt(ttl, 10) || 6));
    setTtl(String(hours));
    const msg = `Patients now have ${hours} hour${hours === 1 ? '' : 's'} to approve a drug transfer.`;
    if (!isBranch) { saveOrg({ transferApprovalTtlHours: hours }, msg, 'ttl'); return; }
    setSaving('ttl');
    try {
      await api(`/api/v1/pharmacy-branches/${profile?.id}`, { method: 'PATCH', body: { transferApprovalTtlHours: hours } });
      Alert.alert('Saved', msg);
    } catch { Alert.alert('Could not save', 'Please try again.'); } finally { setSaving(null); }
  };

  const saveBusiness = () => {
    if (!biz.name?.trim()) { Alert.alert('Business profile', 'Pharmacy name is required.'); return; }
    saveOrg(Object.fromEntries(Object.entries(biz).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])), 'Business profile saved.', 'biz');
  };

  const changeEmail = async () => {
    const next = email.next.trim().toLowerCase();
    if (!next || next === (me?.email || '').toLowerCase()) { Alert.alert('Login email', 'Enter a new email address.'); return; }
    if (!email.password) { Alert.alert('Login email', 'Enter your current password to confirm.'); return; }
    setSaving('email');
    try {
      await api('/api/v1/auth/email-change', { method: 'POST', body: { userId: profile?.id, newEmail: next, currentPassword: email.password } });
      setEmail({ next: '', password: '' });
      Alert.alert('Login email updated', `Sign in with ${next} from now on.`);
      load();
    } catch (e) {
      Alert.alert('Could not update email', e?.message || 'Check your password and try again.');
    } finally { setSaving(null); }
  };

  const resendVerification = async () => {
    setSaving('verify');
    try {
      await api('/api/v1/auth/verify-email/resend', { method: 'POST' });
      Alert.alert('Email sent', 'Check your inbox for the confirmation link.');
    } catch { Alert.alert('Could not send', 'Please try again later.'); } finally { setSaving(null); }
  };

  const exportProfile = () => {
    const safe = {
      exportedAt: new Date().toISOString(), pharmacyId: orgId, name: org?.name || org?.branchName, registrationNumber: org?.registrationNumber,
      email: me?.email, phone: org?.contactPhone, address: org?.address, country: org?.country, city: org?.city, timezone: org?.timezone,
    };
    Share.share({ title: 'NessaHub pharmacy profile', message: JSON.stringify(safe, null, 2) }).catch(() => {});
  };

  const signOut = () => {
    Alert.alert('Sign out', 'End this session on this phone?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => {
        try { await performLogout(); } catch (_) {}
        await wipeLocalData();
        navigation.getParent()?.replace('Intent');
      } },
    ]);
  };

  const field = (key, label, opts = {}) => (
    <View key={key}>
      <Text style={ui.label}>{label}</Text>
      <TextInput style={[ui.input, opts.multiline && { minHeight: 80, textAlignVertical: 'top' }]} value={biz[key] ?? ''}
        onChangeText={(v) => setBiz(b => ({ ...b, [key]: v }))} placeholderTextColor="#94a3b8" {...opts} />
    </View>
  );

  const tabs = isBranch ? TABS.filter(t => t.id !== 'business') : TABS;
  const verified = me?.emailVerified !== false;

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled">
      <PageHeader title="Settings" subtitle="Account, preferences, security and workspace shortcuts" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} accent={C.primary} />

      {loading ? <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} /> : null}

      {!loading && tab === 'overview' && (
        <>
          <Section title="Jump to" accent={C.primary}>
            <View style={st.chips}>
              {[['Dashboard', isBranch ? 'BranchHome' : 'PharmacyHome'], !isBranch && ['Branches', 'PharmacyBranches'],
                ['Prescriptions', isBranch ? 'BranchPrescriptions' : 'PharmacyPrescriptions'], ['Reports', isBranch ? 'BranchReports' : 'PharmacyReports']]
                .filter(Boolean).map(([l, r]) => (
                  <TouchableOpacity key={r} style={[st.chip, { borderColor: C.primary }]} onPress={() => navigation.navigate(r)}>
                    <Text style={[st.chipText, { color: C.primary }]}>{l}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </Section>
          <KpiGrid items={[
            ...(isBranch ? [] : [{ label: 'Branches', value: stats.branches, hint: `${stats.active} active · ${stats.suspended} suspended`, icon: 'storefront-outline', color: '#0369a1', bg: '#e0f2fe', onPress: () => navigation.navigate('PharmacyBranches') }]),
            { label: 'Routed prescriptions', value: stats.rx, hint: isBranch ? 'This branch' : 'All branches', icon: 'medical-outline', color: '#7c3aed', bg: '#f3e8ff' },
            { label: 'Password reset required', value: profile?.mustChangePassword ? 'Yes' : 'No', icon: 'key-outline', color: profile?.mustChangePassword ? '#b45309' : '#15803d', bg: '#f8fafc' },
          ]} />
          <Section title="Account identifiers" subtitle="Use these when contacting support. They do not grant access by themselves." accent={C.primary}>
            <KeyValue label={isBranch ? 'Branch ID' : 'Pharmacy ID'} value={isBranch ? profile?.id : orgId} mono right={<Button accent={C.primary} variant="outline" label="Copy" onPress={() => copy('ID', isBranch ? profile?.id : orgId)} style={st.mini} />} />
            <KeyValue label="User ID" value={profile?.id} mono right={<Button accent={C.primary} variant="outline" label="Copy" onPress={() => copy('User ID', profile?.id)} style={st.mini} />} />
            <KeyValue label="Username" value={profile?.username} mono />
            <KeyValue label="Login email" value={me?.email || profile?.email} />
            <KeyValue label="Email verified" value={verified ? 'Verified' : 'Not verified'} right={<Pill label={verified ? 'Verified' : 'Not verified'} color={verified ? '#166534' : '#92400e'} bg={verified ? '#dcfce7' : '#fef3c7'} />} />
            <KeyValue label="Account status" value={profile?.status || org?.status || '—'} />
            <KeyValue label="Registered" value={formatWhen(toMillis(org?.createdAt || me?.createdAt))} />
            {!verified ? (
              <Button accent={C.primary} variant="outline" label={saving === 'verify' ? 'Sending…' : 'Send verification email'} onPress={resendVerification} disabled={saving === 'verify'} style={{ marginTop: 12 }} />
            ) : null}
          </Section>
        </>
      )}

      {!loading && tab === 'preferences' && (
        <>
          <Section title="Regional & display" subtitle="Your timezone comes from this phone's settings and is saved to your profile automatically." accent={C.primary}>
            <KeyValue label="Device timezone" value={deviceTimezone()} mono right={<Button accent={C.primary} variant="outline" label="Copy" onPress={() => copy('Timezone', deviceTimezone())} style={st.mini} />} />
            {!isBranch ? <KeyValue label="Stored on account" value={org?.timezone} mono /> : null}
            <KeyValue label="Local date & time" value={now.toLocaleString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })} />
            {!isBranch ? (
              <Button accent={C.primary} variant="outline" label="Refresh timezone from this phone" style={{ marginTop: 12 }}
                onPress={() => saveOrg({ timezone: deviceTimezone() }, 'Timezone refreshed from this phone.', 'tz')} disabled={saving === 'tz'} />
            ) : null}
          </Section>
          <Section title="Transfer approval window" subtitle="When a medicine moves to another branch, the patient must approve it. This is how long they have (1–72 hours)." accent={C.primary}>
            <View style={st.inline}>
              <TextInput style={[ui.input, { width: 90 }]} value={ttl} onChangeText={setTtl} keyboardType="number-pad" placeholder="6" placeholderTextColor="#94a3b8" />
              <Text style={ui.muted}>hours</Text>
              <View style={{ flex: 1 }} />
              <Button accent={C.primary} label={saving === 'ttl' ? 'Saving…' : 'Save'} onPress={saveTtl} disabled={saving === 'ttl'} />
            </View>
          </Section>
          {locationRoute ? (
            <Section accent={C.primary}>
              <Row icon="location-outline" iconColor={C.primary} title="Location settings" subtitle="The address and map pin patients and doctors see." onPress={() => navigation.navigate(locationRoute)} last />
            </Section>
          ) : null}
        </>
      )}

      {!loading && tab === 'business' && !isBranch && (
        <Section title="Business profile" subtitle="Shown on records and used for prescription routing." accent={C.primary}>
          {field('name', 'Pharmacy name *')}
          {field('registrationNumber', 'Business registration')}
          {field('contactPhone', 'Phone', { keyboardType: 'phone-pad' })}
          <Text style={ui.label}>Country</Text>
          <View style={st.chips}>
            {COUNTRIES.map(([code, label]) => (
              <TouchableOpacity key={code} onPress={() => setBiz(b => ({ ...b, country: code }))}
                style={[st.chip, biz.country === code && { backgroundColor: C.primary, borderColor: C.primary }]}>
                <Text style={[st.chipText, biz.country === code && { color: '#fff' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {field('address', 'Address')}
          {field('city', 'City')}
          {field('area', 'Area / locality')}
          {field('region', 'Region / state')}
          {field('street', 'Street')}
          {field('ghanaDigitalAddress', 'Ghana digital address (optional)', { autoCapitalize: 'characters', placeholder: 'e.g. GA-123-4567' })}
          {field('licenseNote', 'Licence / regulatory notes', { multiline: true })}
          {locationRoute ? (
            <Row icon="navigate-outline" iconColor={C.primary} title="Set map pin and GPS" subtitle="Use your current location" onPress={() => navigation.navigate(locationRoute)} last />
          ) : null}
          <Button accent={C.primary} label={saving === 'biz' ? 'Saving…' : 'Save business profile'} onPress={saveBusiness} disabled={saving === 'biz'} style={{ marginTop: 14 }} />
        </Section>
      )}

      {!loading && tab === 'insurance' && <InsuranceNetworksMobile accent={C.primary} />}

      {!loading && tab === 'security' && (
        <>
          <SecuritySettingsSection accent={C.primary} />
          <Section title="Login email" subtitle="Changes the email you use to sign in. Requires your current password." accent={C.primary}>
            <Text style={ui.label}>New login email</Text>
            <TextInput style={ui.input} value={email.next} onChangeText={(v) => setEmail(e => ({ ...e, next: v }))} autoCapitalize="none" keyboardType="email-address" placeholder={me?.email || 'name@pharmacy.com'} placeholderTextColor="#94a3b8" />
            <Text style={ui.label}>Current password</Text>
            <TextInput style={ui.input} value={email.password} onChangeText={(v) => setEmail(e => ({ ...e, password: v }))} secureTextEntry autoCapitalize="none" placeholderTextColor="#94a3b8" />
            <Button accent={C.primary} variant="outline" label={saving === 'email' ? 'Updating…' : 'Update login email'} onPress={changeEmail} disabled={saving === 'email'} style={{ marginTop: 12 }} />
          </Section>
          <ChangePasswordCard accent={C.primary} />
        </>
      )}

      {!loading && tab === 'data' && (
        <Section title="Data & session" subtitle="Share non-sensitive profile fields, or end this session on this phone." accent={C.primary}>
          <Notice text="The export has your pharmacy's public details only — no patient data." />
          <View style={[st.inline, { marginTop: 12 }]}>
            <Button accent={C.primary} variant="outline" icon="share-outline" label="Export profile" onPress={exportProfile} style={{ flex: 1 }} />
            <Button accent={C.primary} variant="danger" icon="log-out-outline" label="Sign out" onPress={signOut} style={{ flex: 1 }} />
          </View>
        </Section>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mini: { paddingVertical: 5, paddingHorizontal: 10 },
});
