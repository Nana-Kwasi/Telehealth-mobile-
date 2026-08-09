import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/apiClient';
import { performLogout } from '../services/authService';
import { Colors } from '../constants/colors';

export function getForcedPasswordFirestoreTarget(userRole, profile) {
  const id = profile?.id;
  if (!id) return null;
  switch (userRole) {
    case 'doctor':
      return { collection: 'doctors', docId: id };
    case 'therapist':
    case 'admin':
      return { collection: 'therapists', docId: id };
    case 'client':
      return { collection: 'auth', docId: id };
    case 'patient':
      return { collection: 'patients', docId: id };
    case 'pharmacy':
      return { collection: 'pharmacies', docId: id };
    case 'branch_user':
      return { collection: 'pharmacyBranches', docId: id };
    case 'lab':
      return { collection: 'labs', docId: id };
    case 'lab_branch':
      return { collection: 'labBranches', docId: id };
    case 'scan':
      return { collection: 'scanCenters', docId: id };
    case 'scan_branch':
      return { collection: 'scanBranches', docId: id };
    case 'homecare_nurse':
      return { collection: 'homeCareNurses', docId: id };
    default:
      return null;
  }
}

export default function ForcedPasswordChangeGateMobile({ active, userRole, profile, onSuccess }) {
  const target = useMemo(
    () => getForcedPasswordFirestoreTarget(userRole, profile),
    [userRole, profile],
  );
  const visible =
    !!active &&
    profile?.mustChangePassword === true &&
    !!target?.collection &&
    !!target?.docId;

  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleChangePassword = async () => {
    setPwError('');
    if (newPw.length < 8) { setPwError('Password must be at least 8 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }
    setPwSaving(true);
    try {
      const userId = await AsyncStorage.getItem('th.userId');
      if (!userId) { setPwError('Not signed in.'); return; }
      await api('/api/v1/auth/password-change', {
        method: 'POST',
        body: { userId, currentPassword: profile?.tempPassword || newPw, newPassword: newPw },
      });
      setNewPw(''); setConfirmPw('');
      onSuccess?.();
    } catch (err) {
      setPwError(err?.message || 'Failed to update password. Try again.');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.pwCard}>
          <Text style={styles.pwTitle}>Password reset required</Text>
          <Text style={styles.pwSub}>
            Your administrator set a temporary password. Set a new one to continue.
          </Text>
          {pwError ? <Text style={styles.pwError}>{pwError}</Text> : null}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.pwLabel}>New password</Text>
            <TextInput
              style={styles.pwInput}
              secureTextEntry
              value={newPw}
              onChangeText={setNewPw}
              placeholder="••••••••"
              autoCapitalize="none"
            />
          </View>
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.pwLabel}>Confirm new password</Text>
            <TextInput
              style={styles.pwInput}
              secureTextEntry
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="••••••••"
              autoCapitalize="none"
            />
          </View>
          <TouchableOpacity
            style={[styles.pwBtn, pwSaving && { opacity: 0.6 }]}
            onPress={handleChangePassword}
            disabled={pwSaving}
          >
            {pwSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.pwBtnText}>Set password and continue</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              try {
                await performLogout();
              } catch (_) {}
            }}
            style={styles.pwLogout}
          >
            <Text style={styles.pwLogoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pwCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  pwTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  pwSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  pwError: {
    backgroundColor: '#fff1f2',
    borderRadius: 8,
    padding: 10,
    color: '#be123c',
    fontSize: 13,
    marginBottom: 12,
  },
  pwLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 6,
  },
  pwInput: {
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: Colors.text,
  },
  pwBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  pwBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pwLogout: { alignItems: 'center', marginTop: 12 },
  pwLogoutText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },
});
