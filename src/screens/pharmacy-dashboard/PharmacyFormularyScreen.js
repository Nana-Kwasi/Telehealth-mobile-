import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, RefreshControl, StyleSheet } from 'react-native';
import { api } from '../../services/apiClient';
import { PharmacyColors as C } from '../../constants/colors';
import { PageHeader, Section, Tabs, Button, Empty, Notice, ui } from '../../components/provider/ProviderUI';

/**
 * The pharmacist's formulary on mobile — the twin of web Common/FormularyManager.js.
 * Every prescription check (interactions, duplicates, allergies) runs against
 * this list. New and edited entries are drafts until a pharmacist approves them.
 */
const EMPTY_DRUG = { genericName: '', brandNames: '', drugClass: '', allergyTerms: '', crossReactiveTerms: '', referenceDosing: '', notes: '' };
const EMPTY_RULE = { subjectA: '', subjectB: '', severity: 'major', effect: '', advice: '' };
const SEVERITIES = [['contraindicated', 'Contraindicated'], ['major', 'Major'], ['moderate', 'Moderate']];

function StatusText({ s, by }) {
  const color = s === 'approved' ? '#12602f' : s === 'retired' ? '#64748b' : '#8a4b09';
  return <Text style={[st.status, { color }]}>{s === 'draft' ? 'Not reviewed' : s}{s === 'approved' && by ? ` · ${by}` : ''}</Text>;
}

