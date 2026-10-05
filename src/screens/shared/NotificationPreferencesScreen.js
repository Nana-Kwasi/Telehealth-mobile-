import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Switch, ScrollView, StyleSheet, ActivityIndicator, Alert,
  TouchableOpacity, Linking, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api } from '../../services/apiClient';
import {
  getPushStatus, sendTestPush, registerForPushNotifications,
} from '../../services/notificationService';

/**
 * A person's own delivery controls.
 *
 * These switches govern OPTIONAL mail only. Appointment confirmations, security
 * alerts and other transactional messages are never gated by them — turning off
 * marketing must not stop someone learning their appointment moved. The screen
 * says so, because a switch that looks like it covers everything is worse than
 * no switch at all.
 */
export default function NotificationPreferencesScreen() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [push, setPush] = useState(null);
  const [testing, setTesting] = useState(false);

  const loadPush = useCallback(async () => {
    try { setPush(await getPushStatus()); } catch { /* the card simply won't show */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setPrefs(await api('/api/v1/notification-preferences'));
      } catch (e) {
        Alert.alert('Could not load', e?.message || 'Please try again.');
      } finally {
        setLoading(false);
      }
    })();
    loadPush();
  }, [loadPush]);

  const toggle = async (key) => {
    if (!prefs || saving) return;
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);            // optimistic — a switch must feel immediate
    setSaving(true);
    try {
      setPrefs(await api('/api/v1/notification-preferences', {
        method: 'PUT',
        body: { [key]: next[key] },
      }));
    } catch (e) {
      setPrefs(previous);      // put it back if the server refused
      Alert.alert('Not saved', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
      if (key === 'pushEnabled') loadPush();
    }
  };

  /**
   * Prove it, rather than asserting it.
   *
   * "How do I know the toggle did anything?" has no answer on a settings screen
   * that only stores a value. This sends a real push through the real path and
   * reports what actually happened — including the two ways it can legitimately
   * send nothing, which have different fixes.
   */
  const runTest = async () => {
    setTesting(true);
    try {
      const res = await sendTestPush();
      Alert.alert(
        res?.sent ? 'Test sent' : 'Nothing sent',
        res?.message || (res?.sent ? 'Check your notifications.' : 'Push is not available.'),
      );
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'Please try again.');
    } finally {
      setTesting(false);
      loadPush();
    }
  };

  /** Ask for OS permission, then register — for a device that has never been asked. */
  const enableOnThisDevice = async () => {
    const token = await registerForPushNotifications();
    await loadPush();
    if (!token) {
      Alert.alert(
        'Not enabled',
        'This device did not grant permission for notifications. You can turn them on '
        + 'for NessaHub in your phone settings.',
      );
    }
  };

  if (loading) {
    return (
      <ZCGround>
        <View style={styles.centered}><ActivityIndicator color={ZC.accent} size="large" /></View>
      </ZCGround>
    );
  }

  const ROWS = [
    { key: 'emailEnabled',     label: 'Email',              desc: 'Receipts, reminders and updates by email.' },
    { key: 'pushEnabled',      label: 'Push notifications', desc: 'Alerts on this device.' },
    { key: 'wellnessEnabled',  label: 'Wellness emails',    desc: 'Tips and encouragement from your own care team.' },
    { key: 'marketingEnabled', label: 'Marketing emails',   desc: 'Offers and promotions. Off unless you turn it on.' },
  ];

  return (
    <ZCGround>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={zcStyles.badge}><Text style={zcStyles.badgeText}>Notifications</Text></View>
        <Text style={[zcStyles.display, styles.title]}>How we contact you</Text>

        <View style={[styles.card, glassStyle]}>
          <GlassFill />
          {ROWS.map((r, i) => (
            <View key={r.key} style={[styles.row, i < ROWS.length - 1 && styles.rowDivider]}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={styles.rowDesc}>{r.desc}</Text>
              </View>
              <Switch
                value={Boolean(prefs?.[r.key])}
                onValueChange={() => toggle(r.key)}
                trackColor={{ false: ZC.ink4, true: ZC.accent }}
                thumbColor="#ffffff"
              />
            </View>
          ))}
        </View>

        {/* ── This device ──
            The switch above is an ACCOUNT setting; whether this particular
            handset can actually receive a push is a separate question with
            three separate answers — OS permission, whether a token reached the
            server, and the account switch. Collapsing them into one green tick
            would hide which of the three is the one that is broken. */}
        {push ? (
          <View style={[styles.card, glassStyle, styles.deviceCard]}>
            <GlassFill />
            <Text style={zcStyles.eyebrow}>This device</Text>

            {/* A build with no EAS project cannot receive push at all. Saying so
                stops the screen blaming the user's permissions for something
                only a rebuild can fix. */}
            {!push.configured ? (
              <StatusLine
                ok={false}
                label={'This build is not set up for push notifications yet. '
                  + 'It needs an Expo project ID, which is added when the app is built for release.'}
              />
            ) : null}

            <StatusLine
              ok={push.permission === 'granted'}
              label={push.permission === 'granted'
                ? 'Notifications allowed on this phone'
                : 'This phone has not allowed notifications'}
            />
            <StatusLine
              ok={push.deviceRegistered}
              label={push.deviceRegistered
                ? 'Registered to receive push'
                : 'Not registered for push yet'}
            />
            <StatusLine
              ok={push.preferenceOn}
              label={push.preferenceOn
                ? 'Push is on for your account'
                : 'Push is off for your account (switch above)'}
            />

            {push.devices > 1 ? (
              <Text style={styles.deviceNote}>
                {push.devices} devices are signed in to your account and receive notifications.
              </Text>
            ) : null}

            <View style={styles.deviceActions}>
              {!push.configured ? null : push.permission !== 'granted' ? (
                <TouchableOpacity
                  style={styles.deviceBtn}
                  onPress={push.canAskAgain ? enableOnThisDevice : () => Linking.openSettings()}
                >
                  <Text style={styles.deviceBtnText}>
                    {push.canAskAgain
                      ? 'Allow notifications'
                      : `Open ${Platform.OS === 'ios' ? 'iOS' : 'phone'} settings`}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.deviceBtn, testing && { opacity: 0.5 }]}
                  onPress={runTest}
                  disabled={testing}
                >
                  <Text style={styles.deviceBtnText}>
                    {testing ? 'Sending…' : 'Send a test notification'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        <Text style={styles.footnote}>
          Appointment confirmations, security alerts and other essential messages are always sent
          by email, whatever you choose here. Turning push off silences this phone only — the
          notifications are still waiting for you in the app.
        </Text>
      </ScrollView>
    </ZCGround>
  );
}

/** One plain true/false fact about push on this device. */
function StatusLine({ ok, label }) {
  return (
    <View style={styles.statusLine}>
      <Ionicons
        name={ok ? 'checkmark-circle' : 'alert-circle-outline'}
        size={17}
        color={ok ? '#2f6b4a' : '#9a5b06'}
      />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { marginTop: 12, marginBottom: 6 },
  card: { borderRadius: 20, padding: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, gap: 12 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(13,13,13,0.09)' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: ZC.ink },
  rowDesc: { fontSize: 12, color: ZC.ink3, marginTop: 2, lineHeight: 17 },
  footnote: { fontSize: 12, color: ZC.ink3, paddingHorizontal: 6, lineHeight: 18 },

  deviceCard: { padding: 18, gap: 10, marginTop: 6 },
  statusLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  // flex on the text only — never the row, or the icon stretches.
  statusText: { flex: 1, fontSize: 13.5, color: ZC.ink2, lineHeight: 19 },
  deviceNote: { fontSize: 12, color: ZC.ink3, lineHeight: 17 },
  deviceActions: { marginTop: 4 },
  deviceBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(80,70,189,0.10)',
  },
  deviceBtnText: { fontSize: 13, fontWeight: '700', color: ZC.accent },
});
