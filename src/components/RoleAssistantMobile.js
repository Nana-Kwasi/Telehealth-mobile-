import React, { useCallback, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/apiClient';

/**
 * "Ask AI" for pharmacy and lab / scan centre staff on mobile — twin of web
 * Common/RoleAssistant. Live figures for this organisation and any person who
 * dealt with it, by name. Read-only; clinical details stay private.
 */
const SUGGESTIONS = {
  pharmacy: ['What is waiting for us today?', 'Which medicines did we dispense most this month?', 'How are our insurance claims doing?'],
  lab: ['What is overdue right now?', 'What is our average turnaround?', 'Which tests are ordered most?'],
};

const strip = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/gm, '');

export default function RoleAssistantMobile({ kind = 'pharmacy', accent = '#0f766e', bottom = 24 }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef(null);

  const ask = useCallback(async (text) => {
    const question = String(text || '').trim();
    if (!question || busy) return;
    setQ(''); setBusy(true);
    const history = thread.map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.text }));
    setThread((t) => [...t, { role: 'me', text: question }]);
    try {
      const d = await api('/api/v1/assistant/ask', { method: 'POST', body: { question, history } });
      setThread((t) => [...t, { role: 'ai', text: d.answer, people: d.people || [] }]);
    } catch (e) {
      setThread((t) => [...t, { role: 'ai', text: e?.message || 'The assistant could not answer right now.' }]);
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [busy, thread]);

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={[s.fab, { backgroundColor: accent, bottom }]} accessibilityLabel="Ask AI">
        <Ionicons name="sparkles" size={16} color="#fff" /><Text style={s.fabText}>Ask AI</Text>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#f8fafc' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[s.head, { backgroundColor: accent }]}>
            <Ionicons name="sparkles" size={20} color="#fff" />
            <View style={{ flex: 1 }}><Text style={s.headTitle}>NessaHub AI</Text><Text style={s.headSub}>Live figures for your organisation · read-only</Text></View>
            <TouchableOpacity onPress={() => setOpen(false)}><Ionicons name="close" size={24} color="#fff" /></TouchableOpacity>
          </View>
          <ScrollView ref={scroll} contentContainerStyle={{ padding: 14, gap: 10 }} keyboardShouldPersistTaps="handled">
            {thread.length === 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={s.intro}>Ask about your queue, figures or any person who dealt with you — a first name is enough. Medical details stay private.</Text>
                {(SUGGESTIONS[kind] || SUGGESTIONS.pharmacy).map((x) => (
                  <TouchableOpacity key={x} style={s.chip} onPress={() => ask(x)}><Text style={s.chipText}>{x}</Text></TouchableOpacity>
                ))}
              </View>
            ) : null}
            {thread.map((m, i) => (
              <View key={i} style={m.role === 'me' ? [s.me, { backgroundColor: accent }] : s.ai}>
                <Text style={m.role === 'me' ? s.meText : s.aiText}>{m.role === 'ai' ? strip(m.text) : m.text}</Text>
                {m.people?.length > 1 ? m.people.map((p) => (
                  <TouchableOpacity key={p.id} style={[s.chip, { marginTop: 6 }]} onPress={() => ask(`Tell me about ${p.name} (${p.hint})`)}>
                    <Text style={s.chipText}>{p.name} · {p.hint}</Text>
                  </TouchableOpacity>
                )) : null}
              </View>
            ))}
            {busy ? <ActivityIndicator color={accent} style={{ alignSelf: 'flex-start' }} /> : null}
          </ScrollView>
          <View style={s.form}>
            <TextInput style={s.input} value={q} onChangeText={setQ} placeholder="Ask about your organisation…" placeholderTextColor="#94a3b8" onSubmitEditing={() => ask(q)} returnKeyType="send" maxLength={800} />
            <TouchableOpacity onPress={() => ask(q)} disabled={busy || !q.trim()} style={[s.send, { backgroundColor: accent }, (busy || !q.trim()) && { opacity: 0.5 }]}>
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fab: { position: 'absolute', right: 18, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12, elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: Platform.OS === 'ios' ? 54 : 18, paddingBottom: 14, paddingHorizontal: 16 },
  headTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  headSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12 },
  intro: { color: '#475569', fontSize: 14, lineHeight: 20 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  me: { alignSelf: 'flex-end', borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '85%' },
  meText: { color: '#fff', fontSize: 14 },
  ai: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 14, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '92%' },
  aiText: { color: '#0f172a', fontSize: 14, lineHeight: 20 },
  form: { flexDirection: 'row', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#fff' },
  input: { flex: 1, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
