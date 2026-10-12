import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContext } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../services/apiClient';

/**
 * The FAQ, from the backend (/api/v1/faq) — the same list the website shows, so
 * the app and the web can never give different answers.
 *
 * compact: a short list for a home screen (first `limit` questions; the search
 * box searches all of them) with "See all" opening the full FAQ screen.
 * audience: 'visitor' | 'client' | 'patient' | 'clinician'.
 */
/**
 * "Ask Ness": a question in your own words, answered from the FAQ and the app
 * guide only (POST /api/v1/help/ask), matching the website. Public, so it works
 * before sign-in; the server caps how often.
 */
function AskNess({ audience, onOpen }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(null);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    try {
      const d = await api('/api/v1/help/ask', { method: 'POST', body: { question, audience }, authenticated: false });
      setReply({ question, ...d });
    } catch (err) {
      setReply({ question, answer: err?.message || 'Ness could not answer right now. Please try again shortly.', related: [] });
    } finally { setBusy(false); }
  };

  return (
    <LinearGradient colors={['#eef6f0', '#f6faf4']} style={styles.ask}>
      <View style={styles.askRow}>
        <LinearGradient colors={['#5a9a6d', '#2f5e3f']} style={styles.askBadge}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </LinearGradient>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Ask Ness about using NessaHub…"
          placeholderTextColor="#94a3b8"
          style={styles.askInput}
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={ask}
          accessibilityLabel="Ask Ness a question about NessaHub"
        />
        <TouchableOpacity onPress={ask} disabled={busy || !q.trim()} style={[styles.askBtn, (busy || !q.trim()) && { opacity: 0.55 }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={18} color="#fff" />}
        </TouchableOpacity>
      </View>
      {reply ? (
        <View style={styles.answer} accessibilityLiveRegion="polite">
          <Text style={styles.answerQ}>“{reply.question}”</Text>
          <Text style={styles.answerText}>{reply.answer}</Text>
          {reply.related?.length ? (
            <View style={styles.related}>
              {reply.related.map((r) => (
                <TouchableOpacity key={r.id} style={styles.chip} onPress={() => onOpen(r)}>
                  <Text style={styles.chipText}>{r.question}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <Text style={styles.answerNote}>
            {reply.limited ? 'You have asked a lot today, so this is the closest FAQ answer. ' : ''}
            Ness answers from our help pages only. It cannot see your account or give medical advice.
          </Text>
        </View>
      ) : null}
    </LinearGradient>
  );
}

export default function FaqSection({ audience = 'all', compact = false, limit = 5, title = 'Questions & answers', showAsk = true, bare = false }) {
  // Context, not useNavigation(): the help window renders this outside any
  // navigator, where useNavigation() throws.
  const navigation = useContext(NavigationContext);
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    api(`/api/v1/faq?audience=${encodeURIComponent(audience)}`, { authenticated: false })
      .then((d) => { if (!cancelled) setItems(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) { setItems([]); setFailed(true); } });
    return () => { cancelled = true; };
  }, [audience]);

  const shown = useMemo(() => {
    const list = items || [];
    const s = search.trim().toLowerCase();
    if (s) return list.filter((f) => `${f.question} ${f.answer} ${f.category}`.toLowerCase().includes(s));
    return compact ? list.slice(0, limit) : list;
  }, [items, search, compact, limit]);

  // Grouped by category on the full screen; a flat list on a home screen.
  const groups = useMemo(() => {
    if (compact) return [[null, shown]];
    const m = new Map();
    shown.forEach((f) => { if (!m.has(f.category)) m.set(f.category, []); m.get(f.category).push(f); });
    return [...m.entries()];
  }, [shown, compact]);

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <View style={bare ? styles.bare : styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        {compact ? (
          <TouchableOpacity onPress={() => navigation?.navigate('Faq', { audience })} accessibilityRole="link">
            <Text style={styles.all}>See all</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {showAsk ? <AskNess audience={audience} onOpen={(r) => { setSearch(r.question); setOpen((prev) => new Set(prev).add(r.id)); }} /> : null}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search questions…"
          placeholderTextColor="#94a3b8"
          style={styles.search}
          accessibilityLabel="Search the FAQ"
          returnKeyType="search"
        />
      </View>
      {items === null ? <ActivityIndicator style={{ marginVertical: 12 }} color="#2b5ce6" /> : null}
      {failed ? <Text style={styles.muted}>The FAQ could not be loaded right now. Please try again shortly.</Text> : null}
      {items && !failed && shown.length === 0 ? <Text style={styles.muted}>No matches — try another word.</Text> : null}
      {groups.map(([category, list]) => (
        <View key={category || 'all'}>
          {category ? <Text style={styles.cat}>{category.toUpperCase()}</Text> : null}
          {list.map((f) => (
            <View key={f.id} style={styles.item}>
              <TouchableOpacity style={styles.q} onPress={() => toggle(f.id)} accessibilityState={{ expanded: open.has(f.id) }}>
                <Text style={styles.qText}>{f.question}</Text>
                <Ionicons name={open.has(f.id) ? 'remove' : 'add'} size={20} color="#2b5ce6" />
              </TouchableOpacity>
              {open.has(f.id) ? <Text style={styles.a}>{f.answer}</Text> : null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, marginHorizontal: 16, marginVertical: 12 },
  bare: { paddingHorizontal: 16, paddingBottom: 24 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  all: { fontSize: 14, fontWeight: '700', color: '#2b5ce6' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 10, marginTop: 12, marginBottom: 4 },
  search: { flex: 1, paddingVertical: 9, fontSize: 15, color: '#0f172a' },
  cat: { marginTop: 16, marginBottom: 4, fontSize: 11.5, letterSpacing: 0.8, color: '#64748b', fontWeight: '700' },
  item: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  q: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 12 },
  qText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0f172a' },
  a: { paddingBottom: 12, fontSize: 14.5, lineHeight: 21, color: '#334155' },
  muted: { color: '#64748b', fontSize: 14, marginTop: 8 },
  ask: { marginTop: 12, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#d6e7da' },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  askBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  askInput: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#b9d4bf', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 15, color: '#0f172a' },
  askBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#4a7c59', alignItems: 'center', justifyContent: 'center' },
  answer: { marginTop: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#d6e7da' },
  answerQ: { fontSize: 12.5, color: '#64748b', fontStyle: 'italic' },
  answerText: { marginTop: 5, fontSize: 14.5, lineHeight: 21, color: '#0f172a' },
  related: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: '#b9d4bf', backgroundColor: '#eef6f0', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600', color: '#2f5e3f' },
  answerNote: { marginTop: 8, fontSize: 11.5, color: '#94a3b8' },
});
