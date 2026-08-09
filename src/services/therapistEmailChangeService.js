import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, STORAGE_KEYS } from './apiClient';

export function mapEmailChangeError(err) {
  const msg = err?.message || String(err);
  if (/current password|invalid.*credential|wrong.*password/i.test(msg)) {
    return 'Current password is incorrect.';
  }
  if (/already in use|already registered/i.test(msg)) {
    return 'That email is already registered to another account. Pick a different email, or sign in with that account instead.';
  }
  if (/invalid.*email/i.test(msg)) {
    return 'Enter a valid email address.';
  }
  if (msg) return msg;
  return 'Could not update email. Check your password and try again.';
}

export async function changeTherapistLoginEmail(newEmailRaw, currentPassword, loginEmail) {
  const next = newEmailRaw.trim().toLowerCase();
  const cur = (loginEmail || '').trim().toLowerCase();

  if (!next || next === cur) throw new Error('Enter a new email address.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new Error('Enter a valid email address.');
  if (!currentPassword) throw new Error('Enter your current password to confirm.');

  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) throw new Error('You are not signed in. Please sign in again.');

  await api('/api/v1/auth/email-change', {
    method: 'POST',
    body: { userId, currentPassword, newEmail: next },
  });

  return { type: 'updated', message: 'Login email updated successfully.', email: next };
}

export function mapPasswordChangeError(err) {
  const msg = err?.message || String(err);
  if (/current password|invalid.*credential|wrong.*password/i.test(msg)) {
    return 'Current password is incorrect.';
  }
  if (/at least 8/i.test(msg)) {
    return 'Password must be at least 8 characters.';
  }
  if (msg) return msg;
  return 'Could not update password. Try again.';
}

export async function changeTherapistPassword(currentPassword, newPassword, confirmPassword, loginEmail) {
  if (!newPassword || newPassword.length < 8) throw new Error('Password must be at least 8 characters.');
  if (newPassword !== confirmPassword) throw new Error('New passwords do not match.');
  if (!currentPassword) throw new Error('Enter your current password to confirm.');

  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) throw new Error('You are not signed in. Please sign in again.');

  await api('/api/v1/auth/password-change', {
    method: 'POST',
    body: { userId, currentPassword, newPassword },
  });

  return { message: 'Password updated successfully.' };
}
