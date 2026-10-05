import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import { MedicalColors } from '../../constants/colors';
import { api } from '../../services/apiClient';

/**
 * Wellness content a provider sends to their OWN people.
 *
 * `audience` comes from the navigator that registers this screen —
 * 'my_clients' for a therapist, 'my_patients' for a doctor — and is never
 * offered as a choice, so a therapist is not even shown the option of mailing
 * medical patients. The backend refuses the wrong pairing regardless.
 */
export default function ProviderWellnessScreen({ audience = 'my_clients', peopleNoun = 'clients' }) {
  const [title, setTitle]     = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');
  const [reach, setReach]     = useState(null);
  const [past, setPast]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, r] = await Promise.all([
        api('/api/v1/campaigns?type=wellness').catch(() => []),
        api(`/api/v1/campaigns/audience-preview?audience=${encodeURIComponent(audience)}&category=wellness`)
          .catch(() => null),
      ]);
      setPast(Array.isArray(list) ? list : []);
      setReach(r);
    } finally {
      setLoading(false);
    }
  }, [audience]);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!title.trim() || !subject.trim() || !body.trim()) {
      Alert.alert('Incomplete', 'Add a name, a subject and a message before sending.');
      return;
    }
    setBusy(true);
    try {
      const created = await api('/api/v1/campaigns', {
        method: 'POST',
        body: {
          campaignType: 'wellness',
          category: 'wellness',
          audience,
          title: title.trim(),
          subject: subject.trim(),
          bodyHtml: body.trim(),
        },
      });
      const res = await api(`/api/v1/campaigns/${created.id}/send`, { method: 'POST' });
      Alert.alert(
        'Sent',
        `Sent to ${res.sent} of your ${res.audienceSize} ${peopleNoun}.` +
        (res.skipped ? ` ${res.skipped} have wellness email turned off.` : ''),
      );
      setTitle(''); setSubject(''); setBody('');
      load();
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <ZCGround>
        <View style={styles.centered}><ActivityIndicator color={MedicalColors.primary} size="large" /></View>
      </ZCGround>
    );
  }

  const noAudience = reach && reach.total === 0;

  return (
    <ZCGround>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.heroCard}>
            <View style={styles.heroTopLine}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>Wellness</Text>
              </View>
              <View style={styles.smallBadge}>
                <Ionicons name="medical" size={12} color={MedicalColors.primary} />
                <Text style={styles.smallBadgeText}>Care team</Text>
              </View>
            </View>

            <View style={styles.heroBody}>
              <View style={styles.heroTextWrap}>
                <Text style={styles.heroTitle}>Send wellness updates</Text>
                <Text style={styles.heroSubtitle}>
                  Keep {peopleNoun} informed with thoughtful encouragement and support notes.
                </Text>
              </View>
              <View style={styles.heroIconWrap}>
                <Ionicons name="sparkles" size={26} color={MedicalColors.primary} />
              </View>
            </View>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Internal label</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. September check-in"
              placeholderTextColor={MedicalColors.textLight}
            />

            <Text style={styles.fieldLabel}>Subject</Text>
            <TextInput
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. A few ways to unwind this week"
              placeholderTextColor={MedicalColors.textLight}
            />
            <Text style={styles.hint}>Keep subjects general — they may appear on a lock screen.</Text>

            <Text style={styles.fieldLabel}>Message</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={body}
              onChangeText={setBody}
              placeholder="Share encouragement, reminders, or useful health tips…"
              placeholderTextColor={MedicalColors.textLight}
              multiline
              textAlignVertical="top"
            />
          </View>

          {reach ? (
            <View style={styles.reachCard}>
              <Ionicons name="people-outline" size={18} color={MedicalColors.primary} />
              <Text style={styles.reachText}>
                {reach.willingToReceive} of {reach.total} {peopleNoun} will receive this
                {reach.optedOut ? ` • ${reach.optedOut} have wellness email off.` : '.'}
                {noAudience ? ' No one is assigned yet.' : ''}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryButton, (busy || noAudience) && { opacity: 0.5 }]}
            onPress={send}
            disabled={busy || noAudience}
          >
            <Text style={styles.primaryButtonText}>
              {busy ? 'Sending…' : `Send to my ${peopleNoun}`}
            </Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Previously sent</Text>
          {past.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="mail-open-outline" size={22} color={MedicalColors.primary} />
              <Text style={styles.emptyText}>You have not sent any wellness messages yet.</Text>
            </View>
          ) : past.map((c) => (
            <View key={c.id} style={styles.pastCard}>
              <Text style={styles.pastTitle}>{c.title}</Text>
              <Text style={styles.pastMeta}>{c.subject} • reached {c.sent_count ?? 0}</Text>
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </ZCGround>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 18, paddingBottom: 40, gap: 14 },

  heroCard: {
    backgroundColor: MedicalColors.primary,
    borderRadius: 22,
    padding: 18,
    shadowColor: MedicalColors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  heroTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  pill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  smallBadge: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#edf7ff',
  },
  smallBadgeText: {
    color: MedicalColors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTextWrap: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 30,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  heroIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },

  formCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: MedicalColors.border,
    borderRadius: 18,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: MedicalColors.textSecondary,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: MedicalColors.border,
    borderRadius: 12,
    color: MedicalColors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  textarea: {
    minHeight: 120,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: MedicalColors.textSecondary,
    marginTop: 6,
    marginBottom: 2,
    lineHeight: 18,
  },

  reachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff8ff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbeafe',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reachText: {
    flex: 1,
    fontSize: 12.5,
    color: MedicalColors.text,
    lineHeight: 18,
  },

  primaryButton: {
    backgroundColor: MedicalColors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: MedicalColors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },

  sectionTitle: {
    marginTop: 4,
    marginBottom: 2,
    fontSize: 13,
    color: MedicalColors.textSecondary,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: MedicalColors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: MedicalColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pastCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: MedicalColors.border,
    borderRadius: 16,
    padding: 14,
  },
  pastTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: MedicalColors.text,
    lineHeight: 20,
  },
  pastMeta: {
    marginTop: 4,
    fontSize: 12,
    color: MedicalColors.textSecondary,
  },
});
