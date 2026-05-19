import React, { useState, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebaseConfig';
import { Colors } from '../../constants/colors';
import { RELATIONSHIP_TYPES, COUPLE_STORAGE_KEYS } from '../../constants/coupleTherapyConfig';
import {
  createCoupleRegistration,
  createPartnerClientRecord,
  linkCouplePartnerAuth,
} from '../../services/coupleTherapyService';
import { buildLegalPrivacyFields } from '../../services/privacyConsentService';

export default function CoupleInitiationScreen({ navigation }) {
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.navigate('Welcome');
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={{ marginLeft: 4, padding: 4 }}
        >
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const [relationshipType, setRelationshipType] = useState('');
  const [partnerAName, setPartnerAName] = useState('');
  const [partnerAEmail, setPartnerAEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [partnerBName, setPartnerBName] = useState('');
  const [partnerBEmail, setPartnerBEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!relationshipType) return 'Select your relationship type';
    if (!partnerAName.trim()) return 'Enter your full name';
    if (!partnerAEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerAEmail)) {
      return 'Enter a valid email for yourself';
    }
    if (!password || password.length < 6) return 'Password must be at least 6 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    if (!partnerBName.trim()) return "Enter your partner's full name";
    if (!partnerBEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerBEmail)) {
      return "Enter a valid email for your partner";
    }
    if (partnerAEmail.trim().toLowerCase() === partnerBEmail.trim().toLowerCase()) {
      return 'Partner emails must be different';
    }
    return null;
  };

  const onContinue = async () => {
    const err = validate();
    if (err) {
      Alert.alert('Validation', err);
      return;
    }

    setLoading(true);
    try {
      const result = await createCoupleRegistration({
        relationshipType,
        partnerA: { name: partnerAName.trim(), email: partnerAEmail.trim().toLowerCase() },
        partnerB: { name: partnerBName.trim(), email: partnerBEmail.trim().toLowerCase() },
      });

      const coupleId = result.coupleId;
      const email = partnerAEmail.trim().toLowerCase();
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = cred.user.uid;
      const clientId = await createPartnerClientRecord(
        coupleId,
        'partnerA',
        email,
        partnerAName.trim(),
        uid,
      );

      await setDoc(doc(db, 'auth', uid), {
        uid,
        name: partnerAName.trim(),
        email,
        role: 'client',
        clientId,
        userIntent: 'therapy',
        therapyType: 'couples',
        coupleId,
        couplePartnerRole: 'partnerA',
        therapyType: 'couples',
        status: 'pending',
        createdAt: new Date().toISOString(),
        ...buildLegalPrivacyFields(),
      });

      await linkCouplePartnerAuth(coupleId, 'partnerA', {
        authUid: uid,
        clientId,
        name: partnerAName.trim(),
      });

      await AsyncStorage.multiSet([
        [COUPLE_STORAGE_KEYS.coupleId, coupleId],
        [COUPLE_STORAGE_KEYS.partnerRole, 'partnerA'],
        [COUPLE_STORAGE_KEYS.otherPartnerName, partnerBName.trim()],
        [COUPLE_STORAGE_KEYS.myRegistrationEmail, email],
        [COUPLE_STORAGE_KEYS.myPartnerName, partnerAName.trim()],
        ['th.clientId', clientId],
        ['th.onboard', JSON.stringify({ therapyType: 'couples', coupleId, startedAt: new Date().toISOString() })],
      ]);

      navigation.replace('CoupleIntake', { coupleId, partnerRole: 'partnerA' });
    } catch (e) {
      console.error(e);
      if (e.code === 'auth/email-already-in-use') {
        navigation.replace('Login', { coupleResume: true });
        return;
      }
      Alert.alert('Error', e.message || 'Could not start couple registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Couple therapy</Text>
        <Text style={styles.subtitle}>
          Create your account, then complete your private intake. We will email your partner their own invitation
          immediately — they never see your answers.
        </Text>

        <Text style={styles.sectionLabel}>Relationship type</Text>
        <View style={styles.chips}>
          {RELATIONSHIP_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, relationshipType === t && styles.chipOn]}
              onPress={() => setRelationshipType(t)}
            >
              <Text style={[styles.chipText, relationshipType === t && styles.chipTextOn]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Your account (Partner A)</Text>
        <TextInput style={styles.input} placeholder="Your full name" value={partnerAName} onChangeText={setPartnerAName} />
        <TextInput
          style={styles.input}
          placeholder="Your email"
          value={partnerAEmail}
          onChangeText={setPartnerAEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Create password (min 6 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
        />

        <Text style={styles.sectionLabel}>Your partner (Partner B)</Text>
        <TextInput style={styles.input} placeholder="Partner's full name" value={partnerBName} onChangeText={setPartnerBName} />
        <TextInput
          style={styles.input}
          placeholder="Partner's email — invitation sent here"
          value={partnerBEmail}
          onChangeText={setPartnerBEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.primaryBtn} onPress={onContinue} disabled={loading}>
          {loading ? <ActivityIndicator color={Colors.surface} /> : <Text style={styles.primaryBtnText}>Create account & start intake</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.text, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.text },
  chipTextOn: { color: Colors.surface, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: Colors.surface,
    color: Colors.text,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  primaryBtnText: { color: Colors.surface, fontSize: 17, fontWeight: '700' },
});
