import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';

/**
 * Promotional campaigns that name me — the mobile half of a web-only screen.
 *
 * The rule: an admin may compose an offer featuring a provider, but it does
 * not go out on their behalf until they approve it. This is where a clinician
 * who is away from a desk actually answers, which is most of them.
 *
 * Distinct from "Offers on my fee", which changes what patients PAY. This one
 * only decides whether an advert goes out with their name on it.
 */
export default function ProviderPromotionsScreen() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy]       = useState(null);
  const [declining, setDeclining] = useState(null);
  const [note, setNote]       = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api('/api/v1/campaigns/consent/pending');
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      Alert.alert('Could not load', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (campaignId, decision, declineNote) => {
    setBusy(campaignId);
    try {
      await api(`/api/v1/campaigns/${campaignId}/consent`, {
        method: 'POST',
        body: { decision, note: declineNote || null },
      });
      Alert.alert(
        decision === 'approve' ? 'Approved' : 'Declined',
        decision === 'approve'
          ? 'This campaign may now go out featuring you.'
          : 'This campaign will not go out featuring you.',
      );
      setDeclining(null); setNote('');
      await load();
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'Please try again.');
    } finally { setBusy(null); }
  };

  /** Strip tags so the preview is readable text, never rendered markup. */
  const preview = (html) => String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1d4ed8" /></View>;
  }

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      <Text style={styles.h1}>Promotions featuring you</Text>
      <Text style={styles.lead}>
        An administrator has written these. Nothing goes out with your name on it until
        you approve it, and declining changes nothing else.
      </Text>

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>
            Nothing is waiting for your decision. Campaigns that name you appear here.
          </Text>
        </View>
      ) : rows.map((p) => (
        <View key={p.campaign_id} style={styles.card}>
          <Text style={styles.title}>{p.title}</Text>
          {p.subject ? <Text style={styles.subject}>Subject: {p.subject}</Text> : null}

          {p.body_html ? (
            <View style={styles.previewBox}>
              {/* Plain text only — the campaign body is authored elsewhere and
                  is not trusted markup. */}
              <Text style={styles.previewText}>{preview(p.body_html)}</Text>
            </View>
          ) : null}

          {declining === p.campaign_id ? (
            <View style={styles.declineBox}>
              <Text style={styles.label}>Why? (optional — the admin will see this)</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder="e.g. I am not taking new referrals"
                placeholderTextColor="#9aa0b2"
              />
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.btn, styles.danger]}
                  disabled={busy === p.campaign_id}
                  onPress={() => decide(p.campaign_id, 'decline', note)}
                >
                  <Text style={styles.btnText}>
                    {busy === p.campaign_id ? 'Sending…' : 'Confirm decline'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.ghost]}
                  onPress={() => { setDeclining(null); setNote(''); }}
                >
                  <Text style={styles.ghostText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.approve]}
                disabled={busy === p.campaign_id}
                onPress={() => decide(p.campaign_id, 'approve')}
              >
                <Ionicons name="checkmark" size={15} color="#ffffff" />
                <Text style={styles.btnText}>
                  {busy === p.campaign_id ? 'Sending…' : 'Approve'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.ghost]}
                onPress={() => setDeclining(p.campaign_id)}
              >
                <Text style={styles.ghostText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f9fc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  h1: { fontSize: 21, fontWeight: '800', color: '#0f1424' },
  lead: { fontSize: 13, lineHeight: 19, color: '#545a6b', marginTop: 5, marginBottom: 16 },

  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 10,
          borderWidth: 1, borderColor: '#e4e7ee' },
  title: { fontSize: 15, fontWeight: '750', color: '#0f1424' },
  subject: { fontSize: 12.5, color: '#6b7283', marginTop: 3 },
  empty: { fontSize: 13, lineHeight: 20, color: '#6b7283' },

  previewBox: { marginTop: 10, backgroundColor: '#f7f9fc', borderWidth: 1, borderColor: '#e4e7ee',
                borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11 },
  previewText: { fontSize: 13, lineHeight: 19, color: '#334155' },

  declineBox: { marginTop: 12, padding: 11, borderRadius: 10,
                backgroundColor: '#fafbfd', borderWidth: 1, borderColor: '#e4e7ee' },
  label: { fontSize: 12, fontWeight: '700', color: '#2b3142', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#d8dce6', borderRadius: 9,
           paddingVertical: 9, paddingHorizontal: 11, fontSize: 13.5, color: '#0f1424',
           backgroundColor: '#ffffff' },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 5,
         paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  approve: { backgroundColor: '#166534' },
  danger: { backgroundColor: '#991b1b' },
  ghost: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#d8dce6' },
  btnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '700' },
  ghostText: { color: '#2b3142', fontSize: 13.5, fontWeight: '700' },
});
