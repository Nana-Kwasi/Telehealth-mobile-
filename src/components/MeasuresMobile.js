import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Rect, Polyline, Circle, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { api } from '../services/apiClient';

/*
 * Scored measures (PHQ-9, GAD-7) on mobile. Same endpoints and wording as web.
 *  - MeasuresPanelMobile: the clinician's Measures tab on a client.
 *  - MyQuestionnairesMobile: the client's "questionnaires to fill in" card.
 */

const BAND_COLOURS = {
  minimal: '#dcfce7', mild: '#fef9c3', moderate: '#fde68a', moderately_severe: '#fed7aa', severe: '#fecaca',
};
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');
const signed = (n) => (n == null ? '—' : n > 0 ? `+${n}` : String(n));
function changeText(n, meaningful) {
  if (n == null) return 'First score';
  if (n === 0) return 'No change';
  const dir = n < 0 ? 'better' : 'worse';
  return `${signed(n)} (${Math.abs(n) >= meaningful ? 'meaningfully' : 'slightly'} ${dir})`;
}

const REPEATS = [{ v: null, l: 'Once' }, { v: 7, l: 'Weekly' }, { v: 14, l: '2 weeks' }, { v: 28, l: '4 weeks' }];

// ── Clinician ────────────────────────────────────────────────────────────────

export function MeasuresPanelMobile({ clientId, accent = '#4f46e5' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [measure, setMeasure] = useState('PHQ9');
  const [repeat, setRepeat] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');

  const load = useCallback(() => {
    api(`/api/v1/measures/clients/${clientId}`).then(setData).catch((e) => setError(e?.message || 'Could not load measures.'));
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setBusy(true); setError(''); setSent('');
    try {
      await api('/api/v1/measures/requests', { method: 'POST', body: { clientId, measure, repeatEveryDays: repeat } });
      setSent('Sent. The client has been notified.');
      load();
    } catch (e) {
      setError(e?.message || 'Could not send.');
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id) => {
    try { await api(`/api/v1/measures/requests/${id}`, { method: 'DELETE' }); load(); }
    catch (e) { setError(e?.message || 'Could not stop it.'); }
  };

  if (!data) return <View style={s.card}>{error ? <Text style={s.err}>{error}</Text> : <ActivityIndicator />}</View>;
  const defs = Object.fromEntries(data.measures.map((m) => [m.code, m]));

  return (
    <View>
      <View style={s.card}>
        <Text style={s.title}>Send a questionnaire</Text>
        <View style={s.chips}>
          {data.measures.map((m) => (
            <Chip key={m.code} on={measure === m.code} accent={accent} label={`${m.name} · ${m.purpose}`} onPress={() => setMeasure(m.code)} />
          ))}
        </View>
        <View style={s.chips}>
          {REPEATS.map((r) => <Chip key={String(r.v)} on={repeat === r.v} accent={accent} label={r.l} onPress={() => setRepeat(r.v)} />)}
        </View>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }, busy && { opacity: 0.5 }]} onPress={send} disabled={busy}>
          <Text style={s.btnText}>{busy ? 'Sending…' : 'Send'}</Text>
        </TouchableOpacity>
        {sent ? <Text style={s.ok}>{sent}</Text> : null}
        {error ? <Text style={s.err}>{error}</Text> : null}
        {data.pending.map((p) => (
          <View key={p.id} style={s.row}>
            <Text style={s.rowText}>
              <Text style={{ fontWeight: '700' }}>{defs[p.measure]?.name}</Text>
              {new Date(p.available_from) > new Date() ? ` · next due ${fmtDate(p.available_from)}` : ' · waiting for the client'}
              {p.repeat_every_days ? ` · every ${p.repeat_every_days} days` : ''}
            </Text>
            <TouchableOpacity onPress={() => stop(p.id)}><Text style={[s.link, { color: accent }]}>Stop</Text></TouchableOpacity>
          </View>
        ))}
      </View>
      {data.measures.map((m) => <History key={m.code} def={m} rows={data.results[m.code] || []} />)}
    </View>
  );
}

