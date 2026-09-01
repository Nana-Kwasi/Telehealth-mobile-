import React, { useState } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, storeSession } from '../services/apiClient';
import { Colors } from '../constants/colors';
import { COUPLE_STORAGE_KEYS } from '../constants/coupleTherapyConfig';
import {
  linkCouplePartnerAuth,
  createPartnerClientRecord,
} from '../services/coupleTherapyService';
import { syncPrivacyConsentToUser, buildLegalPrivacyFields } from '../services/privacyConsentService';
import { resetToHomeCarePatientDashboard } from '../utils/homeCareNavigation';

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

  const coupleInviteSubtitle =
    clientData?.therapyType === 'couples' && clientData?.couplePartnerRole === 'partnerB'
      ? `${clientData?.invitePartnerName || 'Your partner'} invited you to couples therapy. Create your own login — your intake answers stay private.`
      : null;

  const handleSignUp = async () => {
    setError('');

    if (!name || !email || !password) {
      setError('All fields are required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);

      // Determine the account's intent BEFORE registering so the backend role is
      // correct. The backend derives intent from role (PATIENT → medical,
      // CLIENT → therapy); couples & home care stay CLIENT and use userIntent.
      const medicalSkipEarly = await AsyncStorage.getItem('th.medicalSkip');
      const pendingBookingEarly = await AsyncStorage.getItem('th.pendingBooking');
      const storedIntentEarly = await AsyncStorage.getItem('userIntent');
      const coupleIdEarly =
        clientData?.coupleId || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
      const isCoupleEarly = clientData?.therapyType === 'couples' || !!coupleIdEarly;
      // Medical intent is set on IntentScreen ('userIntent'='medical') even if the
      // user bails before the doctor-booking intake (which sets th.medicalSkip).
      const isMedicalEarly =
        !isCoupleEarly &&
        (storedIntentEarly === 'medical' || !!(medicalSkipEarly || pendingBookingEarly));
      const regRole = isMedicalEarly ? 'PATIENT' : 'CLIENT';
      const sessionRole = isMedicalEarly ? 'patient' : 'client';

      const regData = await api('/api/v1/auth/register', {
        method: 'POST', authenticated: false,
        body: { email: email.toLowerCase(), password, fullName: name, role: regRole, phone: phone.trim() },
      });
      const userId = regData.userId;
      await storeSession({ token: regData.token, refreshToken: regData.refreshToken, userId, role: sessionRole });
      let clientId = await AsyncStorage.getItem('th.clientId');
      const coupleId =
        clientData?.coupleId || (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.coupleId));
      const couplePartnerRole =
        clientData?.couplePartnerRole ||
        (await AsyncStorage.getItem(COUPLE_STORAGE_KEYS.partnerRole)) ||
        'partnerA';
      const isCouple = clientData?.therapyType === 'couples' || !!coupleId;

      if (isCouple && !clientId && coupleId) {
        clientId = await createPartnerClientRecord(
          coupleId,
          couplePartnerRole,
          email.toLowerCase(),
          name,
          userId,
        );
        await AsyncStorage.setItem('th.clientId', clientId);
      }

      const homecareIntent = storedIntentEarly === 'homecare';
      const isMedical = isMedicalEarly;

      const userProfile = {
        id: userId, uid: userId, name, email: email.toLowerCase(), role: sessionRole,
        clientId: clientId || userId, coupleId: isCouple ? coupleId : undefined,
        couplePartnerRole: isCouple ? couplePartnerRole : undefined,
        therapyType: isCouple ? 'couples' : undefined, status: 'pending',
        userIntent: isCouple ? 'therapy' : homecareIntent ? 'homecare' : isMedical ? 'medical' : 'therapy',
        ...buildLegalPrivacyFields(),
      };

      await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
      await AsyncStorage.setItem('userRole', sessionRole);
      await AsyncStorage.setItem('userId', userId);
      await AsyncStorage.setItem('th.userId', userId);
      await AsyncStorage.setItem('userName', name);
      await syncPrivacyConsentToUser({ userId, role: sessionRole, profileId: (isMedicalEarly ? userId : clientId) || userId }).catch(() => {});

      if (isMedicalEarly) {
        // Medical patient: create the patient profile (POST upserts) under THIS
        // user id — using a stale th.clientId would write another user's row and
        // leave this account with no profile (blank name + location PATCH 404).
        await AsyncStorage.setItem('th.clientId', userId);
        await api(`/api/v1/patients/${userId}`, {
          method: 'POST',
          body: { fullName: name },
        }).catch(() => {});
      } else if (clientId || !homecareIntent) {
        // Therapy clients land here. This used to be gated on `clientId` alone, but the
        // questionnaire clears `th.clientId` right before navigating to SignUp, so for a
        // plain therapy signup the branch never ran and the account was created with no
        // profile row at all — the dashboard's GET /api/v1/patients/{id} then 400'd
        // ("Patient not found") and the client home screen failed with "Error loading
        // dashboard data". PATCH creates the row when missing, so fall back to the user
        // id. Home care keeps its own onboarding and is left untouched.
        const profileId = clientId || userId;
        await AsyncStorage.setItem('th.clientId', profileId);
        await api(`/api/v1/patients/${profileId}`, {
          method: 'PATCH',
          body: { fullName: name, email: email.toLowerCase(), status: 'pending' },
        }).catch(() => {});

        // Persist the intake questionnaire. `clientData` was only ever used to
        // prefill the name/email/phone inputs, so every answer the visitor gave —
        // therapy type, gender, age, concerns, PHQ-9 — was thrown away at signup and
        // the client's Settings screen had nothing to show. The client profile row
        // stores it in preferencesJson (PATCH upserts, POST is the create fallback).
        if (clientData && typeof clientData === 'object') {
          const intakeBody = {
            phone: phone?.trim() || clientData.phone || null,
            preferencesJson: JSON.stringify({
              ...clientData,
              name,
              email: email.toLowerCase(),
              completedAt: clientData.completedAt || new Date().toISOString(),
            }),
            status: 'active',
          };
          try {
            await api(`/api/v1/clients/${userId}`, { method: 'PATCH', body: intakeBody });
          } catch {
            await api('/api/v1/clients', {
              method: 'POST',
              body: { clientId: userId, ...intakeBody },
            }).catch(() => {});
          }
        }
      }

      if (isCouple && coupleId) {
        await linkCouplePartnerAuth(coupleId, couplePartnerRole, {
          authUid: userId,
          clientId: clientId || userId,
          name,
        });
        const storagePairs = [
          [COUPLE_STORAGE_KEYS.coupleId, coupleId],
          [COUPLE_STORAGE_KEYS.partnerRole, couplePartnerRole],
          [COUPLE_STORAGE_KEYS.myPartnerName, name.trim()],
          ['th.clientId', clientId || userId],
        ];
        if (couplePartnerRole === 'partnerB' && clientData?.invitePartnerName) {
          storagePairs.push([COUPLE_STORAGE_KEYS.otherPartnerName, clientData.invitePartnerName]);
        }
        await AsyncStorage.multiSet(storagePairs);
        if (couplePartnerRole === 'partnerB') {
          navigation.replace('CoupleIntake', { coupleId, partnerRole: 'partnerB' });
          return;
        }
        navigation.replace('CoupleIntake', { coupleId, partnerRole: 'partnerA' });
        return;
      }

      if (isMedical) {
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
    } catch (error) {
      console.error('Sign up error:', error);
      
      // Handle specific Firebase errors (matching web version)
      if (error.message.includes('offline') || error.message.includes('Failed to get document')) {
        setError('You are currently offline. Please check your internet connection and try again.');
      } else if (/email.*already|already.*registered/i.test(error.message)) {
        setError('This email is already registered. Please try logging in instead.');
      } else if (/at least 8|weak.*password/i.test(error.message)) {
        setError('Password should be at least 8 characters long.');
      } else {
        setError(error.message || 'Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>
            {coupleInviteSubtitle || 'Set up your login credentials'}
          </Text>
        </View>

        <View style={styles.formContainer}>
          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, lockEmail && styles.inputLocked]}
              placeholder="Enter your email"
              placeholderTextColor={Colors.textLight}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!lockEmail}
            />
          </View>

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

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Create a password (min 6 characters)"
              placeholderTextColor={Colors.textLight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
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
              <Text style={styles.signUpButtonText}>Create Account</Text>
            )}
          </TouchableOpacity>
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
  inputLocked: {
    backgroundColor: '#f3f4f6',
    color: Colors.textSecondary,
  },
});

export default SignUpScreen;
