import React from 'react';
import { View, ImageBackground, StyleSheet } from 'react-native';
import { ZC } from '../constants/zencare';

/**
 * The page ground every therapy screen sits on.
 *
 * This exists for the glass, not for decoration. A BlurView samples whatever is
 * painted behind it — over a flat colour it has nothing to distort, and the
 * panel renders as a plain white card. That is exactly what went wrong on web:
 * real `backdrop-filter`, real blur, and still indistinguishable from a card,
 * because the ground underneath was near-uniform.
 *
 * The artwork (assets/zc-ground.jpg) is the supplied glass-cube render: white
 * drifting into lavender, with soft smoke and one refractive object. It is
 * chosen, not decorative — the cube and the smoke are exactly the kind of
 * high-frequency detail a BlurView needs in order to read as frosted rather
 * than as a flat white card.
 *
 * `fixed` keeps the artwork still while content scrolls over it. A background
 * that scrolls with the cards would drag the cube through the middle of the
 * page; holding it still makes the panels read as sheets of glass moving across
 * a fixed scene, which is the effect in the reference.
 */
export default function ZCGround({ children, style }) {
  return (
    <ImageBackground
      source={require('../../assets/zc-ground.jpg')}
      resizeMode="cover"
      style={[styles.root, style]}
      // The mesh is decorative; it carries nothing a screen reader needs.
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // The flat colour still matters: it shows for the frame before the image
  // decodes and anywhere the cover crop cannot reach.
  root: { flex: 1, backgroundColor: ZC.bg },
});
