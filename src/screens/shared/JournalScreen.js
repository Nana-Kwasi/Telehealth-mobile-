import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Image, Alert, Dimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { LineChart } from 'react-native-chart-kit';
import { api, uploadFile, API_BASE } from '../../services/apiClient';
import { s } from '../../components/PsychRecordMobile';

/*
 * My Journal on mobile. Same endpoints as web, plus a Face ID / fingerprint
 * lock (kept on this phone only) and "Save as PDF" through the share sheet.
 */

export const AREAS = [['health', 'Health'], ['fitness', 'Fitness'], ['beauty', 'Beauty'], ['longevity', 'Longevity'], ['mind', 'Mind'], ['other', 'Other']];
export const MOODS = [[1, '😞', 'Very low'], [2, '🙁', 'Low'], [3, '😐', 'Okay'], [4, '🙂', 'Good'], [5, '😄', 'Great']];
export const MEASURES = [
  ['weightKg', 'Weight', 'kg'], ['steps', 'Steps', ''], ['sleepHours', 'Sleep', 'h'], ['waterLitres', 'Water', 'L'],
  ['systolic', 'BP top', 'mmHg'], ['diastolic', 'BP bottom', 'mmHg'], ['glucose', 'Blood sugar', 'mmol/L'],
];
const LOCK_KEY = 'nessa-journal-lock';
const areaLabel = (a) => (AREAS.find(([k]) => k === a) || [a, a])[1];
const moodOf = (m) => MOODS.find(([v]) => v === m);
const fmtDay = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const abs = (url) => (url && url.startsWith('/') ? `${API_BASE}${url}` : url);
const pad = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function Chip({ on, label, onPress, accent }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={[s.chip, on && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
      <Text style={[s.chipText, on && { color: accent, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function JournalTextMobile({ text }) {
  return (
    <View>
      {(text || '').split('\n').map((l, i) => {
        const check = /^\s*- \[( |x)\] (.*)$/i.exec(l);
        const bullet = /^\s*- (.*)$/.exec(l);
        const line = check ? `${check[1].toLowerCase() === 'x' ? '☑' : '☐'} ${check[2]}` : bullet ? `• ${bullet[1]}` : l;
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <Text key={i} style={[s.detail, { marginTop: 2 }]}>
            {parts.map((p, k) => (p.startsWith('**') && p.endsWith('**') && p.length > 4
              ? <Text key={k} style={{ fontWeight: '700' }}>{p.slice(2, -2)}</Text> : p))}
          </Text>
        );
      })}
    </View>
  );
}

export default function JournalScreen({ accent = '#4f46e5' }) {
  const navigation = useNavigation();
  const [locked, setLocked] = useState(null);
  const [lockOn, setLockOn] = useState(false);
  const [entries, setEntries] = useState(null);
  const [overview, setOverview] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState('');

  const unlock = useCallback(async () => {
    try {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock your journal' });
      if (r.success) setLocked(false);
    } catch (_) { setLocked(false); }
  }, []);
  useEffect(() => {
    (async () => {
      let on = false;
      try { on = (await SecureStore.getItemAsync(LOCK_KEY)) === '1'; } catch (_) { /* storage unavailable */ }
      setLockOn(on);
      if (on) { setLocked(true); unlock(); } else setLocked(false);
    })();
  }, [unlock]);

  const load = useCallback(() => {
    api(`/api/v1/journal/entries?limit=200${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`)
      .then((l) => setEntries(Array.isArray(l) ? l : [])).catch((e) => { setEntries([]); setError(e?.message || 'Could not load your journal.'); });
    api('/api/v1/journal/overview').then(setOverview).catch(() => {});
  }, [q]);
  useFocusEffect(useCallback(() => { if (locked === false) load(); }, [locked, load]));
  useEffect(() => {
    if (locked !== false) return;
    api('/api/v1/journal/programs').then((l) => setPrograms(Array.isArray(l) ? l : [])).catch(() => {});
    api('/api/v1/journal/settings').then(setSettings).catch(() => {});
  }, [locked]);

  const toggleLock = async () => {
    const has = await LocalAuthentication.hasHardwareAsync().catch(() => false);
    const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
    if (!lockOn && (!has || !enrolled)) { Alert.alert('Not available', 'Set up Face ID, Touch ID or a fingerprint on this phone first.'); return; }
    const next = !lockOn;
    try { await SecureStore.setItemAsync(LOCK_KEY, next ? '1' : '0'); setLockOn(next); } catch (_) { /* ignore */ }
  };

  const exportPdf = async () => {
    const list = entries || [];
    const html = `<html><head><meta name="viewport" content="width=device-width"/><style>body{font-family:-apple-system,Roboto,sans-serif;padding:24px;color:#0f172a}h1{font-size:22px}
      .e{border-top:1px solid #e2e8f0;padding:12px 0}.m{color:#64748b;font-size:12px}p{white-space:pre-wrap;margin:6px 0}</style></head><body>
      <h1>My NessaHub journal</h1><p class="m">${list.length} entries · saved ${esc(new Date().toLocaleDateString())}</p>
      ${list.map((e) => `<div class="e"><div class="m">${esc(fmtDay(e.entry_date))} · ${esc(areaLabel(e.area))}${e.mood ? ` · mood ${e.mood}/5` : ''}</div>
      ${e.title ? `<b>${esc(e.title)}</b>` : ''}<p>${esc(e.body)}</p>
      ${Object.keys(e.measures || {}).length ? `<div class="m">${esc(MEASURES.filter(([k]) => e.measures[k] !== undefined).map(([k, l, u]) => `${l} ${e.measures[k]} ${u}`).join(' · '))}</div>` : ''}</div>`).join('')}
      </body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e) { setError('The PDF could not be made.'); }
  };

  const saved = (r) => {
    setEditing(null);
    setAlert(r?.crisisMessage ? { crisis: true, text: r.crisisMessage + (r.careTeamTold ? ' Because you shared this entry, your care team has been told.' : ' This entry is private, so no one else was told.') }
      : r?.emergencyNote ? { crisis: false, text: r.emergencyNote } : null);
    load();
  };
  const program = async (code, join) => {
    try { setPrograms(await api(`/api/v1/journal/programs/${code}/${join ? 'join' : 'leave'}`, { method: 'POST', body: {} })); load(); }
    catch (e) { setError(e?.message || 'Could not do that.'); }
  };
  const remove = (id) => Alert.alert('Delete this entry?', 'It will be removed from your journal.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => api(`/api/v1/journal/entries/${id}`, { method: 'DELETE' }).then(load).catch((e) => setError(e?.message || 'Could not delete.')) },
  ]);
  const toCommunity = (e) => navigation.navigate(navigation.getState()?.routeNames?.includes('TherapyCommunity') ? 'TherapyCommunity' : 'MedicalCommunity',
    { draft: [e.title, e.body].filter(Boolean).join('\n\n').slice(0, 4000) });

  if (locked === null) return <View style={{ flex: 1 }} />;
  if (locked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={s.title}>Your journal is locked</Text>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={unlock}><Text style={s.btnText}>Unlock</Text></TouchableOpacity>
      </View>
    );
  }
  if (editing) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <EditorMobile initial={editing} accent={accent} onCancel={() => setEditing(null)} onSaved={saved} />
      </ScrollView>
    );
  }

  const chartW = Dimensions.get('window').width - 60;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.title}>My Journal</Text>
        <Text style={s.muted}>Private to you, unless you share an entry with your care team.</Text>
        <View style={s.chips}>
          <TouchableOpacity style={[s.btn, { backgroundColor: accent }]} onPress={() => setEditing({ entry_date: todayStr(), area: 'health' })}><Text style={s.btnText}>New entry</Text></TouchableOpacity>
          <TouchableOpacity onPress={exportPdf}><Text style={[s.link, { color: accent }]}>Save as PDF</Text></TouchableOpacity>
          <TouchableOpacity onPress={toggleLock}><Text style={[s.link, { color: accent }]}>{lockOn ? 'Lock: on' : 'Lock with Face ID'}</Text></TouchableOpacity>
        </View>
      </View>
      {alert ? (
        <View style={[s.gaps, alert.crisis && { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={[s.gapsTitle, alert.crisis && { color: '#7f1d1d' }]}>{alert.crisis ? 'You do not have to go through this alone.' : 'Saved.'}</Text>
          <Text style={s.detail}>{alert.text}</Text>
          <TouchableOpacity onPress={() => setAlert(null)}><Text style={[s.link, { color: accent }]}>Close</Text></TouchableOpacity>
        </View>
      ) : null}
      {error ? <Text style={s.err}>{error}</Text> : null}

      {overview ? (
        <View style={[s.card, { flexDirection: 'row', justifyContent: 'space-around' }]}>
          <View style={{ alignItems: 'center' }}><Text style={[s.title, { fontSize: 22, marginBottom: 0 }]}>{overview.streakDays}</Text><Text style={s.muted}>days in a row</Text></View>
          <View style={{ alignItems: 'center' }}><Text style={[s.title, { fontSize: 22, marginBottom: 0 }]}>{overview.entriesThisMonth}</Text><Text style={s.muted}>this month</Text></View>
        </View>
      ) : null}

      {overview && overview.prompts.length ? (
        <View style={s.card}>
          <Text style={s.title}>Today's prompts</Text>
          {overview.prompts.map((p) => (
            <View key={p.programCode} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.muted}>{p.programTitle} · day {p.day} of {p.days}</Text>
                <Text style={s.detail}>{p.prompt}</Text>
              </View>
              {p.done ? <Text style={s.ok}>Done</Text> : (
                <TouchableOpacity onPress={() => setEditing({ entry_date: todayStr(), area: p.area, program_code: p.programCode, program_day: p.day, prompt: p.prompt })}>
                  <Text style={[s.link, { color: accent }]}>Write</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {overview && overview.mood.length > 1 ? (
        <View style={s.card}>
          <Text style={s.title}>Mood, last 30 days</Text>
          <LineChart
            data={{ labels: overview.mood.map((m, i) => (i % Math.ceil(overview.mood.length / 5) === 0 ? m.date.slice(8) : '')), datasets: [{ data: overview.mood.map((m) => Number(m.mood)) }] }}
            width={chartW} height={170} fromZero yAxisInterval={1} segments={4}
            chartConfig={{ backgroundGradientFrom: '#fff', backgroundGradientTo: '#fff', decimalPlaces: 0, color: (o = 1) => `rgba(79,70,229,${o})`, labelColor: () => '#64748b', propsForDots: { r: '3' } }}
            bezier style={{ marginLeft: -12 }}
          />
        </View>
      ) : null}

      {overview && overview.onThisDay.length ? (
        <View style={s.card}>
          <Text style={s.title}>On this day</Text>
          {overview.onThisDay.map((e) => <Text key={e.id} style={s.detail}><Text style={s.muted}>{e.when} · </Text>{e.title ? `${e.title}: ` : ''}{e.preview}</Text>)}
        </View>
      ) : null}

      <View style={s.card}>
        <TextInput style={s.input} placeholder="Search your journal" value={q} onChangeText={setQ} onSubmitEditing={load} returnKeyType="search" />
        {entries === null ? <Text style={s.muted}>Loading…</Text> : entries.length === 0 ? <Text style={[s.muted, { marginTop: 8 }]}>No entries yet. Start with how today went.</Text>
          : entries.map((e) => {
            const mood = moodOf(e.mood);
            const m = e.measures || {};
            return (
              <View key={e.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.muted}>{fmtDay(e.entry_date)} · {areaLabel(e.area)}{mood ? ` · ${mood[1]}` : ''}{e.shared_with_care ? ' · shared' : ''}</Text>
                  {e.title ? <Text style={s.strong}>{e.title}</Text> : null}
                  <JournalTextMobile text={e.body} />
                  {Object.keys(m).length ? <Text style={[s.muted, { color: '#0f766e', marginTop: 4 }]}>{MEASURES.filter(([k]) => m[k] !== undefined).map(([k, l, u]) => `${l} ${m[k]}${u ? ` ${u}` : ''}`).join(' · ')}</Text> : null}
                  {e.photos?.length ? (
                    <ScrollView horizontal style={{ marginTop: 6 }}>
                      {e.photos.map((p) => <Image key={p.id} source={{ uri: abs(p.url) }} style={{ width: 90, height: 90, borderRadius: 8, marginRight: 6 }} />)}
                    </ScrollView>
                  ) : null}
                  <View style={s.chips}>
                    <TouchableOpacity onPress={() => setEditing(e)}><Text style={[s.link, { color: accent }]}>Edit</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => toCommunity(e)}><Text style={[s.link, { color: accent }]}>Post to a group</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(e.id)}><Text style={[s.link, { color: '#b91c1c' }]}>Delete</Text></TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
      </View>

      <View style={s.card}>
        <Text style={s.title}>Guided programmes</Text>
        <Text style={s.muted}>A prompt a day for a week.</Text>
        {programs.map((p) => (
          <View key={p.code} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.strong}>{p.title}</Text>
              <Text style={s.muted}>{p.summary}{p.status === 'finished' ? ' · finished' : ''}</Text>
            </View>
            <TouchableOpacity onPress={() => program(p.code, p.status !== 'active')}>
              <Text style={[s.link, { color: accent }]}>{p.status === 'active' ? 'Stop' : p.status ? 'Start again' : 'Start'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {settings ? (
        <View style={s.card}>
          <Text style={s.title}>Daily reminder</Text>
          <View style={s.chips}>
            <Chip accent={accent} on={!!settings.reminderOn} label={settings.reminderOn ? 'On' : 'Off'}
              onPress={() => api('/api/v1/journal/settings', { method: 'PUT', body: { ...settings, reminderOn: !settings.reminderOn } }).then(setSettings).catch(() => {})} />
            {settings.reminderOn ? [8, 12, 18, 20, 21].map((h) => (
              <Chip key={h} accent={accent} on={settings.reminderHour === h} label={`${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`}
                onPress={() => api('/api/v1/journal/settings', { method: 'PUT', body: { ...settings, reminderHour: h } }).then(setSettings).catch(() => {})} />
            )) : null}
          </View>
          <Text style={[s.muted, { marginTop: 4 }]}>Only on days you have not written yet.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function EditorMobile({ initial, accent, onCancel, onSaved }) {
  const [date, setDate] = useState(initial.entry_date || todayStr());
  const [title, setTitle] = useState(initial.title || '');
  const [body, setBody] = useState(initial.body || '');
  const [mood, setMood] = useState(initial.mood || null);
  const [area, setArea] = useState(initial.area || 'health');
  const [tags, setTags] = useState((initial.tags || []).join(', '));
  const [photos, setPhotos] = useState(initial.photos || []);
  const [measures, setMeasures] = useState(() => Object.fromEntries(Object.entries(initial.measures || {}).map(([k, v]) => [k, String(v)])));
  const [showMeasures, setShowMeasures] = useState(Object.keys(initial.measures || {}).length > 0);
  const [shared, setShared] = useState(!!initial.shared_with_care);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const addPhoto = async (camera) => {
    if (photos.length >= 6) return;
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Permission needed', camera ? 'Allow camera access to take a photo.' : 'Allow access to your photos.'); return; }
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.7 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (r.canceled || !r.assets?.[0]) return;
    setUploading(true); setError('');
    try {
      const a = r.assets[0];
      const ext = (a.uri.split('.').pop() || 'jpg').toLowerCase();
      const up = await uploadFile(`journal/${Date.now()}.${ext}`, a.uri, a.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg'), { withMeta: true });
      if (up?.fileId) setPhotos((p) => [...p, { id: up.fileId, url: up.url }]);
    } catch (e) { setError('The photo could not be uploaded.'); }
    finally { setUploading(false); }
  };
  const insert = (prefix) => setBody((b) => `${b}${b && !b.endsWith('\n') ? '\n' : ''}${prefix}`);

  const save = async () => {
    setBusy(true); setError('');
    try {
      const r = await api(initial.id ? `/api/v1/journal/entries/${initial.id}` : '/api/v1/journal/entries', {
        method: initial.id ? 'PUT' : 'POST',
        body: {
          entryDate: date, title, body, mood, area, tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          photoIds: photos.map((p) => p.id), measures: Object.fromEntries(Object.entries(measures).filter(([, v]) => String(v).trim() !== '')),
          programCode: initial.program_code || null, programDay: initial.program_day || null, sharedWithCare: shared,
        },
      });
      onSaved(r);
    } catch (e) { setError(e?.message || 'Could not save.'); setBusy(false); }
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>{initial.id ? 'Edit entry' : 'New entry'}</Text>
      {initial.prompt ? <Text style={[s.detail, { backgroundColor: '#eef2ff', padding: 8, borderRadius: 8, color: '#3730a3' }]}>{initial.prompt}</Text> : null}
      <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="Date YYYY-MM-DD" autoCapitalize="none" />
      <View style={s.chips}>{AREAS.map(([k, l]) => <Chip key={k} label={l} accent={accent} on={area === k} onPress={() => setArea(k)} />)}</View>
      <Text style={[s.muted, { marginTop: 10 }]}>How do you feel?</Text>
      <View style={s.chips}>
        {MOODS.map(([v, e, l]) => (
          <TouchableOpacity key={v} accessibilityLabel={l} accessibilityState={{ selected: mood === v }} onPress={() => setMood(mood === v ? null : v)}
            style={[s.chip, { paddingHorizontal: 8 }, mood === v && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput style={s.input} placeholder="Title (optional)" value={title} onChangeText={setTitle} maxLength={150} />
      <View style={s.chips}>
        <TouchableOpacity onPress={() => insert('- ')}><Text style={[s.link, { color: accent }]}>• List</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => insert('- [ ] ')}><Text style={[s.link, { color: accent }]}>☐ Checklist</Text></TouchableOpacity>
      </View>
      <TextInput style={[s.input, { minHeight: 160, textAlignVertical: 'top' }]} multiline value={body} onChangeText={setBody} maxLength={20000}
        placeholder="Write freely: how you feel, what you did, what you noticed." />
      <ScrollView horizontal style={{ marginTop: 8 }}>
        {photos.map((p) => (
          <TouchableOpacity key={p.id} onLongPress={() => setPhotos(photos.filter((x) => x.id !== p.id))} accessibilityHint="Long press to remove">
            <Image source={{ uri: abs(p.url) }} style={{ width: 80, height: 80, borderRadius: 8, marginRight: 6 }} />
          </TouchableOpacity>
        ))}
      </ScrollView>
      {photos.length ? <Text style={s.muted}>Long-press a photo to remove it.</Text> : null}
      <View style={s.chips}>
        <TouchableOpacity onPress={() => addPhoto(true)} disabled={uploading}><Text style={[s.link, { color: accent }]}>{uploading ? 'Uploading…' : '+ Take photo'}</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => addPhoto(false)} disabled={uploading}><Text style={[s.link, { color: accent }]}>+ From photos</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setShowMeasures(!showMeasures)}><Text style={[s.link, { color: accent }]}>{showMeasures ? 'Hide measurements' : '+ Measurements'}</Text></TouchableOpacity>
      </View>
      {showMeasures ? MEASURES.map(([k, l, u]) => (
        <TextInput key={k} style={s.input} keyboardType="decimal-pad" placeholder={`${l}${u ? ` (${u})` : ''}`} value={measures[k] || ''} onChangeText={(t) => setMeasures({ ...measures, [k]: t })} />
      )) : null}
      <TextInput style={s.input} placeholder="Tags, separated by commas" value={tags} onChangeText={setTags} autoCapitalize="none" />
      <View style={s.chips}>
        <Chip accent={accent} on={shared} onPress={() => setShared(!shared)} label={shared ? 'Shared with my care team' : 'Private (only me)'} />
      </View>
      {error ? <Text style={s.err}>{error}</Text> : null}
      <View style={s.actions}>
        <TouchableOpacity onPress={onCancel} disabled={busy}><Text style={[s.link, { color: accent }]}>Cancel</Text></TouchableOpacity>
        <TouchableOpacity style={[s.btn, { backgroundColor: accent }, (busy || uploading) && { opacity: 0.5 }]} disabled={busy || uploading} onPress={save}>
          <Text style={s.btnText}>{busy ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** A clinician's read-only view of entries the person shared. */
export function SharedJournalMobile({ clientId }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/v1/journal/clients/${clientId}`).then((l) => setList(Array.isArray(l) ? l : [])).catch((e) => { setList([]); setError(e?.message || 'Could not load.'); });
  }, [clientId]);
  return (
    <View style={s.card}>
      <Text style={s.title}>Journal entries shared with you</Text>
      <Text style={s.muted}>Their journal is private. You see only what they chose to share.</Text>
      {error ? <Text style={s.err}>{error}</Text> : null}
      {list === null ? <Text style={s.muted}>Loading…</Text> : list.length === 0 ? <Text style={[s.muted, { marginTop: 6 }]}>Nothing shared yet.</Text> : list.map((e) => (
        <View key={e.id} style={[s.row, e.safety_flag && { borderLeftWidth: 4, borderLeftColor: '#dc2626', paddingLeft: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.muted}>{fmtDay(e.entry_date)} · {areaLabel(e.area)}{e.mood ? ` · mood ${e.mood}/5` : ''}{e.safety_flag ? ' · safety concern' : ''}</Text>
            {e.title ? <Text style={s.strong}>{e.title}</Text> : null}
            <JournalTextMobile text={e.body} />
            {e.photos?.length ? (
              <ScrollView horizontal style={{ marginTop: 6 }}>
                {e.photos.map((p) => <Image key={p.id} source={{ uri: abs(p.url) }} style={{ width: 80, height: 80, borderRadius: 8, marginRight: 6 }} />)}
              </ScrollView>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
