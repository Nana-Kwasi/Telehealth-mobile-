import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ZC, ZC_RADIUS, zcShadow } from '../constants/zencare';

/**
 * A frosted-glass panel.
 *
 * React Native has no `backdrop-filter`, so unlike web this cannot be done in a
 * stylesheet — the blur has to be a real view (expo-blur) that samples what is
 * painted behind it. Everything else is layered on top of that view.
 *
 * Why this is more than a BlurView with a tint:
 *
 * Glass only reads as glass when there is something behind it to distort. Over
 * a near-uniform light ground a blurred panel is indistinguishable from a plain
 * white card — which is exactly how the web side first looked. NN/G's guidance
 * for simple backgrounds is that the depth has to come from STROKES and
 * GRADIENTS instead, since blur has nothing to bite on. So:
 *
 *  - `glassBorder` is a near-white stroke standing for the lit edge of a pane.
 *  - `glassEdge` is a second, darker hairline just inside the top, which is the
 *    refraction you see looking through real glass at a grazing angle.
 *  - `zcShadow` is two stacked soft shadows, so the panel floats above the
 *    ground rather than sitting flat on it.
 *
 * Remove any one of those three and this collapses back into a white rectangle.
 *
 * `intensity` is deliberately modest. NN/G recommend heavy blur over busy
 * imagery, but over a calm ground a strong blur just greys the panel; the tint
 * does the lifting here and the blur keeps the edges honest.
 */
export default function GlassCard({
  children,
  style,
  intensity = ZC.blurAmount,
  tint = 'light',
  strong = false,
  padded = true,
}) {
  const fill = strong ? ZC.glassStrong : ZC.glass;

  return (
    <View style={[styles.wrap, zcShadow, style]}>
      <BlurView
        intensity={intensity}
        tint={tint}
        // Android's blur is far weaker and, on older devices, absent entirely.
        // The tint below covers that case, so the panel never renders as a
        // transparent hole if the blur silently does nothing.
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} />
      {/* The grazing-angle highlight along the top edge. */}
      <View style={styles.edge} pointerEvents="none" />
      <View style={padded ? styles.content : null}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: ZC_RADIUS,
    borderWidth: 1,
    borderColor: ZC.glassBorder,
    // Required: without it the BlurView paints past the rounded corners.
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: ZC.glassEdge,
  },
  content: { padding: 18 },
});
