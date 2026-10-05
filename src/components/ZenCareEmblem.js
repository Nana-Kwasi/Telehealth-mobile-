import React from 'react';
import { Image, StyleSheet } from 'react-native';

/**
 * The ZenCare mark, mobile.
 *
 * Uses the same artwork file as web (assets/zencare-emblem.png). Two things
 * follow from the file itself:
 *
 *  - It has NO alpha channel — the navy is baked in. Whatever sits behind it
 *    must be the same navy, which is why the ground tokens in constants/zencare
 *    are sampled from this exact file rather than judged by eye.
 *  - It is 1402x1122, so it is sized by WIDTH with the aspect ratio preserved.
 *    Forcing a square would squash the mark.
 *
 * React Native has no mask-image, so where web fades the artwork's edge into
 * the page this simply sits at reduced opacity on the matching ground. Placing
 * it so it bleeds off an edge (see `bleedRight`) hides the seam the same way.
 */
export default function ZenCareEmblem({ width = 260, style, opacity = 0.9, bleedRight = false }) {
  return (
    <Image
      source={require('../../assets/zencare-emblem.png')}
      resizeMode="contain"
      style={[
        styles.emblem,
        { width, height: width * (1122 / 1402), opacity },
        bleedRight && { position: 'absolute', right: -width * 0.28, top: 0 },
        style,
      ]}
      // Decorative: it carries no information a screen reader needs.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  emblem: { alignSelf: 'center' },
});
