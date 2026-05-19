import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Linking,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import {
  PRIVACY_STORAGE_KEY,
  POLICIES_URL,
  acceptPrivacyOnDevice,
} from '../services/privacyConsentService';

export default function IntroHomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const videoRef = useRef(null);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [checkingPrivacy, setCheckingPrivacy] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [privacyError, setPrivacyError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(PRIVACY_STORAGE_KEY);
        const accepted = stored === 'true';
        setPrivacyAccepted(accepted);
        setShowPrivacyModal(!accepted);
      } catch {
        setShowPrivacyModal(true);
      } finally {
        setCheckingPrivacy(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!videoReady || checkingPrivacy) return;
    videoRef.current?.playAsync?.().catch(() => {});
  }, [videoReady, checkingPrivacy]);

  const openPolicies = useCallback(() => {
    Linking.openURL(POLICIES_URL).catch(() => {});
  }, []);

  const handleAcceptPrivacy = async () => {
    setPrivacyError('');
    setSavingPrivacy(true);
    try {
      await acceptPrivacyOnDevice();
      setPrivacyAccepted(true);
      setShowPrivacyModal(false);
    } catch (e) {
      console.warn('Privacy consent save failed:', e);
      setPrivacyError('Could not save your choice. Check your connection and try again.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleContinue = () => {
    if (!privacyAccepted) {
      setShowPrivacyModal(true);
      return;
    }
    navigation.navigate('Intent');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <Video
        ref={videoRef}
        source={require('../../assets/home.mp4')}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted
        shouldPlay
        onReadyForDisplay={() => setVideoReady(true)}
      />

      {!videoReady && (
        <View style={styles.videoLoading}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.brandBlock, { paddingTop: insets.top + 16 }]} pointerEvents="none">
          <Text style={styles.brandName}>NessaHub</Text>
          <Text style={styles.brandTagline}>Healthcare & therapy, connected</Text>
        </View>

        <TouchableOpacity
          style={[
            styles.continueBtn,
            { bottom: Math.max(insets.bottom, 20) + 12, right: Math.max(insets.right, 16) + 8 },
            !privacyAccepted && styles.continueBtnDimmed,
          ]}
          onPress={handleContinue}
          activeOpacity={0.85}
          accessibilityLabel="Continue to app"
          accessibilityHint={privacyAccepted ? 'Go to main menu' : 'Accept privacy policy first'}
        >
          <Ionicons name="arrow-forward" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showPrivacyModal && !checkingPrivacy}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { marginBottom: insets.bottom }]}>
            <Text style={styles.modalTitle}>Privacy & policies</Text>
            <Text style={styles.modalBody}>
              To use NessaHub, please review and accept our privacy practices and platform policies.
              We process health-related data in line with applicable privacy and healthcare standards.
            </Text>
            <Pressable onPress={openPolicies} style={styles.policyLinkWrap}>
              <Text style={styles.policyLink}>Read Nessa Hub policies</Text>
              <Ionicons name="open-outline" size={16} color={Colors.primary} />
            </Pressable>
            {privacyError ? <Text style={styles.privacyError}>{privacyError}</Text> : null}
            <TouchableOpacity
              style={[styles.acceptBtn, savingPrivacy && { opacity: 0.65 }]}
              onPress={handleAcceptPrivacy}
              activeOpacity={0.88}
              disabled={savingPrivacy}
            >
              {savingPrivacy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptBtnText}>I accept</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.modalFootnote}>
              You can review policies anytime at{' '}
              <Text style={styles.modalFootnoteLink} onPress={openPolicies}>
                teleehealth.firebaseapp.com
              </Text>
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  brandBlock: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  brandName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandTagline: {
    marginTop: 8,
    fontSize: 15,
    color: 'rgba(255,255,255,0.88)',
    fontWeight: '500',
    textAlign: 'center',
  },
  continueBtn: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  continueBtnDimmed: {
    opacity: 0.75,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    marginBottom: 14,
  },
  policyLinkWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
    paddingVertical: 8,
  },
  policyLink: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
  acceptBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  acceptBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  privacyError: {
    fontSize: 13,
    color: '#be123c',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalFootnote: {
    marginTop: 14,
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 16,
    textAlign: 'center',
  },
  modalFootnoteLink: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
