import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { ZC, zcStyles } from '../constants/zencare';

/**
 * Which kind of therapy — asked before the sign-up form.
 *
 * The three options route into flows that already exist and are known to work
 * (individual questionnaire, teen parent/guardian consent, couple invitation).
 * This screen only decides WHICH; it deliberately does not reimplement any of
 * them.
 *
 * The keys are the ones the rest of the app already stores and branches on —
 * note `couples`, plural, which is what WelcomeScreen and the stored
 * `th.onboard` record use. Introducing `couple` here would look harmless and
 * silently fail every downstream comparison.
 */
export const THERAPY_TYPES = [
  {
    key: 'individual',
    title: 'Individual',
    body: 'One-to-one therapy for you.',
    icon: 'person-outline',
  },
  {
    key: 'teen',
    title: 'Teen',
    body: 'For under-18s. A parent or guardian consents first.',
    icon: 'happy-outline',
  },
  {
    key: 'couples',
    title: 'Couples',
    body: 'For you and your partner, together.',
    icon: 'heart-outline',
  },
];

export default function TherapyTypeModal({ visible, onClose, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <BlurView
          intensity={26}
          tint="light"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        <TouchableOpacity style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onClose} accessible={false} />

        <View style={styles.panel}>
          <BlurView
            intensity={ZC.blurAmount}
            tint="light"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ZC.glassStrong }]} />
          <View style={styles.edge} pointerEvents="none" />

          <View style={styles.content}>
            <Text style={styles.title}>What kind of therapy?</Text>
            <Text style={styles.sub}>This decides who you will be matched with.</Text>

            {THERAPY_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={styles.option}
                onPress={() => onSelect(t.key)}
                accessibilityRole="button"
              >
                <View style={styles.optionIcon}>
                  <Ionicons name={t.icon} size={20} color={ZC.accentDeep} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle}>{t.title}</Text>
                  <Text style={styles.optionBody}>{t.body}</Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color="#9aa0ac" />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  scrim: { backgroundColor: 'rgba(28,34,70,0.35)' },
  panel: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: ZC.glassBorder,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: ZC.glassEdge },
  content: { padding: 20, gap: 10 },
  title: { fontSize: 19, fontWeight: '800', color: ZC.ink },
  sub: { fontSize: 13.5, color: ZC.ink3, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(16,16,16,0.10)',
  },
  optionIcon: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: ZC.accentWash,
  },
  optionText: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '700', color: ZC.ink },
  optionBody: { fontSize: 12.5, color: ZC.ink3, marginTop: 1 },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '700', color: ZC.accentDeep },
});
