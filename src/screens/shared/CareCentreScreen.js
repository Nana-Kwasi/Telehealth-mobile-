import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute } from '@react-navigation/native';
import ZCGround from '../../components/ZCGround';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Medication reminders and check-ins, for the person receiving care.
 *
 * Recording a MISSED dose is exactly as easy as recording a taken one, and
 * neither is styled as success or failure. An adherence log people avoid
 * because it scolds them is worse than no log at all.
 *
 * Nothing here advises on a missed dose — that is a prescribing decision.
 */
export default function CareCentreScreen() {
  const route = useRoute();
  const P = PALETTES[route?.name === 'TherapyCare' ? 'therapy' : 'medical'];
  const [reminders, setReminders] = useState([]);
  const [doses, setDoses]         = useState([]);
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [answers, setAnswers]     = useState({});
  const [plans, setPlans]         = useState([]);
  const [urgent, setUrgent]       = useState('');
  const [scripts, setScripts]     = useState([]);
  const [adding, setAdding]       = useState(false);
  const [pick, setPick]           = useState({ prescriptionId: '', times: ['08:00'] });

  const load = useCallback(async () => {
    try {
      const [r, d, f, p] = await Promise.all([
        api('/api/v1/care/reminders').catch(() => []),
        api('/api/v1/care/doses').catch(() => []),
        api('/api/v1/care/followups').catch(() => []),
        api('/api/v1/care/followup-plans').catch(() => []),
      ]);
      setReminders(Array.isArray(r) ? r : []);
      setDoses(Array.isArray(d) ? d : []);
      setFollowups(Array.isArray(f) ? f : []);
      setPlans(Array.isArray(p) ? p : []);
      const me = await getStoredUserId();
      if (me) {
        const sc = await api(`/api/v1/medical/prescriptions/patient/${me}`).catch(() => []);
        setScripts(Array.isArray(sc) ? sc : (sc?.items || []));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recordDose = async (id, status) => {
    try {
      const res = await api(`/api/v1/care/doses/${id}`, { method: 'POST', body: { status } });
      Alert.alert('Recorded', res.message);
      load();
    } catch (e) {
      Alert.alert('Could not record', e?.message || 'Please try again.');
    }
  };

  const sendFollowUp = async (id, weekly = false) => {
    const a = answers[id] || {};
    const scales = weekly ? WEEKLY_FIELDS.filter((w) => a[w.key] !== undefined) : [];
    if (!a.response && a.severity === undefined && !scales.length
        && !a.sleepHours && !a.medication && !a.events) {
      Alert.alert('Nothing to send', weekly ? 'Answer at least one question.' : 'Add a rating or a short answer first.');
      return;
    }
    try {
      const body = weekly
        ? {
            response: a.response || null,
            answers: {
              ...Object.fromEntries(scales.map((w) => [w.key, a[w.key]])),
              ...(a.sleepHours ? { sleepHours: Number(a.sleepHours) } : {}),
              ...(a.medication ? { medication: a.medication } : {}),
              ...(a.events ? { events: a.events } : {}),
            },
          }
        : { response: a.response || null, severity: a.severity ?? null };
      const res = await api(`/api/v1/care/followups/${id}`, { method: 'POST', body });
      // A safety concern is shown on the screen as crisis guidance, not in a
      // dismissible "Sent" alert.
      if (res.escalated) setUrgent(res.message); else Alert.alert('Sent', res.message);
      load();
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'Please try again.');
    }
  };

  const setAttendance = async (id, attending) => {
    try {
      const res = await api(`/api/v1/care/followup-plans/${id}/attendance`, {
        method: 'POST', body: { attending },
      });
      Alert.alert('Thank you', res.message);
      load();
    } catch (e) {
      Alert.alert('Could not send', e?.message || 'Please try again.');
    }
  };

  /** Medication and dose come from the prescription; only the times are chosen here. */
  const createReminder = async () => {
    if (!pick.prescriptionId) { Alert.alert('Medication', 'Choose one of your prescriptions.'); return; }
    if (!pick.times.length) { Alert.alert('Times', 'Choose at least one time of day.'); return; }
    try {
      await api('/api/v1/care/reminders', {
        method: 'POST', body: { prescriptionId: pick.prescriptionId, timesOfDay: pick.times },
      });
      setAdding(false);
      setPick({ prescriptionId: '', times: ['08:00'] });
      load();
    } catch (e) {
      Alert.alert('Could not set reminder', e?.message || 'Please try again.');
    }
  };

  const toggleTime = (t) => setPick((p) => ({
    ...p, times: p.times.includes(t) ? p.times.filter((x) => x !== t) : [...p.times, t].sort(),
  }));

  const stopReminder = (id, medication) => {
    Alert.alert('Stop reminder?', `You will no longer be reminded about ${medication}.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: async () => {
          try { await api(`/api/v1/care/reminders/${id}`, { method: 'DELETE' }); load(); }
          catch (e) { Alert.alert('Could not stop', e?.message || 'Please try again.'); }
        } },
    ]);
  };

  if (loading) {
    return (
      <ZCGround>
        <View style={styles.centered}><ActivityIndicator color={P.accent} size="large" /></View>
      </ZCGround>
    );
  }

  const pendingDoses = doses.filter((d) => d.status === 'pending');
  const activeReminders = reminders.filter((r) => r.active);
  const todays = doses.filter((d) => sameDay(d.due_at));
  const takenToday = todays.filter((d) => d.status === 'taken').length;
  const timesOf = (r) => (Array.isArray(r.times_of_day) ? r.times_of_day
    : String(r.times_of_day || '').replace(/[{}]/g, '').split(',')).filter(Boolean);

  return (
    <ZCGround>
      <ScrollView showsVerticalScrollIndicator={false}
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={P.accent} />
        }
      >
        {/* ── Header: today at a glance ── */}
        <LinearGradient colors={[P.accent, P.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroIcon}><Ionicons name="heart-circle" size={24} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>My Care</Text>
              <Text style={styles.heroSub}>Reminders and check-ins from your care team</Text>
            </View>
          </View>
          <View style={styles.stats}>
            <Stat icon="medkit" value={activeReminders.length} label="Reminders" />
            <Stat icon="checkmark-done" value={`${takenToday}/${todays.length}`} label="Taken today" />
            <Stat icon="chatbubbles" value={followups.length} label="Check-ins" />
          </View>
        </LinearGradient>

        {urgent ? (
          <View style={styles.urgent}>
            <Text style={styles.urgentText}>{urgent}</Text>
          </View>
        ) : null}

        {/* Check-ins first — someone is waiting on these. */}
        {followups.length ? (
          <Section icon="chatbubbles" title="From your care team" count={followups.length} P={P}>
            {followups.map((f) => {
              const a = answers[f.id] || {};
              if (f.kind === 'weekly_checkin') {
                return (
                  <WeeklyCheckIn key={f.id} prompt={f.prompt} a={a} P={P}
                    set={(patch) => setAnswers({ ...answers, [f.id]: { ...a, ...patch } })}
                    send={() => sendFollowUp(f.id, true)} />
                );
              }
              return (
                <View key={f.id} style={[styles.item, { borderLeftWidth: 4, borderLeftColor: P.accent }]}>
                  <Text style={styles.prompt}>{f.prompt}</Text>
                  <Scale value={a.severity} onPick={(n) => setAnswers({ ...answers, [f.id]: { ...a, severity: n } })} P={P} />
                  <TextInput
                    style={[styles.input, styles.note]}
                    placeholder="Anything you'd like to add? (optional)"
                    placeholderTextColor="#94a3b8"
                    value={a.response || ''}
                    onChangeText={(t) => setAnswers({ ...answers, [f.id]: { ...a, response: t } })}
                    multiline
                  />
                  <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: P.accent }]} onPress={() => sendFollowUp(f.id)}>
                    <Text style={styles.btnPrimaryText}>Send to my care team</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </Section>
        ) : null}

        {/* Doses awaiting an answer. */}
        {pendingDoses.length ? (
          <Section icon="time" title="Did you take these?" count={pendingDoses.length} P={P}>
            {pendingDoses.map((d) => (
              <View key={d.id} style={styles.item}>
                <View style={styles.row}>
                  <View style={[styles.timePill, { backgroundColor: P.soft }]}>
                    <Text style={[styles.timePillText, { color: P.accent }]}>
                      {new Date(d.due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medName} numberOfLines={1}>{d.medication}</Text>
                    <Text style={styles.medMeta} numberOfLines={1}>
                      {[d.dosage, new Date(d.due_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity style={[styles.btn, styles.btnFill, { backgroundColor: P.accent, borderColor: P.accent }]} onPress={() => recordDose(d.id, 'taken')}>
                    <Ionicons name="checkmark" size={15} color="#fff" />
                    <Text style={[styles.btnText, { color: '#fff' }]}>Taken</Text>
                  </TouchableOpacity>
                  {/* Equal weight, on purpose — a miss is information, not a failure. */}
                  <TouchableOpacity style={styles.btn} onPress={() => recordDose(d.id, 'missed')}>
                    <Text style={styles.btnText}>Missed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btn} onPress={() => recordDose(d.id, 'skipped')}>
                    <Text style={styles.btnText}>Skipped</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {/* Follow-ups the clinician planned. */}
        {plans.length ? (
          <Section icon="calendar" title="Upcoming follow-ups" count={plans.length} P={P}>
            {plans.map((p) => {
              const dt = new Date(`${p.due_on}T00:00:00`);
              return (
                <View key={p.id} style={styles.item}>
                  <View style={styles.row}>
                    <View style={[styles.dateTile, { borderColor: P.line }]}>
                      <Text style={[styles.dateMonth, { backgroundColor: P.accent }]}>
                        {dt.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
                      </Text>
                      <Text style={styles.dateDay}>{dt.getDate()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.medName}>
                        {dt.toLocaleDateString(undefined, { weekday: 'long' })}{p.clinician_name ? ` · ${p.clinician_name}` : ''}
                      </Text>
                      {p.reason ? <Text style={styles.medMeta}>{p.reason}</Text> : null}
                    </View>
                  </View>
                  {p.attending === null || p.attending === undefined ? (
                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.btn, { backgroundColor: P.accent, borderColor: P.accent }]} onPress={() => setAttendance(p.id, true)}>
                        <Text style={[styles.btnText, { color: '#fff' }]}>I'll be there</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.btn} onPress={() => setAttendance(p.id, false)}>
                        <Text style={styles.btnText}>I can't make it</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={[styles.tag, p.attending && styles.tagOk]}>
                      <Text style={[styles.tagText, p.attending && styles.tagTextOk]}>
                        {p.attending ? 'Confirmed' : "You can't make it"}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </Section>
        ) : null}

        {/* ── Reminders ── */}
        <Section
          icon="notifications"
          title="Medication reminders"
          count={activeReminders.length}
          P={P}
          action={scripts.length ? (
            <TouchableOpacity onPress={() => setAdding(!adding)} hitSlop={8}
              style={[styles.addBtn, adding ? styles.btn : { backgroundColor: P.accent }]}>
              {adding ? null : <Ionicons name="add" size={16} color="#fff" />}
              <Text style={[styles.btnText, !adding && { color: '#fff' }]}>{adding ? 'Cancel' : 'Add'}</Text>
            </TouchableOpacity>
          ) : null}
        >
          {adding ? (
            <View style={[styles.item, { backgroundColor: '#fff' }]}>
              <Text style={styles.fieldLabel}>Which medication?</Text>
              {scripts.map((sc) => {
                const on = pick.prescriptionId === sc.id;
                return (
                  <TouchableOpacity key={sc.id}
                    onPress={() => setPick((p) => ({ ...p, prescriptionId: sc.id }))}
                    style={[styles.option, on && { backgroundColor: P.soft, borderColor: P.accent }]}>
                    <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? P.accent : '#94a3b8'} />
                    <Text style={[styles.optionText, on && { color: P.accent }]}>{sc.medication} {sc.dosage || ''}</Text>
                  </TouchableOpacity>
                );
              })}
              <Text style={[styles.fieldLabel, { marginTop: 10 }]}>When?</Text>
              <View style={styles.timeGrid}>
                {TIMES.map(([t, label, icon]) => {
                  const on = pick.times.includes(t);
                  return (
                    <TouchableOpacity key={t} onPress={() => toggleTime(t)}
                      style={[styles.timeOpt, on && { backgroundColor: P.accent, borderColor: P.accent }]}>
                      <Ionicons name={icon} size={18} color={on ? '#fff' : P.accent} />
                      <Text style={[styles.timeOptLabel, on && { color: '#fff' }]}>{label}</Text>
                      <Text style={[styles.timeOptTime, on && { color: 'rgba(255,255,255,0.85)' }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: P.accent, marginTop: 12 }]} onPress={createReminder}>
                <Ionicons name="notifications" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Set reminder</Text>
              </TouchableOpacity>
              <Text style={[styles.medMeta, { textAlign: 'center', marginTop: 6 }]}>You'll get each reminder in the app and by email.</Text>
            </View>
          ) : null}

          {activeReminders.length === 0 && !adding ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: P.soft }]}><Ionicons name="medkit-outline" size={26} color={P.accent} /></View>
              <Text style={styles.emptyTitle}>No reminders yet</Text>
              <Text style={styles.emptyText}>
                {scripts.length
                  ? 'Tap Add to be reminded about one of your prescriptions.'
                  : 'Reminders are made from a prescription, so they always match what you were prescribed.'}
              </Text>
            </View>
          ) : activeReminders.map((r) => (
            <View key={r.id} style={[styles.item, { backgroundColor: '#fff' }]}>
              <View style={styles.row}>
                <View style={[styles.pillIcon, { backgroundColor: P.soft }]}><Ionicons name="medkit" size={18} color={P.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.medName} numberOfLines={1}>{r.medication}</Text>
                  {r.dosage ? <Text style={styles.medMeta} numberOfLines={1}>{r.dosage}</Text> : null}
                </View>
                <TouchableOpacity onPress={() => stopReminder(r.id, r.medication)} hitSlop={10} accessibilityLabel={`Stop reminder for ${r.medication}`}>
                  <Ionicons name="close-circle" size={22} color="#cbd5e1" />
                </TouchableOpacity>
              </View>
              <View style={styles.chips}>
                {timesOf(r).map((t) => (
                  <View key={t} style={[styles.chip, { backgroundColor: P.soft }]}>
                    <Ionicons name="time-outline" size={12} color={P.accent} />
                    <Text style={[styles.chipText, { color: P.accent }]}>{t}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Section>
      </ScrollView>
    </ZCGround>
  );
}

function sameDay(iso) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function Stat({ icon, value, label }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={15} color="rgba(255,255,255,0.9)" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Section({ icon, title, count, action, P, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: P.soft }]}><Ionicons name={icon} size={16} color={P.accent} /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {count ? <View style={[styles.count, { backgroundColor: P.soft }]}><Text style={[styles.countText, { color: P.accent }]}>{count}</Text></View> : null}
        <View style={{ flex: 1 }} />
        {action}
      </View>
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

function Scale({ value, onPick, P }) {
  return (
    <View style={styles.scale}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
        <TouchableOpacity key={n} onPress={() => onPick(n)}
          style={[styles.scaleBtn, value === n && { backgroundColor: P.accent, borderColor: P.accent }]}>
          <Text style={[styles.scaleText, value === n && styles.scaleTextOn]}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const TIMES = [['08:00', 'Morning', 'sunny-outline'], ['13:00', 'Midday', 'partly-sunny-outline'], ['18:00', 'Evening', 'cloudy-night-outline'], ['22:00', 'Night', 'moon-outline']];

/** Therapy purple or medical blue, from the menu that opened the screen. */
const PALETTES = {
  therapy: { accent: '#5046bd', accent2: '#3f37a0', soft: '#eeedfb', line: '#c9c5f2' },
  medical: { accent: '#1e6bb8', accent2: '#155a9c', soft: '#e8f1fb', line: '#bfdbfe' },
};

/** The weekly questions. Each is optional: a partial answer is still an answer. */
const WEEKLY_FIELDS = [
  { key: 'mood',    label: 'Mood',    hint: '0 very low · 10 very good' },
  { key: 'anxiety', label: 'Anxiety', hint: '0 none · 10 severe' },
  { key: 'stress',  label: 'Stress',  hint: '0 none · 10 severe' },
  { key: 'energy',  label: 'Energy',  hint: '0 exhausted · 10 full of energy' },
];

function WeeklyCheckIn({ prompt, a, set, send, P }) {
  return (
    <View style={[styles.item, { borderLeftWidth: 4, borderLeftColor: P.accent, backgroundColor: '#fff' }]}>
      <Text style={styles.prompt}>{prompt}</Text>
      <Text style={styles.medMeta}>Your weekly check-in. Every question is optional.</Text>
      {WEEKLY_FIELDS.map((w) => (
        <View key={w.key} style={{ marginTop: 8 }}>
          <Text style={styles.fieldLabel}>{w.label} <Text style={styles.hint}>{w.hint}</Text></Text>
          <Scale value={a[w.key]} onPick={(n) => set({ [w.key]: n })} P={P} />
        </View>
      ))}
      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Sleep (hours a night)</Text>
      <TextInput style={[styles.input, { width: 110 }]} keyboardType="decimal-pad"
        value={a.sleepHours ? String(a.sleepHours) : ''} placeholder="e.g. 6"
        placeholderTextColor="#94a3b8"
        onChangeText={(t) => set({ sleepHours: t.replace(',', '.') })} />
      <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Medication this week</Text>
      <View style={styles.actions}>
        {[['yes', 'Taken'], ['no', 'Missed some'], ['na', 'Not on any']].map(([v, t]) => (
          <TouchableOpacity key={v} onPress={() => set({ medication: v })}
            style={[styles.btn, a.medication === v && { backgroundColor: P.soft, borderColor: P.accent }]}>
            <Text style={[styles.btnText, a.medication === v && { color: P.accent }]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={[styles.input, styles.note, { marginTop: 10 }]} multiline
        placeholder="Anything important happen this week? (optional)" placeholderTextColor="#94a3b8"
        value={a.events || ''} onChangeText={(t) => set({ events: t })} />
      <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: P.accent }]} onPress={send}>
        <Text style={styles.btnPrimaryText}>Send to my therapist</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 14 },

  hero: { borderRadius: 22, padding: 18, shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 4 },
  statLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5 },

  section: {
    backgroundColor: '#fff', borderRadius: 20, padding: 14, borderWidth: 1, borderColor: '#e2e8f0',
    shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: '#0f172a' },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '800' },

  item: { borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#edf0f5', backgroundColor: '#fbfcfe', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prompt: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 21 },
  medName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  medMeta: { fontSize: 12.5, color: '#64748b', marginTop: 2 },

  timePill: { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  timePillText: { fontWeight: '800', fontSize: 14 },
  dateTile: { width: 50, borderRadius: 12, borderWidth: 1, overflow: 'hidden', backgroundColor: '#fff', alignItems: 'center' },
  dateMonth: { alignSelf: 'stretch', textAlign: 'center', color: '#fff', fontSize: 10.5, fontWeight: '800', paddingVertical: 2 },
  dateDay: { fontSize: 19, fontWeight: '800', color: '#0f172a', paddingVertical: 3 },
  pillIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f1f5f9' },
  tagOk: { backgroundColor: '#dcfce7' },
  tagText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tagTextOk: { color: '#15803d' },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#d5dbe5', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 14, backgroundColor: '#fff',
  },
  btnFill: {},
  btnText: { color: '#334155', fontWeight: '700', fontSize: 13.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13 },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  input: { borderWidth: 1.5, borderColor: '#dbe2ea', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#0f172a', backgroundColor: '#fff' },
  note: { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  hint: { fontSize: 11.5, fontWeight: '500', color: '#64748b' },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, paddingVertical: 11, paddingHorizontal: 12, backgroundColor: '#fff',
  },
  optionText: { fontSize: 14, fontWeight: '600', color: '#334155', flex: 1 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeOpt: { width: '48%', flexGrow: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, backgroundColor: '#fff', gap: 2 },
  timeOptLabel: { fontSize: 14, fontWeight: '700', color: '#0f172a', marginTop: 2 },
  timeOptTime: { fontSize: 12, color: '#64748b' },

  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  scaleBtn: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#d5dbe5', backgroundColor: '#ffffff',
  },
  scaleText: { fontSize: 12.5, fontWeight: '700', color: '#475569' },
  scaleTextOn: { color: '#ffffff' },

  empty: { alignItems: 'center', paddingVertical: 18, paddingHorizontal: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  emptyText: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 4, lineHeight: 19 },

  urgent: {
    backgroundColor: '#fff7ed', borderWidth: 2, borderColor: '#fdba74',
    borderRadius: 14, padding: 14,
  },
  urgentText: { fontSize: 14, lineHeight: 21, color: '#7c2d12' },
});
