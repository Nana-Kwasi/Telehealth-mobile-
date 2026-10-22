import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, storeSession } from '../services/apiClient';
import { createAppointment } from '../services/doctorDataService';
import { Colors } from '../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import {
  linkCouplePartnerAuth,
  createPartnerClientRecord,
} from '../services/coupleTherapyService';
import { syncPrivacyConsentToUser, buildLegalPrivacyFields } from '../services/privacyConsentService';
import { resetToHomeCarePatientDashboard } from '../utils/homeCareNavigation';
import {
  signInWithEmailOrUsername,
  completeTwoFactorSignIn,
  signInWithRefreshToken,
  performLogout,
} from '../services/authService';
import {
  biometricCapability,
  biometricAccountEmail,
  isBiometricLoginEnabled,
  unlockRefreshToken,
  disableBiometricLogin,
} from '../services/biometricAuth';
import { chooseService } from '../utils/careServices';
import { saveTherapyIntake } from '../services/therapyIntake';

const EXISTS_RE = /email.*already|already.*(exists|registered|in use)/i;

const SignUpScreen = ({ route, navigation }) => {
  const { clientData } = route.params || {};
  const lockEmail = !!clientData?.lockEmail;
  const [name, setName] = useState(clientData?.name || clientData?.displayName || '');
  const [email, setEmail] = useState(clientData?.email || '');
  // Captured on every signup so the admin user-detail screen has a phone for each
  // account, and so care staff can reach the person.
  const [phone, setPhone] = useState(clientData?.phone || clientData?.phoneNumber || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // One account covers medical care and therapy. When the email already has an
  // account the form turns into a sign-in and the journey (intake, couples link,
  // doctor booking) is attached to that account instead of a new one.
  const [mode, setMode] = useState('create'); // 'create' | 'login'
  const [challenge, setChallenge] = useState(null); // two-step sign-in in progress
  const [code, setCode] = useState('');
  // Face ID / fingerprint label when this phone already signs in to THIS email
  // that way — the existing-account step then works without the password.
  const [biometricLabel, setBiometricLabel] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (mode !== 'login' || !(await isBiometricLoginEnabled())) { if (!cancelled) setBiometricLabel(null); return; }
      const saved = (await biometricAccountEmail()).trim().toLowerCase();
      const cap = await biometricCapability();
      if (!cancelled) setBiometricLabel(cap.available && saved && saved === email.trim().toLowerCase() ? cap.label : null);
    })().catch(() => { if (!cancelled) setBiometricLabel(null); });
    return () => { cancelled = true; };
  }, [mode, email]);

  const coupleInviteSubtitle =
    clientData?.therapyType === 'couples' && clientData?.couplePartnerRole === 'partnerB'
      ? `${clientData?.invitePartnerName || 'Your partner'} invited you to couples therapy. Create your own login — your intake answers stay private.`
      : null;

  const switchToLogin = () => {
    setMode('login');
    setError('');
    setPassword('');
  };

  // Spot an existing account as soon as the email is typed.
  const checkEmail = async () => {
    const e = email.trim().toLowerCase();
    if (mode !== 'create' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return;
    try {
      const found = await api(`/api/v1/auth/mobile/find-user?identifier=${encodeURIComponent(e)}`, { authenticated: false });
      if (String(found?.email || '').toLowerCase() === e) switchToLogin();
    } catch { /* not found */ }
  };

  // Which service this sign-up is for. The backend derives a NEW account's role
  // from it (PATIENT → medical, CLIENT → therapy); couples & home care stay
  // CLIENT and use userIntent.
  const readJourney = async () => {
    const medicalSkip = await AsyncStorage.getItem('th.medicalSkip');
    const pendingBooking = await AsyncStorage.getItem('th.pendingBooking');
    const storedIntent = await AsyncStorage.getItem('userIntent');
    const coupleId =
      clientData?.coupleId || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
    const isCouple = clientData?.therapyType === 'couples' || !!coupleId;
    // Medical intent is set on IntentScreen ('userIntent'='medical') even if the
    // user bails before the doctor-booking intake (which sets th.medicalSkip).
    // Therapy answers from the questionnaire (or the therapy intent) win: stale
    // medical flags left on the phone by an earlier Doctor attempt used to turn a
    // new therapy client into a medical patient, skipping the therapist picker.
    const isTherapy = !!clientData?.therapyType || storedIntent === 'therapy' || storedIntent === 'medpsych';
    const isMedical =
      !isCouple && !isTherapy &&
      (storedIntent === 'medical' || !!(medicalSkip || pendingBooking));
    return {
      coupleId,
      isCouple,
      isMedical,
      homecareIntent: storedIntent === 'homecare',
      couplePartnerRole:
        clientData?.couplePartnerRole ||
        (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole)) ||
        'partnerA',
      // Read before any sign-in, which may reset it.
      clientId: await AsyncStorage.getItem('th.clientId'),
    };
  };

  const createAccount = async (j) => {
    const regRole = j.isMedical ? 'PATIENT' : 'CLIENT';
    const sessionRole = j.isMedical ? 'patient' : 'client';

    const regData = await api('/api/v1/auth/register', {
      method: 'POST', authenticated: false,
      body: { email: email.toLowerCase(), password, fullName: name, role: regRole, phone: phone.trim() },
    });
    const userId = regData.userId;
    await storeSession({ token: regData.token, refreshToken: regData.refreshToken, userId, role: sessionRole });
    try { (await import('../services/sessionIdle')).touchActivity(); } catch { /* ignore */ }

    const userProfile = {
      id: userId, uid: userId, name, email: email.toLowerCase(), role: sessionRole,
      clientId: j.clientId || userId, coupleId: j.isCouple ? j.coupleId : undefined,
      couplePartnerRole: j.isCouple ? j.couplePartnerRole : undefined,
      therapyType: j.isCouple ? 'couples' : undefined, status: 'pending',
      userIntent: j.isCouple ? 'therapy' : j.homecareIntent ? 'homecare' : j.isMedical ? 'medical' : 'therapy',
      ...buildLegalPrivacyFields(),
    };

    await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
    await AsyncStorage.setItem('userRole', sessionRole);
    await AsyncStorage.setItem('userId', userId);
    await AsyncStorage.setItem('th.userId', userId);
    await AsyncStorage.setItem('userName', name);
    await syncPrivacyConsentToUser({ userId, role: sessionRole, profileId: (j.isMedical ? userId : j.clientId) || userId }).catch(() => {});

    if (j.isMedical) {
      // Medical patient: create the patient profile (POST upserts) under THIS
      // user id — using a stale th.clientId would write another user's row and
      // leave this account with no profile (blank name + location PATCH 404).
      await api(`/api/v1/patients/${userId}`, {
        method: 'POST',
        body: { fullName: name },
      }).catch(() => {});
    } else if (j.clientId || !j.homecareIntent) {
      // Therapy clients land here. This used to be gated on `clientId` alone, but the
      // questionnaire clears `th.clientId` right before navigating to SignUp, so for a
      // plain therapy signup the branch never ran and the account was created with no
      // profile row at all — the dashboard's GET /api/v1/patients/{id} then 400'd
      // ("Patient not found") and the client home screen failed with "Error loading
      // dashboard data". PATCH creates the row when missing, so fall back to the user
      // id. Home care keeps its own onboarding and is left untouched.
      await api(`/api/v1/patients/${j.clientId || userId}`, {
        method: 'PATCH',
        body: { fullName: name, email: email.toLowerCase(), status: 'pending' },
      }).catch(() => {});
    }
    return { userId, name, email: email.toLowerCase(), phone: phone.trim(), isNew: true };
  };

  // Signed in to an existing account from this screen (password or 2FA code).
  const existingAccount = async ({ role, profile }) => {
    if (role !== 'client' && role !== 'patient') {
      // A doctor/therapist/staff login is not a patient account; don't attach
      // someone's therapy intake or booking to it.
      try { await performLogout(); } catch { /* ignore */ }
      throw new Error('This email belongs to a NessaHub staff account. Please use a different email for your own care.');
    }
    const userId = profile?.id || (await AsyncStorage.getItem('th.userId'));
    const personName = profile?.name || profile?.fullName || name;
    await AsyncStorage.setItem('userRole', role);
    await AsyncStorage.setItem('userId', userId);
    await AsyncStorage.setItem('userName', personName);
    await AsyncStorage.setItem('isAuthenticated', 'true');
    DeviceEventEmitter.emit('refreshProfile');
    return { userId, name: personName, email: profile?.email || email.toLowerCase(), phone: phone.trim(), isNew: false };
  };

  // Everything after the account exists — the same for a new account and an
  // existing one: save the therapy intake, link the couple, create the doctor
  // booking, then land in the flow they started.
  const continueJourney = async (j, person) => {
    const { userId } = person;
    let { clientId } = j;
    const { coupleId, isCouple, couplePartnerRole, isMedical, homecareIntent } = j;

    // Open the dashboard for the service they just used.
    if (!homecareIntent) await chooseService(userId, isMedical ? 'medical' : 'therapy');

    if (isCouple && !clientId && coupleId) {
      clientId = await createPartnerClientRecord(
        coupleId,
        couplePartnerRole,
        person.email,
        person.name,
        userId,
      );
    }

    if (isMedical) {
      await AsyncStorage.setItem('th.clientId', userId);
    } else if (clientId || !homecareIntent) {
      await AsyncStorage.setItem('th.clientId', clientId || userId);

      // Persist the intake questionnaire. `clientData` was only ever used to
      // prefill the name/email/phone inputs, so every answer the visitor gave —
      // therapy type, gender, age, concerns, PHQ-9 — was thrown away at signup and
      // the client's Settings screen had nothing to show. The client profile row
      // stores it in preferencesJson (PATCH upserts, POST is the create fallback).
      // An existing account keeps its earlier answers underneath the new ones.
      if (clientData && typeof clientData === 'object') {
        await saveTherapyIntake(userId, clientData, person);
      }
    }

    if (isCouple && coupleId) {
      await linkCouplePartnerAuth(coupleId, couplePartnerRole, {
        authUid: userId,
        clientId: clientId || userId,
        name: person.name,
      });
      const storagePairs = [
        [COUPLE_STORAGE_KEYS.coupleId, coupleId],
        [COUPLE_STORAGE_KEYS.partnerRole, couplePartnerRole],
        [COUPLE_STORAGE_KEYS.myPartnerName, person.name.trim()],
        ['th.clientId', clientId || userId],
      ];
      if (couplePartnerRole === 'partnerB' && clientData?.invitePartnerName) {
        storagePairs.push([COUPLE_STORAGE_KEYS.otherPartnerName, clientData.invitePartnerName]);
      }
      await AsyncStorage.multiSet(storagePairs);
      navigation.replace('CoupleIntake', { coupleId, partnerRole: couplePartnerRole === 'partnerB' ? 'partnerB' : 'partnerA' });
      return;
    }

    if (isMedical) {
      // A doctor booked (and paid for) before sign-up becomes a real appointment now.
      try {
        const raw = await AsyncStorage.getItem('th.pendingBooking');
        const pb = raw ? JSON.parse(raw) : null;
        if (pb?.doctorId) {
          await createAppointment({ ...pb, clientId: userId, clientName: person.name, patientId: userId });
          if (pb.paymentReference) {
            await api('/api/v1/payments/record', { method: 'POST', body: { reference: pb.paymentReference, description: `Consultation with Dr. ${pb.doctorName || ''}`.trim() } }).catch(() => {});
          }
          await AsyncStorage.removeItem('th.pendingBooking');
        }
      } catch (bookErr) {
        // Kept for a retry; the payment reference is saved with it.
        console.warn('Could not create the paid appointment yet:', bookErr?.message);
      }
      await AsyncStorage.removeItem('th.medicalSkip');
      await AsyncStorage.setItem('userIntent', 'medical');
      navigation.replace('MedicalMain');
    } else if (homecareIntent) {
      await AsyncStorage.setItem('userIntent', 'homecare');
      resetToHomeCarePatientDashboard(navigation);
    } else {
      // Therapy clients choose a therapist first, then pay that therapist's rate.
      navigation.navigate('MatchTherapist');
    }
  };

  const showError = (err, fallback) => {
    console.error('Sign up error:', err);
    const msg = String(err?.message || '');
    if (msg.includes('offline') || msg.includes('Failed to get document')) {
      setError('You are currently offline. Please check your internet connection and try again.');
    } else if (/at least 8|weak.*password/i.test(msg)) {
      setError('Password should be at least 8 characters long.');
    } else {
      setError(msg || fallback);
    }
  };

  const handleSignUp = async () => {
    setError('');

    if (!email || !password || (mode === 'create' && !name)) {
      setError('All fields are required');
      return;
    }

    if (mode === 'create' && password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const j = await readJourney();
      if (mode === 'login') {
        const result = await signInWithEmailOrUsername(email, password);
        if (result?.twoFactorRequired) {
          setChallenge({ ...result, journey: j });
          setCode('');
          return;
        }
        await continueJourney(j, await existingAccount(result));
        return;
      }
      let person;
      try {
        person = await createAccount(j);
      } catch (err) {
        if (EXISTS_RE.test(String(err?.message || ''))) { switchToLogin(); return; }
        throw err;
      }
      await continueJourney(j, person);
    } catch (err) {
      showError(err, mode === 'login' ? 'Sign in failed' : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // Same refresh-token sign-in as the login screen's Face ID button, then the
  // same journey as a password sign-in.
  const handleBiometric = async () => {
    setError('');
    try {
      setLoading(true);
      const refreshToken = await unlockRefreshToken(`Use ${biometricLabel} to continue`);
      if (!refreshToken) return; // cancelled — the password field is still there
      const j = await readJourney();
      const result = await signInWithRefreshToken(refreshToken);
      await continueJourney(j, await existingAccount(result));
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('reuse detected') || msg.includes('revoked') || msg.includes('expired')) {
        await disableBiometricLogin();
        setBiometricLabel(null);
        setError(`Your saved ${biometricLabel} sign-in expired. Please use your password.`);
      } else {
        showError(err, 'Sign in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // Same reset email the login screen's "Forgot password?" sends.
  const sendReset = async () => {
    try {
      await api('/api/v1/auth/password-reset', { method: 'POST', authenticated: false, body: { email: email.trim() } });
      Alert.alert('Check your email', `We sent a link to reset your password to ${email.trim()}.`);
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to send reset email. Please try again.');
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    try {
      setLoading(true);
      const result = await completeTwoFactorSignIn(challenge.challengeId, code);
      await continueJourney(challenge.journey, await existingAccount(result));
    } catch (err) {
      setError(err?.message || 'That code did not work. Check it and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>{mode === 'login' ? 'Welcome back' : 'Create Your Account'}</Text>
          <Text style={styles.subtitle}>
            {mode === 'login'
              ? 'You already have a NessaHub account with this email. Sign in to continue — your medical and therapy care share one account.'
              : coupleInviteSubtitle || 'Set up your login credentials'}
          </Text>
        </View>

        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {challenge ? (
            <>
              <Text style={[styles.subtitle, { marginBottom: 16 }]}>
                Two-step sign-in is on. We sent a 6-digit code to {challenge.email}.
              </Text>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Verification code</Text>
                <TextInput
                  style={styles.input}
                  placeholder="123456"
                  placeholderTextColor={Colors.textLight}
                  value={code}
                  onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  maxLength={8}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                style={[styles.signUpButton, (loading || code.length < 4) && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={loading || code.length < 4}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.surface} />
                ) : (
                  <Text style={styles.signUpButtonText}>Verify and continue</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
          <>
          {mode === 'create' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                placeholderTextColor={Colors.textLight}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, lockEmail && styles.inputLocked]}
              placeholder="Enter your email"
              placeholderTextColor={Colors.textLight}
              value={email}
              onChangeText={setEmail}
              onEndEditing={checkEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!lockEmail}
            />
          </View>

          {mode === 'create' && (
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 0243899834"
                placeholderTextColor={Colors.textLight}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder={mode === 'login' ? 'Your NessaHub password' : 'Create a password (min 6 characters)'}
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={mode === 'login'}
            />
          </View>

          <TouchableOpacity
            style={[styles.signUpButton, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.surface} />
            ) : (
              <Text style={styles.signUpButtonText}>
                {mode === 'login' ? 'Sign In and Continue' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' && biometricLabel ? (
            <TouchableOpacity
              style={[styles.biometricButton, loading && styles.buttonDisabled]}
              onPress={handleBiometric}
              disabled={loading}
            >
              <Text style={styles.biometricButtonText}>Continue with {biometricLabel}</Text>
            </TouchableOpacity>
          ) : null}

          {mode === 'login' ? (
            <View style={styles.switchRow}>
              <TouchableOpacity onPress={sendReset}>
                <Text style={styles.switchLink}>Forgot password?</Text>
              </TouchableOpacity>
              {!lockEmail && (
                <TouchableOpacity onPress={() => { setMode('create'); setError(''); }}>
                  <Text style={styles.switchLink}>Use a different email</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity style={styles.switchRow} onPress={switchToLogin}>
              <Text style={styles.switchLink}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          )}
          </>
          )}
        </View>
      </ScrollView>
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
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
  signUpButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  signUpButtonText: {
    color: Colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  biometricButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  biometricButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 18,
  },
  switchLink: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  inputLocked: {
    backgroundColor: '#f3f4f6',
    color: Colors.textSecondary,
  },
});

export default SignUpScreen;
