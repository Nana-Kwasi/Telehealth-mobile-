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
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
      
      // Note: navigator.onLine is not available in React Native, but Firebase will handle offline errors
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;
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

      // Create user profile in auth collection (matching web version)
      const userProfile = {
        uid: userId,
        name: name,
        email: email.toLowerCase(),
        role: 'client',
        clientId: clientId || userId,
        coupleId: isCouple ? coupleId : undefined,
        couplePartnerRole: isCouple ? couplePartnerRole : undefined,
        therapyType: isCouple ? 'couples' : undefined,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // Check user intent — medical skip or pending booking goes to medical dashboard
      const medicalSkip = await AsyncStorage.getItem('th.medicalSkip');
      const pendingBooking = await AsyncStorage.getItem('th.pendingBooking');
      const homecareIntent = (await AsyncStorage.getItem('userIntent')) === 'homecare';
      const isMedical = !!(medicalSkip || pendingBooking);

      userProfile.userIntent = isCouple
        ? 'therapy'
        : homecareIntent
          ? 'homecare'
          : isMedical
            ? 'medical'
            : 'therapy';
      Object.assign(userProfile, buildLegalPrivacyFields());

      await setDoc(doc(db, 'auth', userId), userProfile);
      await syncPrivacyConsentToUser({ userId, role: 'client', profileId: clientId || userId }).catch(() => {});

      // Update the client document with the auth UID and proper name (matching web version)
      if (clientId) {
        await setDoc(
          doc(db, 'clients', clientId),
          {
            authUid: userId,
            displayName: name,
            clientName: name,
            email: email.toLowerCase(),
            therapyType: isCouple ? 'couples' : undefined,
            coupleId: isCouple ? coupleId : undefined,
            couplePartnerRole: isCouple ? couplePartnerRole : undefined,
            status: 'pending',
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
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
        navigation.navigate('Payment');
      }
    } catch (error) {
      console.error('Sign up error:', error);
      
      // Handle specific Firebase errors (matching web version)
      if (error.message.includes('offline') || error.message.includes('Failed to get document')) {
        setError('You are currently offline. Please check your internet connection and try again.');
      } else if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please try logging in instead.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
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
