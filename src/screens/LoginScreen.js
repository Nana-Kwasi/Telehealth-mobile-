import React, { useState } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebaseConfig';
import { signInWithEmailOrUsername } from '../services/authService';
import { fetchClientData } from '../services/clientDataService';
import { Colors } from '../constants/colors';

const LoginScreen = ({ navigation }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Forgot password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleLogin = async () => {
    setError('');

    if (!identifier || !password) {
      setError('Both fields are required!');
      return;
    }

    try {
      setLoading(true);
      const { role, profile } = await signInWithEmailOrUsername(identifier, password);

      if (role !== 'client' && role !== 'therapist' && role !== 'admin' && role !== 'doctor') {
        setError('Unable to determine your account type. Please contact support.');
        return;
      }

      await AsyncStorage.setItem('userRole', role);
      await AsyncStorage.setItem('userName', profile?.name || profile?.displayName || identifier);
      await AsyncStorage.setItem('userId', profile?.id || '');
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
      await AsyncStorage.setItem('isAuthenticated', 'true');

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

      if (profile?.clientId) {
        await AsyncStorage.setItem('th.clientId', profile.clientId);
      } else if (profile?.id) {
        await AsyncStorage.setItem('th.clientId', profile.id);
      }

      try {
        const clientData = await fetchClientData();
        console.log('Client data fetched on login:', clientData);
      } catch (error) {
        console.error('Error fetching client data on login:', error);
      }

      const intent = profile?.userIntent || await AsyncStorage.getItem('userIntent');
      if (intent === 'medical') {
        navigation.replace('MedicalMain');
      } else {
        navigation.replace('Main');
      }
    } catch (e) {
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
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setResetSent(true);
    } catch (err) {
      let msg = 'Failed to send reset email. Please try again.';
      if (err.code === 'auth/user-not-found') msg = 'No account found with this email address.';
      else if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
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

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => navigation.navigate('Welcome')}
          >
            <Text style={styles.linkText}>New user? Start with questionnaire</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* ── Forgot Password Modal ── */}
      <Modal visible={showForgot} transparent animationType="fade" onRequestClose={() => setShowForgot(false)}>
        <View style={styles.modalOverlay}>
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
        </View>
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
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.primary,
    fontSize: 14,
    textDecorationLine: 'underline',
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
