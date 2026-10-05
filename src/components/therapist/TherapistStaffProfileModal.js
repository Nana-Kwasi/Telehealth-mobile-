import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TherapistColors } from '../../constants/colors';
import { GlassScrim, GlassSheetSurface } from '../GlassSheet';
import { resolveFileUrl } from '../../utils/mediaUrl';

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{String(value)}</Text>
    </View>
  );
}

export default function TherapistStaffProfileModal({ visible, user, mode, isAdmin, onClose }) {
  if (!user) return null;

  const title = mode === 'manage' ? 'Manage user' : 'User profile';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <GlassScrim />
        <GlassSheetSurface style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.subtitle}>{user.name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.profileRow}>
              {user.photoURL ? (
                <Image source={{ uri: resolveFileUrl(user.photoURL)}} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{(user.name || '?')[0].toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{user.name}</Text>
                <Text style={styles.role}>{user.role || 'Therapist'}</Text>
                <Text style={styles.type}>{user.type || 'Professional'}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Account</Text>
            <Field label="Email" value={user.email} />
            <Field label="Phone" value={user.phone} />
            <Field label="Years of experience" value={user.yearsExperience} />

            <Text style={styles.sectionTitle}>Professional</Text>
            <Field label="License number" value={user.licenseNumber} />
            <Field label="Licensing authority" value={user.licensingAuthority} />
            <Field label="Practice" value={user.practiceName} />
            <Field label="Specialties" value={Array.isArray(user.specialties) ? user.specialties.join(', ') : user.specialties} />
            <Field label="Bio" value={user.bio} />

            {mode === 'manage' && isAdmin ? (
              <Text style={styles.manageNote}>
                User management edits sync from the web admin portal. View-only on mobile for now.
              </Text>
            ) : null}
          </ScrollView>
        </GlassSheetSurface>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0d0d0d' },
  subtitle: { fontSize: 13, color: '#0d0d0d', marginTop: 2 },
  closeBtn: { padding: 4 },
  body: { padding: 18, paddingBottom: 32 },
  profileRow: { flexDirection: 'row', gap: 14, marginBottom: 20, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 18 },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: TherapistColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: '#fff' },
  name: { fontSize: 18, fontWeight: '800', color: '#0d0d0d' },
  role: { fontSize: 13, color: TherapistColors.primary, fontWeight: '600', marginTop: 2 },
  type: { fontSize: 12, color: '#0d0d0d', marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3d3d3d',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
  },
  field: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.16)',
  },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: '#3d3d3d', marginBottom: 3 },
  fieldValue: { fontSize: 15, color: '#0d0d0d' },
  manageNote: {
    marginTop: 20,
    fontSize: 13,
    color: '#0d0d0d',
    lineHeight: 20,
    backgroundColor: 'transparent',
    padding: 12,
    borderRadius: 10,
  },
});
