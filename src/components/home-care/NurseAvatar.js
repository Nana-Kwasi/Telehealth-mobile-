import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { HomeCareColors as C } from '../../constants/homeCareColors';

export function nurseInitials(nurse) {
  const name = nurse?.fullName || nurse?.name || 'N';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function NurseAvatar({ nurse, size = 68, style }) {
  const radius = size / 2;
  if (nurse?.photoURL) {
    return (
      <Image
        source={{ uri: nurse.photoURL }}
        style={[styles.photo, { width: size, height: size, borderRadius: radius }, style]}
      />
    );
  }
  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius: radius }, style]}>
      <Text style={[styles.initial, { fontSize: size * 0.35 }]}>{nurseInitials(nurse)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { backgroundColor: C.primaryLight },
  placeholder: {
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  initial: { fontWeight: '800', color: '#fff' },
});
