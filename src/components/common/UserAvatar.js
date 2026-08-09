// ─── UserAvatar ──────────────────────────────────────────────────────────────
// The profile icon, wherever a person is shown. Renders their picture if one is
// saved, and their initials if not — so it never falls back to a blank circle.
//
// Screens used to each roll their own avatar and read a different field name
// (photoURL here, profilePhotoUrl there), which is why a saved image appeared in
// one place and not another.

import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { avatarUrlOf, initialsOf } from '../../utils/profileImage';

export default function UserAvatar({
  user,
  size = 44,
  onPress,
  backgroundColor = '#4f46e5',
  textColor = '#fff',
  style,
}) {
  const [failed, setFailed] = useState(false);
  const url = failed ? null : avatarUrlOf(user);

  const box = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: url ? '#e2e8f0' : backgroundColor,
  };

  const inner = url ? (
    <Image
      source={{ uri: url }}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      // A deleted or unreachable image falls back to initials instead of a blank.
      onError={() => setFailed(true)}
    />
  ) : (
    <Text style={[styles.initials, { color: textColor, fontSize: Math.max(11, size * 0.38) }]}>
      {initialsOf(user)}
    </Text>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.wrap, box, style]} onPress={onPress} activeOpacity={0.8}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.wrap, box, style]}>{inner}</View>;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { resizeMode: 'cover' },
  initials: { fontWeight: '700' },
});
