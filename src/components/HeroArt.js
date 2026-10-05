import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

/**
 * The dashboard illustration, mobile edition.
 *
 * Web places the artwork beside the copy and hides it under 1180px. A phone is
 * never that wide, so a side-by-side image would either squeeze the greeting
 * or push it off-screen. Instead this sits BEHIND the header content, anchored
 * to the right edge, with a left-to-right gradient scrim over it so the text
 * stays on a near-solid surface while the image is still visible on the right.
 *
 * React Native has no mask-image, which is how the web version fades; the
 * scrim is the equivalent that actually exists here.
 *
 * `pointerEvents="none"` throughout — the notification button and avatar sit
 * on top of this and must stay tappable.
 */
export default function HeroArt({ source, scrim = '#ffffff', width = 150, opacity = 0.9 }) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Image
        source={source}
        style={[styles.image, { width, opacity }]}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    // Behind the header's own content, which has no explicit z-index and so
    // paints after this in document order.
    zIndex: 0,
  },
  image: {
    position: 'absolute',
    right: 0,
    top: -12,
    bottom: -12,
    height: '118%',
  },
});
