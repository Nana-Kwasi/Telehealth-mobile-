import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * Invoices, insurance and claims — mobile counterpart of web's
 * BillingAssistantPanel. Status lines are the server's fixed explanations.
 */
const TONE = {
  verified: '#12602f', paid: '#12602f', approved: '#12602f',
  pending_verification: '#8a4b09', submitted: '#8a4b09', draft: '#3d4257',
  incomplete: '#8f1d17', rejected: '#8f1d17', expired: '#8f1d17', none: '#3d4257',
};

export default function BillingAssistantCard({ accent = '#2a3ea8' }) {
  const [invoices, setInvoices] = useState([]);
  const [insurance, setInsurance] = useState(null);
  const [claims, setClaims] = useState([]);
  const [form, setForm] = useState(null);
  const [note, setNote] = useState('');
  const [claimNote, setClaimNote] = useState(null);

  const load = useCallback(async () => {
    const [i, ins, c] = await Promise.all([
      api('/api/v1/billing/assist/invoices').catch(() => []),
      api('/api/v1/billing/assist/insurance').catch(() => null),
      api('/api/v1/billing/assist/claims').catch(() => []),
    ]);
    setInvoices(Array.isArray(i) ? i : []);
    setInsurance(ins);
    setClaims(Array.isArray(c) ? c : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setNote('');
    try {
      const res = await api('/api/v1/billing/assist/insurance', { method: 'POST', body: form });
      setNote([res.explanation, ...(res.missing || []).map((m) => `Missing: ${m}`), ...(res.warnings || [])].join(' '));
      if (res.status !== 'incomplete') setForm(null);
      load();
    } catch (e) { setNote(e?.message || 'That could not be submitted.'); }
  };

  const claim = async (id) => {
    try {
      const res = await api('/api/v1/billing/assist/claims', { method: 'POST', body: { billingRecordId: id } });
      setClaimNote({ id, text: res.explanation, missing: res.missing || [] });
      load();
    } catch (e) { setClaimNote({ id, text: e?.message || 'The claim could not be prepared.', missing: [] }); }
  };

  const share = (inv) => Share.share({ message:
    `NessaHub invoice ${inv.invoice_number}\nDate: ${day(inv.created_at)}\nBilled to: ${inv.billed_to}\n`
    + `${clean(inv.description)}: ${money(inv.amount_cents, inv.currency)}\nStatus: ${inv.status}\nRef: ${inv.provider_ref || ''}` });

  const status = insurance?.status || 'none';

  return (
    <View>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.icon}><Ionicons name="shield-checkmark-outline" size={16} color={accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Insurance</Text>
            <Text style={[styles.status, { color: TONE[status] }]}>
              {insurance?.provider ? `${insurance.provider} · ` : ''}{label(status)}
            </Text>
            <Text style={styles.sub}>{insurance?.explanation}</Text>
            {insurance?.decision_note ? <Text style={styles.sub}>Reason: {insurance.decision_note}</Text> : null}
          </View>
          {!form ? (
            <TouchableOpacity style={styles.ghost} onPress={() => setForm({
              provider: insurance?.provider || '', policyNumber: insurance?.policy_number || '',
              memberName: insurance?.member_name || '', planName: insurance?.plan_name || '',
              validTo: insurance?.valid_to || '' })}>
              <Text style={styles.ghostText}>{status === 'none' ? 'Add' : 'Update'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {form ? (
          <View>
            {[['provider', 'Insurer (e.g. NHIS)'], ['policyNumber', 'Policy / membership number'],
              ['memberName', 'Member name on the card'], ['planName', 'Plan (optional)'],
              ['validTo', 'Valid until (YYYY-MM-DD)']].map(([k, ph]) => (
              <TextInput key={k} style={styles.input} placeholder={ph} placeholderTextColor="#8a8f9e"
                value={form[k]} onChangeText={(t) => setForm({ ...form, [k]: t })} />
            ))}
            <View style={styles.row}>
              <TouchableOpacity style={[styles.primary, { backgroundColor: accent }]} onPress={submit}>
                <Text style={styles.primaryText}>Submit for verification</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghost} onPress={() => setForm(null)}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
            </View>
          </View>
        ) : null}
        {note ? <Text style={styles.sub}>{note}</Text> : null}
      </View>

      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.icon}><Ionicons name="receipt-outline" size={16} color={accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Invoices</Text>
            <Text style={styles.sub}>One for every payment. Insured? Prepare a claim from an invoice.</Text>
          </View>
        </View>
        {invoices.length === 0 ? <Text style={styles.sub}>No invoices yet.</Text> : invoices.map((inv) => (
          <View key={inv.id} style={styles.line}>
            <Text style={styles.strong}>{inv.invoice_number} · {money(inv.amount_cents, inv.currency)}</Text>
            <Text style={styles.sub}>{clean(inv.description)} · {day(inv.created_at)} · {inv.status}</Text>
            {claimNote?.id === inv.id ? (
              <Text style={styles.sub}>{claimNote.text}{claimNote.missing.map((m) => `\n• ${m}`).join('')}</Text>
            ) : null}
            <View style={styles.row}>
              <TouchableOpacity style={styles.ghost} onPress={() => share(inv)}><Text style={styles.ghostText}>Share</Text></TouchableOpacity>
              {!inv.claim_status ? (
                <TouchableOpacity style={styles.ghost} onPress={() => claim(inv.id)}><Text style={styles.ghostText}>Claim</Text></TouchableOpacity>
              ) : <Text style={[styles.badge, { color: TONE[inv.claim_status] }]}>Claim {inv.claim_status}</Text>}
            </View>
          </View>
        ))}
      </View>

      {claims.length ? (
        <View style={styles.card}>
          <Text style={styles.title}>Insurance claims</Text>
          {claims.map((c) => (
            <View key={c.id} style={styles.line}>
              <Text style={[styles.strong, { color: TONE[c.status] }]}>{c.invoice_number} · {label(c.status)}</Text>
              <Text style={styles.sub}>{c.explanation}</Text>
              {c.decision_note ? <Text style={styles.sub}>Reason: {c.decision_note}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function label(s) {
  return ({ none: 'Not added', pending_verification: 'Waiting for verification', incomplete: 'Details missing' }[s])
    || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
}
function money(minor, cur) { return `${cur || 'GHS'} ${(Number(minor || 0) / 100).toFixed(2)}`; }
function clean(d) { return String(d || '').replace(/\s*\[ref [^\]]+\]/, ''); }
function day(iso) { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(); }

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 18, padding: 16, marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 6 },
  icon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#eef2ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  status: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  sub: { fontSize: 11.5, lineHeight: 16, color: '#565c6e', marginTop: 2 },
  strong: { fontSize: 13, fontWeight: '700', color: '#15173a' },
  input: { borderWidth: 1, borderColor: '#d8dce6', borderRadius: 10, padding: 9, fontSize: 13, color: '#2c3040', marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' },
  line: { paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f2f6' },
  badge: { fontSize: 12, fontWeight: '700' },
  primary: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999 },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  ghost: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#d8dce6' },
  ghostText: { fontSize: 12.5, fontWeight: '700', color: '#2c3040' },
});
