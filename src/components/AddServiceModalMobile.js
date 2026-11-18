import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { IconBubbleMobile } from './EmptyStateMobile';

/*
 * "Add therapy to your account" / "See a doctor on NessaHub" on mobile.
 * Same steps as the web: what is already done is shown as done; the questions,
 * the service's own consent and policies, choosing the clinician and paying
 * still happen, in the screens a new person uses.
 */
const COPY = {
  therapy: {
    icon: 'MentalHealthTherapy', tone: 'violet', color: '#7c3aed', bg: '#f5f3ff',
    title: 'Add therapy to your NessaHub account',
    steps: [
      ['A few questions about how you have been feeling', 'So we can match you with the right therapist. About 5 minutes.'],
      ['Read and accept the therapy consent and policies', 'What therapy covers, how your privacy is protected, and its limits. You sign with your name.'],
      ['Choose your therapist', 'From therapists matched to your answers.'],
      ['Choose a plan and pay', 'Then book your first session.'],
    ],
  },
  medical: {
    icon: 'Stethoscope', tone: 'blue', color: '#1e6bb8', bg: '#eff6ff',
    title: 'See a doctor on NessaHub',
    steps: [
      ['Tell us what is wrong', 'Three short steps: what you feel, for how long, and how bad it is.'],
      ['Choose a doctor', 'From doctors who can help with it.'],
      ['Pick a time and pay', 'Your consultation is then booked.'],
    ],
  },
};
const DONE = ['Your account and sign-in', 'Your contact details', 'The NessaHub policies you accepted'];

export default function AddServiceModalMobile({ service, onClose, onStart }) {
  const c = COPY[service];
  if (!c) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.back}>
        <View style={st.card} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={{ paddingBottom: 6 }} bounces={false}>
            <View style={[st.hero, { backgroundColor: c.bg }]}>
              <IconBubbleMobile icon={c.icon} tone={c.tone} size={34} />
              <Text style={st.title}>{c.title}</Text>
              <Text style={st.lead}>You do not need a new account. We will use the details you have already given us.</Text>
            </View>
            <View style={st.done}>
              <Text style={st.kicker}>Already done</Text>
              {DONE.map((d) => (
                <View key={d} style={st.doneRow}>
                  <View style={st.tick}><Text style={st.tickText}>✓</Text></View>
                  <Text style={st.doneText}>{d}</Text>
                </View>
              ))}
            </View>
            <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
              <Text style={st.kicker}>What is left</Text>
              {c.steps.map(([t, d], i) => (
                <View key={t} style={st.step}>
                  <View style={[st.num, { backgroundColor: c.color }]}><Text style={st.numText}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.stepTitle}>{t}</Text>
                    <Text style={st.stepText}>{d}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={st.actions}>
            <TouchableOpacity style={st.later} onPress={onClose} accessibilityRole="button"><Text style={st.laterText}>Not now</Text></TouchableOpacity>
            <TouchableOpacity style={[st.go, { backgroundColor: c.color }]} onPress={onStart} accessibilityRole="button"><Text style={st.goText}>Start</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden', maxHeight: '92%' },
  hero: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  title: { fontSize: 21, fontWeight: '800', color: '#0f172a', textAlign: 'center', marginTop: 12 },
  lead: { fontSize: 14.5, color: '#475569', textAlign: 'center', marginTop: 6, lineHeight: 21 },
  kicker: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 },
  done: { marginHorizontal: 20, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', borderWidth: 1, borderRadius: 14, padding: 12 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  tick: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  tickText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  doneText: { color: '#166534', fontSize: 14 },
  step: { flexDirection: 'row', gap: 12, marginBottom: 12, alignItems: 'flex-start' },
  num: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#fff', fontWeight: '800' },
  stepTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  stepText: { fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  later: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 18 },
  laterText: { color: '#334155', fontWeight: '700' },
  go: { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  goText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
