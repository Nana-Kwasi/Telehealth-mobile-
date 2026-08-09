import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TherapistColors as C } from '../../constants/colors';
import { getCoupleCaseForTherapist, listMyCouples } from '../../services/coupleTherapyService';

// This screen previously read `relationshipComparison`, `partnerAIntake.relationship`
// and `partnerBIntake.sensitive` — none of which the API returns. GET
// /couples/{id}/case-for-therapist responds with
//   { registration, intakes: [{ partnerKey, sectionId, sectionData, submittedAt }], bothIntakesComplete }
// so every card rendered blank. It is now built against that real shape.
//
// It also had no entry point: nothing in the app navigated to it. Called without a
// coupleId it now lists the therapist's couples and drills into one.

const PARTNER_LABEL = { A: 'Partner A', B: 'Partner B' };

function parseSectionData(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { value: String(parsed) };
  } catch {
    return { value: String(raw) };
  }
}

function prettyKey(k) {
  return String(k)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function renderValue(v) {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function partnerName(couple, key) {
  if (!couple) return PARTNER_LABEL[key];
  return key === 'A'
    ? couple.partnerAName || couple.partnerA?.name || 'Partner A'
    : couple.partnerBName || couple.partnerB?.name || 'Partner B';
}

function StatusPill({ status }) {
  const s = String(status || '').toLowerCase();
  const bg = s.includes('matched') || s === 'active' ? '#dcfce7'
    : s.includes('proposed') || s.includes('pending') ? '#fef3c7' : '#e2e8f0';
  const fg = s.includes('matched') || s === 'active' ? '#166534'
    : s.includes('proposed') || s.includes('pending') ? '#92400e' : '#475569';
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{status || 'unknown'}</Text>
    </View>
  );
}

export default function TherapistCoupleCaseScreen({ route, navigation }) {
  const paramCoupleId = route?.params?.coupleId || null;
  const [coupleId, setCoupleId] = useState(paramCoupleId);
  const [couples, setCouples] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadList = useCallback(async () => {
    setError('');
    try {
      setCouples(await listMyCouples());
    } catch (e) {
      setError(e?.message || 'Could not load your couple cases.');
    }
  }, []);

  const loadCase = useCallback(async (id) => {
    setError('');
    try {
      setData(await getCoupleCaseForTherapist(id));
    } catch (e) {
      setData(null);
      setError(e?.message || 'Could not load this couple case.');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (coupleId) await loadCase(coupleId);
      else await loadList();
      setLoading(false);
    })();
  }, [coupleId, loadCase, loadList]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (coupleId) await loadCase(coupleId);
    else await loadList();
    setRefreshing(false);
  };

  const couple = data?.couple || data?.registration || null;

  const intakesByPartner = useMemo(() => {
    const list = Array.isArray(data?.intakes) ? data.intakes : [];
    const out = { A: [], B: [] };
    list.forEach((row) => {
      const key = String(row.partnerKey || '').toUpperCase() === 'B' ? 'B' : 'A';
      out[key].push(row);
    });
    return out;
  }, [data]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  // ── List mode ──
  if (!coupleId) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
      >
        <Text style={styles.title}>Couple cases</Text>
        <Text style={styles.subtitle}>Couples matched to you. Tap one to read both partners' private intake.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {couples.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="people-outline" size={30} color={C.textLight} />
            <Text style={styles.emptyText}>No couples matched to you yet.</Text>
            <Text style={styles.emptyHint}>A couple appears once both partners confirm you as their therapist.</Text>
          </View>
        ) : (
          couples.map((c) => (
            <TouchableOpacity
              key={c.id || c.coupleId}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => { setLoading(true); setCoupleId(c.coupleId || c.id); }}
            >
              <View style={styles.cardTop}>
                <Ionicons name="people" size={18} color={C.primary} />
                <StatusPill status={c.status} />
              </View>
              <Text style={styles.cardTitle}>
                {partnerName(c, 'A')} & {partnerName(c, 'B')}
              </Text>
              <Text style={styles.cardMeta}>{c.relationshipType || 'Relationship not specified'}</Text>
              <Text style={styles.cardMeta}>
                Intake: {c.partnerAIntakeComplete ? '✓' : '⏳'} A · {c.partnerBIntakeComplete ? '✓' : '⏳'} B
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    );
  }

  // ── Case mode ──
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
    >
      {!paramCoupleId ? (
        <TouchableOpacity
          style={styles.back}
          onPress={() => { setData(null); setCoupleId(null); }}
        >
          <Ionicons name="chevron-back" size={16} color={C.textSecondary} />
          <Text style={styles.backText}>All couple cases</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>
        {partnerName(couple, 'A')} & {partnerName(couple, 'B')}
      </Text>
      <Text style={styles.subtitle}>
        Therapist-only record. Each partner answered privately and cannot see the other's answers.
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>Relationship</Text>
          <Text style={styles.metaValue}>{couple?.relationshipType || '—'}</Text>
        </View>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>Status</Text>
          <StatusPill status={couple?.status} />
        </View>
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>Both intakes</Text>
          <Text style={styles.metaValue}>{data?.bothIntakesComplete ? 'Complete' : 'Outstanding'}</Text>
        </View>
        <View style={styles.metaBox}>
          <Text style={styles.metaLabel}>Payment</Text>
          <Text style={styles.metaValue}>{couple?.paymentComplete ? 'Complete' : 'Outstanding'}</Text>
        </View>
      </View>

      <View style={styles.privacy}>
        <Ionicons name="alert-circle-outline" size={16} color="#92400e" />
        <Text style={styles.privacyText}>
          Confidential individual responses — do not share one partner's answers with the other.
        </Text>
      </View>

      {['A', 'B'].map((key) => (
        <View key={key} style={styles.partnerBlock}>
          <Text style={styles.partnerHeading}>
            {PARTNER_LABEL[key]} — {partnerName(couple, key)}
          </Text>
          {intakesByPartner[key].length === 0 ? (
            <Text style={styles.emptyHint}>No intake sections submitted yet.</Text>
          ) : (
            intakesByPartner[key].map((row) => {
              const entries = Object.entries(parseSectionData(row.sectionData));
              return (
                <View key={row.id} style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>{prettyKey(row.sectionId)}</Text>
                    <Text style={styles.when}>{fmtDate(row.submittedAt || row.createdAt)}</Text>
                  </View>
                  {entries.length === 0 ? (
                    <Text style={styles.emptyHint}>No answers recorded.</Text>
                  ) : (
                    entries.map(([k, v]) => (
                      <View key={k} style={styles.kvRow}>
                        <Text style={styles.kvKey}>{prettyKey(k)}</Text>
                        <Text style={styles.kvVal}>{renderValue(v)}</Text>
                      </View>
                    ))
                  )}
                </View>
              );
            })
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.background },
  title: { fontSize: 22, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 13, color: C.textSecondary, marginBottom: 16, lineHeight: 18 },

  back: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  backText: { fontSize: 14, fontWeight: '600', color: C.textSecondary },

  card: {
    backgroundColor: C.surface, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  cardMeta: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

  metaRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  metaBox: {
    flex: 1, backgroundColor: C.cardBg, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: C.border,
  },
  metaLabel: { fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: C.textLight, marginBottom: 4 },
  metaValue: { fontSize: 14, fontWeight: '700', color: C.text },

  privacy: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginVertical: 12,
    backgroundColor: '#fef3c7', borderRadius: 10, borderWidth: 1, borderColor: '#fcd34d',
  },
  privacyText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 17 },

  partnerBlock: { marginBottom: 20 },
  partnerHeading: {
    fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8,
    paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: C.border,
  },
  section: {
    backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
  },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.primary },
  when: { fontSize: 11, color: C.textLight },

  kvRow: { flexDirection: 'row', paddingVertical: 4, borderTopWidth: 1, borderTopColor: C.cardBg },
  kvKey: { flex: 4, fontSize: 12, fontWeight: '600', color: C.textSecondary, paddingRight: 8 },
  kvVal: { flex: 6, fontSize: 12, color: C.text },

  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyText: { fontSize: 14, fontWeight: '600', color: C.textSecondary },
  emptyHint: { fontSize: 12, color: C.textLight, textAlign: 'center' },
  error: {
    marginBottom: 12, padding: 10, backgroundColor: '#fee2e2', borderRadius: 10,
    borderWidth: 1, borderColor: '#fca5a5', color: '#991b1b', fontSize: 12,
  },

  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
});
