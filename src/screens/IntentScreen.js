import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, MedicalColors } from '../constants/colors';

const { width } = Dimensions.get('window');

const IntentScreen = ({ navigation }) => {
  const handleSelect = async (intent) => {
    try {
      await AsyncStorage.setItem('userIntent', intent);
    } catch (_) {}
    if (intent === 'therapy') {
      navigation.navigate('Welcome');
    } else {
      navigation.navigate('MedicalIntake');
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

        {/* Brand */}
        <View style={styles.brand}>
          <View style={styles.logoMark}>
            <Text style={styles.logoLetter}>N</Text>
          </View>
          <Text style={styles.logoName}>NessaHub</Text>
        </View>

        {/* Headline */}
        <View style={styles.headline}>
          <Text style={styles.title}>Your health,{'\n'}your way.</Text>
          <Text style={styles.sub}>What do you need today?</Text>
        </View>

        {/* Pill Buttons */}
        <View style={styles.pills}>
          <TouchableOpacity
            style={[styles.pill, styles.pillTherapy]}
            onPress={() => handleSelect('therapy')}
            activeOpacity={0.82}
          >
            <Text style={styles.pillEmoji}>🧠</Text>
            <View>
              <Text style={styles.pillTitle}>Therapy</Text>
              <Text style={styles.pillSub}>Mental health support</Text>
            </View>
            <Text style={styles.pillArrow}>→</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pill, styles.pillMedical]}
            onPress={() => handleSelect('medical')}
            activeOpacity={0.82}
          >
            <Text style={styles.pillEmoji}>🩺</Text>
            <View>
              <Text style={styles.pillTitle}>Doctor</Text>
              <Text style={styles.pillSub}>Medical consultations</Text>
            </View>
            <Text style={styles.pillArrow}>→</Text>
          </TouchableOpacity>
        </View>

        {/* Login link */}
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
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'space-between',
  },

  /* Brand */
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#4a7c59',
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

  /* Headline */
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

  /* Pills */
  pills: {
    gap: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pillTherapy: {
    backgroundColor: 'rgba(74,124,89,0.18)',
    borderColor: 'rgba(110,231,183,0.35)',
  },
  pillMedical: {
    backgroundColor: 'rgba(30,107,184,0.18)',
    borderColor: 'rgba(147,197,253,0.35)',
  },
  pillEmoji: {
    fontSize: 26,
  },
  pillTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 2,
  },
  pillSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '400',
  },
  pillArrow: {
    marginLeft: 'auto',
    fontSize: 18,
    color: 'rgba(255,255,255,0.4)',
  },

  /* Login */
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
