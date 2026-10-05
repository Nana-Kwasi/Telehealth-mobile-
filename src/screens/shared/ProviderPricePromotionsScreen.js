import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/apiClient';

/**
 * Promotions on MY fee — a doctor or therapist deciding whether to take part.
 *
 * An admin may compose a discount that names a provider, but it does not touch
 * their fee until they say yes here. Declining leaves the rate exactly as it
 * was, and a promotion with no approvals cannot go live at all. So the card
 * leads with what it costs them, in money, before it asks.
 */
const money = (n) => `GHS ${Number(n || 0).toFixed(2)}`;

export default function ProviderPricePromotionsScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(null);
  const [declining, setDeclining] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api('/api/v1/promotions/mine');
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      Alert.alert('Could not load', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (promotionId, decision, declineNote) => {
    setBusy(promotionId);
    try {
      await api(`/api/v1/promotions/${promotionId}/consent`, {
        method: 'POST',
        body: { decision, note: declineNote || null },
      });
      Alert.alert(
        decision === 'approve' ? 'Approved' : 'Declined',
        decision === 'approve'
          ? 'The discount will show on your profile while the offer runs.'
          : 'Your fee is unchanged.',
      );
      setDeclining(null);
      setNote('');
      await load();
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const effect = (r) => {
    if (r.discount_type === 'percent') {
      const cap = r.max_discount_amount ? ` (never more than ${money(r.max_discount_amount)})` : '';
      return `${Number(r.value)}% off each session${cap}`;
    }
    if (r.discount_type === 'fixed_amount') return `${money(r.value)} off each session`;
    return `Each session priced at ${money(r.value)}`;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  const pending = rows.filter((r) => r.my_status === 'pending');
  const answered = rows.filter((r) => r.my_status !== 'pending');

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
      <Text style={styles.h1}>Promotions on your fee</Text>
      <Text style={styles.lead}>
        An administrator can propose a discount that features you. It does not change
        what you are paid until you approve it, and declining leaves your rate exactly
        as it is.
      </Text>

      {pending.length > 0 ? (
        <>
          <Text style={styles.h2}>Waiting for your decision</Text>
          {pending.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.name}>{r.name}</Text>
                <View style={styles.pillWait}>
                  <Text style={styles.pillWaitText}>Needs your answer</Text>
                </View>
              </View>
              {r.description ? <Text style={styles.desc}>{r.description}</Text> : null}

              <View style={styles.effect}>
                <Text style={styles.effectText}>{effect(r)}</Text>
              </View>

              <Text style={styles.meta}>
                Runs {new Date(r.starts_at).toLocaleDateString()} to{' '}
                {new Date(r.ends_at).toLocaleDateString()}
                {r.service_types ? ` · ${r.service_types}` : ''}
                {Number(r.min_final_amount) > 0
                  ? ` · never below ${money(r.min_final_amount)}` : ''}
              </Text>

              {declining === r.id ? (
                <View style={styles.declineBox}>
                  <Text style={styles.label}>Why? (optional — the admin will see this)</Text>
                  <TextInput
                    style={styles.input}
                    value={note}
                    onChangeText={setNote}
                    placeholder="e.g. my rate is already at the lower end"
                    placeholderTextColor="#9aa0b2"
                  />
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.btn, styles.danger]}
                      disabled={busy === r.id}
                      onPress={() => decide(r.id, 'decline', note)}
                    >
                      <Text style={styles.btnText}>
                        {busy === r.id ? 'Sending…' : 'Confirm decline'}
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
                    disabled={busy === r.id}
                    onPress={() => decide(r.id, 'approve')}
                  >
                    <Ionicons name="checkmark" size={16} color="#ffffff" />
                    <Text style={styles.btnText}>
                      {busy === r.id ? 'Sending…' : 'Approve'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.ghost]}
                    onPress={() => setDeclining(r.id)}
                  >
                    <Text style={styles.ghostText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </>
      ) : null}

      <Text style={styles.h2}>{pending.length ? 'Already decided' : 'Your promotions'}</Text>
      {answered.length === 0 ? (
        <Text style={styles.empty}>
          {pending.length
            ? 'Nothing decided yet.'
            : 'No promotion names you at the moment. Nothing is affecting your fee.'}
        </Text>
      ) : (
        answered.map((r) => (
          <View key={r.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.name}>{r.name}</Text>
              <View style={r.my_status === 'approved' ? styles.pillOk : styles.pillNo}>
                <Text style={r.my_status === 'approved' ? styles.pillOkText : styles.pillNoText}>
                  You {r.my_status}
                </Text>
              </View>
            </View>
            <View style={styles.effect}>
              <Text style={styles.effectText}>{effect(r)}</Text>
            </View>
            <Text style={styles.meta}>
              {new Date(r.starts_at).toLocaleDateString()} to{' '}
              {new Date(r.ends_at).toLocaleDateString()}
              {new Date(r.ends_at) < new Date() ? ' · ended — your normal fee applies' : ''}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f9fc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  h1: { fontSize: 21, fontWeight: '800', color: '#0f1424' },
  h2: {
    fontSize: 12, fontWeight: '800', color: '#2b3142', letterSpacing: 0.6,
    textTransform: 'uppercase', marginTop: 22, marginBottom: 10,
  },
  lead: { fontSize: 13.5, lineHeight: 20, color: '#545a6b', marginTop: 6 },

  card: {
    backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#e4e7ee',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  // flex:1 only on the text, so it wraps instead of the row stretching.
  name: { flex: 1, fontSize: 15.5, fontWeight: '750', color: '#0f1424' },
  desc: { fontSize: 13, lineHeight: 19, color: '#545a6b', marginBottom: 8 },

  effect: {
    backgroundColor: '#f7f9fc', borderRadius: 10, borderWidth: 1, borderColor: '#e4e7ee',
    paddingVertical: 9, paddingHorizontal: 11, marginBottom: 8,
  },
  effectText: { fontSize: 13.5, fontWeight: '650', color: '#16203a' },
  meta: { fontSize: 11.5, lineHeight: 17, color: '#6b7283' },

  declineBox: {
    marginTop: 12, padding: 11, borderRadius: 10,
    backgroundColor: '#fafbfd', borderWidth: 1, borderColor: '#e4e7ee',
  },
  label: { fontSize: 12, fontWeight: '700', color: '#2b3142', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#d8dce6', borderRadius: 9,
    paddingVertical: 9, paddingHorizontal: 11, fontSize: 13.5, color: '#0f1424',
    backgroundColor: '#ffffff',
  },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10,
  },
  approve: { backgroundColor: '#166534' },
  danger: { backgroundColor: '#991b1b' },
  ghost: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#d8dce6' },
  btnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '700' },
  ghostText: { color: '#2b3142', fontSize: 13.5, fontWeight: '700' },

  empty: { fontSize: 13, color: '#6b7283' },

  pillWait: { backgroundColor: '#fffbeb', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillWaitText: { fontSize: 10.5, fontWeight: '800', color: '#8a4b09' },
  pillOk: { backgroundColor: '#dcfce7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillOkText: { fontSize: 10.5, fontWeight: '800', color: '#14532d' },
  pillNo: { backgroundColor: '#f1f3f8', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillNoText: { fontSize: 10.5, fontWeight: '800', color: '#454b5c' },
});
