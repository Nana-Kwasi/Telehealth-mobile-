import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api } from '../../services/apiClient';

/**
 * The patient's own care plan.
 *
 * Only approved plans reach here — the server filters on
 * `visible_to_patient AND NOT is_draft`, so a draft the clinician is still
 * working on cannot appear. An unapproved plan is a machine's proposal, and a
 * patient reading one would be taking instructions from a model.
 *
 * What is shown is the plain-language summary the clinician approved, not the
 * structured plan, which is written for them.
 */
export default function MyCarePlanScreen({ peopleNoun = 'clinician' }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await api('/api/v1/care-plans');
      setPlans(Array.isArray(rows) ? rows : []);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <ZCGround>
        <View style={styles.centered}><ActivityIndicator color={ZC.accent} size="large" /></View>
      </ZCGround>
    );
  }

  return (
    <ZCGround>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={ZC.accent} />
        }
      >
        <View style={zcStyles.badge}><Text style={zcStyles.badgeText}>Care plan</Text></View>
        <Text style={[zcStyles.display, styles.title]}>What to do</Text>
        <Text style={[zcStyles.body, styles.lead]}>
          What your {peopleNoun} has asked you to do. Ask them if anything here is
          unclear — this is a reminder, not a replacement for talking to them.
        </Text>

        {plans.length === 0 ? (
          <View style={[styles.card, glassStyle, styles.empty]}>
            <GlassFill />
            <Ionicons name="clipboard-outline" size={28} color={ZC.ink3} />
            <Text style={[zcStyles.body, styles.emptyText]}>
              You do not have a care plan yet. One appears here when your
              {' '}{peopleNoun} shares it with you.
            </Text>
          </View>
        ) : plans.map((p) => (
          <View key={p.id} style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={styles.meta}>
              {p.approved_at ? `Shared ${fmt(p.approved_at)}` : `Added ${fmt(p.created_at)}`}
            </Text>
            {String(p.patient_summary || '').split(/\n+/).filter(Boolean).map((line, i) => (
              <Text key={i} style={styles.para}>{line}</Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </ZCGround>
  );
}

function fmt(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' :
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { marginTop: 12 },
  lead: { marginBottom: 4 },
  card: { borderRadius: 20, padding: 18 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 34 },
  emptyText: { textAlign: 'center' },
  meta: { fontSize: 11.5, color: ZC.ink3, marginBottom: 8 },
  para: { fontSize: 15, lineHeight: 24, color: ZC.ink2, marginBottom: 8 },
});
