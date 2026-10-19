import React, { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../services/apiClient';
import FaqSection from './FaqSection';

/**
 * The help window for people who have not signed in: "Ask Ness" (answers from
 * the FAQ and app guide only, POST /api/v1/help/ask) and the FAQ itself, as
 * two tabs. Opened from the floating help button.
 */
const SUGGESTIONS = [
  'How do I book a doctor?',
  'How does therapy matching work?',
  'Is my information private?',
  'Can teenagers use NessaHub?',
];

export default function HelpCenterModal({ visible, onClose, audience = 'visitor' }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('ask');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState([]);
  const scroller = useRef(null);

  const ask = async (text) => {
    const question = (text ?? q).trim();
    if (!question || busy) return;
    setQ('');
    setBusy(true);
    setThread((t) => [...t, { role: 'me', text: question }]);
    try {
      const d = await api('/api/v1/help/ask', { method: 'POST', body: { question, audience }, authenticated: false });
      setThread((t) => [...t, { role: 'ness', text: d.answer, related: d.related || [], limited: d.limited }]);
    } catch (err) {
      setThread((t) => [...t, { role: 'ness', text: err?.message || 'Ness could not answer right now. Please try again shortly.', related: [] }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f8fafc' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <LinearGradient colors={['#4a7c59', '#2f5e3f']} style={[s.header, { paddingTop: Platform.OS === 'ios' ? 18 : insets.top + 12 }]}>
          <View style={s.headerRow}>
            <View style={s.headerIcon}><Ionicons name="sparkles" size={18} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>Help & questions</Text>
              <Text style={s.headerSub}>Ask Ness, or browse the FAQ</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close help">
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={s.tabs}>
            {[['ask', 'Ask Ness', 'chatbubbles'], ['faq', 'FAQ', 'help-circle']].map(([key, label, icon]) => (
              <TouchableOpacity key={key} style={[s.tab, tab === key && s.tabOn]} onPress={() => setTab(key)}
                accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
                <Ionicons name={icon} size={16} color={tab === key ? '#4a7c59' : '#fff'} />
                <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </LinearGradient>

        {tab === 'faq' ? (
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 4 }}>
            <FaqSection audience={audience} showAsk={false} bare title="All questions" />
          </ScrollView>
        ) : (
          <>
            <ScrollView showsVerticalScrollIndicator={false} ref={scroller} style={{ flex: 1 }} contentContainerStyle={s.thread} keyboardShouldPersistTaps="handled">
              <View style={[s.bubble, s.ness]}>
                <Text style={s.nessText}>
                  Hi, I'm Ness. Ask me anything about using NessaHub — booking, therapy, payments, privacy.
                  I answer from our help pages only and can't see accounts or give medical advice.
                </Text>
              </View>
              {thread.length === 0 ? (
                <View style={s.suggest}>
                  {SUGGESTIONS.map((t) => (
                    <TouchableOpacity key={t} style={s.chip} onPress={() => ask(t)}>
                      <Text style={s.chipText}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {thread.map((m, i) => (
                <View key={i} style={[s.bubble, m.role === 'me' ? s.me : s.ness]}>
                  <Text style={m.role === 'me' ? s.meText : s.nessText}>{m.text}</Text>
                  {m.related?.length ? (
                    <View style={s.relatedRow}>
                      {m.related.map((r) => (
                        <TouchableOpacity key={r.id} style={s.chip} onPress={() => setTab('faq')}>
                          <Text style={s.chipText}>{r.question}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                  {m.limited ? <Text style={s.note}>You've asked a lot today, so this is the closest FAQ answer.</Text> : null}
                </View>
              ))}
              {busy ? <View style={[s.bubble, s.ness]}><ActivityIndicator color="#4a7c59" /></View> : null}
            </ScrollView>
            <View style={[s.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Ask Ness a question…"
                placeholderTextColor="#94a3b8"
                style={s.input}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => ask()}
                accessibilityLabel="Ask Ness a question about NessaHub"
              />
              <TouchableOpacity onPress={() => ask()} disabled={busy || !q.trim()} style={[s.send, (busy || !q.trim()) && { opacity: 0.5 }]}
                accessibilityLabel="Send">
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12.5 },
  tabs: { flexDirection: 'row', marginTop: 14, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 9 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabTextOn: { color: '#4a7c59' },
  thread: { padding: 16, gap: 10 },
  bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  ness: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#d6e7da', borderBottomLeftRadius: 4 },
  me: { alignSelf: 'flex-end', backgroundColor: '#4a7c59', borderBottomRightRadius: 4 },
  nessText: { color: '#0f172a', fontSize: 14.5, lineHeight: 21 },
  meText: { color: '#fff', fontSize: 14.5, lineHeight: 21 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relatedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderWidth: 1, borderColor: '#b9d4bf', backgroundColor: '#eef6f0', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#2f5e3f' },
  note: { marginTop: 6, fontSize: 11.5, color: '#94a3b8' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  input: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 11, fontSize: 15, color: '#0f172a' },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#4a7c59', alignItems: 'center', justifyContent: 'center' },
});
