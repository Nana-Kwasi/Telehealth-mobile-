import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api } from '../../services/apiClient';

/**
 * Search a record, and read it in order.
 *
 * Both halves come from the same server retrieval, so a search and the timeline
 * can never disagree about what is on file.
 *
 * The RECORDS are the answer; the summary sentence is a convenience. When the
 * narration fails the entries still render, and when nothing matches the screen
 * says so rather than showing a reassuring paragraph about an empty record.
 */
export default function RecordExplorerScreen({ route, title = 'My records' }) {
  const subjectId = route?.params?.subjectId || null;

  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadTimeline = useCallback(async () => {
    try {
      const qs = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : '';
      const res = await api(`/api/v1/ai/records/timeline${qs}`);
      setTimeline(res?.ok ? res : null);
    } catch {
      setTimeline(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [subjectId]);

  useEffect(() => { loadTimeline(); }, [loadTimeline]);

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await api('/api/v1/ai/records/search', {
        method: 'POST',
        body: { subjectId, query },
      });
      if (!res?.ok) { setError(res?.message || 'That search could not be run.'); return; }
      setResult(res);
    } catch (e) {
      setError(e?.message || 'That search could not be run.');
    } finally {
      setBusy(false);
    }
  };

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
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadTimeline(); }} tintColor={ZC.accent} />
        }
      >
        <View style={zcStyles.badge}><Text style={zcStyles.badgeText}>Records</Text></View>
        <Text style={[zcStyles.display, styles.title]}>{title}</Text>
        <Text style={[zcStyles.body, styles.lead]}>
          Everything on file, in order. Search it in your own words — the answer
          comes from the record, never from the assistant's memory.
        </Text>

        <View style={[styles.searchRow, glassStyle]}>
          <GlassFill />
          <Ionicons name="search-outline" size={16} color={ZC.ink3} />
          {/* flex on the input only — never the row, or the icon stretches. */}
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="e.g. everything about blood pressure"
            placeholderTextColor={ZC.ink4}
            returnKeyType="search"
            onSubmitEditing={search}
          />
          <TouchableOpacity
            style={[styles.go, (busy || !query.trim()) && styles.off]}
            onPress={search}
            disabled={busy || !query.trim()}
          >
            <Text style={styles.goText}>{busy ? '…' : 'Search'}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result ? (
          <View style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={styles.cardTitle}>
              {result.matched
                ? `${result.matched} entr${result.matched === 1 ? 'y' : 'ies'} for “${result.query}”`
                : `Nothing for “${result.query}”`}
            </Text>
            {result.summary ? <Text style={styles.summary}>{result.summary}</Text> : null}
            {(result.entries || []).map((e, i) => <Row key={i} entry={e} />)}
            {result.matched ? (
              <TouchableOpacity style={styles.clear} onPress={() => { setResult(null); setQuery(''); }}>
                <Text style={styles.clearText}>Back to the full timeline</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {!result && timeline ? (
          timeline.total === 0 ? (
            <View style={[styles.card, glassStyle]}>
              <GlassFill />
              <Text style={styles.empty}>Nothing on file yet.</Text>
            </View>
          ) : (
            <View style={[styles.card, glassStyle]}>
              <GlassFill />
              <Text style={styles.cardTitle}>Timeline · {timeline.total} entries</Text>
              {timeline.days.map((d) => (
                <View key={d.date} style={styles.day}>
                  <Text style={styles.dayLabel}>{fmtDay(d.date)}</Text>
                  <View style={styles.dayItems}>
                    {d.items.map((e, i) => <Row key={i} entry={e} />)}
                  </View>
                </View>
              ))}
            </View>
          )
        ) : null}
      </ScrollView>
    </ZCGround>
  );
}

function Row({ entry }) {
  const tone = KINDS[entry.kind] || KINDS.event;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: tone.bg }]}>
        <Ionicons name={ICONS[entry.kind] || 'ellipse-outline'} size={12} color={tone.text} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{entry.title}</Text>
        {entry.text ? <Text style={styles.rowText}>{entry.text}</Text> : null}
      </View>
    </View>
  );
}

const ICONS = {
  note: 'document-text-outline', prescription: 'medkit-outline',
  result: 'flask-outline', appointment: 'calendar-outline', event: 'pulse-outline',
};

/* Measured on each chip's own background. */
const KINDS = {
  note:         { bg: '#eef2ff', text: '#2a3ea8' },  /* 7.98:1 */
  prescription: { bg: '#e6f6ec', text: '#12602f' },  /* 6.85:1 */
  result:       { bg: '#fff4e5', text: '#8a4b09' },  /* 6.25:1 */
  appointment:  { bg: '#f1f3f8', text: '#3d4257' },  /* 9.0:1  */
  event:        { bg: '#f7f8fa', text: '#3d4257' },
};

function fmtDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso :
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { marginTop: 12 },
  lead: { marginBottom: 4 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8,
  },
  search: { flex: 1, minWidth: 0, fontSize: 13.5, color: ZC.ink, paddingVertical: 4 },
  go: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: ZC.accent,
  },
  goText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  off: { opacity: 0.5 },

  card: { borderRadius: 20, padding: 18 },
  cardTitle: { fontSize: 14.5, fontWeight: '800', color: ZC.ink, marginBottom: 10 },
  summary: {
    fontSize: 13, lineHeight: 20, color: ZC.ink2,
    backgroundColor: 'rgba(15,20,36,0.04)', borderRadius: 12,
    padding: 11, marginBottom: 12,
  },

  day: { marginBottom: 12 },
  dayLabel: { fontSize: 11.5, fontWeight: '700', color: ZC.ink3, marginBottom: 6 },
  dayItems: { borderLeftWidth: 2, borderLeftColor: 'rgba(15,20,36,0.08)', paddingLeft: 12 },

  row: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginBottom: 9 },
  rowIcon: {
    width: 24, height: 24, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '700', color: ZC.ink },
  rowText: { fontSize: 12, lineHeight: 17, color: ZC.ink2, marginTop: 1 },

  clear: {
    marginTop: 4, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 999, borderWidth: 1, borderColor: 'rgba(15,20,36,0.14)',
  },
  clearText: { fontSize: 12, fontWeight: '650', color: ZC.ink2 },
  error: { fontSize: 12.5, color: '#8f1d17' },
  empty: { fontSize: 13, color: ZC.ink3 },
});
