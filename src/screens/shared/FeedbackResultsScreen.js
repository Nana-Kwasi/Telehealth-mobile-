import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native';
import { api } from '../../services/apiClient';

/**
 * Feedback survey results — the mobile half of a web-only screen.
 *
 * Mirrors the web component's data handling exactly: the endpoint returns an
 * ARRAY of campaigns, each with its own star histogram and comments. An
 * earlier draft of this screen assumed a single {average, responses} object,
 * which would have rendered an empty page against real data without erroring.
 *
 * Responses are anonymous, and the screen says so — a clinician reading a
 * sharp comment should not be guessing who wrote it.
 */
export default function FeedbackResultsScreen() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await api('/api/v1/campaigns/feedback/results');
      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      setError(e?.message || 'Could not load feedback.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1d4ed8" /></View>;
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); load(); }} />
      }
    >
      <Text style={styles.h1}>Patient feedback</Text>
      <Text style={styles.lead}>
        Results from platform feedback surveys. Responses are anonymous.
      </Text>

      {error ? (
        <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {rows.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.empty}>No feedback surveys have been run yet.</Text>
        </View>
      ) : rows.map((r) => {
        const total = Number(r.responses || 0);
        const bars = [['5', r.five], ['4', r.four], ['3', r.three], ['2', r.two], ['1', r.one]];
        const comments = Array.isArray(r.comments) ? r.comments : [];
        return (
          <View key={r.id} style={styles.card}>
            <Text style={styles.title}>{r.title}</Text>
            <Text style={styles.meta}>
              {total} response{total === 1 ? '' : 's'}
              {r.average_rating ? ` · average ${r.average_rating} / 5` : ''}
            </Text>

            {total > 0 ? (
              <View style={styles.bars}>
                {bars.map(([star, count]) => {
                  const n = Number(count || 0);
                  const pct = total ? Math.round((n / total) * 100) : 0;
                  return (
                    <View key={star} style={styles.barRow}>
                      <Text style={styles.barStar}>{star}★</Text>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={styles.barCount}>{n}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {comments.length ? (
              <View style={styles.commentsBlock}>
                <Text style={styles.commentsTitle}>What people said</Text>
                {comments.map((c, i) => (
                  <View key={i} style={styles.comment}>
                    <Text style={styles.commentText}>
                      {c.rating ? <Text style={styles.commentStar}>{c.rating}★  </Text> : null}
                      {c.comment}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f9fc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },

  h1: { fontSize: 21, fontWeight: '800', color: '#0f1424' },
  lead: { fontSize: 13, lineHeight: 19, color: '#545a6b', marginTop: 5, marginBottom: 16 },

  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, marginBottom: 10,
          borderWidth: 1, borderColor: '#e4e7ee' },
  title: { fontSize: 15, fontWeight: '750', color: '#0f1424' },
  meta: { fontSize: 12, color: '#6b7283', marginTop: 3 },
  empty: { fontSize: 13, lineHeight: 20, color: '#6b7283', textAlign: 'center' },

  bars: { marginTop: 12, gap: 5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barStar: { width: 20, fontSize: 11.5, color: '#6b7283' },
  // flex:1 on the track only — it is in a row, so it takes the leftover width.
  barTrack: { flex: 1, height: 8, borderRadius: 999, backgroundColor: '#f1f5f9', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 999, backgroundColor: '#1d4ed8' },
  barCount: { width: 30, fontSize: 11.5, color: '#6b7283', textAlign: 'right' },

  commentsBlock: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f3f8' },
  commentsTitle: { fontSize: 12.5, fontWeight: '700', color: '#2b3142', marginBottom: 7 },
  comment: { backgroundColor: '#f8fafc', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11,
             marginBottom: 6 },
  commentText: { fontSize: 13, lineHeight: 19, color: '#334155' },
  commentStar: { fontWeight: '800', color: '#b8860b' },

  error: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca',
           borderRadius: 10, padding: 11, marginBottom: 12 },
  errorText: { fontSize: 13, color: '#991b1b', lineHeight: 19 },
});
