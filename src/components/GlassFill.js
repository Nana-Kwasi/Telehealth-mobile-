import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { ZC } from '../constants/zencare';

/**
 * Drop-in frosted fill for a container that already exists.
 *
 * GlassCard wraps its children; that is wrong for a card which is itself a
 * TouchableOpacity, or for one whose layout is already set — wrapping would
 * either swallow the touch target or add a box that changes the spacing. This
 * renders only the BACKGROUND layers, absolutely positioned, so it can be
 * dropped in as the first child of an existing card:
 *
 *   <TouchableOpacity style={[styles.kpiCard, glassStyle]}>
 *     <GlassFill />
 *     ...existing content, untouched...
 *
 * The host style needs `overflow: 'hidden'` (or the blur paints past the
 * rounded corners) and a transparent background (or its own fill covers this).
 * `glassStyle` below carries both, plus the stroke that makes the glass edge
 * legible on a light ground.
 */
export default function GlassFill({ intensity = ZC.blurAmount, strong = false, tint = 'light' }) {
  return (
    <>
      <BlurView
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: strong ? ZC.glassStrong : ZC.glass }]}
        pointerEvents="none"
      />
      {/* Lit top edge — the grazing highlight that reads as the pane's thickness. */}
      <View style={styles.edge} pointerEvents="none" />
    </>
  );
}

/** Spread onto the host container alongside its own style. */
export const glassStyle = {
  backgroundColor: 'transparent',
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: ZC.glassBorder,
};

const styles = StyleSheet.create({
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: ZC.glassEdge },
});
