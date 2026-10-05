import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  Modal,
  DeviceEventEmitter,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signInWithEmailOrUsername, completeTwoFactorSignIn, signInWithRefreshToken } from '../services/authService';
import { api } from '../services/apiClient';
import { fetchClientData } from '../services/clientDataService';
import { Colors } from '../constants/colors';
import { logAction, A } from '../utils/auditLogger';
import { PRIVACY_STORAGE_KEY, syncPrivacyConsentToUser } from '../services/privacyConsentService';
import { resetToHomeCarePatientDashboard } from '../utils/homeCareNavigation';
import { applyCoupleLandingIfNeeded } from '../services/coupleTherapyService';
import { COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import {
  biometricCapability,
  isBiometricLoginEnabled,
  unlockRefreshToken,
  disableBiometricLogin,
  enableBiometricLogin,
} from '../services/biometricAuth';

const friendlyAuthError = (err) => {
  const msg = err?.message || err?.error || 'Unable to sign in right now.';
  if (msg.includes('Session expired')) return 'Your session expired. Please sign in again.';
  if (msg.includes('verification') || msg.includes('code')) return msg;
  if (msg.includes('invalid') || msg.includes('incorrect') || msg.includes('credential')) {
    return 'That email and password do not match. Please try again.';
  }
  return msg;
};

const LoginScreen = ({ navigation, route }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [challengeEmail, setChallengeEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  // "Face ID" / "Fingerprint" / "Biometrics" — whatever this device actually has.
  const [biometricLabel, setBiometricLabel] = useState('Biometrics');

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    const prime = async () => {
      if (!route.params?.coupleResume) return;
      const { coupleId, partnerRole } = route.params;
      const pairs = [];
      if (coupleId) pairs.push([COUPLE_STORAGE_KEYS.coupleId, coupleId]);
      if (partnerRole) pairs.push([COUPLE_STORAGE_KEYS.partnerRole, partnerRole]);
      if (pairs.length) await AsyncStorage.multiSet(pairs);
    };
    prime();
  }, [route.params?.coupleResume, route.params?.coupleId, route.params?.partnerRole]);

  useEffect(() => {
    const probeBiometric = async () => {
      try {
        // Capability is measured FIRST and unconditionally. It used to be
        // checked only when enrolment was already on, so the screen could
        // never say "this device supports Face ID" to someone who had not
        // turned it on yet — and there was no way to discover the feature
        // from here at all.
        const capability = await biometricCapability();
        setBiometricReady(Boolean(capability.available));
        setBiometricLabel(capability.label || 'Biometrics');

        const enabled = await isBiometricLoginEnabled();
        setBiometricEnabled(enabled);

        // Only auto-prompt when there is actually a saved session to unlock.
        if (enabled && capability.available) {
          await attemptBiometricLogin(true);
        }
      } catch {
        setBiometricEnabled(false);
        setBiometricReady(false);
      }
    };
    probeBiometric();
  }, []);

  const attemptBiometricLogin = async (enabledOverride = biometricEnabled) => {
    if (!enabledOverride) return;
    setError('');

    try {
      const capability = await biometricCapability();
      if (!capability.available) {
        await disableBiometricLogin();
        setBiometricEnabled(false);
        setBiometricReady(false);
        setError('Biometric sign-in is not available on this device. Please log in with your password to re-enable it.');
        return;
      }

      setLoading(true);
      const refreshToken = await unlockRefreshToken('Use Face ID or fingerprint to sign in');
      if (!refreshToken) {
        setLoading(false);
        return;
      }

      const result = await signInWithRefreshToken(refreshToken);
      await completeSignIn(result.role, result.profile, result.refreshToken);
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('reuse detected') || msg.includes('revoked') || msg.includes('expired')) {
        await disableBiometricLogin();
        setBiometricEnabled(false);
        setBiometricReady(false);
        setError('Your saved biometric sign-in expired. Please log in with your password to set it up again.');
      } else {
        setError(friendlyAuthError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    await attemptBiometricLogin(true);
  };

  const handleLogin = async () => {
    setError('');

    if (!identifier || !password) {
      setError('Both fields are required!');
      return;
    }

    try {
      setLoading(true);
      const result = await signInWithEmailOrUsername(identifier, password);

      if (result.twoFactorRequired) {
        setChallengeId(result.challengeId);
        setChallengeEmail(result.email || identifier);
        setVerificationCode('');
        setLoading(false);
        return;
      }

      await completeSignIn(result.role, result.profile, result.refreshToken);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTwoFactor = async () => {
    if (!challengeId) {
      setError('The verification code is missing. Please sign in again.');
      return;
    }

    if (!verificationCode.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    try {
      setLoading(true);
      const result = await completeTwoFactorSignIn(challengeId, verificationCode);
      await completeSignIn(result.role, result.profile, result.refreshToken);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Everything after a real token exists. Shared by the password, 2FA and
   * biometric paths so all three land in the same state — routing, stored
   * profile and privacy sync included.
   */
  /**
   * Offer biometric enrolment straight after a password sign-in.
   *
   * Asked here because this is the only moment we hold a fresh refresh token
   * AND have the user's attention. Burying it in Settings meant most people
   * never found it, and the login screen had nothing to show them.
   *
   * Declining is remembered for the session only — it is a prompt, not a
   * commitment, and Settings still has the switch.
   */
  const offerBiometricEnrolment = async (refreshToken, email) => {
    if (!refreshToken) return;
    try {
      if (await isBiometricLoginEnabled()) return;
      const capability = await biometricCapability();
      if (!capability.available) return;

      await new Promise((resolve) => {
        Alert.alert(
          `Use ${capability.label} next time?`,
          `Sign in with ${capability.label} instead of typing your password. `
          + 'Your password is never stored on this device.',
          [
            { text: 'Not now', style: 'cancel', onPress: resolve },
            {
              text: `Use ${capability.label}`,
              onPress: async () => {
                await enableBiometricLogin(refreshToken, email);
                resolve();
              },
            },
          ],
          { cancelable: false },
        );
      });
    } catch {
      // Enrolment is a convenience; never block a completed sign-in on it.
    }
  };

  const completeSignIn = async (role, profile, refreshToken) => {
    // Ask before routing away — once the navigator replaces this screen the
    // moment is gone.
    await offerBiometricEnrolment(refreshToken, profile?.email || identifier);
    try {
      const allowedRoles = [
        'client', 'patient', 'therapist', 'admin', 'doctor',
        'pharmacy', 'branch_user', 'lab', 'lab_branch', 'scan', 'scan_branch', 'homecare_nurse',
      ];
      if (!allowedRoles.includes(role)) {
        setError('Unable to determine your account type. Please contact support.');
        return;
      }
      logAction(A.LOGIN_SUCCESS, { role, identifier }, role);

      const privacyAccepted = await AsyncStorage.getItem(PRIVACY_STORAGE_KEY);
      if (privacyAccepted === 'true') {
        syncPrivacyConsentToUser({
          userId: profile?.id,
          role,
          profileId: profile?.id,
        }).catch(() => {});
      }

      await AsyncStorage.setItem('userRole', role);
      await AsyncStorage.setItem('userName', profile?.name || profile?.displayName || identifier);
      await AsyncStorage.setItem('userId', profile?.id || '');
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
      await AsyncStorage.setItem('isAuthenticated', 'true');

      // AppNavigator resolves `profile` once, in its start-up session check — which
      // runs before this login, so its state is still null. Dashboards that take
      // `profile` as a prop (pharmacy/branch/lab/scan) would render with null and
      // load nothing. Tell the navigator to re-read the profile we just stored.
      DeviceEventEmitter.emit('refreshProfile');

      // Therapists and admins go to therapist dashboard
      if (role === 'therapist' || role === 'admin') {
        await AsyncStorage.setItem('userIntent', 'therapist');
        navigation.replace('TherapistMain');
        return;
      }

      // Doctors go to the dedicated Doctor Portal
      if (role === 'doctor') {
        await AsyncStorage.setItem('userIntent', 'doctor');
        navigation.replace('DoctorMain');
        return;
      }

      if (role === 'pharmacy') {
        await AsyncStorage.setItem('userIntent', 'pharmacy');
        navigation.replace('PharmacyMain');
        return;
      }
      if (role === 'branch_user') {
        await AsyncStorage.setItem('userIntent', 'branch');
        navigation.replace('BranchMain');
        return;
      }
      if (role === 'lab') {
        await AsyncStorage.setItem('userIntent', 'lab');
        navigation.replace('LabMain');
        return;
      }
      if (role === 'lab_branch') {
        await AsyncStorage.setItem('userIntent', 'lab_branch');
        navigation.replace('LabBranchMain');
        return;
      }
      if (role === 'scan') {
        await AsyncStorage.setItem('userIntent', 'scan');
        navigation.replace('ScanMain');
        return;
      }
      if (role === 'scan_branch') {
        await AsyncStorage.setItem('userIntent', 'scan_branch');
        navigation.replace('ScanBranchMain');
        return;
      }
      if (role === 'homecare_nurse') {
        await AsyncStorage.setItem('userIntent', 'homecare_nurse');
        navigation.replace('HomeCareNurseMain');
        return;
      }

      // Medical patients (role PATIENT) go straight to the medical dashboard.
      // Routing here avoids the therapy-only fetchClientData() call below, which
      // 403s for a patient, and guarantees the correct intent independent of
      // any locally-cached userIntent.
      if (role === 'patient') {
        await AsyncStorage.setItem('userIntent', 'medical');
        if (profile?.id) await AsyncStorage.setItem('th.clientId', profile.id);
        navigation.replace('MedicalMain');
        return;
      }

      if (profile?.clientId) {
        await AsyncStorage.setItem('th.clientId', profile.clientId);
      } else if (profile?.id) {
        await AsyncStorage.setItem('th.clientId', profile.id);
      }

      let clientData = null;
      try {
        clientData = await fetchClientData();
        console.log('Client data fetched on login:', clientData);
      } catch (error) {
        console.error('Error fetching client data on login:', error);
      }

      if (role === 'client') {
        const coupleProfile = {
          ...profile,
          ...(clientData || {}),
          coupleId: profile?.coupleId || clientData?.coupleId,
          therapyType: profile?.therapyType || clientData?.therapyType,
          couplePartnerRole: profile?.couplePartnerRole || clientData?.couplePartnerRole,
          coupleIntakeComplete: profile?.coupleIntakeComplete ?? clientData?.coupleIntakeComplete,
        };
        const coupleHandled = await applyCoupleLandingIfNeeded(navigation, coupleProfile);
        if (coupleHandled) return;
      }

      const intent = profile?.userIntent || await AsyncStorage.getItem('userIntent');
      if (intent === 'medical') {
        navigation.replace('MedicalMain');
      } else if (intent === 'homecare') {
        resetToHomeCarePatientDashboard(navigation);
      } else {
        navigation.replace('Main');
      }
    } catch (e) {
      logAction(A.LOGIN_FAILED, { error: e.message, identifier });
      setError(e.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const openForgotPassword = () => {
    // Pre-fill with email if identifier looks like an email
    const looksLikeEmail = identifier.includes('@');
    setResetEmail(looksLikeEmail ? identifier : '');
    setResetSent(false);
    setShowForgot(true);
  };

  const handleSendReset = async () => {
    if (!resetEmail.trim()) {
      Alert.alert('Email required', 'Please enter your email address.');
      return;
    }
    setResetSending(true);
    try {
      await api('/api/v1/auth/password-reset', { method: 'POST', authenticated: false, body: { email: resetEmail.trim() } });
      setResetSent(true);
    } catch (err) {
      const msg = err?.message || 'Failed to send reset email. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setResetSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.logo}>NessaHub</Text>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </View>

        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {challengeId ? (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Verification code</Text>
                <Text style={styles.challengeText}>
                  A 6-digit code was sent to {challengeEmail || 'your email address'}.
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your code"
                  placeholderTextColor={Colors.textLight}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleVerifyTwoFactor}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.surface} />
                ) : (
                  <Text style={styles.loginButtonText}>Verify Code</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setChallengeId('');
                  setVerificationCode('');
                  setError('');
                }}
              >
                <Text style={styles.secondaryButtonText}>Use a different sign-in method</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Email or Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email or username"
                  placeholderTextColor={Colors.textLight}
                  value={identifier}
                  onChangeText={setIdentifier}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>

              <View style={styles.inputContainer}>
                <View style={styles.passwordLabelRow}>
                  <Text style={styles.label}>Password</Text>
                  <TouchableOpacity onPress={openForgotPassword}>
                    <Text style={styles.forgotLink}>Forgot Password?</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor={Colors.textLight}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.surface} />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>

              {biometricEnabled && biometricReady ? (
                <TouchableOpacity
                  style={styles.biometricButton}
                  onPress={handleBiometricLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={biometricLabel === 'Face ID' ? 'scan-outline' : 'finger-print-outline'}
                    size={20}
                    color={Colors.primary}
                  />
                  <Text style={styles.biometricButtonText}>Sign in with {biometricLabel}</Text>
                </TouchableOpacity>
              ) : biometricReady ? (
                /* The device can do this but the account has not opted in.
                   Say so here rather than leaving the feature invisible until
                   someone happens to find it in Settings. */
                <Text style={styles.biometricHint}>
                  Sign in once, then turn on {biometricLabel} in Settings to skip
                  your password next time.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={showForgot} transparent animationType="fade" onRequestClose={() => setShowForgot(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            {resetSent ? (
              <>
                <View style={styles.successIcon}>
                  <Text style={{ fontSize: 32 }}>✅</Text>
                </View>
                <Text style={styles.modalTitle}>Email Sent!</Text>
                <Text style={styles.modalSubtitle}>
                  A password reset link has been sent to{'\n'}
                  <Text style={{ fontWeight: '700', color: Colors.primary }}>{resetEmail}</Text>.
                  {'\n\n'}Check your inbox (and spam folder) and follow the link to reset your password.
                </Text>
                <TouchableOpacity style={styles.resetBtn} onPress={() => setShowForgot(false)}>
                  <Text style={styles.resetBtnText}>Back to Login</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Reset Password</Text>
                <Text style={styles.modalSubtitle}>
                  Enter your account email address. We'll send you a link to reset your password.
                </Text>
                <Text style={styles.inputLabel}>Email Address</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="your@email.com"
                  placeholderTextColor={Colors.textLight}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <TouchableOpacity
                  style={[styles.resetBtn, resetSending && { opacity: 0.6 }]}
                  onPress={handleSendReset}
                  disabled={resetSending}
                >
                  {resetSending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.resetBtnText}>Send Reset Email</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForgot(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  formContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 20,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  forgotLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  // ── Biometric sign-in ──
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: '#ffffff',
  },
  biometricButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },
  biometricHint: {
    marginTop: 14,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    color: '#656b7d',
  },

  secondaryButton: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  challengeText: {
    color: Colors.textSecondary,
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  successIcon: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  inputLabel: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  modalInput: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    marginBottom: 16,
  },
  resetBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  resetBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    width: '100%',
    padding: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default LoginScreen;
