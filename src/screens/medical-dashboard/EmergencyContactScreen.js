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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import { MedicalColors } from '../../constants/colors';

const RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Friend', 'Guardian', 'Other'];

const emptyContact = { name: '', relationship: '', phone: '', email: '' };

const EmergencyContactScreen = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editIndex, setEditIndex] = useState(null); // null = new
  const [form, setForm] = useState(emptyContact);
  const [showRelPicker, setShowRelPicker] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const uid = await getStoredUserId();
      if (!uid) return;
      const data = await api(`/api/v1/patients/${uid}`).catch(() => null);
      if (data?.emergencyContacts) setContacts(data.emergencyContacts);
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  const persistContacts = async (updated) => {
    const uid = await getStoredUserId();
    await api(`/api/v1/patients/${uid}`, { method: 'PATCH', body: { emergencyContacts: updated } });
  };

  const openAdd = () => {
    setForm(emptyContact);
    setEditIndex(null);
    setShowRelPicker(false);
    setShowModal(true);
  };

  const openEdit = (idx) => {
    setForm({ ...contacts[idx] });
    setEditIndex(idx);
    setShowRelPicker(false);
    setShowModal(true);
  };

  const handleSaveContact = async () => {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter the contact\'s name.'); return; }
    if (!form.phone.trim()) { Alert.alert('Required', 'Please enter a phone number.'); return; }
    setSaving(true);
    try {
      let updated;
      if (editIndex !== null) {
        updated = contacts.map((c, i) => i === editIndex ? form : c);
      } else {
        updated = [...contacts, form];
      }
      await persistContacts(updated);
      setContacts(updated);
      setShowModal(false);
    } catch (err) {
      console.error('Error saving contact:', err);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (idx) => {
    Alert.alert('Remove Contact', `Remove ${contacts[idx].name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          const updated = contacts.filter((_, i) => i !== idx);
          try {
            await persistContacts(updated);
            setContacts(updated);
          } catch (err) { Alert.alert('Error', 'Failed to remove.'); }
        }
      },
    ]);
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color={MedicalColors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerCard}>
          <View style={styles.headerIcon}>
            <Ionicons name="call" size={26} color={MedicalColors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Emergency Contacts</Text>
            <Text style={styles.headerSub}>People to contact in case of a medical emergency</Text>
          </View>
        </View>

        {contacts.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={54} color={MedicalColors.textLight} />
            <Text style={styles.emptyTitle}>No emergency contacts</Text>
            <Text style={styles.emptySubtitle}>Add at least one person your doctor can contact in an emergency.</Text>
          </View>
        ) : (
          contacts.map((c, idx) => (
            <View key={idx} style={styles.contactCard}>
              <View style={styles.contactAvatar}>
                <Text style={styles.contactAvatarText}>{(c.name || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.name}</Text>
                {c.relationship ? <Text style={styles.contactRel}>{c.relationship}</Text> : null}
                <View style={styles.contactDetails}>
                  {c.phone ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="call-outline" size={13} color={MedicalColors.textSecondary} />
                      <Text style={styles.detailText}>{c.phone}</Text>
                    </View>
                  ) : null}
                  {c.email ? (
                    <View style={styles.detailRow}>
                      <Ionicons name="mail-outline" size={13} color={MedicalColors.textSecondary} />
                      <Text style={styles.detailText}>{c.email}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={styles.contactActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(idx)}>
                  <Ionicons name="pencil-outline" size={18} color={MedicalColors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(idx)}>
                  <Ionicons name="trash-outline" size={18} color={MedicalColors.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Ionicons name="add-circle-outline" size={20} color={MedicalColors.primary} />
          <Text style={styles.addBtnText}>Add Emergency Contact</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editIndex !== null ? 'Edit Contact' : 'New Contact'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Ionicons name="close" size={22} color={MedicalColors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={v => setForm(p => ({ ...p, name: v }))}
                placeholder="Contact's full name"
                placeholderTextColor={MedicalColors.textLight}
              />

              {/* Relationship */}
              <Text style={styles.label}>Relationship</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowRelPicker(v => !v)}
                activeOpacity={0.8}
              >
                <Text style={form.relationship ? styles.inputText : styles.inputPlaceholder}>
                  {form.relationship || 'Select relationship'}
                </Text>
              </TouchableOpacity>
              {showRelPicker && (
                <View style={styles.picker}>
                  {RELATIONSHIPS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.pickerItem, form.relationship === r && styles.pickerItemActive]}
                      onPress={() => { setForm(p => ({ ...p, relationship: r })); setShowRelPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, form.relationship === r && styles.pickerItemTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Phone */}
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={v => setForm(p => ({ ...p, phone: v }))}
                placeholder="+1 (555) 000-0000"
                placeholderTextColor={MedicalColors.textLight}
                keyboardType="phone-pad"
              />

              {/* Email */}
              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={v => setForm(p => ({ ...p, email: v }))}
                placeholder="contact@example.com"
                placeholderTextColor={MedicalColors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.65 }]}
                onPress={handleSaveContact}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{editIndex !== null ? 'Update Contact' : 'Save Contact'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
    backgroundColor: '#fff7ed',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  headerIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: MedicalColors.text, marginBottom: 2 },
  headerSub: { fontSize: 12, color: MedicalColors.textSecondary, lineHeight: 17 },

  emptyState: { alignItems: 'center', paddingVertical: 50 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: MedicalColors.text, marginTop: 14 },
  emptySubtitle: { fontSize: 13, color: MedicalColors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: MedicalColors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: MedicalColors.border,
  },
  contactAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: MedicalColors.primaryLight,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  contactAvatarText: { fontSize: 18, fontWeight: '700', color: MedicalColors.primary },
  contactName: { fontSize: 15, fontWeight: '700', color: MedicalColors.text },
  contactRel: { fontSize: 12, color: MedicalColors.primary, fontWeight: '600', marginBottom: 4 },
  contactDetails: { gap: 3 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailText: { fontSize: 12, color: MedicalColors.textSecondary },
  contactActions: { gap: 6, alignItems: 'flex-end' },
  iconBtn: { padding: 6 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: MedicalColors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 6,
    borderWidth: 2,
    borderColor: MedicalColors.primary,
    borderStyle: 'dashed',
  },
  addBtnText: { color: MedicalColors.primary, fontSize: 15, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: MedicalColors.text },

  label: { fontSize: 13, fontWeight: '600', color: MedicalColors.text, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: MedicalColors.text,
    backgroundColor: MedicalColors.cardBg, justifyContent: 'center',
  },
  inputText: { fontSize: 14, color: MedicalColors.text },
  inputPlaceholder: { fontSize: 14, color: MedicalColors.textLight },

  picker: {
    borderWidth: 1.5, borderColor: MedicalColors.border, borderRadius: 10,
    marginTop: 4, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 4,
  },
  pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: MedicalColors.border },
  pickerItemActive: { backgroundColor: MedicalColors.primaryLight },
  pickerItemText: { fontSize: 14, color: MedicalColors.text },
  pickerItemTextActive: { color: MedicalColors.primary, fontWeight: '700' },

  saveBtn: {
    backgroundColor: MedicalColors.primary, borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 20, marginBottom: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

export default EmergencyContactScreen;
