import React from 'react';
import { Modal, View, Pressable, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ZC, ZC_RADIUS, zcShadow } from '../constants/zencare';

/**
 * A modal whose panel is frosted glass, matching GlassCard.
 *
 * Two layers of blur, which is the part that is easy to get wrong:
 *
 *  1. The SCRIM blurs the whole screen behind the dialog. This is what makes a
 *     glass modal legible — the content underneath becomes texture rather than
 *     competing detail, which is NN/G's point about needing heavy blur when
 *     what is behind is busy. A plain dark scrim would work too, but then the
 *     panel has nothing interesting to refract and stops reading as glass.
 *  2. The PANEL itself, same treatment as GlassCard: blur, white tint, a
 *     near-white stroke for the glass edge, and a layered shadow for depth.
 *
 * Tapping the scrim dismisses, as does the hardware back button on Android via
 * `onRequestClose`.
 */
export default function GlassModal({
  visible,
  onClose,
  children,
  dismissOnBackdropPress = true,
  style,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <BlurView
          intensity={28}
          tint="light"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
          style={StyleSheet.absoluteFill}
        />
        {/* A wash over the scrim blur so the dialog still separates from the
            page on devices where the blur is weak or unsupported. */}
        <Pressable
          style={[StyleSheet.absoluteFill, styles.scrim]}
          onPress={dismissOnBackdropPress ? onClose : undefined}
          // The dismiss affordance is the visible Close control inside the
          // dialog; this backdrop is a shortcut, not the labelled way out.
          accessible={false}
          importantForAccessibility="no"
        />

        <View style={[styles.panel, zcShadow, style]} pointerEvents="box-none">
          <BlurView
            intensity={ZC.blurAmount}
            tint="light"
            experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
            style={StyleSheet.absoluteFill}
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: ZC.glassStrong }]} />
          <View style={styles.edge} pointerEvents="none" />
          <View style={styles.content}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  scrim: { backgroundColor: 'rgba(28,42,39,0.28)' },
  panel: {
    width: '100%',
    maxWidth: 460,
    borderRadius: ZC_RADIUS,
    borderWidth: 1,
    borderColor: ZC.glassBorder,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: ZC.glassEdge },
  content: { padding: 20 },
});
