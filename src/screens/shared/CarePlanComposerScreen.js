import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Write a care plan on the phone: instructions in, structured plan out, and
 * nothing reaches the patient until the clinician approves it.
 *
 * The draft organises what the clinician wrote — it adds no dose, no duration
 * and no caution of its own. Saving without approving keeps the plan as a
 * draft the patient cannot see, and the server enforces that regardless of
 * what this sends.
 */
export default function CarePlanComposerScreen({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [plan, setPlan] = useState(null);
  const [summary, setSummary] = useState('');
  const [proposed, setProposed] = useState(null);
  const [auditId, setAuditId] = useState(null);
  const [busy, setBusy] = useState('');
  const [topic, setTopic] = useState('');
  const [explainNote, setExplainNote] = useState('');

  const loadPatients = useCallback(async () => {
    try {
      const me = await getStoredUserId();
      if (role === 'THERAPIST') {
        const rows = await api(`/api/v1/therapy-management/assignments?therapistId=${me}`);
        setPatients(dedupe((Array.isArray(rows) ? rows : [])
          .filter((a) => String(a.status || 'active').toLowerCase() === 'active')
          .map((a) => ({ id: a.clientId, name: a.clientName || a.clientEmail || 'Client' }))));
        return;
      }
      // Appointments, not the roster: the roster table is empty in practice, and
      // appointments is also what the server authorises a draft against — so the
      // list can only offer patients the draft will accept.
      const appts = await api(`/api/v1/medical/appointments/doctor/${me}`);
      setPatients(dedupe((Array.isArray(appts) ? appts : [])
        .map((a) => ({ id: a.patientId, name: a.patientName || 'Patient' }))));
    } catch {
      setPatients([]);
    }
  }, [role]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const draft = async () => {
    if (!instructions.trim()) {
      Alert.alert('Nothing to organise', 'Write what the patient should do first.');
      return;
    }
    setBusy('Organising…');
    try {
      const res = await api('/api/v1/care-plans/draft', {
        method: 'POST',
        body: { patientId: patientId || null, instructions },
      });
      if (!res?.ok) { Alert.alert('Not prepared', res?.message || 'The plan could not be prepared.'); return; }
      setPlan(res.plan);
      setProposed(JSON.stringify(res.plan));
      setSummary(res.plan.patientSummary || '');
      setAuditId(res.aiAuditId || null);
    } catch (e) {
      Alert.alert('Not prepared', e?.message || 'The plan could not be prepared.');
    } finally {
      setBusy('');
    }
  };

  /**
   * Plainer wording for the patient: restate the summary (the clinician stays
   * the author), or add an explanation of a topic — written only from the
   * clinic's approved material, refused otherwise. Lands in the editable box.
   */
  const explain = async (mode) => {
    const body = mode === 'topic'
      ? { topic: topic.trim(), patientId: patientId || null }
      : { clinicianText: summary, patientId: patientId || null };
    if (mode === 'topic' ? !body.topic : !summary.trim()) return;
    setBusy(mode === 'topic' ? 'Explaining…' : 'Simplifying…'); setExplainNote('');
    try {
      const res = await api('/api/v1/care-plans/explain', { method: 'POST', body });
      if (!res?.ok) { setExplainNote(res?.message || 'That could not be done right now.'); return; }
      if (mode === 'topic') {
        setSummary((cur) => `${cur.trim()}\n\nAbout ${body.topic}: ${res.text}`.trim());
        setTopic('');
      } else {
        setSummary(res.text);
      }
      setExplainNote('Updated — read it through before approving.');
    } catch (e) {
      setExplainNote(e?.message || 'That could not be done right now.');
    } finally {
      setBusy('');
    }
  };

  const save = async (approve) => {
    if (!patientId) { Alert.alert('Patient', 'Choose the patient this plan is for.'); return; }
    setBusy(approve ? 'Approving…' : 'Saving…');
    try {
      const current = { ...(plan || {}), patientSummary: summary };
      const res = await api('/api/v1/care-plans', {
        method: 'POST',
        body: {
          patientId,
          instructions,
          planJson: JSON.stringify(current),
          patientSummary: summary,
          visibleToPatient: approve,
          approve,
          aiAssisted: Boolean(auditId),
          aiAuditId: auditId,
          aiEdited: auditId ? JSON.stringify(current) !== proposed : null,
        },
      });
      Alert.alert(
        res.status === 'active' ? 'Approved' : 'Saved',
        res.status === 'active'
          ? 'The patient can now see their plan.'
          : 'Saved as a draft. The patient cannot see it yet.',
      );
    } catch (e) {
      Alert.alert('Not saved', e?.message || 'That could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const setItem = (key, idx, field, value) => setPlan((p) => {
    const next = { ...p };
    const list = [...(next[key] || [])];
    list[idx] = { ...list[idx], [field]: value };
    next[key] = list;
    return next;
  });

  const setLine = (key, idx, value) => setPlan((p) => {
    const next = { ...p };
    const list = [...(next[key] || [])];
    list[idx] = value;
    next[key] = list;
    return next;
  });

  return (
    <ZCGround>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={zcStyles.badge}><Text style={zcStyles.badgeText}>Care plan</Text></View>
          <Text style={[zcStyles.display, styles.title]}>Write a care plan</Text>
          <Text style={[zcStyles.body, styles.lead]}>
            Write what the patient should do and this organises it. Nothing
            reaches them until you approve it.
          </Text>

          <View style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={zcStyles.label}>Patient</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {patients.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, patientId === p.id && styles.chipActive]}
                  onPress={() => setPatientId(p.id)}
                >
                  <Text style={[styles.chipText, patientId === p.id && styles.chipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {patients.length === 0 ? (
                <Text style={styles.hint}>No patients found.</Text>
              ) : null}
            </ScrollView>

            <Text style={zcStyles.label}>Your instructions</Text>
            <TextInput
              style={[zcStyles.input, styles.textarea]}
              value={instructions}
              onChangeText={setInstructions}
              placeholder="e.g. Amlodipine 5mg once daily in the morning. Thirty minutes walking, five days a week. Review in four weeks."
              placeholderTextColor={ZC.ink4}
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.hint}>
              Only what you write is used. Anything you leave out — a dose, a
              frequency, a date — is left out rather than filled in.
            </Text>

            <TouchableOpacity
              style={[zcStyles.btnPrimary, (!!busy || !instructions.trim()) && styles.off]}
              onPress={draft}
              disabled={!!busy || !instructions.trim()}
            >
              <Text style={zcStyles.btnPrimaryText}>
                {busy === 'Organising…' ? 'Organising…' : 'Organise into a plan'}
              </Text>
            </TouchableOpacity>
          </View>

          {plan ? (
            <>
              <View style={[styles.card, glassStyle]}>
                <GlassFill />
                <Text style={[zcStyles.eyebrow, styles.section]}>The plan</Text>

                {(plan.medications || []).length ? <Text style={zcStyles.label}>Medications</Text> : null}
                {(plan.medications || []).map((m, i) => (
                  <View key={`m${i}`} style={styles.group}>
                    <TextInput style={zcStyles.input} value={m.what || ''} placeholder="what"
                      placeholderTextColor={ZC.ink4}
                      onChangeText={(v) => setItem('medications', i, 'what', v)} />
                    <TextInput style={zcStyles.input} value={m.when || ''} placeholder="when"
                      placeholderTextColor={ZC.ink4}
                      onChangeText={(v) => setItem('medications', i, 'when', v)} />
                  </View>
                ))}

                {(plan.activities || []).length ? <Text style={zcStyles.label}>Activities</Text> : null}
                {(plan.activities || []).map((a, i) => (
                  <View key={`a${i}`} style={styles.group}>
                    <TextInput style={zcStyles.input} value={a.what || ''} placeholder="what"
                      placeholderTextColor={ZC.ink4}
                      onChangeText={(v) => setItem('activities', i, 'what', v)} />
                    <TextInput style={zcStyles.input} value={a.when || ''} placeholder="when"
                      placeholderTextColor={ZC.ink4}
                      onChangeText={(v) => setItem('activities', i, 'when', v)} />
                  </View>
                ))}

                {(plan.monitoring || []).length ? <Text style={zcStyles.label}>To monitor</Text> : null}
                {(plan.monitoring || []).map((t, i) => (
                  <TextInput key={`o${i}`} style={zcStyles.input} value={t}
                    onChangeText={(v) => setLine('monitoring', i, v)} />
                ))}

                {(plan.tests || []).length ? <Text style={zcStyles.label}>Tests</Text> : null}
                {(plan.tests || []).map((t, i) => (
                  <TextInput key={`t${i}`} style={zcStyles.input} value={t}
                    onChangeText={(v) => setLine('tests', i, v)} />
                ))}

                <Text style={zcStyles.label}>Follow-up</Text>
                <TextInput style={zcStyles.input} value={plan.followUp || ''}
                  onChangeText={(v) => setPlan((p) => ({ ...p, followUp: v }))} />
              </View>

              <View style={[styles.card, glassStyle]}>
                <GlassFill />
                <View style={styles.sectionRow}>
                  <Ionicons name="eye-outline" size={15} color={ZC.ink2} />
                  <Text style={zcStyles.eyebrow}>What the patient will read</Text>
                </View>
                <TextInput
                  style={[zcStyles.input, styles.textarea]}
                  value={summary}
                  onChangeText={setSummary}
                  multiline
                  textAlignVertical="top"
                />
                <Text style={styles.hint}>
                  This is the only part the patient sees. Read it as they will.
                </Text>

                <TouchableOpacity
                  style={[styles.ghost, (!!busy || !summary.trim()) && styles.off]}
                  onPress={() => explain('restate')}
                  disabled={!!busy || !summary.trim()}
                >
                  <Text style={styles.ghostText}>Plainer words</Text>
                </TouchableOpacity>
                <View style={styles.explainRow}>
                  <TextInput
                    style={[zcStyles.input, styles.flex]}
                    value={topic}
                    onChangeText={setTopic}
                    placeholder="Explain a topic, e.g. hypertension"
                    placeholderTextColor={ZC.ink4}
                  />
                  <TouchableOpacity
                    style={[styles.ghostSmall, (!!busy || !topic.trim()) && styles.off]}
                    onPress={() => explain('topic')}
                    disabled={!!busy || !topic.trim()}
                  >
                    <Text style={styles.ghostText}>Add</Text>
                  </TouchableOpacity>
                </View>
                {explainNote ? <Text style={styles.hint}>{explainNote}</Text> : null}

                <TouchableOpacity
                  style={[zcStyles.btnPrimary, !!busy && styles.off]}
                  onPress={() => save(true)}
                  disabled={!!busy}
                >
                  <Text style={zcStyles.btnPrimaryText}>
                    {busy === 'Approving…' ? 'Approving…' : 'Approve and share with patient'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ghost, !!busy && styles.off]}
                  onPress={() => save(false)}
                  disabled={!!busy}
                >
                  <Text style={styles.ghostText}>Save as draft</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          {busy ? <ActivityIndicator color={ZC.accent} style={{ marginTop: 8 }} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ZCGround>
  );
}

/** One entry per person: a patient with six appointments is still one patient. */
function dedupe(list) {
  const seen = new Map();
  for (const p of list) if (p.id && !seen.has(p.id)) seen.set(p.id, p);
  return [...seen.values()];
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { marginTop: 12 },
  lead: { marginBottom: 4 },
  card: { borderRadius: 20, padding: 18, gap: 8 },
  textarea: { minHeight: 110, paddingTop: 12 },
  hint: { fontSize: 12, color: ZC.ink3, lineHeight: 17, marginTop: -2, marginBottom: 6 },
  section: { marginBottom: 4 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  group: { gap: 6, marginBottom: 8 },
  chipRow: { marginBottom: 8 },
  chip: {
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(15,20,36,0.12)', marginRight: 8,
  },
  chipActive: { backgroundColor: ZC.accent, borderColor: ZC.accent },
  chipText: { fontSize: 12.5, fontWeight: '600', color: ZC.ink2 },
  chipTextActive: { color: '#ffffff' },
  ghost: {
    marginTop: 8, paddingVertical: 12, borderRadius: 999, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(15,20,36,0.14)',
  },
  ghostText: { fontSize: 14, fontWeight: '700', color: ZC.ink2 },
  explainRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 6 },
  ghostSmall: {
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(15,20,36,0.14)',
  },
  off: { opacity: 0.5 },
});
