import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MedicalColors } from '../../constants/colors';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { emoji: '🤒', label: 'Fever / Flu',  specialty: 'General Practice' },
  { emoji: '❤️', label: 'Heart / Chest', specialty: 'Cardiology' },
  { emoji: '🦷', label: 'Skin / Rash',   specialty: 'Dermatology' },
  { emoji: '👶', label: 'Child Health',  specialty: 'Pediatrics' },
  { emoji: '🦴', label: 'Bone / Joint',  specialty: 'Orthopedics' },
  { emoji: '👁️', label: 'Eyes',           specialty: 'Ophthalmology' },
  { emoji: '👂', label: 'Ear / Nose',    specialty: 'ENT' },
  { emoji: '🫁', label: 'Breathing',     specialty: 'General Practice' },
  { emoji: '🩺', label: 'Other',         specialty: null },
];

const URGENCY = [
  { key: 'routine', label: 'Routine check-up',   desc: 'Not urgent, general care' },
  { key: 'soon',    label: 'Soon — within days', desc: 'Uncomfortable but manageable' },
  { key: 'urgent',  label: 'Urgent — today',      desc: 'Significant pain or concern' },
];

export default function MedicalIntakeScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState(null);
  const [description, setDescription] = useState('');
  const [urgency, setUrgency] = useState('routine');

  const goBack = () => {
    if (step === 1) { navigation.goBack(); return; }
    setStep(s => s - 1);
  };

  const handleSkip = async () => {
    try {
      await AsyncStorage.setItem('th.medicalSkip', 'true');
      await AsyncStorage.setItem('userIntent', 'medical');
    } catch (_) {}
    navigation.navigate('SignUp');
  };

  const handleCategorySelect = (cat) => {
    setSelected(cat);
    setStep(2);
  };

  const handleContinue = () => {
    if (step === 2) { setStep(3); return; }
    // Navigate to doctor search with intake params
    navigation.navigate('DoctorSearch', {
      intakeSpecialty: selected?.specialty || null,
      intakeQuery: description.trim(),
      urgency,
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        {/* Progress dots */}
        <View style={styles.dots}>
          {[1, 2, 3].map(n => (
            <View key={n} style={[styles.dot, step >= n && styles.dotActive]} />
          ))}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Step 1 — Category */}
        {step === 1 && (
          <View>
            <Text style={styles.stepEmoji}>🩺</Text>
            <Text style={styles.title}>What brings you in today?</Text>
            <Text style={styles.sub}>Select the area that best describes your concern.</Text>
            <View style={styles.grid}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.label}
                  style={styles.catBtn}
                  onPress={() => handleCategorySelect(cat)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.catEmoji}>{cat.emoji}</Text>
                  <Text style={styles.catLabel}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Step 2 — Describe */}
        {step === 2 && (
          <View>
            <Text style={styles.stepEmoji}>{selected?.emoji}</Text>
            <Text style={styles.title}>Tell us a bit more</Text>
            <Text style={styles.sub}>
              Describe your symptoms briefly. Doctors will see this before your consultation.
            </Text>
            <TextInput
              style={styles.textarea}
              placeholder={`E.g. "I've had a headache and mild fever for 3 days…"`}
              placeholderTextColor="#9ca3af"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              autoFocus
            />
            <TouchableOpacity style={styles.cta} onPress={handleContinue} activeOpacity={0.85}>
              <Text style={styles.ctaText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 3 — Urgency */}
        {step === 3 && (
          <View>
            <Text style={styles.stepEmoji}>⏱️</Text>
            <Text style={styles.title}>How soon do you need care?</Text>
            <Text style={styles.sub}>This helps us show doctors available at the right time.</Text>
            <View style={styles.urgencyList}>
              {URGENCY.map(u => (
                <TouchableOpacity
                  key={u.key}
                  style={[styles.urgencyBtn, urgency === u.key && styles.urgencyBtnSelected]}
                  onPress={() => setUrgency(u.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.urgencyLabel, urgency === u.key && styles.urgencyLabelSelected]}>
                    {u.label}
                  </Text>
                  <Text style={styles.urgencyDesc}>{u.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.cta} onPress={handleContinue} activeOpacity={0.85}>
              <Text style={styles.ctaText}>Find matching doctors →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Skip option — always visible */}
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>I'll find a doctor later — Sign up without booking</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 20, color: '#374151', fontWeight: '600' },

  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 24, height: 4, borderRadius: 9999, backgroundColor: '#e5e7eb' },
  dotActive: { backgroundColor: MedicalColors.primary },

  scroll: { padding: 24, paddingBottom: 48 },

  stepEmoji: { fontSize: 36, textAlign: 'center', marginBottom: 12 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
    paddingHorizontal: 8,
  },

  /* Category grid — 3 columns */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  catBtn: {
    width: (width - 68) / 3,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
    alignItems: 'center',
    gap: 6,
  },
  catEmoji: { fontSize: 22 },
  catLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
    lineHeight: 14,
  },

  /* Textarea */
  textarea: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    minHeight: 130,
    marginBottom: 20,
    lineHeight: 22,
  },

  /* Urgency */
  urgencyList: { gap: 10, marginBottom: 24 },
  urgencyBtn: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  urgencyBtnSelected: {
    borderColor: MedicalColors.primary,
    backgroundColor: '#e8f1fb',
  },
  urgencyLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 3,
  },
  urgencyLabelSelected: { color: MedicalColors.primary },
  urgencyDesc: { fontSize: 13, color: '#6b7280' },

  /* CTA */
  cta: {
    backgroundColor: MedicalColors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: MedicalColors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  /* Skip */
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 18,
    marginTop: 8,
  },
  skipText: {
    fontSize: 13,
    color: '#9ca3af',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
});
