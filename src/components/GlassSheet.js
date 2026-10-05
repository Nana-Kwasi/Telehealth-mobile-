import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ZC } from '../constants/zencare';

/**
 * The frosted backing for a bottom-sheet modal.
 *
 * The therapy modals are bottom sheets, not centred dialogs, so they cannot use
 * GlassModal without rewriting their layout. This gives them the same glass
 * treatment in place: drop `<GlassScrim />` inside the overlay and wrap the
 * sheet's children in `<GlassSheetSurface>`.
 *
 * Why a blurred scrim and not just a dark wash: glass only reads as glass when
 * there is something behind it to distort. A flat scrim gives the sheet nothing
 * to refract, which is what made these look like plain white sheets. Blurring
 * the page behind turns it into texture the sheet can pick up — and it is also
 * NN/G's recommendation for keeping a busy background from competing with the
 * dialog's content.
 */

export function GlassScrim({ tint = 'light', intensity = 26 }) {
  return (
    <>
      <BlurView
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      {/* A wash over the blur, so the sheet still separates from the page on
          devices where the blur is weak or silently unsupported. */}
      <View style={[StyleSheet.absoluteFill, styles.wash]} pointerEvents="none" />
    </>
  );
}

export function GlassSheetSurface({ children, style, radius = 20 }) {
  return (
    <View
      style={[
        styles.surface,
        { borderTopLeftRadius: radius, borderTopRightRadius: radius },
        style,
      ]}
    >
      <BlurView
        intensity={ZC.blurAmount}
        tint="light"
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ZC.glassStrong }]} />
      {/* The lit top edge — on a sheet this is the only glass edge you see. */}
      <View style={styles.edge} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wash: { backgroundColor: 'rgba(28,42,39,0.26)' },
  surface: {
    // Required, or the BlurView paints past the rounded top corners.
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: ZC.glassBorder,
    backgroundColor: 'transparent',
  },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: ZC.glassEdge },
});

export default GlassSheetSurface;
