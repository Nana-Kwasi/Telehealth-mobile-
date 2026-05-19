import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '../../constants/colors';
import { getCoupleCaseForTherapist } from '../../services/coupleTherapyService';

export default function TherapistCoupleCaseScreen({ route }) {
  const { coupleId } = route.params || {};
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCoupleCaseForTherapist(coupleId);
        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [coupleId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  const cmp = data?.relationshipComparison || {};
  const a = data?.partnerAIntake || {};
  const b = data?.partnerBIntake || {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Couple case</Text>
      <Text style={styles.subtitle}>
        {data?.couple?.partnerA?.name} & {data?.couple?.partnerB?.name} — therapist-only private records
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Relationship comparison</Text>
        <Text style={styles.row}>Partner A satisfaction: {cmp.satisfactionA ?? '—'}/10</Text>
        <Text style={styles.row}>Partner B satisfaction: {cmp.satisfactionB ?? '—'}/10</Text>
        <Text style={styles.row}>Partner A objectives: {(cmp.objectivesA || []).join(', ') || '—'}</Text>
        <Text style={styles.row}>Partner B objectives: {(cmp.objectivesB || []).join(', ') || '—'}</Text>
      </View>

      <Section title="Partner A — relationship (private)" data={a.relationship} />
      <Section title="Partner A — sensitive (private)" data={a.sensitive} sensitive />
      <Section title="Partner B — relationship (private)" data={b.relationship} />
      <Section title="Partner B — sensitive (private)" data={b.sensitive} sensitive />
    </ScrollView>
  );
}

function Section({ title, data, sensitive }) {
  if (!data || !Object.keys(data).length) return null;
  return (
    <View style={[styles.card, sensitive && styles.sensitiveCard]}>
      <Text style={styles.cardTitle}>{title}</Text>
      {Object.entries(data).map(([k, v]) => (
        <Text key={k} style={styles.kv}>
          <Text style={styles.key}>{k}: </Text>
          {typeof v === 'object' ? JSON.stringify(v) : String(v)}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginBottom: 16 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sensitiveCard: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  cardTitle: { fontWeight: '700', marginBottom: 8, color: Colors.text },
  row: { fontSize: 14, color: Colors.text, marginBottom: 4 },
  kv: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  key: { fontWeight: '600', color: Colors.text },
});
