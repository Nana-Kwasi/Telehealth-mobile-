import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch, Alert, ActivityIndicator, Share,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';
import { performLogout, wipeLocalData } from '../../services/authService';
import { ChangePasswordCard } from '../../components/AccountSecurityExtras';
import { InsuranceNetworksMobile } from '../../components/InsuranceMobile';

/**
 * Lab / scan Settings on mobile — same sections as web Diagnostic/DiagSettings:
 * Overview · Profile · Operations · Security · Session. Saved through
 * /diagnostics/operations/settings (parent centre or branch, decided server-side).
 *
 * Per-branch MFA stays on the parent's Branch detail screen.
 */
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const DEFAULT_HOURS = Object.fromEntries(DAYS.map(([k]) => [k, k === 'sun' ? { closed: true, open: '08:00', close: '14:00' } : { closed: false, open: k === 'sat' ? '08:00' : '07:00', close: k === 'sat' ? '14:00' : '18:00' }]));
const SERVICES = {
  lab: ['Haematology', 'Clinical chemistry', 'Microbiology', 'Serology / immunology', 'Parasitology', 'Urinalysis', 'Histopathology', 'Molecular / PCR', 'Blood bank'],
  scan: ['X-ray', 'Ultrasound', 'CT', 'MRI', 'Mammography', 'Echocardiography', 'Doppler', 'Fluoroscopy', 'Bone densitometry (DEXA)'],
};
const PAYMENTS = ['Cash', 'Mobile money', 'Card', 'NHIS', 'Private insurance', 'Corporate account'];
const SECTIONS = [['overview', 'Overview'], ['profile', 'Profile'], ['operations', 'Operations'], ['insurance', 'Insurance'], ['security', 'Security'], ['session', 'Session']];
const statusLabel = (s) => ({ APPROVED: 'Active', REJECTED: 'Suspended', PENDING: 'Pending review', PENDING_REVIEW: 'Pending review' }[String(s || '').toUpperCase()] || s || '—');

// Module-level so inputs keep focus while typing (an inline component remounts each render).
function Field({ label, value, onChange, disabled, ...rest }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, disabled && { backgroundColor: '#f1f5f9', color: '#64748b' }]} value={value} editable={!disabled} onChangeText={onChange} placeholderTextColor="#94a3b8" {...rest} />
    </View>
  );
}
function Chip({ on, label, onPress, accent }) {
  return <TouchableOpacity onPress={onPress} style={[s.chip, on && { backgroundColor: accent, borderColor: accent }]}><Text style={[s.chipText, on && { color: '#fff' }]}>{on ? '✓ ' : ''}{label}</Text></TouchableOpacity>;
}
function ToggleRow({ label, sub, value, onChange }) {
  return <View style={s.row}><View style={{ flex: 1, paddingRight: 12 }}><Text style={s.rowTitle}>{label}</Text>{sub ? <Text style={s.rowSub}>{sub}</Text> : null}</View><Switch value={value} onValueChange={onChange} /></View>;
}
function KV({ k, v }) {
  return <View style={s.kv}><Text style={s.kvK}>{k}</Text><Text style={s.kvV} selectable>{v || '—'}</Text></View>;
}

