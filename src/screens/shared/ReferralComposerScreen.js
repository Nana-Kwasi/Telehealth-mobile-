import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import ZCGround from '../../components/ZCGround';
import GlassFill, { glassStyle } from '../../components/GlassFill';
import { ZC, zcStyles } from '../../constants/zencare';
import { api, getStoredUserId } from '../../services/apiClient';

/**
 * Prepare a referral on the phone.
 *
 * The clinician states who and why; the packet the receiving clinician needs is
 * gathered from the record and shown for checking before it goes. The reason is
 * required — deciding that someone needs a specialist is not a thing to
 * generate, and without it there is nothing to select the record against.
 */
export default function ReferralComposerScreen({ role = 'DOCTOR' }) {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState({ patientId: '', specialty: '', reason: '' });
  const [packet, setPacket] = useState(null);
  const [proposed, setProposed] = useState(null);
  const [auditId, setAuditId] = useState(null);
  const [busy, setBusy] = useState('');

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
      const appts = await api(`/api/v1/medical/appointments/doctor/${me}`);
      setPatients(dedupe((Array.isArray(appts) ? appts : [])
        .map((a) => ({ id: a.patientId, name: a.patientName || 'Patient' }))));
    } catch {
      setPatients([]);
    }
  }, [role]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const assemble = async () => {
    setBusy('Assembling…');
    try {
      const res = await api('/api/v1/care-plans/referrals/draft', {
        method: 'POST',
        body: { patientId: form.patientId || null, specialty: form.specialty, reason: form.reason },
      });
      if (!res?.ok) { Alert.alert('Not assembled', res?.message || 'The referral could not be assembled.'); return; }
      setPacket(res.packet);
      setProposed(JSON.stringify(res.packet));
      setAuditId(res.aiAuditId || null);
    } catch (e) {
      Alert.alert('Not assembled', e?.message || 'The referral could not be assembled.');
    } finally { setBusy(''); }
  };

  const save = async (submit) => {
    setBusy(submit ? 'Submitting…' : 'Saving…');
    try {
      const res = await api('/api/v1/care-plans/referrals', {
        method: 'POST',
        body: {
          ...form,
          clinicalSummary: packet?.clinicalSummary || '',
          relevantHistory: packet?.relevantHistory || '',
          currentMedications: packet?.currentMedications || '',
          relevantResults: packet?.relevantResults || '',
          submit,
          aiAssisted: Boolean(auditId),
          aiAuditId: auditId,
          aiEdited: auditId ? JSON.stringify(packet) !== proposed : null,
        },
      });
      Alert.alert(res.status === 'submitted' ? 'Submitted' : 'Saved',
        res.status === 'submitted' ? 'Referral submitted.' : 'Saved as a draft.');
    } catch (e) {
      Alert.alert('Not saved', e?.message || 'That could not be saved.');
    } finally { setBusy(''); }
  };

  const field = (key, label) => (
    <>
      <Text style={zcStyles.label}>{label}</Text>
      <TextInput
        style={[zcStyles.input, styles.textarea]}
        value={packet?.[key] || ''}
        onChangeText={(v) => setPacket((p) => ({ ...p, [key]: v }))}
        placeholder="Nothing on record — add anything the receiving clinician needs."
        placeholderTextColor={ZC.ink4}
        multiline
        textAlignVertical="top"
      />
    </>
  );

  const canAssemble = !busy && form.patientId && form.reason.trim();

  return (
    <ZCGround>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={zcStyles.badge}><Text style={zcStyles.badgeText}>Referral</Text></View>
          <Text style={[zcStyles.display, styles.title]}>Refer a patient</Text>
          <Text style={[zcStyles.body, styles.lead]}>
            You decide who and why. The packet is gathered from the record and
            shown for you to check before it goes.
          </Text>

          <View style={[styles.card, glassStyle]}>
            <GlassFill />
            <Text style={zcStyles.label}>Patient</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {patients.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, form.patientId === p.id && styles.chipActive]}
                  onPress={() => set('patientId', p.id)}
                >
                  <Text style={[styles.chipText, form.patientId === p.id && styles.chipTextActive]}>
                    {p.name}
                  </Text>
                </TouchableOpacity>
              ))}
              {patients.length === 0 ? <Text style={styles.hint}>No patients found.</Text> : null}
            </ScrollView>

            <Text style={zcStyles.label}>Refer to</Text>
            <TextInput style={zcStyles.input} value={form.specialty}
              onChangeText={(v) => set('specialty', v)}
              placeholder="e.g. Cardiology" placeholderTextColor={ZC.ink4} />

            <Text style={zcStyles.label}>Why are you referring?</Text>
            <TextInput style={[zcStyles.input, styles.textarea]} value={form.reason}
              onChangeText={(v) => set('reason', v)} multiline textAlignVertical="top"
              placeholder="e.g. Exertional chest discomfort with a family history of coronary disease."
              placeholderTextColor={ZC.ink4} />
            <Text style={styles.hint}>
              Required. The record is selected against this, so the packet carries
              what bears on your reason rather than everything on file.
            </Text>

            <TouchableOpacity
              style={[zcStyles.btnPrimary, !canAssemble && styles.off]}
              onPress={assemble}
              disabled={!canAssemble}
            >
              <Text style={zcStyles.btnPrimaryText}>
                {busy === 'Assembling…' ? 'Assembling…' : 'Assemble the packet'}
              </Text>
            </TouchableOpacity>
          </View>

          {packet ? (
            <View style={[styles.card, glassStyle]}>
              <GlassFill />
              <Text style={[zcStyles.eyebrow, styles.section]}>The packet</Text>
              {field('clinicalSummary', 'Clinical summary')}
              {field('relevantHistory', 'Relevant history')}
              {field('currentMedications', 'Current medications')}
              {field('relevantResults', 'Relevant results')}

              <TouchableOpacity
                style={[zcStyles.btnPrimary, !!busy && styles.off]}
                onPress={() => save(true)} disabled={!!busy}
              >
                <Text style={zcStyles.btnPrimaryText}>
                  {busy === 'Submitting…' ? 'Submitting…' : 'Submit referral'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghost, !!busy && styles.off]}
                onPress={() => save(false)} disabled={!!busy}
              >
                <Text style={styles.ghostText}>Save as draft</Text>
              </TouchableOpacity>
            </View>
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
  textarea: { minHeight: 90, paddingTop: 12 },
  hint: { fontSize: 12, color: ZC.ink3, lineHeight: 17, marginTop: -2, marginBottom: 6 },
  section: { marginBottom: 4 },
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
  off: { opacity: 0.5 },
});