function Chip({ on, label, onPress, accent }) {
  return (
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={[s.chip, on && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
      <Text style={[s.chipText, on && { color: accent, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function History({ def, rows }) {
  const last = rows[rows.length - 1];
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>{def.name} · {def.purpose}</Text>
        {last ? <Text style={[s.band, { backgroundColor: BAND_COLOURS[last.severity] || '#f1f5f9' }]}>{last.score}/{def.maxScore} · {last.severityLabel}</Text> : null}
      </View>
      {rows.length === 0 ? <Text style={s.muted}>No results yet.</Text> : (
        <>
          <Text style={s.muted}>Since first: <Text style={s.strong}>{changeText(last.changeFromBaseline, def.meaningfulChange)}</Text></Text>
          <Text style={s.muted}>Since last: <Text style={s.strong}>{changeText(last.changeFromLast, def.meaningfulChange)}</Text></Text>
          <ScoreChart def={def} rows={rows} />
          {[...rows].reverse().map((r) => (
            <View key={r.id} style={s.row}>
              <Text style={s.rowText}>{fmtDate(r.completed_at)} · {r.score} · {r.severityLabel}</Text>
              {r.safety_flag ? <Text style={s.flag}>Self-harm item answered</Text> : <Text style={s.muted}>{signed(r.changeFromLast)}</Text>}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

function ScoreChart({ def, rows }) {
  const [w, setW] = useState(0);
  const h = 160, padL = 24, padR = 10, padT = 8, padB = 18;
  const innerW = Math.max(1, w - padL - padR), innerH = h - padT - padB;
  const y = (v) => padT + innerH - (v / def.maxScore) * innerH;
  const x = (i) => padL + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  return (
    <View style={{ marginVertical: 8 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={h}>
          {def.bands.map((b) => (
            <Rect key={b.key} x={padL} width={innerW} y={y(Math.min(b.to + 1, def.maxScore))}
              height={y(b.from) - y(Math.min(b.to + 1, def.maxScore))} fill={BAND_COLOURS[b.key]} opacity={0.6} />
          ))}
          <SvgLine x1={padL} x2={padL} y1={padT} y2={padT + innerH} stroke="#cbd5e1" />
          {[0, def.maxScore].map((v) => (
            <SvgText key={v} x={padL - 4} y={y(v) + 4} fontSize="10" fill="#64748b" textAnchor="end">{v}</SvgText>
          ))}
          {rows.length > 1 && (
            <Polyline points={rows.map((r, i) => `${x(i)},${y(r.score)}`).join(' ')} fill="none" stroke="#4f46e5" strokeWidth="2" />
          )}
          {rows.map((r, i) => <Circle key={r.id} cx={x(i)} cy={y(r.score)} r="4" fill="#4f46e5" />)}
          <SvgText x={padL} y={h - 4} fontSize="10" fill="#64748b">{fmtDate(rows[0].completed_at)}</SvgText>
          {rows.length > 1 && (
            <SvgText x={padL + innerW} y={h - 4} fontSize="10" fill="#64748b" textAnchor="end">{fmtDate(rows[rows.length - 1].completed_at)}</SvgText>
          )}
        </Svg>
      )}
    </View>
  );
}

// ── Client ───────────────────────────────────────────────────────────────────

export function MyQuestionnairesMobile({ accent = '#4f46e5' }) {
  const [due, setDue] = useState([]);
  const [open, setOpen] = useState(null);
  const [done, setDone] = useState(null);

  const load = useCallback(() => {
    api('/api/v1/measures/mine').then((d) => setDue(d.due || [])).catch(() => setDue([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (done) {
    return (
      <View style={s.card}>
        <Text style={s.ok}>Thank you. Your answers have been sent to your clinician.</Text>
        {done.crisisMessage ? <Text style={s.crisis} accessibilityRole="alert">{done.crisisMessage}</Text> : null}
        <TouchableOpacity onPress={() => { setDone(null); load(); }}><Text style={[s.link, { color: accent }]}>Close</Text></TouchableOpacity>
      </View>
    );
  }
  if (open) return <Questionnaire req={open} accent={accent} onCancel={() => setOpen(null)} onDone={(r) => { setOpen(null); setDone(r); }} />;
  if (due.length === 0) return null;

  return (
    <View style={s.card}>
      <Text style={s.title}>Questionnaires to fill in</Text>
      {due.map((q) => (
        <View key={q.id} style={s.row}>
          <Text style={s.rowText}><Text style={{ fontWeight: '700' }}>{q.definition.name}</Text> from {q.clinician_name || 'your clinician'} · about 2 minutes</Text>
          <TouchableOpacity style={[s.btnSmall, { backgroundColor: accent }]} onPress={() => setOpen(q)}>
            <Text style={s.btnText}>Start</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function Questionnaire({ req, accent, onCancel, onDone }) {
  const def = req.definition;
  const [answers, setAnswers] = useState(() => def.items.map(() => null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const complete = answers.every((a) => a != null);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      onDone(await api(`/api/v1/measures/requests/${req.id}/submit`, { method: 'POST', body: { answers } }));
    } catch (e) {
      setError(e?.message || 'Could not send your answers.');
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>{def.name}</Text>
      <Text style={s.muted}>{def.stem}</Text>
      {def.items.map((item, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          <Text style={s.item}>{i + 1}. {item}</Text>
          <View style={s.chips}>
            {def.scale.map((label, v) => (
              <Chip key={v} on={answers[i] === v} accent={accent} label={label}
                onPress={() => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} />
            ))}
          </View>
        </View>
      ))}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}>
        <TouchableOpacity onPress={onCancel} disabled={busy}><Text style={[s.link, { color: accent }]}>Later</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btnSmall, { backgroundColor: accent }, (!complete || busy) && { opacity: 0.5 }]}
          onPress={submit} disabled={!complete || busy}>
          <Text style={s.btnText}>{busy ? 'Sending…' : 'Send answers'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 12 },
  title: { fontSize: 15, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12.5, color: '#334155' },
  btn: { borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  btnSmall: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  link: { fontWeight: '700', fontSize: 13.5, paddingVertical: 6 },
  ok: { color: '#15803d', fontSize: 13.5, marginTop: 6 },
  err: { color: '#b91c1c', fontSize: 13.5, marginTop: 6 },
  muted: { color: '#64748b', fontSize: 13 },
  strong: { color: '#0f172a', fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  rowText: { flex: 1, fontSize: 13.5, color: '#334155' },
  band: { fontSize: 12, fontWeight: '700', color: '#334155', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  flag: { color: '#b91c1c', fontWeight: '700', fontSize: 12 },
  crisis: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, color: '#991b1b', borderRadius: 10, padding: 12, fontWeight: '700', marginTop: 10 },
  item: { fontSize: 14, color: '#0f172a' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginTop: 14 },
});
