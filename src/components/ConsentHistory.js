import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';
import { NESSA_HUB_POLICY_LINKS, nessaHubPolicyUrl } from '../constants/nessaHubPolicies';

/**
 * What this person has agreed to, read-only, grouped by where they agreed —
 * the same view as the website (Common/ConsentHistory). Replaces tickable
 * checkboxes that showed defaults, could be unticked, and saved somewhere never
 * read back. Source: the append-only ledger (/api/v1/consents/me).
 */
const CONTEXT_LABELS = {
  app_first_launch: 'When you first opened NessaHub',
  registration: 'When you created your account',
  therapy_registration: 'Therapy sign-up',
  medical_registration: 'Medical sign-up',
  teen_registration: 'Teen therapy — parent or guardian consent',
  couple_registration: 'Couples therapy sign-up',
  psychiatry_registration: 'Psychiatry sign-up',
  second_opinion: 'Second opinion',
  in_call: 'During a session',
};

function policyLink(key) {
  if (key === 'nessahub_policies') return NESSA_HUB_POLICY_LINKS.policiesHome;
  if (key.startsWith('teen_')) return nessaHubPolicyUrl('children-minors-parental-consent-policy');
  if (key.includes('privacy')) return NESSA_HUB_POLICY_LINKS.privacy;
  if (key.includes('terms')) return NESSA_HUB_POLICY_LINKS.terms;
  return null;
}

const when = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const PLATFORM = { web: 'website', ios: 'iPhone app', android: 'Android app' };

export default function ConsentHistory() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api('/api/v1/consents/me')
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => { setRows([]); setFailed(true); });
  }, []);

  const groups = new Map();
  (rows || []).forEach((r) => {
    if (!groups.has(r.context)) groups.set(r.context, []);
    groups.get(r.context).push(r);
  });

  return (
    <View>
      <View style={st.note}>
        <Ionicons name="information-circle-outline" size={18} color="#1e40af" />
        <Text style={st.noteText}>
          These are the agreements you accepted, with the date and policy version. They are part of your record and
          cannot be withdrawn here. Closing your account stops your use of NessaHub; your data is then kept only for
          the period the law requires before it is permanently deleted.
        </Text>
      </View>
      {rows === null ? <ActivityIndicator style={{ marginVertical: 16 }} color="#2563eb" /> : null}
      {failed ? <Text style={st.muted}>Your consent record could not be loaded right now.</Text> : null}
      {rows && !failed && rows.length === 0 ? <Text style={st.muted}>No agreements are recorded for this account yet.</Text> : null}
      {[...groups.entries()].map(([ctx, list]) => (
        <View key={ctx} style={st.card}>
          <Text style={st.h3}>{CONTEXT_LABELS[ctx] || ctx}</Text>
          {list.map((r) => {
            const link = policyLink(r.consent_key);
            return (
              <View key={`${r.consent_key}-${r.policy_version}`} style={st.row}>
                <View style={st.tick}><Ionicons name="checkmark" size={14} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={st.title}>{r.policy_title}</Text>
                  <Text style={st.meta}>
                    Accepted {when(r.accepted_at)} · version {r.policy_version}{r.platform ? ` · ${PLATFORM[r.platform] || r.platform}` : ''}
                  </Text>
                </View>
                {link ? (
                  <TouchableOpacity onPress={() => Linking.openURL(link)} accessibilityRole="link">
                    <Text style={st.read}>Read</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  note: { flexDirection: 'row', gap: 8, backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  noteText: { flex: 1, color: '#1e3a8a', fontSize: 13.5, lineHeight: 19 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  h3: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  tick: { width: 22, height: 22, borderRadius: 6, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5, fontWeight: '600', color: '#0f172a' },
  meta: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
  read: { fontSize: 14, fontWeight: '700', color: '#2563eb' },
  muted: { color: '#64748b', fontSize: 14, marginVertical: 8 },
});
