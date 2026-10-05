import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator, Alert, Modal, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, getStoredUserId } from '../../services/apiClient';
import CheckInReviewQueueCard from '../../components/CheckInReviewQueueCard';

/**
 * Follow-up check-ins on mobile — a surface that only existed on web.
 *
 * Mirrors the web screen deliberately: same endpoints, same three groups
 * (answered / waiting / overdue), same rule that the question is the
 * clinician's own words. A clinician who uses one and then the other should
 * not have to learn it twice.
 */
const TEMPLATES = [
  { label: 'Symptom rating', text: 'How have your symptoms been since our last session? Rate them 0-10.' },
  { label: 'Medication',     text: 'Have you been able to take your medication as prescribed? Any side effects?' },
  { label: 'Sleep',          text: 'How has your sleep been this week? Roughly how many hours a night?' },
  { label: 'Mood',           text: 'How has your mood been since we last spoke?' },
];

const DAYS = ['1', '2', '3', '5', '7', '14', '30'];

export default function ClinicianFollowUpsScreen({ role = 'THERAPIST' }) {
  const [people, setPeople]   = useState([]);
  const [restricted, setRestricted] = useState(0);
  const [sent, setSent]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy]       = useState(false);

  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState(null);
  const [query, setQuery]     = useState('');
  const [prompt, setPrompt]   = useState(TEMPLATES[0].text);
  const [dueIn, setDueIn]     = useState('3');
  const [series, setSeries]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      const [rows, mine] = await Promise.all([
        role === 'DOCTOR'
          ? api('/api/v1/doctors/me/patients').catch(() => [])
          : api('/api/v1/therapy-management/clients').catch(() => []),
        api('/api/v1/care/followups/sent').catch(() => []),
      ]);
      const list = Array.isArray(rows) ? rows : (rows?.items || []);
      // await: on mobile this reads AsyncStorage and returns a Promise.
      const me = await getStoredUserId();
      const own = list.filter((p) => !p.therapistId || String(p.therapistId) === String(me));
      setPeople(own.length ? own : list);
      setRestricted(own.length > 0 && own.length < list.length ? list.length - own.length : 0);
      setSent(Array.isArray(mine) ? mine : []);
    } catch (e) {
      Alert.alert('Could not load', e?.message || 'Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const nameOf = (p) => p.fullName || p.name || p.displayName || p.email || 'Unnamed';

  const stats = useMemo(() => ({
    answered: sent.filter((f) => f.response).length,
    waiting:  sent.filter((f) => f.status === 'pending' && !f.overdue).length,
    overdue:  sent.filter((f) => f.overdue).length,
  }), [sent]);

  const visible = useMemo(() => {
    if (filter === 'answered') return sent.filter((f) => f.response);
    if (filter === 'waiting')  return sent.filter((f) => f.status === 'pending' && !f.overdue);
    if (filter === 'overdue')  return sent.filter((f) => f.overdue);
    return sent;
  }, [sent, filter]);

  const schedule = async () => {
    if (!subject) { Alert.alert('Choose a patient', 'Pick who this is for first.'); return; }
    if (!prompt.trim()) { Alert.alert('Write a question', 'They see this exactly as written.'); return; }
    setBusy(true);
    try {
      const due = new Date(Date.now() + Number(dueIn || 3) * 86400000);
      await api('/api/v1/care/followups', {
        method: 'POST',
        body: {
          patientId: subject.id,
          prompt: prompt.trim(),
          dueAt: due.toISOString().slice(0, 19),
          seriesKey: series.trim() || null,
        },
      });
      Alert.alert('Scheduled',
        `${subject.name} will be asked in ${dueIn} day${dueIn === '1' ? '' : 's'}.`);
      setComposing(false); setSubject(null); setSeries('');
      await load();
    } catch (e) {
      Alert.alert('Could not schedule', e?.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  if (loading) {
    return <View style={styles.centered}><ActivityIndicator size="large" color="#1d4ed8" /></View>;
  }

  return (
    <View style={styles.flex}>
      <ScrollView
      // The keyboard covered whatever was being typed into: this screen had
      // no keyboard handling at all. iOS insets the scroll view; Android
      // resizes the window (app.json softwareKeyboardLayoutMode default).
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        <Text style={styles.h1}>Follow-up check-ins</Text>
        <Text style={styles.lead}>
          Ask a patient something between appointments and see how their answers change.
        </Text>

        {/* What a clinician opens this for: did anyone answer, is anyone overdue. */}
        <View style={styles.stats}>
          <Stat label="Answered" value={stats.answered} tone="ok"   icon="checkmark-circle-outline"
                active={filter === 'answered'}
                onPress={() => setFilter(filter === 'answered' ? 'all' : 'answered')} />
          <Stat label="Waiting"  value={stats.waiting}  tone="info" icon="time-outline"
                active={filter === 'waiting'}
                onPress={() => setFilter(filter === 'waiting' ? 'all' : 'waiting')} />
          <Stat label="Overdue"  value={stats.overdue}  tone="warn" icon="alert-circle-outline"
                active={filter === 'overdue'}
                onPress={() => setFilter(filter === 'overdue' ? 'all' : 'overdue')} />
        </View>

        {/* Unread answers (safety flags first) and self-running follow-ups. */}
        <CheckInReviewQueueCard
          people={people.map((p) => ({ ...p, id: p.id || p.userId || p.clientId }))}
          nameOf={nameOf} />

        <View style={styles.card}>
          <Text style={styles.h2}>
            {filter === 'all' ? 'All check-ins'
              : filter === 'answered' ? 'Answered'
              : filter === 'waiting' ? 'Waiting for a reply' : 'Overdue'}
          </Text>

          {visible.length === 0 ? (
            <Text style={styles.empty}>
              {sent.length === 0
                ? 'You have not sent any check-ins yet. Tap the button below to ask a patient something between appointments.'
                : 'Nothing in this group.'}
            </Text>
          ) : visible.map((f) => {
            const open = expanded === f.id;
            return (
              <View key={f.id} style={styles.item}>
                <TouchableOpacity
                  style={styles.itemHead}
                  onPress={() => setExpanded(open ? null : f.id)}
                >
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName}>
                      {f.patient_name || f.patient_email || 'Patient'}
                    </Text>
                    <Text style={styles.itemPrompt} numberOfLines={1}>{f.prompt}</Text>
                  </View>
                  <View style={f.response ? styles.pillOk : f.overdue ? styles.pillWarn : styles.pillInfo}>
                    <Text style={f.response ? styles.pillOkText : f.overdue ? styles.pillWarnText : styles.pillInfoText}>
                      {f.response ? 'Answered' : f.overdue ? 'Overdue' : 'Waiting'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {open ? (
                  <View style={styles.itemBody}>
                    {f.response ? (
                      <>
                        <Text style={styles.answerLabel}>
                          THEIR ANSWER
                          {f.responded_at ? ` — ${new Date(f.responded_at).toLocaleDateString()}` : ''}
                        </Text>
                        {/* The patient's own words, not summarised. */}
                        <Text style={styles.answer}>{f.response}</Text>
                      </>
                    ) : (
                      <Text style={styles.pendingNote}>
                        No answer yet. Due {new Date(f.due_at).toLocaleDateString()}.
                      </Text>
                    )}
                    <Text style={styles.meta}>
                      Sent {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                      {f.series_key ? ` · tracked as "${f.series_key}"` : ''}
                    </Text>
                    <TouchableOpacity
                      style={styles.repeat}
                      onPress={() => {
                        setSubject({ id: f.patient_id, name: f.patient_name || 'Patient' });
                        setPrompt(f.prompt);
                        setSeries(f.series_key || '');
                        setComposing(true);
                      }}
                    >
                      <Text style={styles.repeatText}>Ask this again</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setComposing(true)}>
        <Ionicons name="add" size={20} color="#ffffff" />
        <Text style={styles.fabText}>New check-in</Text>
      </TouchableOpacity>

      {/* ── Compose ── */}
      <Modal visible={composing} animationType="slide" presentationStyle="pageSheet"
             onRequestClose={() => setComposing(false)}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>New check-in</Text>
          <TouchableOpacity onPress={() => setComposing(false)} style={styles.sheetClose}>
            <Ionicons name="close" size={20} color="#454b5c" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Who</Text>
          {subject ? (
            <View style={styles.chosen}>
              <Text style={styles.chosenText}>{subject.name}</Text>
              <TouchableOpacity onPress={() => setSubject(null)} style={styles.chosenX}>
                <Ionicons name="close" size={12} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name or email…"
                placeholderTextColor="#9aa0b2"
              />
              <View style={styles.peopleBox}>
                {people
                  .filter((p) => {
                    const q = query.trim().toLowerCase();
                    return !q || `${nameOf(p)} ${p.email || ''}`.toLowerCase().includes(q);
                  })
                  .slice(0, 40)
                  .map((p) => {
                    const id = p.id || p.userId || p.clientId;
                    return (
                      <TouchableOpacity key={id} style={styles.personRow}
                        onPress={() => { setSubject({ id, name: nameOf(p) }); setQuery(''); }}>
                        <Text style={styles.personName}>{nameOf(p)}</Text>
                        {p.email ? <Text style={styles.personEmail}>{p.email}</Text> : null}
                      </TouchableOpacity>
                    );
                  })}
              </View>
              {restricted > 0 ? (
                <Text style={styles.note}>
                  {restricted} other {restricted === 1 ? 'person is' : 'people are'} on the platform
                  but not assigned to you.
                </Text>
              ) : null}
            </>
          )}

          <Text style={[styles.label, { marginTop: 18 }]}>
            Your question — they see this exactly as written
          </Text>
          <View style={styles.templates}>
            {TEMPLATES.map((t) => (
              <TouchableOpacity
                key={t.label}
                style={prompt === t.text ? styles.templateOn : styles.template}
                onPress={() => setPrompt(t.text)}
              >
                <Text style={prompt === t.text ? styles.templateOnText : styles.templateText}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={prompt}
            onChangeText={setPrompt}
            multiline
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Ask in</Text>
          <View style={styles.templates}>
            {DAYS.map((d) => (
              <TouchableOpacity key={d}
                style={dueIn === d ? styles.templateOn : styles.template}
                onPress={() => setDueIn(d)}>
                <Text style={dueIn === d ? styles.templateOnText : styles.templateText}>
                  {d} day{d === '1' ? '' : 's'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Track as (optional)</Text>
          <TextInput
            style={styles.input}
            value={series}
            onChangeText={setSeries}
            placeholder="e.g. headache"
            placeholderTextColor="#9aa0b2"
          />
          <Text style={styles.hint}>
            Reuse the same label to see answers as a series over time.
          </Text>

          <TouchableOpacity
            style={[styles.btn, (!subject || !prompt.trim() || busy) && styles.btnOff]}
            disabled={!subject || !prompt.trim() || busy}
            onPress={schedule}
          >
            <Text style={styles.btnText}>{busy ? 'Scheduling…' : 'Schedule check-in'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </View>
  );
}

function Stat({ label, value, tone, icon, active, onPress }) {
  const t = {
    ok:   { bg: '#f0fdf4', border: '#bbf7d0', fg: '#14532d' },
    info: { bg: '#eff6ff', border: '#bfdbfe', fg: '#14427e' },
    warn: { bg: '#fffbeb', border: '#fde68a', fg: '#8a4b09' },
  }[tone];
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.stat, { backgroundColor: t.bg, borderColor: active ? t.fg : t.border,
                             borderWidth: active ? 2 : 1.5 }]}
    >
      <Ionicons name={icon} size={16} color={t.fg} />
      <Text style={[styles.statValue, { color: t.fg }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: t.fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f7f9fc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 96 },

  h1: { fontSize: 21, fontWeight: '800', color: '#0f1424' },
  h2: { fontSize: 14.5, fontWeight: '750', color: '#0f1424', marginBottom: 10 },
  lead: { fontSize: 13, lineHeight: 19, color: '#545a6b', marginTop: 5, marginBottom: 14 },

  stats: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  // flex:1 on the tile is correct here — it is a row, so it shares width.
  stat: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 12, borderRadius: 14 },
  statValue: { fontSize: 19, fontWeight: '800' },
  statLabel: { fontSize: 11.5, fontWeight: '650' },

  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14,
          borderWidth: 1, borderColor: '#e4e7ee' },
  empty: { fontSize: 13, lineHeight: 20, color: '#6b7283' },

  item: { borderWidth: 1, borderColor: '#e4e7ee', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 },
  itemMain: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: '700', color: '#0f1424' },
  itemPrompt: { fontSize: 11.5, color: '#6b7283', marginTop: 2 },
  itemBody: { paddingHorizontal: 11, paddingBottom: 11, borderTopWidth: 1, borderTopColor: '#f1f3f8' },

  answerLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, color: '#6b7283', marginTop: 10 },
  answer: { fontSize: 13.5, lineHeight: 20, color: '#16203a', marginTop: 5, marginBottom: 8,
            backgroundColor: '#f7f9fc', borderWidth: 1, borderColor: '#e4e7ee',
            borderRadius: 10, paddingVertical: 9, paddingHorizontal: 11 },
  pendingNote: { fontSize: 13, color: '#6b7283', marginTop: 10, marginBottom: 6 },
  meta: { fontSize: 11, color: '#8a90a0', marginBottom: 10 },
  repeat: { alignSelf: 'flex-start', backgroundColor: '#f1f5fb', borderWidth: 1,
            borderColor: '#d8dce6', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  repeatText: { fontSize: 12, fontWeight: '650', color: '#1a3ea8' },

  pillOk:   { backgroundColor: '#dcfce7', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillOkText: { fontSize: 10.5, fontWeight: '800', color: '#14532d' },
  pillInfo: { backgroundColor: '#eff6ff', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillInfoText: { fontSize: 10.5, fontWeight: '800', color: '#14427e' },
  pillWarn: { backgroundColor: '#fffbeb', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillWarnText: { fontSize: 10.5, fontWeight: '800', color: '#8a4b09' },

  fab: { position: 'absolute', right: 16, bottom: 20, flexDirection: 'row', alignItems: 'center',
         gap: 6, backgroundColor: '#1d4ed8', borderRadius: 999,
         paddingVertical: 13, paddingHorizontal: 18, elevation: 5,
         shadowColor: '#1d3fb8', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
  fabText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
               paddingHorizontal: 16, paddingVertical: 14,
               borderBottomWidth: 1, borderBottomColor: '#edeff4', backgroundColor: '#ffffff' },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f1424' },
  sheetClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f3f8',
                alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: 16, paddingBottom: 44, backgroundColor: '#ffffff' },

  label: { fontSize: 12.5, fontWeight: '700', color: '#2b3142', marginBottom: 6 },
  hint: { fontSize: 11.5, lineHeight: 17, color: '#6b7283', marginTop: 5 },
  note: { fontSize: 11.5, color: '#6b7283', marginTop: 8 },
  input: { borderWidth: 1.5, borderColor: '#d8dce6', borderRadius: 10,
           paddingVertical: 10, paddingHorizontal: 12, fontSize: 13.5, color: '#0f1424',
           backgroundColor: '#ffffff' },
  textarea: { minHeight: 84, textAlignVertical: 'top' },

  peopleBox: { marginTop: 8, maxHeight: 230, borderWidth: 1, borderColor: '#e4e7ee',
               borderRadius: 10, padding: 4 },
  personRow: { paddingVertical: 9, paddingHorizontal: 10, borderRadius: 8 },
  personName: { fontSize: 13.5, fontWeight: '650', color: '#16203a' },
  personEmail: { fontSize: 11, color: '#6b7283', marginTop: 1 },

  chosen: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8,
            backgroundColor: '#eff4ff', borderRadius: 999,
            paddingVertical: 7, paddingLeft: 14, paddingRight: 7 },
  chosenText: { fontSize: 13.5, fontWeight: '700', color: '#1a3ea8' },
  chosenX: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#1a3ea8',
             alignItems: 'center', justifyContent: 'center' },

  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  template: { borderWidth: 1.5, borderColor: '#d8dce6', borderRadius: 999,
              paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#ffffff' },
  templateText: { fontSize: 12, fontWeight: '650', color: '#4a5163' },
  templateOn: { borderWidth: 1.5, borderColor: '#1d4ed8', borderRadius: 999,
                paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#eff4ff' },
  templateOnText: { fontSize: 12, fontWeight: '750', color: '#1a3ea8' },

  btn: { marginTop: 22, backgroundColor: '#1d4ed8', borderRadius: 12,
         paddingVertical: 13, alignItems: 'center' },
  btnOff: { opacity: 0.45 },
  btnText: { color: '#ffffff', fontSize: 14.5, fontWeight: '700' },
});
