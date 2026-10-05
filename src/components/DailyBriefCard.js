import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * "What needs me today", on the clinician's own dashboard.
 *
 * Every number is counted by the server in SQL. The one-line summary is the
 * only model-written part, it is written over those same counted figures, and
 * the card renders in full when the model says nothing — a missing sentence
 * costs a little polish, never a fact.
 *
 * Each line is tappable, because a count you cannot act on is just an anxiety
 * generator: "3 unsigned notes" should take you to the notes.
 */
export default function DailyBriefCard({ navigation, routeFor, accent = '#5046bd' }) {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setBrief(await api('/api/v1/ai/daily-brief')); }
    catch { setBrief(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.card, styles.loading]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }
  if (!brief) return null;

  // Zero-count lines are dropped: the summary already says the day is clear,
  // and a wall of zeroes reads as a to-do list.
  const actionable = (brief.items || []).filter((i) => typeof i.count === 'number' && i.count > 0);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="sunny-outline" size={16} color="#8a4b09" />
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>Today's brief</Text>
          <Text style={styles.sub}>
            {brief.summary
              || (actionable.length === 0
                ? 'Nothing is waiting on you right now.'
                : 'Here is what is waiting on you.')}
          </Text>
        </View>
      </View>

      {actionable.length ? (
        <View style={styles.rows}>
          {actionable.map((i) => {
            const target = routeFor?.(i.key);
            return (
              <TouchableOpacity
                key={i.key}
                style={styles.row}
                activeOpacity={target ? 0.75 : 1}
                disabled={!target}
                onPress={() => target && navigation?.navigate(target)}
              >
                <View style={[styles.count, TONES[i.tone] || TONES.neutral]}>
                  <Text style={[styles.countText, { color: (TONES[i.tone] || TONES.neutral).color }]}>
                    {i.count}
                  </Text>
                </View>
                <Text style={styles.label}>{i.label}</Text>
                {target ? <Ionicons name="chevron-forward" size={13} color="#5b6170" /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/* Measured on the row background (#f7f8fa). */
const TONES = {
  neutral:   { backgroundColor: '#eef2ff', color: '#2a3ea8' },   /* 7.98:1 */
  attention: { backgroundColor: '#fff4e5', color: '#8a4b09' },   /* 6.25:1 */
  good:      { backgroundColor: '#e6f6ec', color: '#12602f' },   /* 6.85:1 */
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: '#e4e7ee',
    borderRadius: 18, padding: 16,
    marginHorizontal: 4, marginBottom: 14,
  },
  loading: { alignItems: 'center', paddingVertical: 26 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  icon: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff4e5',
  },
  // flex on the text only — never the row, or the icon stretches.
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '800', color: '#15173a' },
  sub: { fontSize: 12.5, lineHeight: 18, color: '#4a5063', marginTop: 2 },

  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 7, paddingHorizontal: 10,
    borderRadius: 999, borderWidth: 1, borderColor: '#e9ebf1',
    backgroundColor: '#f7f8fa',
  },
  count: {
    minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  countText: { fontSize: 11.5, fontWeight: '800' },
  label: { fontSize: 12.5, fontWeight: '600', color: '#2c3040' },
});
