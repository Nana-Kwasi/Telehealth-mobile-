import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { HomeCareColors as C } from '../../constants/homeCareColors';

export default function NurseTabBar({ tabs, active, onChange }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.row}>
      {tabs.map((t) => {
        const on = active === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            style={[styles.tab, on && styles.tabOn, t.urgent && !on && styles.tabUrgent]}
            onPress={() => onChange(t.id)}
            activeOpacity={0.85}
          >
            <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            {t.count > 0 ? (
              <View style={[styles.badge, on && styles.badgeOn]}>
                <Text style={[styles.badgeText, on && styles.badgeTextOn]}>{t.count > 99 ? '99+' : t.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginBottom: 14, flexGrow: 0 },
  row: { gap: 8, paddingRight: 8 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: '#fff',
  },
  tabOn: { backgroundColor: C.primary, borderColor: C.primary },
  tabUrgent: { borderColor: '#fca5a5' },
  tabText: { fontSize: 13, fontWeight: '700', color: C.primaryDark },
  tabTextOn: { color: '#fff' },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeOn: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeText: { fontSize: 10, fontWeight: '800', color: C.textSecondary },
  badgeTextOn: { color: '#fff' },
});
