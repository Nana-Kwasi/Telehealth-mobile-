import EmptyStateMobile, { IconBubbleMobile } from './EmptyStateMobile';
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { api } from '../services/apiClient';

/*
 * The structured psychiatry record on mobile. Same endpoints and rules as web:
 * gaps banner, timeline, mental status exams, diagnoses and treatment plan,
 * and private notes only their author can read.
 */

const base = (id) => `/api/v1/clinical-record/${id}`;
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api(path).then(setData).catch((e) => setError(e?.message || 'Could not load.'));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return [data, error, load];
}

function Loading({ error }) {
  return <View style={s.card}>{error ? <Text style={s.err}>{error}</Text> : <ActivityIndicator />}</View>;
}

function Chip({ on, label, onPress, accent }) {
  return (
    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress}
      style={[s.chip, on && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
      <Text style={[s.chipText, on && { color: accent, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Btn({ label, onPress, disabled, accent }) {
  return (
    <TouchableOpacity style={[s.btn, { backgroundColor: accent }, disabled && { opacity: 0.5 }]} onPress={onPress} disabled={disabled}>
      <Text style={s.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Link({ label, onPress, accent }) {
  return <TouchableOpacity onPress={onPress}><Text style={[s.link, { color: accent }]}>{label}</Text></TouchableOpacity>;
}

// ── Gaps ─────────────────────────────────────────────────────────────────────

export function RecordGapsMobile({ clientId, onOpen, refreshKey, accent = '#4f46e5' }) {
  const [data, , load] = useLoad(`${base(clientId)}/timeline`);
  useEffect(() => { if (refreshKey) load(); }, [refreshKey, load]);
  const g = data?.gaps;
  if (!g) return null;
  const items = [];
  if (g.sessionsWithoutNote > 0) items.push({ text: `${g.sessionsWithoutNote} past session${g.sessionsWithoutNote === 1 ? '' : 's'} with no note`, tab: 'timeline' });
  if (g.noMentalStatusExam) items.push({ text: 'No mental status exam on record', tab: 'mse' });
  if (g.noTreatmentPlan) items.push({ text: 'Diagnosed, but no treatment plan yet', tab: 'diagnosis' });
  if (!items.length) return null;
  return (
    <View style={s.gaps}>
      <Text style={s.gapsTitle}>Missing from this chart</Text>
      {items.map((i) => <Link key={i.tab} label={i.text} accent={accent} onPress={() => onOpen && onOpen(i.tab)} />)}
    </View>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

const KIND = { session: 'Session', note: 'Note', prescription: 'Prescription', result: 'Lab / scan', measure: 'Questionnaire', mse: 'Mental status', diagnosis: 'Diagnosis', plan: 'Treatment plan' };

export function TimelineMobile({ clientId, onAddNote, accent = '#4f46e5' }) {
  const [data, error] = useLoad(`${base(clientId)}/timeline`);
  if (!data) return <Loading error={error} />;
  return (
    <View style={s.card}>
      <Text style={s.title}>Timeline</Text>
      {data.items.length === 0 ? <EmptyStateMobile compact icon="HealthDataSync" tone="sky" title="Nothing on the chart yet" /> : data.items.map((i) => (
        <View key={`${i.kind}-${i.id}`} style={[s.row, i.flag && { backgroundColor: '#fef2f2' }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.kind}>{KIND[i.kind] || i.kind} · {fmtTime(i.at)}</Text>
            <Text style={s.strong}>{i.title}</Text>
            {i.text ? <Text style={s.muted}>{i.text}</Text> : null}
            {i.needsNote && onAddNote ? <Link label="+ Progress note (none written)" accent={accent} onPress={onAddNote} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Mental status exam ───────────────────────────────────────────────────────

export function MseMobile({ clientId, onSaved, accent = '#4f46e5' }) {
  const [def] = useLoad('/api/v1/clinical-record/mse/definition');
  const [list, error, load] = useLoad(`${base(clientId)}/mse`);
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState(null);
  if (!def || !list) return <Loading error={error} />;
  if (open) return <MseFormMobile def={def} clientId={clientId} accent={accent} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); load(); onSaved && onSaved(); }} />;
  return (
    <View style={s.card}>
      <View style={s.head}><Text style={s.title}>Mental status exams</Text><Btn label="New exam" accent={accent} onPress={() => setOpen(true)} /></View>
      {list.length === 0 ? <EmptyStateMobile compact icon="MentalHealthTherapy" tone="violet" title="No exam recorded yet" /> : list.map((m) => (
        <TouchableOpacity key={m.id} style={s.row} onPress={() => setViewing(viewing === m.id ? null : m.id)}>
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>{fmt(m.created_at)} · {m.risk_level} risk</Text>
            <Text style={s.muted}>{m.summary}</Text>
            {viewing === m.id && def.domains.filter((d) => m.findings?.[d.key]).map((d) => (
              <Text key={d.key} style={s.detail}><Text style={s.strong}>{d.label}: </Text>
                {[...(m.findings[d.key].selected || []), m.findings[d.key].comment].filter(Boolean).join(' · ')}</Text>
            ))}
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function MseFormMobile({ def, clientId, accent, onCancel, onSaved }) {
  const [f, setF] = useState({});
  const [risk, setRisk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toggle = (d, o) => setF((p) => {
    const cur = p[d.key]?.selected || [];
    const selected = d.many ? (cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o]) : (cur[0] === o ? [] : [o]);
    return { ...p, [d.key]: { ...p[d.key], selected } };
  });
  const save = async () => {
    setBusy(true); setError('');
    try { await api(`${base(clientId)}/mse`, { method: 'POST', body: { findings: f, riskLevel: risk } }); onSaved(); }
    catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>New mental status exam</Text>
      {def.domains.map((d) => (
        <View key={d.key} style={s.domain}>
          <Text style={s.strong}>{d.label}{d.required ? ' *' : ''}</Text>
          <View style={s.chips}>{d.options.map((o) => <Chip key={o} label={o} accent={accent} on={(f[d.key]?.selected || []).includes(o)} onPress={() => toggle(d, o)} />)}</View>
          <TextInput style={s.input} placeholder={d.text ? '' : 'Comment (optional)'} multiline value={f[d.key]?.comment || ''}
            onChangeText={(t) => setF((p) => ({ ...p, [d.key]: { ...p[d.key], comment: t } }))} />
        </View>
      ))}
      <Text style={s.strong}>Overall risk level *</Text>
      <View style={s.chips}>{def.riskLevels.map((r) => <Chip key={r} label={r} accent={accent} on={risk === r} onPress={() => setRisk(r)} />)}</View>
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}><Link label="Cancel" accent={accent} onPress={onCancel} /><Btn label={busy ? 'Saving…' : 'Save exam'} accent={accent} disabled={busy || !risk} onPress={save} /></View>
    </View>
  );
}

// ── Diagnosis and treatment plan ─────────────────────────────────────────────

export function DiagnosisPlanMobile({ clientId, onSaved, accent = '#4f46e5' }) {
  const [dx, dxError, loadDx] = useLoad(`${base(clientId)}/diagnoses`);
  const [plan, , loadPlan] = useLoad(`${base(clientId)}/treatment-plan`);
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState('');
  const [primary, setPrimary] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);

  const add = async () => {
    setError('');
    try { await api(`${base(clientId)}/diagnoses`, { method: 'POST', body: { code, description: desc, primary } }); setCode(''); setDesc(''); setPrimary(false); loadDx(); onSaved && onSaved(); }
    catch (e) { setError(e?.message || 'Could not add.'); }
  };
  const patch = async (id, body) => {
    setError('');
    try { await api(`/api/v1/clinical-record/diagnoses/${id}`, { method: 'PATCH', body }); loadDx(); }
    catch (e) { setError(e?.message || 'Could not change it.'); }
  };

  if (!dx) return <Loading error={dxError} />;
  const cur = plan?.current;
  return (
    <View>
      <View style={s.card}>
        <Text style={s.title}>Diagnoses (ICD-10)</Text>
        {dx.length === 0 ? <EmptyStateMobile compact icon="Stethoscope" tone="blue" title="No diagnosis recorded" /> : dx.map((d) => (
          <View key={d.id} style={[s.row, d.status !== 'active' && { opacity: 0.6 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>{d.code} {d.description}{d.is_primary ? '  · Primary' : ''}{d.status !== 'active' ? `  · ${d.status.replace('_', ' ')}` : ''}</Text>
              <Text style={s.muted}>{d.onset_date ? `Since ${fmt(d.onset_date)}` : `Added ${fmt(d.created_at)}`} · {d.clinician_name}</Text>
              <View style={s.chips}>
                {d.status === 'active' && !d.is_primary ? <Link label="Make primary" accent={accent} onPress={() => patch(d.id, { primary: true })} /> : null}
                {d.status === 'active'
                  ? <><Link label="Resolved" accent={accent} onPress={() => patch(d.id, { status: 'resolved' })} /><Link label="Ruled out" accent={accent} onPress={() => patch(d.id, { status: 'ruled_out' })} /></>
                  : <Link label="Reactivate" accent={accent} onPress={() => patch(d.id, { status: 'active' })} />}
              </View>
            </View>
          </View>
        ))}
        <TextInput style={s.input} placeholder="Code, e.g. F33.1" autoCapitalize="characters" value={code} onChangeText={setCode} />
        <TextInput style={s.input} placeholder="Description" value={desc} onChangeText={setDesc} />
        <View style={s.chips}><Chip label="Primary diagnosis" accent={accent} on={primary} onPress={() => setPrimary(!primary)} /></View>
        <Btn label="Add diagnosis" accent={accent} disabled={!code || !desc} onPress={add} />
        <TouchableOpacity onPress={() => Linking.openURL('https://icd.who.int/browse10/2019/en')}>
          <Text style={[s.muted, { marginTop: 6 }]}>WHO ICD-10 codes, as NHIS uses them. Check a code in the WHO browser.</Text>
        </TouchableOpacity>
        {error ? <Text style={s.err}>{error}</Text> : null}
      </View>

      {editing ? <PlanFormMobile clientId={clientId} current={cur} accent={accent} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); loadPlan(); onSaved && onSaved(); }} /> : (
        <View style={s.card}>
          <View style={s.head}><Text style={s.title}>Treatment plan{cur ? ` · v${cur.version}` : ''}</Text><Btn label={cur ? 'Update' : 'Write plan'} accent={accent} onPress={() => setEditing(true)} /></View>
          {!cur ? <EmptyStateMobile compact icon="PrescriptionDocument" tone="teal" title="No treatment plan yet" /> : (
            <>
              {cur.reviewDue ? <Text style={s.err}>The review date ({fmt(cur.review_date)}) has come. Review and update the plan.</Text> : null}
              <Text style={s.detail}><Text style={s.strong}>Presenting problem: </Text>{cur.presenting_problem}</Text>
              {(cur.goals || []).map((g, i) => (
                <View key={i} style={[s.row, g.status !== 'open' && { opacity: 0.6 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.strong}>{i + 1}. {g.goal}{g.status !== 'open' ? ` (${g.status})` : ''}</Text>
                    {g.objectives ? <Text style={s.muted}>Objectives: {g.objectives}</Text> : null}
                    {g.interventions ? <Text style={s.muted}>Interventions: {g.interventions}</Text> : null}
                    {g.targetDate ? <Text style={s.muted}>Target {fmt(g.targetDate)}</Text> : null}
                  </View>
                </View>
              ))}
              <Text style={s.muted}>{cur.frequency ? `${cur.frequency} · ` : ''}{cur.review_date ? `Review ${fmt(cur.review_date)} · ` : ''}Saved {fmt(cur.created_at)} by {cur.clinician_name}</Text>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const emptyGoal = () => ({ goal: '', objectives: '', interventions: '', targetDate: '', status: 'open' });

function PlanFormMobile({ clientId, current, accent, onCancel, onSaved }) {
  const [problem, setProblem] = useState(current?.presenting_problem || '');
  const [goals, setGoals] = useState(current?.goals?.length ? current.goals.map((g) => ({ ...emptyGoal(), ...g, targetDate: g.targetDate || '' })) : [emptyGoal()]);
  const [frequency, setFrequency] = useState(current?.frequency || '');
  const [reviewDate, setReviewDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setGoal = (i, k, v) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const save = async () => {
    setBusy(true); setError('');
    try { await api(`${base(clientId)}/treatment-plan`, { method: 'POST', body: { presentingProblem: problem, goals, frequency, reviewDate } }); onSaved(); }
    catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>{current ? `Update plan (saves v${current.version + 1})` : 'Write treatment plan'}</Text>
      <TextInput style={[s.input, { minHeight: 60 }]} multiline placeholder="Presenting problem" value={problem} onChangeText={setProblem} />
      {goals.map((g, i) => (
        <View key={i} style={s.domain}>
          <Text style={s.strong}>Goal {i + 1}</Text>
          <TextInput style={s.input} placeholder="Goal" value={g.goal} onChangeText={(t) => setGoal(i, 'goal', t)} />
          <TextInput style={s.input} placeholder="Objectives" value={g.objectives || ''} onChangeText={(t) => setGoal(i, 'objectives', t)} />
          <TextInput style={s.input} placeholder="Interventions" value={g.interventions || ''} onChangeText={(t) => setGoal(i, 'interventions', t)} />
          <TextInput style={s.input} placeholder="Target date (YYYY-MM-DD)" value={g.targetDate || ''} onChangeText={(t) => setGoal(i, 'targetDate', t)} />
          <View style={s.chips}>
            {['open', 'met', 'dropped'].map((st) => <Chip key={st} label={st} accent={accent} on={g.status === st} onPress={() => setGoal(i, 'status', st)} />)}
            {goals.length > 1 ? <Link label="Remove" accent={accent} onPress={() => setGoals((gs) => gs.filter((_, j) => j !== i))} /> : null}
          </View>
        </View>
      ))}
      <Link label="+ Add goal" accent={accent} onPress={() => setGoals((gs) => [...gs, emptyGoal()])} />
      <TextInput style={s.input} placeholder="Session frequency, e.g. weekly" value={frequency} onChangeText={setFrequency} />
      <TextInput style={s.input} placeholder="Review date (YYYY-MM-DD)" value={reviewDate} onChangeText={setReviewDate} />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}><Link label="Cancel" accent={accent} onPress={onCancel} /><Btn label={busy ? 'Saving…' : 'Save plan'} accent={accent} disabled={busy || !problem.trim()} onPress={save} /></View>
    </View>
  );
}

// ── Private notes ────────────────────────────────────────────────────────────

export function PrivateNotesMobile({ clientId, accent = '#4f46e5' }) {
  const [notes, error, load] = useLoad(`${base(clientId)}/private-notes`);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (editing) await api(`/api/v1/clinical-record/private-notes/${editing}`, { method: 'PUT', body: { body: text } });
      else await api(`${base(clientId)}/private-notes`, { method: 'POST', body: { body: text } });
      setText(''); setEditing(null); load();
    } catch (e) { setErr(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };
  return (
    <View style={s.card}>
      <Text style={s.title}>Private psychotherapy notes</Text>
      <Text style={s.private}>Only you can read these. The client, other clinicians, the AI assistant, exports and transfers never see them.</Text>
      <TextInput style={[s.input, { minHeight: 90 }]} multiline placeholder="Your process notes, impressions, hypotheses…" value={text} onChangeText={setText} />
      {err ? <Text style={s.err}>{err}</Text> : null}
      <View style={s.actions}>
        {editing ? <Link label="Cancel edit" accent={accent} onPress={() => { setEditing(null); setText(''); }} /> : null}
        <Btn label={busy ? 'Saving…' : editing ? 'Save changes' : 'Add private note'} accent={accent} disabled={busy || !text.trim()} onPress={save} />
      </View>
      {!notes ? <Text style={s.muted}>{error || 'Loading…'}</Text> : notes.map((n) => (
        <View key={n.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.kind}>{fmtTime(n.created_at)}</Text>
            <Text style={s.detail}>{n.body}</Text>
          </View>
          <Link label="Edit" accent={accent} onPress={() => { setEditing(n.id); setText(n.body); }} />
        </View>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 6, flexShrink: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12.5, color: '#334155' },
  btn: { borderRadius: 9, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  link: { fontWeight: '700', fontSize: 13.5, paddingVertical: 6, marginRight: 10 },
  err: { color: '#b91c1c', fontSize: 13.5, marginTop: 6 },
  ok: { color: '#15803d', fontSize: 13.5, marginTop: 6 },
  muted: { color: '#64748b', fontSize: 13 },
  strong: { color: '#0f172a', fontWeight: '700', fontSize: 13.5 },
  detail: { color: '#334155', fontSize: 13.5, marginTop: 4 },
  kind: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  domain: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginTop: 6, color: '#0f172a' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 10 },
  gaps: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  gapsTitle: { color: '#92400e', fontWeight: '700', fontSize: 13.5 },
  private: { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', borderWidth: 1, color: '#4c1d95', borderRadius: 10, padding: 10, fontSize: 12.5, marginBottom: 6 },
});