export default function PharmacyFormularyScreen() {
  const [data, setData] = useState({ drugs: [], interactions: [] });
  const [tab, setTab] = useState('drugs');
  const [filter, setFilter] = useState('');
  const [drug, setDrug] = useState(null);
  const [rule, setRule] = useState(null);
  const [msg, setMsg] = useState({ ok: '', err: '' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const d = await api('/api/v1/ai/prescriptions/formulary').catch(() => null);
    if (d) setData({ drugs: d.drugs || [], interactions: d.interactions || [] });
    setRefreshing(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (kind, id, status) => {
    await api(`/api/v1/ai/prescriptions/formulary/${kind}/${id}/review`, { method: 'POST', body: { status } }).catch(() => null);
    load();
  };
  const save = async (kind, body, reset) => {
    try {
      const r = await api(`/api/v1/ai/prescriptions/formulary/${kind}`, { method: 'POST', body });
      setMsg({ ok: r?.message || 'Saved as draft.', err: '' }); reset(null); load();
    } catch (e) { setMsg({ ok: '', err: e?.message || 'Could not save.' }); }
  };

  const q = filter.trim().toLowerCase();
  const drugs = data.drugs.filter(d => !q || `${d.generic_name} ${d.brand_names} ${d.drug_class}`.toLowerCase().includes(q));
  const rules = data.interactions.filter(r => !q || `${r.subject_a} ${r.subject_b} ${r.effect}`.toLowerCase().includes(q));
  const pending = data.drugs.filter(d => d.status === 'draft').length + data.interactions.filter(r => r.status === 'draft').length;

  const field = (obj, set, key, placeholder, multiline) => (
    <TextInput key={key} style={[ui.input, { marginTop: 8 }, multiline && { minHeight: 72, textAlignVertical: 'top' }]}
      placeholder={placeholder} placeholderTextColor="#94a3b8" value={obj[key] || ''} multiline={multiline}
      onChangeText={(v) => set({ ...obj, [key]: v })} />
  );

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content} showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primary} />}>
      <PageHeader title="Formulary" subtitle="Medicines and interactions every prescription check runs against" />
      <Notice tone={pending ? 'warn' : 'ok'} icon={pending ? 'time-outline' : 'checkmark-circle-outline'}
        text={pending
          ? `${pending} entr${pending === 1 ? 'y is' : 'ies are'} waiting for pharmacist review. Medicines not listed are reported to doctors as "not checked".`
          : 'Everything is reviewed. Medicines not listed are reported to doctors as "not checked".'} />

      <Tabs accent={C.primary} value={tab} onChange={(t) => { setTab(t); setDrug(null); setRule(null); }}
        tabs={[{ id: 'drugs', label: `Medicines (${data.drugs.length})` }, { id: 'interactions', label: `Interactions (${data.interactions.length})` }]} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput style={[ui.input, { flex: 1 }]} placeholder="Search" placeholderTextColor="#94a3b8" value={filter} onChangeText={setFilter} />
        <Button accent={C.primary} icon="add" label={tab === 'drugs' ? 'Medicine' : 'Interaction'}
          onPress={() => (tab === 'drugs' ? setDrug({ ...EMPTY_DRUG }) : setRule({ ...EMPTY_RULE }))} />
      </View>
      {msg.ok ? <Notice tone="ok" text={msg.ok} /> : null}
      {msg.err ? <Notice tone="err" text={msg.err} /> : null}

      {drug ? (
        <Section title="Medicine" subtitle="Saved as a draft until approved">
          {field(drug, setDrug, 'genericName', 'Generic name *')}
          {field(drug, setDrug, 'brandNames', 'Brand names (comma-separated)')}
          {field(drug, setDrug, 'drugClass', 'Class (e.g. NSAID)')}
          {field(drug, setDrug, 'allergyTerms', 'Allergy words (e.g. penicillin)')}
          {field(drug, setDrug, 'crossReactiveTerms', 'Cross-reactive allergy words')}
          {field(drug, setDrug, 'referenceDosing', 'Reference dosing (shown to doctors exactly as written)', true)}
          <View style={st.actions}>
            <Button accent={C.primary} label="Save as draft" onPress={() => save('drugs', drug, setDrug)} disabled={!drug.genericName.trim()} />
            <Button accent={C.primary} variant="outline" label="Cancel" onPress={() => setDrug(null)} />
          </View>
        </Section>
      ) : null}

      {rule ? (
        <Section title="Interaction" subtitle="Saved as a draft until approved">
          {field(rule, setRule, 'subjectA', 'Medicine A (generic, or class:NSAID)')}
          {field(rule, setRule, 'subjectB', 'Medicine B (generic, or class:…)')}
          <View style={st.sevRow}>
            {SEVERITIES.map(([v, l]) => (
              <TouchableOpacity key={v} style={[st.sev, rule.severity === v && { backgroundColor: C.primary, borderColor: C.primary }]} onPress={() => setRule({ ...rule, severity: v })}>
                <Text style={[st.sevText, rule.severity === v && { color: '#fff' }]}>{l}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {field(rule, setRule, 'effect', 'Effect *')}
          {field(rule, setRule, 'advice', 'Advice to the prescriber')}
          <View style={st.actions}>
            <Button accent={C.primary} label="Save as draft" onPress={() => save('interactions', rule, setRule)} disabled={!rule.subjectA.trim() || !rule.subjectB.trim() || !rule.effect.trim()} />
            <Button accent={C.primary} variant="outline" label="Cancel" onPress={() => setRule(null)} />
          </View>
        </Section>
      ) : null}

      {tab === 'drugs' ? (
        drugs.length === 0 ? <Section><Empty icon="library-outline" text={q ? 'No medicines match.' : 'No medicines yet.'} /></Section> : drugs.map(d => (
          <View key={d.id} style={st.item}>
            <View style={st.itemHead}>
              <Text style={st.itemTitle}>{d.generic_name}</Text>
              <StatusText s={d.status} by={d.reviewed_by} />
            </View>
            {d.drug_class || d.brand_names ? <Text style={ui.muted}>{[d.drug_class, d.brand_names].filter(Boolean).join(' · ')}</Text> : null}
            <Text style={ui.muted}>Allergy words: {d.allergy_terms || '—'}{d.cross_reactive_terms ? ` · cross: ${d.cross_reactive_terms}` : ''}</Text>
            <Text style={ui.muted}>Reference dosing: {d.reference_dosing || 'not written yet'}</Text>
            <View style={st.actions}>
              <Button accent={C.primary} variant="outline" label="Edit" onPress={() => setDrug({
                genericName: d.generic_name, brandNames: d.brand_names || '', drugClass: d.drug_class || '', allergyTerms: d.allergy_terms || '',
                crossReactiveTerms: d.cross_reactive_terms || '', referenceDosing: d.reference_dosing || '', notes: d.notes || '',
              })} />
              {d.status !== 'approved' ? <Button accent={C.primary} label="Approve" onPress={() => review('drugs', d.id, 'approved')} /> : null}
              {d.status !== 'retired' ? <Button accent={C.primary} variant="danger" label="Retire" onPress={() => review('drugs', d.id, 'retired')} /> : null}
            </View>
          </View>
        ))
      ) : (
        rules.length === 0 ? <Section><Empty icon="git-compare-outline" text={q ? 'No interactions match.' : 'No interactions yet.'} /></Section> : rules.map(r => (
          <View key={r.id} style={st.item}>
            <View style={st.itemHead}>
              <Text style={st.itemTitle}>{r.subject_a} + {r.subject_b}</Text>
              <StatusText s={r.status} by={r.reviewed_by} />
            </View>
            <Text style={[st.status, { color: r.severity === 'moderate' ? '#7a5b06' : '#8f1d17' }]}>{r.severity}</Text>
            <Text style={ui.muted}>{r.effect}{r.advice ? ` — ${r.advice}` : ''}</Text>
            <View style={st.actions}>
              {r.status !== 'approved' ? <Button accent={C.primary} label="Approve" onPress={() => review('interactions', r.id, 'approved')} /> : null}
              {r.status !== 'retired' ? <Button accent={C.primary} variant="danger" label="Retire" onPress={() => review('interactions', r.id, 'retired')} /> : null}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  item: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e8edf3', padding: 14, gap: 4 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  status: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sevRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  sev: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  sevText: { fontSize: 12, fontWeight: '700', color: '#475569' },
});
