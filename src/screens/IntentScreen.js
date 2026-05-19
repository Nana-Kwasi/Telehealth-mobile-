import React from 'react';
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

const INTENT_OPTIONS = [
  {
    key: 'therapy',
    title: 'Therapy',
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
  {
    key: 'homecare',
    title: 'Home-Care',
    sub: 'At-home support',
    emoji: '🏠',
    styleKey: 'pillHomeCare',
  },
];

const IntentScreen = ({ navigation }) => {
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
