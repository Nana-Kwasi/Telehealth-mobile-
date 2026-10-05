import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import TherapyTypeModal from '../components/TherapyTypeModal';

const INTENT_OPTIONS = [
  {
    key: 'therapy',
    title: 'Psychiatry',
    sub: 'Mental health',
    emoji: '🧠',
    styleKey: 'pillTherapy',
  },
  {
    key: 'medical',
    title: 'Doctor',
    sub: 'Medical care',
    emoji: '🩺',
    styleKey: 'pillMedical',
  },
  // Home Care is parked, not removed — the module, its navigator and its
  // screens are untouched, so restoring this entry brings it straight back.
  // {
  //   key: 'homecare',
  //   title: 'Home-Care',
  //   sub: 'At-home support',
  //   emoji: '🏠',
  //   styleKey: 'pillHomeCare',
  // },
  {
    key: 'medpsych',
    title: 'Psychology & Counseling',
    sub: 'Talking therapy',
    emoji: '🩹',
    styleKey: 'pillHomeCare',
  },
  {
    // For someone ALREADY under care elsewhere who wants an independent view on
    // one decision. Separate from the line above because the intake differs —
    // a short case questionnaire rather than the full programme one — and so
    // does the dashboard they land on.
    key: 'second_opinion',
    title: 'Second Opinion',
    sub: 'Review my current care',
    emoji: '🔍',
    styleKey: 'pillHomeCare',
  },
];

const IntentScreen = ({ navigation }) => {
  // Psychology & Counseling asks WHICH kind of therapy before the sign-up
  // form, then hands off to the flow that already handles it.
  const [showTypeModal, setShowTypeModal] = useState(false);

  const startCounselling = async (therapyType) => {
    setShowTypeModal(false);

    // Persist the choice the same way WelcomeScreen does, so every downstream
    // screen reads one value from one place. Clearing the stale per-flow keys
    // first matters: a half-finished teen or couple attempt leaves parent,
    // child and invite records behind, and picking a different type afterwards
    // would carry them into the new one.
    try {
      await AsyncStorage.multiRemove([
        'th.parentInfo', 'th.childInfo', 'th.parentConsent',
        'th.coupleId', 'th.couplePartnerRole', 'th.coupleInviteToken',
      ]);
      await AsyncStorage.setItem('th.onboard', JSON.stringify({
        therapyType, startedAt: new Date().toISOString(),
      }));
    } catch (_) {}

    // Teen and couples have their own established journeys — parent/guardian
    // consent, and partner invitation. They are reused as they are rather than
    // rebuilt inside this flow.
    if (therapyType === 'teen') {
      navigation.navigate('ParentGuardianInfo');
      return;
    }
    if (therapyType === 'couples') {
      navigation.navigate('CoupleInitiation');
      return;
    }

    // Individual keeps the cached, pay-before-anything-is-written flow.
    navigation.navigate('MedPsychSignUp', { service: 'medpsych', therapyType });
  };

  const handleSelect = async (intent) => {
    try {
      await AsyncStorage.setItem('userIntent', intent);
    } catch (_) {}

    if (intent === 'therapy') {
      navigation.navigate('Welcome');
      return;
    }
    if (intent === 'medical') {
      navigation.navigate('MedicalIntake');
      return;
    }
    if (intent === 'homecare') {
      navigation.navigate('HomeCareFlow', { screen: 'HomeCareHome' });
      return;
    }
    if (intent === 'medpsych') {
      setShowTypeModal(true);
      return;
    }
    if (intent === 'second_opinion') {
      // Same policy gate — the consents are identical — carrying its own
      // service type so the gate knows which intake to ask for afterwards.
      navigation.navigate('MedPsychSignUp', { service: 'second_opinion' });
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/back.jpeg')}
      style={styles.bg}
      resizeMode="cover"
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.overlay}>
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>N</Text>
          </View>
          <Text style={styles.logoName}>NessaHub</Text>
        </View>

        <View style={styles.headline}>
          <Text style={styles.title}>Your health,{'\n'}your way.</Text>
          <Text style={styles.sub}>What do you need today?</Text>
        </View>

        <View style={styles.pillsRow}>
          {INTENT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.pill, styles[opt.styleKey]]}
              onPress={() => handleSelect(opt.key)}
              activeOpacity={0.82}
            >
              <Text style={styles.pillEmoji}>{opt.emoji}</Text>
              <Text style={styles.pillTitle}>{opt.title}</Text>
              <Text style={styles.pillSub}>{opt.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.loginBtn}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.75}
        >
          <Text style={styles.loginBtnText}>Already have an account? Sign in</Text>
        </TouchableOpacity>
      </View>
      <TherapyTypeModal
        visible={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onSelect={startCounselling}
      />

    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,20,14,0.72)',
    paddingHorizontal: 16,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    color: 'white',
    fontWeight: '800',
    fontSize: 18,
  },
  logoName: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.3,
  },
  headline: {
    marginTop: -40,
  },
  title: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 44,
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  sub: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    minHeight: 118,
  },
  pillTherapy: {
    backgroundColor: 'rgba(74,124,89,0.18)',
    borderColor: 'rgba(110,231,183,0.35)',
  },
  pillMedical: {
    backgroundColor: 'rgba(30,107,184,0.18)',
    borderColor: 'rgba(147,197,253,0.35)',
  },
  pillHomeCare: {
    backgroundColor: 'rgba(180,83,9,0.18)',
    borderColor: 'rgba(253,186,116,0.4)',
  },
  pillEmoji: {
    fontSize: 26,
    marginBottom: 8,
  },
  pillTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 4,
  },
  pillSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 13,
  },
  loginBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  loginBtnText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default IntentScreen;
