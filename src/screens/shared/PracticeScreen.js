import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity } from 'react-native';
import { api } from '../../services/apiClient';
import { s } from '../../components/PsychRecordMobile';

/*
 * Practice on mobile: waitlist, time off and session policies. Same endpoints as web.
 * Dates are typed as YYYY-MM-DD HH:MM in local time, to avoid a date-picker dependency.
 */

const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
function parseLocal(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec((text || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Chip({ on, label, onPress, accent }) {
  return (
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={[s.chip, on && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
      <Text style={[s.chipText, on && { color: accent, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function PracticeScreen({ role = 'THERAPIST', accent = '#4f46e5' }) {
  const clientsPath = role === 'DOCTOR' ? '/api/v1/doctors/me/patients' : '/api/v1/therapy-management/clients';
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Waitlist clientsPath={clientsPath} accent={accent} />
      <TimeOff accent={accent} />
      <Policies accent={accent} />
    </ScrollView>
  );
}

function Policies({ accent }) {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/v1/practice/settings').then(setSt).catch((e) => setMsg(e?.message || 'Could not load.')); }, []);
  const save = async (patch) => {
    const next = { ...st, ...patch };
    setSt(next); setMsg('');
    try { setSt(await api('/api/v1/practice/settings', { method: 'PUT', body: { cancelNoticeHours: next.cancelNoticeHours, smsReminders: next.smsReminders } })); setMsg('Saved.'); }
    catch (e) { setMsg(e?.message || 'Could not save.'); }
  };
  if (!st) return <View style={s.card}><Text style={s.muted}>{msg || 'Loading…'}</Text></View>;
  return (
    <View style={s.card}>
      <Text style={s.title}>Session policies</Text>
      <Text style={s.detail}>Clients must cancel or move a session at least:</Text>
      <View style={s.chips}>
        {[[null, `Default${st.platformNoticeHours ? ` (${st.platformNoticeHours}h)` : ''}`], [24, '24 hours'], [48, '48 hours'], [72, '72 hours']].map(([v, l]) => (
          <Chip key={String(v)} label={l} accent={accent} on={(st.cancelNoticeHours ?? null) === v} onPress={() => save({ cancelNoticeHours: v })} />
        ))}
      </View>
      <Text style={[s.muted, { marginTop: 6 }]}>You can ask for more notice than NessaHub's default, not less.</Text>
      <View style={s.chips}>
        <Chip label={st.smsReminders ? 'Day-before texts: on' : 'Day-before texts: off'} accent={accent} on={!!st.smsReminders} onPress={() => save({ smsReminders: !st.smsReminders })} />
      </View>
      {msg ? <Text style={msg === 'Saved.' ? s.ok : s.err}>{msg}</Text> : null}
    </View>
  );
}

function TimeOff({ accent }) {
  const [list, setList] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [clashes, setClashes] = useState(null);
  const [cancel, setCancel] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/api/v1/practice/time-off').then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const fromIso = parseLocal(from), toIso = parseLocal(to);

  useEffect(() => {
    setClashes(null);
    if (!fromIso || !toIso || new Date(toIso) <= new Date(fromIso)) return;
    api(`/api/v1/practice/time-off/clashes?startsAt=${encodeURIComponent(fromIso)}&endsAt=${encodeURIComponent(toIso)}`).then(setClashes).catch(() => {});
  }, [fromIso, toIso]);

  const add = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api('/api/v1/practice/time-off', { method: 'POST', body: { startsAt: fromIso, endsAt: toIso, reason, cancelSessions: cancel, notifyClients: true } });
      setMsg(`Time off saved.${r.cancelled ? ` ${r.cancelled} cancelled.` : ''}${r.refundsRequested ? ` ${r.refundsRequested} paid session(s) will be refunded in full.` : ''}`);
      setFrom(''); setTo(''); setReason(''); load();
    } catch (e) { setError(e?.message || 'Could not save.'); }
    finally { setBusy(false); }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>Time off</Text>
      <Text style={s.muted}>No one can book you during time off.</Text>
      <TextInput style={s.input} placeholder="From: YYYY-MM-DD HH:MM" value={from} onChangeText={setFrom} />
      <TextInput style={s.input} placeholder="To: YYYY-MM-DD HH:MM" value={to} onChangeText={setTo} />
      <TextInput style={s.input} placeholder="Reason (only you see it)" value={reason} onChangeText={setReason} />
      {clashes && clashes.length > 0 ? (
        <View style={[s.gaps, { marginTop: 8 }]}>
          <Text style={s.gapsTitle}>{clashes.length} session(s) already booked in this time</Text>
          {clashes.map((c) => <Text key={c.id} style={s.detail}>{fmtTime(c.at)} · {c.client_name || 'Client'}{c.paid ? ' · paid' : ''}</Text>)}
          <View style={s.chips}><Chip accent={accent} on={cancel} onPress={() => setCancel(!cancel)} label={cancel ? 'Cancel them and tell the clients' : 'Keep them booked'} /></View>
        </View>
      ) : null}
      {msg ? <Text style={s.ok}>{msg}</Text> : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <TouchableOpacity style={[s.btn, { backgroundColor: accent }, (busy || !fromIso || !toIso) && { opacity: 0.5 }]} disabled={busy || !fromIso || !toIso} onPress={add}>
        <Text style={s.btnText}>{busy ? 'Saving…' : 'Add time off'}</Text>
      </TouchableOpacity>
      {list.map((t) => (
        <View key={t.id} style={s.row}>
          <Text style={[s.detail, { flex: 1, marginTop: 0 }]}>{fmtTime(t.starts_at)} to {fmtTime(t.ends_at)}{t.reason ? ` · ${t.reason}` : ''}</Text>
          <TouchableOpacity onPress={() => api(`/api/v1/practice/time-off/${t.id}`, { method: 'DELETE' }).then(load).catch(() => {})}>
            <Text style={[s.link, { color: accent }]}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

function Waitlist({ clientsPath, accent }) {
  const [list, setList] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [times, setTimes] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/api/v1/practice/waitlist').then((l) => setList(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  useEffect(() => {
    load();
    api(clientsPath).then((rows) => setClients((Array.isArray(rows) ? rows : []).map((c) => ({ id: c.id, name: c.fullName || c.name || c.email || 'Client' })))).catch(() => {});
  }, [load, clientsPath]);
  const act = async (fn) => { setError(''); try { await fn(); load(); } catch (e) { setError(e?.message || 'Could not do that.'); } };
  const waiting = new Set(list.map((w) => String(w.client_id)));
  return (
    <View style={s.card}>
      <Text style={s.title}>Waitlist</Text>
      {list.length === 0 ? <Text style={s.muted}>No one is waiting.</Text> : list.map((w) => (
        <View key={w.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>{w.client_name}</Text>
            <Text style={s.muted}>{w.preferred_times || 'Any time'} · {w.status === 'offered' ? `offered ${fmtTime(w.offered_at)}` : 'waiting'}</Text>
            <View style={s.chips}>
              <TouchableOpacity onPress={() => act(() => api(`/api/v1/practice/waitlist/${w.id}/offer`, { method: 'POST', body: {} }))}><Text style={[s.link, { color: accent }]}>Offer a slot</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => act(() => api(`/api/v1/practice/waitlist/${w.id}/close`, { method: 'POST', body: { status: 'booked' } }))}><Text style={[s.link, { color: accent }]}>Booked</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => act(() => api(`/api/v1/practice/waitlist/${w.id}/close`, { method: 'POST', body: { status: 'removed' } }))}><Text style={[s.link, { color: accent }]}>Remove</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      ))}
      <Text style={[s.muted, { marginTop: 10 }]}>Add a client</Text>
      <View style={s.chips}>
        {clients.filter((c) => !waiting.has(String(c.id))).slice(0, 30).map((c) => (
          <Chip key={c.id} label={c.name} accent={accent} on={clientId === c.id} onPress={() => setClientId(clientId === c.id ? '' : c.id)} />
        ))}
      </View>
      <TextInput style={s.input} placeholder="Preferred times, e.g. weekday mornings" value={times} onChangeText={setTimes} />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <TouchableOpacity style={[s.btn, { backgroundColor: accent }, !clientId && { opacity: 0.5 }]} disabled={!clientId}
        onPress={() => act(async () => { await api('/api/v1/practice/waitlist', { method: 'POST', body: { clientId, preferredTimes: times } }); setClientId(''); setTimes(''); })}>
        <Text style={s.btnText}>Add to waitlist</Text>
      </TouchableOpacity>
    </View>
  );
}
