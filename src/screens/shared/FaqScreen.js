import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import FaqSection from '../../components/FaqSection';

/** The full FAQ (every category), opened from "See all" on a home screen or the intro screen. */
export default function FaqScreen({ route }) {
  const audience = route?.params?.audience || 'all';
  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.container} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <FaqSection audience={audience} title="All questions" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
});
