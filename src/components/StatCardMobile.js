import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/*
 * The stat card used by Analytics and Earnings on mobile, so the two screens
 * look the same: an icon in a tinted square, a big coloured value, a label and
 * an optional line under it.
 */
export function StatGridMobile({ children }) {
  return <View style={st.grid}>{children}</View>;
}

export default function StatCardMobile({ icon, value, label, sub, color = '#1e6bb8', bg = '#f8fafc' }) {
  return (
    <View style={[st.card, { backgroundColor: bg }]}>
      <View style={[st.icon, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[st.value, { color }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={st.label}>{label}</Text>
      {sub ? <Text style={st.sub}>{sub}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16, marginTop: 8 },
  card: {
    flex: 1, minWidth: '44%', borderRadius: 14, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  icon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  value: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 11, color: '#64748b', textAlign: 'center', fontWeight: '600' },
  sub: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginTop: 3 },
});
