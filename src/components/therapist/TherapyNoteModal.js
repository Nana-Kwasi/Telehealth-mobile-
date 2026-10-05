import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TherapistColors } from '../../constants/colors';
import { GlassScrim, GlassSheetSurface } from '../GlassSheet';

const MOOD_OPTIONS = ['Anxious', 'Calm', 'Sad', 'Hopeful', 'Angry', 'Excited', 'Neutral', 'Depressed', 'Optimistic', 'Stressed'];
const PROGRESS_OPTIONS = ['Significantly Improved', 'Improved', 'Slight Improvement', 'No Change', 'Slight Decline', 'Worsened'];
const INTERVENTION_OPTIONS = ['CBT', 'Mindfulness', 'Role Play', 'Supportive Listening', 'Psychoeducation', 'Exposure Therapy', 'Solution-Focused', 'Other'];

const emptyNote = () => ({
  sessionDate: new Date().toISOString().split('T')[0],
  sessionTime: '',
  sessionNumber: '',
  mood: '',
  behavioralObservations: '',
  sessionFocus: '',
  interventionsUsed: '',
  clientResponse: '',
  progressAssessment: '',
  moodRating: 5,
  homework: '',
  nextSessionFocus: '',
});

export default function TherapyNoteModal({ visible, client, onClose, onSave }) {
  const [noteData, setNoteData] = useState(emptyNote);
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    setNoteData(emptyNote());
    onClose();
  };

  const handleSubmit = async () => {
    if (!noteData.sessionFocus?.trim() || !noteData.mood) return;
    setSaving(true);
    try {
      await onSave(noteData);
      setNoteData(emptyNote());
    } finally {
      setSaving(false);
    }
  };

  const clientName = client?.name || client?.displayName || 'Client';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <GlassScrim />
          <GlassSheetSurface style={styles.sheet}>
            <View style={styles.header}>
              <Text style={styles.title}>Session Note — {clientName}</Text>
              <TouchableOpacity onPress={handleClose} hitSlop={12}>
                <Ionicons name="close" size={22} color={TherapistColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>Session Information</Text>
              <Field label="Date *">
                <TextInput
                  style={styles.input}
                  value={noteData.sessionDate}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, sessionDate: v }))}
                  placeholder="YYYY-MM-DD"
                />
              </Field>
              <Field label="Time">
                <TextInput
                  style={styles.input}
                  value={noteData.sessionTime}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, sessionTime: v }))}
                  placeholder="HH:MM"
                />
              </Field>
              <Field label="Session #">
                <TextInput
                  style={styles.input}
                  value={noteData.sessionNumber}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, sessionNumber: v }))}
                  placeholder="e.g. Session 3"
                />
              </Field>
              <Field label="Mood *">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  {MOOD_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o}
                      style={[styles.chip, noteData.mood === o && styles.chipActive]}
                      onPress={() => setNoteData((p) => ({ ...p, mood: o }))}
                    >
                      <Text style={[styles.chipText, noteData.mood === o && styles.chipTextActive]}>{o}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Field>

              <Text style={styles.sectionTitle}>Session Details</Text>
              <Field label="Session Focus / Issues Discussed *">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={noteData.sessionFocus}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, sessionFocus: v }))}
                  placeholder="Main topics covered…"
                />
              </Field>
              <Field label="Interventions Used">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  {INTERVENTION_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o}
                      style={[styles.chip, noteData.interventionsUsed === o && styles.chipActive]}
                      onPress={() => setNoteData((p) => ({ ...p, interventionsUsed: o }))}
                    >
                      <Text style={[styles.chipText, noteData.interventionsUsed === o && styles.chipTextActive]}>{o}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Field>
              <Field label="Progress Assessment">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
                  {PROGRESS_OPTIONS.map((o) => (
                    <TouchableOpacity
                      key={o}
                      style={[styles.chip, noteData.progressAssessment === o && styles.chipActive]}
                      onPress={() => setNoteData((p) => ({ ...p, progressAssessment: o }))}
                    >
                      <Text style={[styles.chipText, noteData.progressAssessment === o && styles.chipTextActive]} numberOfLines={1}>
                        {o}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </Field>
              <Field label="Client Response">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={noteData.clientResponse}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, clientResponse: v }))}
                />
              </Field>
              <Field label="Behavioral Observations">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={noteData.behavioralObservations}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, behavioralObservations: v }))}
                />
              </Field>
              <Field label={`Mood Rating (1–10): ${noteData.moodRating}`}>
                <View style={styles.ratingRow}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.ratingBtn, noteData.moodRating === n && styles.ratingBtnActive]}
                      onPress={() => setNoteData((p) => ({ ...p, moodRating: n }))}
                    >
                      <Text style={[styles.ratingBtnText, noteData.moodRating === n && styles.ratingBtnTextActive]}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>

              <Text style={styles.sectionTitle}>Plan</Text>
              <Field label="Homework / Between-session Tasks">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={noteData.homework}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, homework: v }))}
                />
              </Field>
              <Field label="Next Session Focus">
                <TextInput
                  style={[styles.input, styles.textArea]}
                  multiline
                  value={noteData.nextSessionFocus}
                  onChangeText={(v) => setNoteData((p) => ({ ...p, nextSessionFocus: v }))}
                />
              </Field>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!noteData.sessionFocus?.trim() || !noteData.mood || saving) && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={!noteData.sessionFocus?.trim() || !noteData.mood || saving}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save Note</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </GlassSheetSurface>
        </KeyboardAvoidingView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: TherapistColors.text, marginRight: 8 },
  form: { padding: 16, paddingBottom: 32 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TherapistColors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
    marginTop: 8,
  },
  field: { marginBottom: 14,
  },
  label: { fontSize: 12, fontWeight: '600', color: '#0d0d0d', marginBottom: 6 },
  input: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(16,16,16,0.16)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TherapistColors.text,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  chipRow: { flexDirection: 'row', marginBottom: 4 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.72)',
    marginRight: 8,
    marginBottom: 6,
  },
  chipActive: { backgroundColor: TherapistColors.primary },
  chipText: { fontSize: 12, color: TherapistColors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ratingBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBtnActive: { backgroundColor: TherapistColors.primary },
  ratingBtnText: { fontSize: 13, fontWeight: '600', color: TherapistColors.textSecondary },
  ratingBtnTextActive: { color: '#fff' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cancelBtnText: { fontWeight: '600', color: '#0d0d0d' },
  saveBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
  },
  saveBtnText: { fontWeight: '700', color: '#fff' },
});
