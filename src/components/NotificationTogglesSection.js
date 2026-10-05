import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Switch, StyleSheet, ActivityIndicator, Alert } from 'react-native';

import { api } from '../services/apiClient';

/**
 * Delivery preferences, shared by every role.
 *
 * The therapist settings screen carried three switches — Session Reminders,
 * New Messages, System Updates — wired to nothing but local component state.
 * They were not saved, not read by anything, and reset the moment the screen
 * unmounted. They looked exactly like working controls.
 *
 * These four are the preferences the backend actually models and honours:
 * `/api/v1/notification-preferences` is what NotificationMailer checks before
 * sending optional mail, and what NotificationService now checks before pushing
 * to a device. Fewer switches that work beat more that do not.
 */

const ROWS = [
  { key: 'emailEnabled',     label: 'Email',              desc: 'Receipts, reminders and updates by email.' },
  { key: 'pushEnabled',      label: 'Push notifications', desc: 'Alerts on the NessaHub app on your phone.' },
  { key: 'wellnessEnabled',  label: 'Wellness emails',    desc: 'Tips and encouragement from your care team.' },
  { key: 'marketingEnabled', label: 'Marketing emails',   desc: 'Offers and promotions. Off unless you turn it on.' },
];

export default function NotificationTogglesSection({ accent = '#1e6bb8' }) {
  const [prefs, setPrefs]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    try {
      setPrefs(await api('/api/v1/notification-preferences'));
    } catch {
      setPrefs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key) => {
    if (!prefs || busy) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);                       // optimistic — a switch must feel immediate
    setBusy(true);
    try {
      setPrefs(await api('/api/v1/notification-preferences', {
        method: 'PUT',
        body: { [key]: next[key] },
      }));
    } catch (e) {
      setPrefs(previous);                 // put it back if the server refused
      Alert.alert('Not saved', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}><ActivityIndicator color={accent} /></View>
    );
  }

  if (!prefs) {
    return (
      <Text style={styles.footnote}>
        Your notification settings could not be loaded. Pull down to refresh, or try again shortly.
      </Text>
    );
  }

  return (
    <View>
      {ROWS.map((r, i) => (
        <View key={r.key} style={[styles.row, i < ROWS.length - 1 && styles.divider]}>
          {/* flex on the text only — never the row, or the switch stretches. */}
          <View style={styles.text}>
            <Text style={styles.label}>{r.label}</Text>
            <Text style={styles.desc}>{r.desc}</Text>
          </View>
          <Switch
            value={Boolean(prefs[r.key])}
            onValueChange={() => toggle(r.key)}
            trackColor={{ false: '#d1d5db', true: accent }}
            thumbColor="#ffffff"
          />
        </View>
      ))}

      {/* Said plainly: a switch that looks like it covers everything, and does
          not, is worse than no switch. */}
      <Text style={styles.footnote}>
        Appointment confirmations, security alerts and other essential messages are always
        sent, whatever you choose here.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingVertical: 28, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(13,13,13,0.10)' },
  text: { flex: 1, minWidth: 0 },
  label: { fontSize: 15, fontWeight: '600', color: '#15173a' },   /* 15.8:1 on white */
  desc: { fontSize: 12, color: '#5b6170', marginTop: 2, lineHeight: 17 },  /* 6.20:1 */
  footnote: { fontSize: 12, color: '#5b6170', lineHeight: 18, marginTop: 12 },
});
