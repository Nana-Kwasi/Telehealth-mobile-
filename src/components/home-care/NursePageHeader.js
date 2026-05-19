import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { HomeCareColors as C } from '../../constants/homeCareColors';

export default function NursePageHeader({ title, subtitle }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: C.primaryDark,
    marginHorizontal: -16,
    marginTop: -16,
    marginBottom: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },
});
