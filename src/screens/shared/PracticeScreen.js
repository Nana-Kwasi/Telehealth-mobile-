import { CalendarDays, CalendarOff, Users, ShieldCheck, Megaphone, TrendingUp } from 'lucide-react-native';
import EmptyStateMobile, { IconBubbleMobile, IconHeadingMobile } from '../../components/EmptyStateMobile';
import { usePlatformFeatures, featureOn } from '../../utils/platformFeatures';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Share, Linking } from 'react-native';
import { api, API_BASE } from '../../services/apiClient';
import { s } from '../../components/PsychRecordMobile';
import { TemplatesMobile } from '../../components/TemplatesMobile';

/*
 * Practice on mobile: goals, waitlist, time off, policies, calendar sync,
 * announcements and templates. Same endpoints as web.
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
  const features = usePlatformFeatures();
  const clientsPath = role === 'DOCTOR' ? '/api/v1/doctors/me/patients' : '/api/v1/therapy-management/clients';
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Goals accent={accent} />
      <Waitlist clientsPath={clientsPath} accent={accent} />
      <TimeOff accent={accent} />
      <Policies accent={accent} features={features} />
      {featureOn(features, 'calendarSync') ? <CalendarSync accent={accent} /> : null}
      {featureOn(features, 'practiceAnnouncements') ? <Announcements clientsPath={clientsPath} accent={accent} /> : null}
      {featureOn(features, 'customTemplates') ? <TemplatesMobile accent={accent} /> : null}
    </ScrollView>
  );
}

function Policies({ accent, features = {} }) {
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/v1/practice/settings').then(setSt).catch((e) => setMsg(e?.message || 'Could not load.')); }, []);
  const save = async (patch) => {
    const next = { ...st, ...patch };
    setSt(next); setMsg('');
    try { setSt(await api('/api/v1/practice/settings', { method: 'PUT', body: { cancelNoticeHours: next.cancelNoticeHours, smsReminders: next.smsReminders } })); setMsg('Saved.'); }
    catch (e) { setMsg(e?.message || 'Could not save.'); }
  };
  const automate = async (patch) => {
    setSt({ ...st, ...patch }); setMsg('');
    try { setSt(await api('/api/v1/practice/settings/automation', { method: 'PUT', body: patch })); setMsg('Saved.'); }
    catch (e) { setMsg(e?.message || 'Could not save.'); }
  };
  if (!st) return <View style={s.card}><Text style={s.muted}>{msg || 'Loading…'}</Text></View>;
  return (
    <View style={s.card}>
      <IconHeadingMobile icon={ShieldCheck} tone="teal">Session policies</IconHeadingMobile>
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
      {featureOn(features, 'waitlistAutoOffers') || featureOn(features, 'reminderCalls') ? <Text style={[s.kind, { marginTop: 12 }]}>Automatic help</Text> : null}
      {featureOn(features, 'waitlistAutoOffers') ? <>
      <View style={s.chips}>
        <Chip label={st.autoOfferWaitlist ? 'Offer cancelled times to my waitlist: on' : 'Offer cancelled times to my waitlist: off'} accent={accent}
          on={!!st.autoOfferWaitlist} onPress={() => automate({ autoOfferWaitlist: !st.autoOfferWaitlist })} />
      </View>
      <Text style={[s.muted, { marginTop: 4 }]}>The person who has waited longest is told. Not when the time is only a few hours away, in your time off, or booked again.</Text>
      </> : null}
      {featureOn(features, 'reminderCalls') ? <>
      <View style={s.chips}>
        <Chip label={st.voiceReminders ? 'Reminder calls the day before: on' : 'Reminder calls the day before: off'} accent={accent}
          on={!!st.voiceReminders} onPress={() => automate({ voiceReminders: !st.voiceReminders })} />
      </View>
      <Text style={[s.muted, { marginTop: 4 }]}>
        The call names neither you nor the service, and is never placed between 8 pm and 8 am.
        {st.voiceAvailable ? '' : ' Reminder calls are not switched on for NessaHub yet, so nothing is dialled until they are.'}
      </Text>
      </> : null}
      {msg ? <Text style={msg === 'Saved.' ? s.ok : s.err}>{msg}</Text> : null}
    </View>
  );
}

const money = (n) => `GH₵ ${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (a, b) => (b ? Math.min(100, Math.round((Number(a) / Number(b)) * 100)) : 0);

function Bar({ value, accent }) {
  return (
    <View style={{ height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginTop: 6 }}
      accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: value }}>
      <View style={{ width: `${value}%`, height: '100%', backgroundColor: accent, borderRadius: 999 }} />
    </View>
  );
}

function Goals({ accent }) {
  const [g, setG] = useState(null);
  const [edit, setEdit] = useState(false);
  const [target, setTarget] = useState('');
  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api('/api/v1/practice/goals').then((r) => { setG(r); setTarget(r.weeklySessionTarget ? String(r.weeklySessionTarget) : ''); setGoal(r.monthlyIncomeGoal ? String(r.monthlyIncomeGoal) : ''); })
      .catch((e) => setError(e?.message || 'Could not load.'));
  }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    setError('');
    try {
      setG(await api('/api/v1/practice/goals', { method: 'PUT', body: { weeklySessionTarget: target.trim() ? Number(target) : null, monthlyIncomeGoal: goal.trim() ? Number(goal) : null } }));
      setEdit(false);
    } catch (e) { setError(e?.message || 'Could not save.'); }
  };
  if (!g) return <View style={s.card}><Text style={s.muted}>{error || 'Loading…'}</Text></View>;
  return (
    <View style={s.card}>
      <IconHeadingMobile icon={TrendingUp} tone="rose">This week and this month</IconHeadingMobile>
      <View style={s.domain}>
        <Text style={s.muted}>Sessions this week</Text>
        <Text style={[s.title, { fontSize: 20, marginBottom: 0 }]}>{g.sessionsThisWeek}{g.weeklySessionTarget ? ` of ${g.weeklySessionTarget}` : ''}</Text>
        {g.weeklySessionTarget ? <Bar value={pct(g.sessionsThisWeek, g.weeklySessionTarget)} accent={accent} /> : null}
      </View>
      <View style={s.domain}>
        <Text style={s.muted}>Active clients</Text>
        <Text style={[s.title, { fontSize: 20, marginBottom: 0 }]}>{g.activeClients}</Text>
      </View>
      <View style={s.domain}>
        <Text style={s.muted}>Earned this month</Text>
        <Text style={[s.title, { fontSize: 20, marginBottom: 0 }]}>{money(g.earnedThisMonth)}</Text>
        {g.monthlyIncomeGoal ? <><Bar value={pct(g.earnedThisMonth, g.monthlyIncomeGoal)} accent={accent} /><Text style={s.muted}>Goal {money(g.monthlyIncomeGoal)}</Text></> : null}
        <Text style={s.muted}>Last month {money(g.earnedLastMonth)}</Text>
      </View>
      <Text style={s.muted}>Earnings are after NessaHub's commission and any refunds. Weeks run Monday to Sunday.</Text>
      {edit ? (
        <>
          <TextInput style={s.input} keyboardType="number-pad" placeholder="Sessions a week (1 to 100)" value={target} onChangeText={setTarget} />
          <TextInput style={s.input} keyboardType="decimal-pad" placeholder="Monthly income goal (GH₵)" value={goal} onChangeText={setGoal} />
          <View style={s.actions}>
            <TouchableOpacity onPress={() => setEdit(false)}><Text style={[s.link, { color: accent }]}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={save}><Text style={s.btnText}>Save</Text></TouchableOpacity>
          </View>
        </>
      ) : (
        <TouchableOpacity onPress={() => setEdit(true)}><Text style={[s.link, { color: accent, marginTop: 6 }]}>Set my goals</Text></TouchableOpacity>
      )}
      {error ? <Text style={s.err}>{error}</Text> : null}
    </View>
  );
}

function CalendarSync({ accent }) {
  const [st, setSt] = useState(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const run = async (fn) => { setError(''); try { await fn(); } catch (e) { setError(e?.message || 'Could not do that.'); } };
  useEffect(() => {
    api('/api/v1/practice/settings').then((r) => {
      setSt(r);
      if (r.calendarOn) api('/api/v1/practice/calendar', { method: 'POST', body: {} }).then((x) => setPath(x.path)).catch(() => {});
    }).catch((e) => setError(e?.message || 'Could not load.'));
  }, []);
  const url = path ? `${API_BASE}${path}` : '';
  if (!st) return <View style={s.card}><Text style={s.muted}>{error || 'Loading…'}</Text></View>;
  return (
    <View style={s.card}>
      <IconHeadingMobile icon={CalendarDays} tone="blue">Calendar sync</IconHeadingMobile>
      <Text style={s.muted}>See your sessions in Google, Outlook or Apple Calendar. One way: make changes in NessaHub, and your calendar updates within a few hours.</Text>
      {!path ? (
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }]}
          onPress={() => run(async () => { const r = await api('/api/v1/practice/calendar', { method: 'POST', body: {} }); setPath(r.path); setSt({ ...st, calendarOn: true }); })}>
          <Text style={s.btnText}>Get my calendar link</Text>
        </TouchableOpacity>
      ) : (
        <>
          <Text selectable style={[s.detail, { backgroundColor: '#f1f5f9', borderRadius: 8, padding: 8, fontSize: 12 }]}>{url}</Text>
          <View style={s.chips}>
            <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={() => Share.share({ message: url }).catch(() => {})}>
              <Text style={s.btnText}>Share or copy link</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => Linking.openURL(url.replace(/^https?:/, 'webcal:')).catch(() => setError('No calendar app opened the link. Copy it instead.'))}>
              <Text style={[s.link, { color: accent }]}>Add to this phone's calendar</Text>
            </TouchableOpacity>
          </View>
          <Text style={[s.muted, { marginTop: 6 }]}>Google Calendar: on a computer, Other calendars › + › From URL. Outlook: Add calendar › Subscribe from web.</Text>
          <View style={s.chips}>
            <Chip accent={accent} on={!!st.calendarShowInitials} label={st.calendarShowInitials ? "Showing clients' initials" : 'Events say only “NessaHub session”'}
              onPress={() => run(async () => setSt(await api('/api/v1/practice/calendar', { method: 'PUT', body: { showInitials: !st.calendarShowInitials } })))} />
          </View>
          <Text style={[s.muted, { marginTop: 6 }]}>Anyone with this link can see your session times. If it is shared by mistake, make a new one: the old link stops working.</Text>
          <View style={s.chips}>
            <TouchableOpacity onPress={() => run(async () => { const r = await api('/api/v1/practice/calendar', { method: 'POST', body: { regenerate: true } }); setPath(r.path); })}>
              <Text style={[s.link, { color: accent }]}>Make a new link</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => run(async () => { setSt(await api('/api/v1/practice/calendar', { method: 'DELETE' })); setPath(''); })}>
              <Text style={[s.link, { color: '#b91c1c' }]}>Turn off</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {error ? <Text style={s.err}>{error}</Text> : null}
    </View>
  );
}

function Announcements({ clientsPath, accent }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState([]);
  const [text, setText] = useState(false);
  const [clients, setClients] = useState([]);
  const [sent, setSent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/api/v1/practice/announcements').then((l) => setSent(Array.isArray(l) ? l : [])).catch(() => {}); }, []);
  useEffect(() => {
    load();
    api(clientsPath).then((rows) => setClients((Array.isArray(rows) ? rows : []).map((c) => ({ id: c.id, name: c.fullName || c.name || c.email || 'Client' })))).catch(() => {});
  }, [load, clientsPath]);
  const send = async () => {
    setBusy(true); setError(''); setMsg('');
    try {
      const r = await api('/api/v1/practice/announcements', { method: 'POST', body: { title, body, clientIds: everyone ? null : picked, sendText: text } });
      setMsg(`Sent to ${r.recipients} client${r.recipients === 1 ? '' : 's'}${text ? `, with ${r.texts} text${r.texts === 1 ? '' : 's'}` : ''}.`);
      setTitle(''); setBody(''); setPicked([]); load();
    } catch (e) { setError(e?.message || 'Could not send.'); }
    finally { setBusy(false); }
  };
  const ready = !busy && title.trim() && body.trim() && (everyone || picked.length > 0);
  return (
    <View style={s.card}>
      <IconHeadingMobile icon={Megaphone} tone="pink">Announcements</IconHeadingMobile>
      <Text style={s.muted}>One message to many clients, for practice news such as a closure or new hours. Up to 5 a day.</Text>
      <TextInput style={s.input} placeholder="Title, e.g. Closed on Friday" value={title} onChangeText={setTitle} maxLength={120} />
      <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline placeholder="Message" value={body} onChangeText={setBody} maxLength={1000} />
      <View style={s.chips}>
        <Chip accent={accent} on={everyone} label="All my clients" onPress={() => setEveryone(true)} />
        <Chip accent={accent} on={!everyone} label="Choose clients" onPress={() => setEveryone(false)} />
      </View>
      {!everyone ? (
        <View style={s.chips}>
          {clients.slice(0, 60).map((c) => (
            <Chip key={c.id} label={c.name} accent={accent} on={picked.includes(c.id)}
              onPress={() => setPicked(picked.includes(c.id) ? picked.filter((x) => x !== c.id) : [...picked, c.id])} />
          ))}
        </View>
      ) : null}
      <View style={s.chips}>
        <Chip accent={accent} on={text} onPress={() => setText(!text)} label={text ? 'Also text them (the text does not include the message)' : 'In the app only'} />
      </View>
      {msg ? <Text style={s.ok}>{msg}</Text> : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      <TouchableOpacity style={[s.btn, { backgroundColor: accent }, !ready && { opacity: 0.5 }]} disabled={!ready} onPress={send}>
        <Text style={s.btnText}>{busy ? 'Sending…' : 'Send'}</Text>
      </TouchableOpacity>
      {sent.map((a) => (
        <View key={a.id} style={s.row}>
          <Text style={[s.detail, { flex: 1, marginTop: 0 }]}>{a.title} · {fmtTime(a.created_at)} · {a.recipient_count} client{a.recipient_count === 1 ? '' : 's'}</Text>
        </View>
      ))}
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
      <IconHeadingMobile icon={CalendarOff} tone="amber">Time off</IconHeadingMobile>
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
      <IconHeadingMobile icon={Users} tone="sky">Waitlist</IconHeadingMobile>
      {list.length === 0 ? <EmptyStateMobile compact icon="Calendar" tone="sky" title="No one is waiting" /> : list.map((w) => (
        <View key={w.id} style={s.row}>
          <View style={{ flex: 1 }}>
            <Text style={s.strong}>{w.client_name}</Text>
            <Text style={s.muted}>{w.preferred_times || 'Any time'} · {w.status === 'offered' ? (w.offered_slot ? `offered the time ${fmtTime(w.offered_slot)}` : `offered a slot ${fmtTime(w.offered_at)}`) : 'waiting'}</Text>
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
