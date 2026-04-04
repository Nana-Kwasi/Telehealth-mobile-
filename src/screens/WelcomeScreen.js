import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';

const { width } = Dimensions.get('window');

const therapyTypes = [
  {
    key: 'individual',
    title: 'Individual',
    label: 'For myself',
    icon: '👤',
    bgColor: '#1a1a1a',
    borderColor: '#404040',
  },
  {
    key: 'couples',
    title: 'Couples',
    label: 'For me and my partner',
    icon: '💑',
    bgColor: '#1a1a1a',
    borderColor: '#404040',
  },
  {
    key: 'teen',
    title: 'Teen',
    label: 'For my child',
    icon: '🧒',
    bgColor: '#1a1a1a',
    borderColor: '#404040',
  },
];

const WelcomeScreen = ({ navigation }) => {
  const [counters, setCounters] = useState({
    therapists: 0,
    sessions: 0,
    clients: 0,
    messages: 0,
  });

  const finalValues = {
    therapists: 150,
    sessions: 278,
    clients: 1000,
    messages: 500,
  };

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const stepDuration = duration / steps;

    Object.keys(finalValues).forEach((key) => {
      const increment = finalValues[key] / steps;
      let currentValue = 0;
      let stepCount = 0;

      const interval = setInterval(() => {
        stepCount++;
        currentValue += increment;

        if (stepCount >= steps || currentValue >= finalValues[key]) {
          currentValue = finalValues[key];
          clearInterval(interval);
        }

        setCounters((prev) => ({
          ...prev,
          [key]: Math.floor(currentValue),
        }));
      }, stepDuration);
    });
  }, []);

  const formatNumber = (num) => {
    if (num == null) return '0';
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M+';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(0) + 'K+';
    }
    return num.toLocaleString() + '+';
  };

  const handleStart = async (type) => {
    try {
      // Clear any existing data and start fresh (matching web version)
      await AsyncStorage.multiRemove(['th.onboard', 'th.subscription', 'th.match', 'th.parentInfo', 'th.childInfo', 'th.parentConsent']);
      
      // For teen therapy, navigate to parent/guardian info first
      if (type === 'teen') {
        navigation.navigate('ParentGuardianInfo');
        return;
      }
      
      // For individual and couples, proceed with normal flow
      // Save therapy type to AsyncStorage (matching web localStorage)
      const data = { 
        therapyType: type, 
        startedAt: new Date().toISOString() 
      };
      await AsyncStorage.setItem('th.onboard', JSON.stringify(data));
      
      navigation.navigate('Questionnaire', { therapyType: type });
    } catch (error) {
      console.error('Error saving therapy type:', error);
      // Still navigate even if save fails
      if (type === 'teen') {
        navigation.navigate('ParentGuardianInfo');
      } else {
        navigation.navigate('Questionnaire', { therapyType: type });
      }
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/back.jpeg')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.overlay}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          bounces={true}
        >
          {/* System Name Header */}
          <View style={styles.header}>
            <Text style={styles.systemName}>NessaHub</Text>
            <Text style={styles.tagline}>You deserve to be happy</Text>
          </View>

          {/* Therapy Type Buttons - Small, Same Row */}
          <View style={styles.buttonsSection}>
            <Text style={styles.sectionLabel}>What type of therapy are you looking for?</Text>
            <View style={styles.buttonsRow}>
              {therapyTypes.map((type) => (
                <TouchableOpacity
                  key={type.key}
                  style={[
                    styles.smallButton,
                    {
                      backgroundColor: type.bgColor,
                      borderColor: type.borderColor,
                    },
                  ]}
                  onPress={() => handleStart(type.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonIcon}>{type.icon}</Text>
                  <Text style={styles.buttonTitle}>{type.title}</Text>
                  <Text style={styles.buttonLabel}>{type.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={styles.loginButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.loginButtonText}>Already have an account? Login</Text>
          </TouchableOpacity>

          {/* Back to Intent Selection */}
          <TouchableOpacity
            style={styles.backToIntentButton}
            onPress={() => navigation.navigate('Intent')}
            activeOpacity={0.8}
          >
            <Text style={styles.backToIntentText}>Looking for a medical doctor instead?</Text>
          </TouchableOpacity>

          {/* Stats Section */}
          <View style={styles.statsSection}>
            <Text style={styles.statsSectionTitle}>The world's largest therapy service.</Text>
            <Text style={styles.statsSectionSubtitle}>100% online.</Text>
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{formatNumber(counters.therapists)}</Text>
                <Text style={styles.statLabel}>Licensed therapists</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{formatNumber(counters.sessions)}</Text>
                <Text style={styles.statLabel}>Therapy sessions completed</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{formatNumber(counters.clients)}</Text>
                <Text style={styles.statLabel}>People helped</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{formatNumber(counters.messages)}</Text>
                <Text style={styles.statLabel}>Messages, chat, audio, video sessions</Text>
              </View>
            </View>
          </View>

          {/* Therapists Features Section */}
          <View style={styles.featuresSection}>
            <Text style={styles.featuresTitle}>Professional and qualified therapists who you can trust</Text>
            <View style={styles.featuresGrid}>
              <View style={styles.featureCard}>
                <Text style={styles.featureIcon}>🎓</Text>
                <Text style={styles.featureTitle}>Licensed & Credentialed</Text>
                <Text style={styles.featureDescription}>
                  All therapists are licensed, trained, experienced, and accredited psychologists, marriage and family therapists, clinical social workers or professional counselors.
                </Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureIcon}>🔒</Text>
                <Text style={styles.featureTitle}>Private & Secure</Text>
                <Text style={styles.featureDescription}>
                  Your sessions are completely confidential and secure. We use encryption and follow strict privacy guidelines to protect your information.
                </Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureIcon}>💬</Text>
                <Text style={styles.featureTitle}>Multiple Ways to Communicate</Text>
                <Text style={styles.featureDescription}>
                  Communicate with your therapist through video, phone, live chat, or messaging - whatever works best for your schedule and comfort level.
                </Text>
              </View>
              <View style={styles.featureCard}>
                <Text style={styles.featureIcon}>📱</Text>
                <Text style={styles.featureTitle}>Accessible Anywhere</Text>
                <Text style={styles.featureDescription}>
                  Access therapy from the comfort of your home, office, or anywhere you have a private space and internet connection.
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Dark overlay for better contrast
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    paddingBottom: 30,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  systemName: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
    letterSpacing: 1,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  tagline: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '300',
    letterSpacing: 0.5,
  },
  buttonsSection: {
    width: '100%',
    marginBottom: 60,
  },
  sectionLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '500',
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    paddingHorizontal: 10,
  },
  smallButton: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    maxWidth: (width - 60) / 3,
    borderWidth: 1.5,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  buttonIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  buttonTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  buttonLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    fontWeight: '400',
  },
  statsSection: {
    width: '100%',
    marginBottom: 40,
    marginTop: 20,
  },
  statsSectionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statsSectionSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  statsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    marginBottom: 16,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#10b981',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    opacity: 0.95,
    lineHeight: 16,
  },
  featuresSection: {
    width: '100%',
    marginBottom: 40,
    marginTop: 20,
  },
  featuresTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    paddingHorizontal: 20,
  },
  featuresGrid: {
    gap: 16,
  },
  featureCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  featureIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 20,
  },
  loginButton: {
    marginTop: 0,
    marginBottom: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  backToIntentButton: {
    marginTop: 12,
    alignItems: 'center',
    padding: 10,
  },
  backToIntentText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
});

export default WelcomeScreen;
