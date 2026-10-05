import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { MedicalColors } from '../../constants/colors';

const InsuranceDetailsScreen = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    provider: '',
    planType: '',
    policyNumber: '',
    groupNumber: '',
    memberId: '',
    expiryDate: '',
    deductible: '',
    copay: '',
    outOfPocketMax: '',
    notes: '',
  });

  useEffect(() => {
    loadInsurance();
  }, []);

  const loadInsurance = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid) return;
      const data = await api(`/api/v1/patients/${uid}`).catch(() => null);
      if (data?.insurance) setForm(prev => ({ ...prev, ...data.insurance }));
    } catch (err) {
      console.error('Error loading insurance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.provider.trim()) {
      Alert.alert('Required', 'Please enter your insurance provider name.');
      return;
    }
    setSaving(true);
    try {
      const uid = await getStoredUserId();
      await api(`/api/v1/patients/${uid}`, { method: 'PATCH', body: { insurance: form } });
      Alert.alert('Saved', 'Your insurance details have been updated.');
    } catch (err) {
      console.error('Error saving insurance:', err);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const field = (label, key, opts = {}) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={form[key]}
        onChangeText={v => setForm(prev => ({ ...prev, [key]: v }))}
        placeholderTextColor={MedicalColors.textLight}
        {...opts}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MedicalColors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled" style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View style={styles.headerIcon}>
          <Ionicons name="shield-checkmark" size={28} color={MedicalColors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Insurance Details</Text>
          <Text style={styles.headerSub}>Your doctor can view this to coordinate coverage</Text>
        </View>
      </View>

      {/* Section: Plan Info */}
      <Text style={styles.sectionTitle}>Plan Information</Text>
      <View style={styles.card}>
        {field('Insurance Provider *', 'provider', { placeholder: 'e.g., Blue Cross Blue Shield' })}
        {field('Plan Type', 'planType', { placeholder: 'e.g., HMO, PPO, EPO' })}
        {field('Policy Number', 'policyNumber', { placeholder: 'e.g., XYZ123456' })}
        {field('Group Number', 'groupNumber', { placeholder: 'e.g., GRP987654' })}
        {field('Member ID', 'memberId', { placeholder: 'e.g., MBR000123' })}
        {field('Expiry Date', 'expiryDate', { placeholder: 'MM/YYYY', keyboardType: 'numbers-and-punctuation' })}
      </View>

      {/* Section: Cost Info */}
      <Text style={styles.sectionTitle}>Coverage Details</Text>
      <View style={styles.card}>
        {field('Deductible', 'deductible', { placeholder: 'e.g., $1,500/year', keyboardType: 'default' })}
        {field('Co-pay', 'copay', { placeholder: 'e.g., $30 per visit' })}
        {field('Out-of-Pocket Max', 'outOfPocketMax', { placeholder: 'e.g., $5,000/year' })}
      </View>

      {/* Section: Notes */}
      <Text style={styles.sectionTitle}>Additional Notes</Text>
      <View style={styles.card}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.fieldInput, styles.textArea]}
            value={form.notes}
            onChangeText={v => setForm(prev => ({ ...prev, notes: v }))}
            placeholder="e.g., secondary insurance, pre-auth requirements..."
            placeholderTextColor={MedicalColors.textLight}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.65 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.saveBtnText}>Save Insurance Details</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MedicalColors.background },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: MedicalColors.background },

  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: MedicalColors.primaryLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: MedicalColors.text, marginBottom: 2 },
  headerSub: { fontSize: 12, color: MedicalColors.textSecondary, lineHeight: 17 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: MedicalColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: MedicalColors.text, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: MedicalColors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: MedicalColors.text,
    backgroundColor: MedicalColors.cardBg,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: MedicalColors.primary,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default InsuranceDetailsScreen;
