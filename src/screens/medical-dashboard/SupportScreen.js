import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId, getStoredRole } from '../../services/apiClient';
import { MedicalColors } from '../../constants/colors';

const ISSUE_TYPES = [
  { key: 'doctor_report', label: 'Report a Doctor', icon: 'person-remove-outline', color: '#dc2626' },
  { key: 'app_bug', label: 'Report App Issue', icon: 'bug-outline', color: '#d97706' },
  { key: 'billing', label: 'Billing / Payment', icon: 'card-outline', color: '#7c3aed' },
  { key: 'account', label: 'Account Problem', icon: 'person-circle-outline', color: '#2563eb' },
  { key: 'appointment', label: 'Appointment Issue', icon: 'calendar-outline', color: '#059669' },
  { key: 'other', label: 'Other / General', icon: 'help-circle-outline', color: '#64748b' },
];

const SupportScreen = () => {
  const [selectedType, setSelectedType] = useState(null);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailing, setEmailing] = useState(false);

  /**
   * Send this straight to the administrators' inboxes rather than only filing a
   * ticket. Same content either way — the difference is that a human is emailed
   * now instead of the message waiting to be noticed in a queue.
   */
  const handleEmailAdmin = async () => {
    if (!selectedType) { Alert.alert('Required', 'Please select an issue type.'); return; }
    if (!description.trim()) { Alert.alert('Required', 'Please describe your issue.'); return; }
    setEmailing(true);
    try {
      // The endpoint reads identity from the auth token, so no ids are sent.
      await api('/api/v1/support/contact-admin', {
        method: 'POST',
        body: {
          subject: subject.trim() || ISSUE_TYPES.find(t => t.key === selectedType)?.label,
          message: description.trim(),
          category: selectedType,
          priority: 'normal',
        },
      });
      setSubmitted(true);
      Alert.alert('Sent', 'Your message has been emailed to our administrators. You will get a copy by email.');
    } catch (err) {
      console.error('Error emailing admin:', err);
      Alert.alert('Error', 'Could not send the email. Please try again.');
    } finally {
      setEmailing(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType) { Alert.alert('Required', 'Please select an issue type.'); return; }
    if (!description.trim()) { Alert.alert('Required', 'Please describe your issue.'); return; }
    setSubmitting(true);
    try {
      const uid = await getStoredUserId() || '';
      const role = (await getStoredRole()) || 'PATIENT';
      await api('/api/v1/care/support/tickets', {
        method: 'POST',
        // Backend requires reporterId + role + category + subject + description.
        body: {
          reporterId: uid,
          role,
          category: selectedType,
          subject: subject.trim() || ISSUE_TYPES.find(t => t.key === selectedType)?.label,
          description: description.trim(),
          priority: 'normal',
        },
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting support ticket:', err);
      Alert.alert('Error', 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedType(null);
    setSubject('');
    setDescription('');
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <View style={styles.successIcon}>
          <Ionicons name="checkmark-circle" size={64} color={MedicalColors.success} />
        </View>
        <Text style={styles.successTitle}>Ticket Submitted!</Text>
        <Text style={styles.successSub}>
          We've received your report and our support team will get back to you within 24-48 hours.
          {'\n\n'}Check your registered email for updates.
        </Text>
        <TouchableOpacity style={styles.submitBtn} onPress={handleReset}>
          <Text style={styles.submitBtnText}>Submit Another</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Ionicons name="headset" size={28} color={MedicalColors.primary} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <Text style={styles.headerSub}>We're here to help — tell us what's wrong</Text>
        </View>
      </View>

      {/* Issue Type */}
      <Text style={styles.sectionTitle}>What's the issue?</Text>
      <View style={styles.typeGrid}>
        {ISSUE_TYPES.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeCard, selectedType === t.key && { borderColor: t.color, backgroundColor: t.color + '10' }]}
            onPress={() => setSelectedType(t.key)}
          >
            <Ionicons name={t.icon} size={22} color={selectedType === t.key ? t.color : MedicalColors.textSecondary} />
            <Text style={[styles.typeLabel, selectedType === t.key && { color: t.color }]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Subject */}
      <Text style={styles.sectionTitle}>Subject (optional)</Text>
      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of your issue..."
          placeholderTextColor={MedicalColors.textLight}
        />
      </View>

      {/* Description */}
      <Text style={styles.sectionTitle}>Describe the issue *</Text>
      <View style={styles.card}>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Please provide as much detail as possible — what happened, when, and any steps to reproduce if it's a bug..."
          placeholderTextColor={MedicalColors.textLight}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, (submitting || !selectedType) && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={submitting || !selectedType}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="send-outline" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Submit Support Ticket</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Second route to the same people: files the ticket AND emails the
          administrators now, for anyone who would rather reach a person than
          wait on a queue. */}
      <TouchableOpacity
        style={[styles.emailAdminBtn, (emailing || !selectedType) && { opacity: 0.6 }]}
        onPress={handleEmailAdmin}
        disabled={emailing || !selectedType}
      >
        {emailing ? (
          <ActivityIndicator color="#2563eb" size="small" />
        ) : (
          <>
            <Ionicons name="mail-outline" size={18} color="#2563eb" />
            <Text style={styles.emailAdminBtnText}>Email an Administrator</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.emailAdminHint}>
        Sends your message to our admin team by email. You will receive a copy.
      </Text>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MedicalColors.background },
  content: { padding: 16 },

  successContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: MedicalColors.background },
  successIcon: { marginBottom: 20 },
  successTitle: { fontSize: 22, fontWeight: '800', color: MedicalColors.text, marginBottom: 12, textAlign: 'center' },
  successSub: { fontSize: 14, color: MedicalColors.textSecondary, textAlign: 'center', lineHeight: 22 },

  headerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: MedicalColors.primaryLight, borderRadius: 14,
    padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#bfdbfe',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: MedicalColors.text, marginBottom: 2 },
  headerSub: { fontSize: 12, color: MedicalColors.textSecondary },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: MedicalColors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 10, marginTop: 4,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  typeCard: {
    width: '47%', alignItems: 'center', gap: 6,
    backgroundColor: MedicalColors.surface, borderRadius: 12,
    padding: 14, borderWidth: 1.5, borderColor: MedicalColors.border,
  },
  typeLabel: { fontSize: 12, fontWeight: '600', color: MedicalColors.textSecondary, textAlign: 'center' },

  card: {
    backgroundColor: MedicalColors.surface, borderRadius: 14,
    padding: 14, marginBottom: 16, borderWidth: 1, borderColor: MedicalColors.border,
  },
  input: {
    fontSize: 14, color: MedicalColors.text,
    borderWidth: 1.5, borderColor: MedicalColors.border,
    borderRadius: 10, padding: 12,
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: MedicalColors.primary, borderRadius: 12,
    padding: 16, marginTop: 8,
  },
  emailAdminBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, marginHorizontal: 16, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: '#bfdbfe', backgroundColor: '#eff6ff',
  },
  emailAdminBtnText: { fontSize: 15, fontWeight: '700', color: '#2563eb' },
  emailAdminHint: {
    fontSize: 11, color: '#94a3b8', textAlign: 'center',
    marginTop: 6, marginHorizontal: 24, lineHeight: 16,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default SupportScreen;
