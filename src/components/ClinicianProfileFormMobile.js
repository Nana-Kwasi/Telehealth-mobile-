import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';
import { CONSULT_TYPES, fieldsFor, fromProfile, missingFields, profileUrl, toStorage } from '../constants/clinicianProfile';

/**
 * Every field of a doctor's or therapist's professional profile — the ones
 * matching reads — for the clinician's own Settings. Same fields and rules as
 * the web form and the super admin's editor. Renders no ScrollView of its own;
 * place it inside the screen's scroll view.
 */
export default function ClinicianProfileFormMobile({ kind, userId, accent = '#2f6f4f' }) {
  const [catalog, setCatalog] = useState(null);
  const [values, setValues] = useState(null);
  const [saved, setSaved] = useState(null);
  const [meta, setMeta] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    Promise.all([
      api('/api/v1/care-catalog', { authenticated: false }).catch(() => ({})),
      api(profileUrl(kind, userId)).catch(() => ({})),
    ]).then(([cat, profile]) => {
      if (!live) return;
      const { values: v, meta: m } = fromProfile(kind, profile || {});
      setCatalog(cat || {});
      setValues(v);
      setSaved(v);
      setMeta(m);
    });
    return () => { live = false; };
  }, [kind, userId]);

  const fields = fieldsFor(kind);
  const sections = useMemo(() => [...new Set(fields.map((f) => f.section))], [fields]);
  const missing = useMemo(() => (values ? missingFields(kind, values, catalog || {}) : []), [kind, values, catalog]);
  const missingKeys = useMemo(() => new Set(missing.map((m) => m.key)), [missing]);
  const dirty = values && saved && JSON.stringify(values) !== JSON.stringify(saved);

  if (!values) {
    return <View style={s.loading}><ActivityIndicator color={accent} /><Text style={s.muted}>Loading your professional details…</Text></View>;
  }

  const set = (key, val) => { setValues((v) => ({ ...v, [key]: val })); setOk(''); };
  const options = (f) => {
    const raw = Array.isArray(f.options) ? f.options : (catalog?.[f.options] || []);
    return raw.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  };

  const save = async () => {
    setBusy(true); setError(''); setOk('');
    try {
      const body = toStorage(kind, values, meta, catalog || {});
      await api(profileUrl(kind, userId), { method: 'PATCH', body });
      setMeta(JSON.parse(body.metadataJson));
      setSaved(values);
      setOk(missing.length ? `Saved. ${missing.length} item${missing.length === 1 ? '' : 's'} still needed for matching.` : 'Saved. Your profile is complete for matching.');
    } catch (e) {
      setError(e.message || 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  const Chip = ({ on, label, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[s.chip, on && { backgroundColor: `${accent}18`, borderColor: accent }]}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      {on ? <Ionicons name="checkmark" size={14} color={accent} /> : null}
      <Text style={[s.chipText, on && { color: accent }]}>{label}</Text>
    </TouchableOpacity>
  );

  const control = (f) => {
    const v = values[f.key];
    const needs = missingKeys.has(f.key);
    const inputStyle = [s.input, needs && s.inputNeeds];
    switch (f.type) {
      case 'textarea':
        return <TextInput style={[...inputStyle, s.textarea]} multiline value={v} placeholder={f.placeholder} placeholderTextColor="#94a3b8" onChangeText={(t) => set(f.key, t)} />;
      case 'number':
        return <TextInput style={inputStyle} keyboardType="numeric" value={String(v ?? '')} placeholder={f.placeholder} placeholderTextColor="#94a3b8" onChangeText={(t) => set(f.key, t.replace(/[^0-9.]/g, ''))} />;
      case 'date':
        return <TextInput style={inputStyle} value={v} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" autoCapitalize="none" maxLength={10} onChangeText={(t) => set(f.key, t)} />;
      case 'select': {
        const opts = options(f);
        return (
          <View style={s.chips}>
            {opts.map((o) => {
              const on = String(v).toLowerCase() === String(o.value).toLowerCase();
              return <Chip key={o.value} on={on} label={o.label} onPress={() => set(f.key, on ? '' : o.value)} />;
            })}
          </View>
        );
      }
      case 'multi': {
        const opts = options(f);
        const chosen = new Set(v.map((x) => String(x).toLowerCase()));
        return (
          <View style={s.chips}>
            {opts.map((o) => {
              const on = chosen.has(String(o.value).toLowerCase());
              return <Chip key={o.value} on={on} label={o.label}
                onPress={() => set(f.key, on ? v.filter((x) => String(x).toLowerCase() !== String(o.value).toLowerCase()) : [...v, o.value])} />;
            })}
          </View>
        );
      }
      case 'list':
        return <TextInput style={inputStyle} value={v.join(', ')} placeholder={f.placeholder} placeholderTextColor="#94a3b8" onChangeText={(t) => set(f.key, t.split(',').map((x) => x.trimStart()))} />;
      case 'bool':
        return (
          <View style={s.chips}>
            <Chip on={v === true} label="Yes" onPress={() => set(f.key, true)} />
            <Chip on={v === false} label="No" onPress={() => set(f.key, false)} />
          </View>
        );
      case 'consultTypes':
        return (
          <View style={s.chips}>
            {CONSULT_TYPES.map((o) => <Chip key={o.value} on={!!v[o.value]} label={o.label} onPress={() => set(f.key, { ...v, [o.value]: !v[o.value] })} />)}
          </View>
        );
      default:
        return <TextInput style={inputStyle} value={v} placeholder={f.placeholder} placeholderTextColor="#94a3b8" onChangeText={(t) => set(f.key, t)} />;
    }
  };

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Professional details</Text>
        <View style={[s.badge, missing.length ? s.badgeWarn : s.badgeGood]}>
          <Text style={[s.badgeText, { color: missing.length ? '#c2410c' : '#15803d' }]}>
            {missing.length ? `${missing.length} to complete` : 'Complete'}
          </Text>
        </View>
      </View>
      <Text style={s.muted}>
        {kind === 'doctor' ? 'Patients are matched to you' : 'Clients are matched to you'} from these details. Fields marked * are required.
      </Text>

      {missing.length ? (
        <View style={s.missing}>
          <Text style={s.missingTitle}>Still needed</Text>
          {missing.slice(0, 6).map((m) => <Text key={m.key + m.text} style={s.missingItem}>• {m.text}</Text>)}
          {missing.length > 6 ? <Text style={s.missingItem}>…and {missing.length - 6} more, highlighted below.</Text> : null}
        </View>
      ) : null}

      {sections.map((sec) => (
        <View key={sec} style={s.section}>
          <Text style={[s.sectionTitle, { color: accent }]}>{sec.toUpperCase()}</Text>
          {fields.filter((f) => f.section === sec).map((f) => (
            <View key={f.key} style={s.field}>
              <Text style={[s.label, missingKeys.has(f.key) && { color: '#b45309' }]}>{f.label}{f.required ? ' *' : ''}</Text>
              {control(f)}
            </View>
          ))}
        </View>
      ))}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {ok ? <Text style={s.ok}>{ok}</Text> : null}

      <TouchableOpacity style={[s.saveBtn, { backgroundColor: accent }, (!dirty || busy) && { opacity: 0.5 }]} disabled={!dirty || busy} onPress={save} activeOpacity={0.85}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>Save professional details</Text>}
      </TouchableOpacity>
      {dirty && !busy ? (
        <TouchableOpacity onPress={() => { setValues(saved); setError(''); }} style={s.discard}>
          <Text style={s.discardText}>Discard changes</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  loading: { padding: 28, alignItems: 'center', gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  muted: { fontSize: 13, color: '#64748b', lineHeight: 19 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1 },
  badgeWarn: { backgroundColor: '#fff7ed', borderColor: '#fed7aa' },
  badgeGood: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  missing: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  missingTitle: { fontWeight: '800', color: '#92400e', marginBottom: 4 },
  missingItem: { color: '#78350f', fontSize: 13, lineHeight: 19 },
  section: { borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 16, paddingTop: 14 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6 },
  field: { marginTop: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#0f172a', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#0f172a', backgroundColor: '#fff' },
  inputNeeds: { borderColor: '#f59e0b', backgroundColor: '#fffdf5' },
  textarea: { minHeight: 90, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  error: { marginTop: 14, color: '#991b1b', backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, fontSize: 13 },
  ok: { marginTop: 14, color: '#166534', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, fontSize: 13 },
  saveBtn: { marginTop: 18, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  discard: { alignItems: 'center', paddingVertical: 10 },
  discardText: { color: '#64748b', fontWeight: '600' },
});
