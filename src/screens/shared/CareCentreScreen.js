import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
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
        <View style={styles.centered}><ActivityIndicator color={ZC.accent} size="large" /></View>
      </ZCGround>
    );
  }

  const pendingDoses = doses.filter((d) => d.status === 'pending');
  const activeReminders = reminders.filter((r) => r.active);

  return (
    <ZCGround>
      <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={ZC.accent} />
        }
      >
        <View style={zcStyles.badge}><Text style={zcStyles.badgeText}>My care</Text></View>
        <Text style={[zcStyles.display, styles.title]}>Reminders & check-ins</Text>

        {urgent ? (
          <View style={styles.urgent}>
            <Text style={styles.urgentText}>{urgent}</Text>
          </View>
        ) : null}

        {/* Check-ins first — someone is waiting on these. */}
        {followups.length ? (
          <>
            <Text style={[zcStyles.eyebrow, styles.heading]}>From your care team</Text>
            {followups.map((f) => {
              const a = answers[f.id] || {};
              if (f.kind === 'weekly_checkin') {
                return (
                  <WeeklyCheckIn key={f.id} prompt={f.prompt} a={a}
                    set={(patch) => setAnswers({ ...answers, [f.id]: { ...a, ...patch } })}
                    send={() => sendFollowUp(f.id, true)} />
                );
              }
              return (
                <View key={f.id} style={[styles.card, glassStyle]}>
                  <GlassFill />
                  <Text style={styles.prompt}>{f.prompt}</Text>
                  <View style={styles.scale}>
                    {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
                      <TouchableOpacity key={n}
                        onPress={() => setAnswers({ ...answers, [f.id]: { ...a, severity: n } })}
                        style={[styles.scaleBtn, a.severity === n && styles.scaleBtnOn]}>
                        <Text style={[styles.scaleText, a.severity === n && styles.scaleTextOn]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={[zcStyles.input, styles.note]}
                    placeholder="Anything you'd like to add? (optional)"
                    placeholderTextColor={ZC.ink4}
                    value={a.response || ''}
                    onChangeText={(t) => setAnswers({ ...answers, [f.id]: { ...a, response: t } })}
                    multiline
                  />
                  <TouchableOpacity style={zcStyles.btnPrimary} onPress={() => sendFollowUp(f.id)}>
                    <Text style={zcStyles.btnPrimaryText}>Send to my care team</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        ) : null}

        {/* Follow-ups the clinician planned. */}
        {plans.length ? (
          <>
            <Text style={[zcStyles.eyebrow, styles.heading]}>Upcoming follow-ups</Text>
            {plans.map((p) => (
              <View key={p.id} style={[styles.card, glassStyle]}>
                <GlassFill />
                <Text style={styles.medName}>
                  {new Date(`${p.due_on}T00:00:00`).toLocaleDateString(undefined,
                    { weekday: 'short', day: 'numeric', month: 'short' })}
                  {p.clinician_name ? ` · ${p.clinician_name}` : ''}
                </Text>
                {p.reason ? <Text style={styles.medMeta}>{p.reason}</Text> : null}
                {p.attending === null || p.attending === undefined ? (
                  <View style={styles.doseActions}>
                    <TouchableOpacity style={styles.doseTaken} onPress={() => setAttendance(p.id, true)}>
                      <Text style={styles.doseTakenText}>I'll be there</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.doseGhost} onPress={() => setAttendance(p.id, false)}>
                      <Text style={styles.doseGhostText}>I can't make it</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.medMeta}>{p.attending ? 'Confirmed' : "You said you can't make it"}</Text>
                )}
              </View>
            ))}
          </>
        ) : null}

        {/* Doses awaiting an answer. */}
        {pendingDoses.length ? (
          <>
            <Text style={[zcStyles.eyebrow, styles.heading]}>Did you take these?</Text>
            {pendingDoses.map((d) => (
              <View key={d.id} style={[styles.card, glassStyle]}>
                <GlassFill />
                <Text style={styles.medName}>{d.medication} {d.dosage || ''}</Text>
                <Text style={styles.medMeta}>Due {new Date(d.due_at).toLocaleString()}</Text>
                <View style={styles.doseActions}>
                  <TouchableOpacity style={styles.doseTaken} onPress={() => recordDose(d.id, 'taken')}>
                    <Text style={styles.doseTakenText}>Taken</Text>
                  </TouchableOpacity>
                  {/* Equal weight, on purpose — a miss is information, not a failure. */}
                  <TouchableOpacity style={styles.doseGhost} onPress={() => recordDose(d.id, 'missed')}>
                    <Text style={styles.doseGhostText}>Missed</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.doseGhost} onPress={() => recordDose(d.id, 'skipped')}>
                    <Text style={styles.doseGhostText}>Skipped</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.headingRow}>
          <Text style={[zcStyles.eyebrow, styles.heading]}>Medication reminders</Text>
          {scripts.length ? (
            <TouchableOpacity onPress={() => setAdding(!adding)} hitSlop={8}>
              <Text style={styles.addLink}>{adding ? 'Cancel' : '+ Add'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {adding ? (
          <View style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={styles.fieldLabel}>Which medication?</Text>
            {scripts.map((sc) => (
              <TouchableOpacity key={sc.id}
                onPress={() => setPick((p) => ({ ...p, prescriptionId: sc.id }))}
                style={[styles.option, pick.prescriptionId === sc.id && styles.optionOn]}>
                <Text style={[styles.optionText, pick.prescriptionId === sc.id && styles.optionTextOn]}>
                  {sc.medication} {sc.dosage || ''}
                </Text>
              </TouchableOpacity>
            ))}
            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>When?</Text>
            <View style={styles.scale}>
              {TIMES.map(([t, label]) => (
                <TouchableOpacity key={t} onPress={() => toggleTime(t)}
                  style={[styles.option, pick.times.includes(t) && styles.optionOn]}>
                  <Text style={[styles.optionText, pick.times.includes(t) && styles.optionTextOn]}>
                    {label} · {t}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={zcStyles.btnPrimary} onPress={createReminder}>
              <Text style={zcStyles.btnPrimaryText}>Set reminder</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {activeReminders.length === 0 && !adding ? (
          <View style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={zcStyles.body}>
              {scripts.length
                ? 'No reminders set. Tap “+ Add” to be reminded about one of your prescriptions.'
                : 'No reminders set. Reminders are made from a prescription, so they always match what you were prescribed.'}
            </Text>
          </View>
        ) : activeReminders.map((r) => (
          <View key={r.id} style={[styles.card, glassStyle, styles.reminderRow]}>
            <GlassFill />
            <View style={{ flex: 1 }}>
              <Text style={styles.medName}>{r.medication} {r.dosage || ''}</Text>
              <Text style={styles.medMeta}>
                {String(r.times_of_day).replace(/[{}]/g, '').split(',').join(' · ')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => stopReminder(r.id, r.medication)} hitSlop={10}>
              <Ionicons name="close-circle-outline" size={22} color={ZC.ink3} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </ZCGround>
  );
}

const TIMES = [['08:00', 'Morning'], ['13:00', 'Midday'], ['18:00', 'Evening'], ['22:00', 'Night']];

/** The weekly questions. Each is optional: a partial answer is still an answer. */
const WEEKLY_FIELDS = [
  { key: 'mood',    label: 'Mood',    hint: '0 very low · 10 very good' },
  { key: 'anxiety', label: 'Anxiety', hint: '0 none · 10 severe' },
  { key: 'stress',  label: 'Stress',  hint: '0 none · 10 severe' },
  { key: 'energy',  label: 'Energy',  hint: '0 exhausted · 10 full of energy' },
];

function WeeklyCheckIn({ prompt, a, set, send }) {
  return (
    <View style={[styles.card, glassStyle]}>
      <GlassFill />
      <Text style={styles.prompt}>{prompt}</Text>
      <Text style={styles.medMeta}>Your weekly check-in. Every question is optional.</Text>
      {WEEKLY_FIELDS.map((w) => (
        <View key={w.key} style={{ marginTop: 6 }}>
          <Text style={styles.fieldLabel}>{w.label} <Text style={styles.hint}>{w.hint}</Text></Text>
          <View style={styles.scale}>
            {[0,1,2,3,4,5,6,7,8,9,10].map((n) => (
              <TouchableOpacity key={n} onPress={() => set({ [w.key]: n })}
                style={[styles.scaleBtn, a[w.key] === n && styles.scaleBtnOn]}>
                <Text style={[styles.scaleText, a[w.key] === n && styles.scaleTextOn]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
      <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Sleep (hours a night)</Text>
      <TextInput style={[zcStyles.input, { width: 110 }]} keyboardType="decimal-pad"
        value={a.sleepHours ? String(a.sleepHours) : ''} placeholder="e.g. 6"
        placeholderTextColor={ZC.ink4}
        onChangeText={(t) => set({ sleepHours: t.replace(',', '.') })} />
      <Text style={[styles.fieldLabel, { marginTop: 6 }]}>Medication this week</Text>
      <View style={styles.scale}>
        {[['yes', 'Taken'], ['no', 'Missed some'], ['na', 'Not on any']].map(([v, t]) => (
          <TouchableOpacity key={v} onPress={() => set({ medication: v })}
            style={[styles.option, a.medication === v && styles.optionOn]}>
            <Text style={[styles.optionText, a.medication === v && styles.optionTextOn]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={[zcStyles.input, styles.note]} multiline
        placeholder="Anything important happen this week? (optional)" placeholderTextColor={ZC.ink4}
        value={a.events || ''} onChangeText={(t) => set({ events: t })} />
      <TouchableOpacity style={zcStyles.btnPrimary} onPress={send}>
        <Text style={zcStyles.btnPrimaryText}>Send to my therapist</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  title: { marginTop: 12, marginBottom: 4 },
  heading: { marginTop: 18, marginBottom: 2 },
  card: { borderRadius: 18, padding: 16, gap: 8 },
  prompt: { fontSize: 15, fontWeight: '700', color: ZC.ink, lineHeight: 21 },
  scale: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  scaleBtn: {
    width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.16)', backgroundColor: '#ffffff',
  },
  scaleBtnOn: { backgroundColor: ZC.accent, borderColor: ZC.accent },
  scaleText: { fontSize: 12.5, fontWeight: '600', color: ZC.ink2 },
  scaleTextOn: { color: '#ffffff' },
  note: { minHeight: 60, paddingTop: 10 },
  medName: { fontSize: 15, fontWeight: '700', color: ZC.ink },
  medMeta: { fontSize: 12.5, color: ZC.ink3, marginTop: 2 },
  doseActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  doseTaken: {
    backgroundColor: ZC.accent, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18,
  },
  doseTakenText: { color: '#ffffff', fontWeight: '700', fontSize: 13.5 },
  doseGhost: {
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.16)', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 16, backgroundColor: '#ffffff',
  },
  doseGhostText: { color: ZC.ink2, fontWeight: '600', fontSize: 13.5 },
  reminderRow: { flexDirection: 'row', alignItems: 'center' },
  headingRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  addLink: { fontSize: 14, fontWeight: '700', color: ZC.accent, marginBottom: 2 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: ZC.ink2 },
  hint: { fontSize: 11.5, fontWeight: '500', color: ZC.ink3 },
  option: {
    borderWidth: 1, borderColor: 'rgba(13,13,13,0.16)', borderRadius: 10,
    paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#ffffff', marginTop: 4,
  },
  optionOn: { backgroundColor: ZC.accent, borderColor: ZC.accent },
  optionText: { fontSize: 13, fontWeight: '600', color: ZC.ink2 },
  optionTextOn: { color: '#ffffff' },
  urgent: {
    backgroundColor: '#fff7ed', borderWidth: 2, borderColor: '#fdba74',
    borderRadius: 14, padding: 14, marginTop: 8,
  },
  urgentText: { fontSize: 14, lineHeight: 21, color: '#7c2d12' },
});