export default function DiagnosticSettingsScreen({ profile, type = 'lab', isBranch = false, locationRoute, accent = '#1e6bb8' }) {
  const navigation = useNavigation();
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(null);
  const [prof, setProf] = useState({});
  const [ops, setOps] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('/api/v1/diagnostics/operations/settings');
      setData(d);
      const p = d.profile || {};
      setProf({ name: p.name || '', registrationNumber: p.registrationNumber || '', contactPhone: p.contactPhone || '', contactEmail: p.contactEmail || '', address: p.address || '', city: p.city || '', country: p.country || '' });
      const s = d.settings || {};
      setOps({
        hours: s.hours || DEFAULT_HOURS, open24h: !!s.open24h, emergency: !!s.emergency, walkIns: s.walkIns !== false, appointmentsOnly: !!s.appointmentsOnly,
        homeCollection: !!s.homeCollection, homeCollectionFee: s.homeCollectionFee != null ? String(s.homeCollectionFee) : '', services: s.services || [], payments: s.payments || ['Cash', 'Mobile money'],
        criticalName: s.criticalName || '', criticalPhone: s.criticalPhone || '', resultsEmail: s.resultsEmail || '', patientNote: s.patientNote || '',
        phone: s.phone || '', licenceNo: s.licenceNo || '', licenceExpiry: s.licenceExpiry || '', accreditation: s.accreditation || '', director: s.director || '', directorRegNo: s.directorRegNo || '',
      });
    } catch (e) { Alert.alert('Settings', e?.message || 'Could not load settings.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async (body) => {
    setSaving(true);
    try { setData(await api('/api/v1/diagnostics/operations/settings', { method: 'PUT', body })); Alert.alert('Saved', 'Your settings are up to date.'); }
    catch (e) { Alert.alert('Error', e?.message || 'Could not save.'); }
    finally { setSaving(false); }
  };
  const saveProfile = () => {
    if (!isBranch && !prof.name.trim()) { Alert.alert('Name required', 'The centre needs a name.'); return; }
    save({
      profile: isBranch ? { address: prof.address, city: prof.city, country: prof.country } : prof,
      settings: { phone: ops.phone, licenceNo: ops.licenceNo, licenceExpiry: ops.licenceExpiry, accreditation: ops.accreditation, director: ops.director, directorRegNo: ops.directorRegNo },
    });
  };
  const saveOps = () => {
    const { hours, open24h, emergency, walkIns, appointmentsOnly, homeCollection, homeCollectionFee, services, payments, criticalName, criticalPhone, resultsEmail, patientNote } = ops;
    save({ settings: { hours, open24h, emergency, walkIns, appointmentsOnly, homeCollection, homeCollectionFee, services, payments, criticalName, criticalPhone, resultsEmail, patientNote } });
  };
  const toggleIn = (key, v) => setOps(o => ({ ...o, [key]: o[key].includes(v) ? o[key].filter(x => x !== v) : [...o[key], v] }));
  const setDay = (k, patch) => setOps(o => ({ ...o, hours: { ...o.hours, [k]: { ...o.hours[k], ...patch } } }));
  const logout = () => Alert.alert('Log out', 'Are you sure you want to log out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log out', style: 'destructive', onPress: async () => { try { await performLogout(); } catch (_) {} await wipeLocalData(); navigation.getParent()?.replace('Intent'); } },
  ]);
  const resetLink = async () => {
    try { await api('/api/v1/auth/password-reset', { method: 'POST', authenticated: false, body: { email: profile?.email } }); Alert.alert('Sent', `Reset link sent to ${profile?.email}.`); }
    catch { Alert.alert('Error', 'Could not send the reset email.'); }
  };

  if (loading) return <View style={s.centered}><ActivityIndicator color={accent} size="large" /></View>;
  const p = data?.profile || {};
  const st = data?.stats || {};
  const parentOps = data?.parentSettings || {};
  const kind = type === 'lab' ? 'Lab' : 'Scan centre';

  return (
    <View style={s.container}>
      <View style={s.tabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
          {SECTIONS.map(([k, label]) => (
            <TouchableOpacity key={k} onPress={() => setSection(k)} style={[s.tab, section === k && { backgroundColor: accent, borderColor: accent }]}>
              <Text style={[s.tabText, section === k && { color: '#fff' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {section === 'overview' && (
          <>
            <View style={s.statRow}>
              {!isBranch && <View style={s.stat}><Text style={[s.statN, { color: accent }]}>{st.branches ?? 0}</Text><Text style={s.statL}>Branches</Text><Text style={s.statH}>{st.branchesActive ?? 0} active</Text></View>}
              <View style={s.stat}><Text style={[s.statN, { color: accent }]}>{st.openOrders ?? 0}</Text><Text style={s.statL}>Open orders</Text><Text style={s.statH}>{st.completed30d ?? 0} done in 30d</Text></View>
              <View style={s.stat}><Text style={[s.statN, { color: accent }]}>{st.catalogItems ?? 0}</Text><Text style={s.statL}>In catalog</Text><Text style={s.statH}>{type === 'lab' ? 'Tests' : 'Scans'}</Text></View>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Account identifiers</Text>
              <Text style={s.rowSub}>Use these when contacting support.</Text>
              <KV k={isBranch ? 'Branch ID' : `${kind} ID`} v={data?.ownerId} />
              {isBranch ? <KV k={`Parent ${type === 'lab' ? 'lab' : 'centre'}`} v={p.parentName} /> : null}
              <KV k="Name" v={p.name} />
              <KV k="Login email" v={profile?.email} />
              <KV k="Account status" v={statusLabel(p.status)} />
              <KV k="Facility licence" v={(ops.licenceNo || parentOps.licenceNo) ? `${ops.licenceNo || parentOps.licenceNo}${(ops.licenceExpiry || parentOps.licenceExpiry) ? ` · expires ${ops.licenceExpiry || parentOps.licenceExpiry}` : ''}` : 'Not recorded'} />
              <KV k="Password change required" v={profile?.mustChangePassword ? 'Yes' : 'No'} />
            </View>
          </>
        )}

        {section === 'profile' && (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>{isBranch ? 'Branch profile' : 'Business profile'}</Text>
              {isBranch ? <Text style={s.rowSub}>Name, status and login email are managed by your parent centre.</Text> : null}
              <Field label={isBranch ? 'Branch name' : `${kind} name *`} value={prof.name} disabled={isBranch} onChange={v => setProf({ ...prof, name: v })} />
              {!isBranch && <Field label="Business registration no." value={prof.registrationNumber} onChange={v => setProf({ ...prof, registrationNumber: v })} />}
              {!isBranch && <Field label="Main phone" value={prof.contactPhone} keyboardType="phone-pad" onChange={v => setProf({ ...prof, contactPhone: v })} />}
              {!isBranch && <Field label="Contact email" value={prof.contactEmail} keyboardType="email-address" autoCapitalize="none" onChange={v => setProf({ ...prof, contactEmail: v })} />}
              {isBranch && <Field label="Branch phone" value={ops.phone} keyboardType="phone-pad" onChange={v => setOps({ ...ops, phone: v })} />}
              <Field label="Address" value={prof.address} onChange={v => setProf({ ...prof, address: v })} />
              <Field label="City" value={prof.city} onChange={v => setProf({ ...prof, city: v })} />
              <Field label="Country" value={prof.country} onChange={v => setProf({ ...prof, country: v })} />
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Licence & accreditation</Text>
              <Field label="Facility licence no. (e.g. HeFRA)" value={ops.licenceNo} placeholder={isBranch && parentOps.licenceNo ? `Parent: ${parentOps.licenceNo}` : ''} onChange={v => setOps({ ...ops, licenceNo: v })} />
              <Field label="Licence expiry (YYYY-MM-DD)" value={ops.licenceExpiry} onChange={v => setOps({ ...ops, licenceExpiry: v })} />
              <Field label="Accreditation" value={ops.accreditation} placeholder={type === 'lab' ? 'e.g. ISO 15189, SLIPTA' : 'e.g. NRA permit'} onChange={v => setOps({ ...ops, accreditation: v })} />
              <Field label={type === 'lab' ? 'Lab manager / scientist in charge' : 'Lead radiologist'} value={ops.director} onChange={v => setOps({ ...ops, director: v })} />
              <Field label="Professional reg. no." value={ops.directorRegNo} onChange={v => setOps({ ...ops, directorRegNo: v })} />
            </View>
            <TouchableOpacity onPress={saveProfile} disabled={saving} style={[s.primaryBtn, { backgroundColor: accent }, saving && s.dim]}><Text style={s.primaryText}>{saving ? 'Saving…' : 'Save profile'}</Text></TouchableOpacity>
            {locationRoute ? (
              <TouchableOpacity style={[s.card, s.linkRow]} onPress={() => navigation.navigate(locationRoute)}>
                <Ionicons name="location-outline" size={18} color={accent} />
                <View style={{ flex: 1 }}><Text style={s.rowTitle}>Map location</Text><Text style={s.rowSub}>Pin the exact spot patients and doctors see.</Text></View>
                <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
              </TouchableOpacity>
            ) : null}
          </>
        )}

        {section === 'operations' && (
          <>
            <View style={s.card}>
              <Text style={s.cardTitle}>Opening hours</Text>
              <ToggleRow label="Open 24 hours, 7 days" value={ops.open24h} onChange={v => setOps({ ...ops, open24h: v })} />
              {!ops.open24h && DAYS.map(([k, label]) => {
                const d = ops.hours?.[k] || DEFAULT_HOURS[k];
                return (
                  <View key={k} style={s.dayRow}>
                    <Text style={[s.rowTitle, { width: 44 }]}>{label}</Text>
                    <Switch value={!d.closed} onValueChange={v => setDay(k, { closed: !v })} />
                    {d.closed ? <Text style={[s.rowSub, { marginTop: 0, marginLeft: 8 }]}>Closed</Text> : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8, flex: 1 }}>
                        <TextInput style={[s.input, s.time]} value={d.open} onChangeText={v => setDay(k, { open: v })} placeholder="07:00" />
                        <Text>–</Text>
                        <TextInput style={[s.input, s.time]} value={d.close} onChangeText={v => setDay(k, { close: v })} placeholder="18:00" />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Services</Text>
              <Text style={s.rowSub}>Prices and turnaround live in the Catalog.</Text>
              <View style={s.chips}>{SERVICES[type].map(sv => <Chip key={sv} accent={accent} label={sv} on={ops.services.includes(sv)} onPress={() => toggleIn('services', sv)} />)}</View>
              <ToggleRow label="Accept walk-ins" value={ops.walkIns} onChange={v => setOps({ ...ops, walkIns: v })} />
              <ToggleRow label="Emergency / STAT service" value={ops.emergency} onChange={v => setOps({ ...ops, emergency: v })} />
              {type === 'scan' && <ToggleRow label="Appointment required for CT / MRI" value={ops.appointmentsOnly} onChange={v => setOps({ ...ops, appointmentsOnly: v })} />}
              {type === 'lab' && <ToggleRow label="Home sample collection" value={ops.homeCollection} onChange={v => setOps({ ...ops, homeCollection: v })} />}
              {type === 'lab' && ops.homeCollection && <Field label="Home collection fee (GHS)" value={ops.homeCollectionFee} keyboardType="decimal-pad" onChange={v => setOps({ ...ops, homeCollectionFee: v })} />}
              <Text style={[s.label, { marginTop: 14 }]}>Payment accepted</Text>
              <View style={s.chips}>{PAYMENTS.map(pm => <Chip key={pm} accent={accent} label={pm} on={ops.payments.includes(pm)} onPress={() => toggleIn('payments', pm)} />)}</View>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>Results & critical values</Text>
              <Text style={s.rowSub}>Results go to the ordering doctor. Critical values alert the doctor automatically — record who follows up by phone.</Text>
              <Field label="Critical-value contact (name)" value={ops.criticalName} onChange={v => setOps({ ...ops, criticalName: v })} />
              <Field label="Critical-value phone" value={ops.criticalPhone} keyboardType="phone-pad" onChange={v => setOps({ ...ops, criticalPhone: v })} />
              <Field label="Results enquiries email" value={ops.resultsEmail} keyboardType="email-address" autoCapitalize="none" onChange={v => setOps({ ...ops, resultsEmail: v })} />
              <Field label="Note for patients" value={ops.patientNote} multiline placeholder="Bring your National ID and the order code." onChange={v => setOps({ ...ops, patientNote: v })} />
            </View>
            <TouchableOpacity onPress={saveOps} disabled={saving} style={[s.primaryBtn, { backgroundColor: accent }, saving && s.dim]}><Text style={s.primaryText}>{saving ? 'Saving…' : 'Save operations'}</Text></TouchableOpacity>
          </>
        )}

        {section === 'insurance' && <InsuranceNetworksMobile accent={accent} />}

        {section === 'security' && (
          <>
            <ChangePasswordCard accent={accent} />
            <View style={s.card}>
              <Text style={s.cardTitle}>Forgot your password?</Text>
              <Text style={s.rowSub}>Send a reset link to {profile?.email || 'your login email'}.{isBranch ? ' To change the login email, ask your parent centre.' : ''}</Text>
              <TouchableOpacity onPress={resetLink} style={[s.outlineBtn, { borderColor: accent }]}><Text style={[s.outlineText, { color: accent }]}>Email reset link</Text></TouchableOpacity>
            </View>
          </>
        )}

        {section === 'session' && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Data & session</Text>
            <Text style={s.rowSub}>Share a copy of your profile and settings, or sign out of this device.</Text>
            <TouchableOpacity style={[s.outlineBtn, { borderColor: accent }]}
              onPress={() => Share.share({ message: JSON.stringify({ kind: data?.kind, id: data?.ownerId, profile: data?.profile, settings: data?.settings }, null, 2) })}>
              <Text style={[s.outlineText, { color: accent }]}>Export settings</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.outlineBtn, { borderColor: '#fecaca' }]} onPress={logout}><Text style={[s.outlineText, { color: '#b91c1c' }]}>Log out</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabs: { paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tab: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '800', color: '#334155' },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  label: { fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#0f172a' },
  time: { flex: 1, paddingVertical: 6, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 6 },
  dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  rowSub: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10, marginBottom: 6 },
  chip: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 12 },
  statN: { fontSize: 22, fontWeight: '900' },
  statL: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 2 },
  statH: { fontSize: 11, color: '#64748b', marginTop: 2 },
  kv: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  kvK: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
  kvV: { fontSize: 14, color: '#0f172a', marginTop: 2 },
  primaryBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginBottom: 12 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  outlineBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 12 },
  outlineText: { fontWeight: '800', fontSize: 14 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dim: { opacity: 0.5 },
});
