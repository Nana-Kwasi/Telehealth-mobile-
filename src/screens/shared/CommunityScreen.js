import EmptyStateMobile, { IconBubbleMobile } from '../../components/EmptyStateMobile';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { api } from '../../services/apiClient';
import { s } from '../../components/PsychRecordMobile';

/*
 * Community on mobile (patients and clients): same endpoints as web.
 * CommunityModerationScreen is for doctors and therapists who moderate groups.
 */

const GROUP_ICON = {
  diabetes: ['Diabetes', 'sky'], 'blood-pressure-heart': ['BloodPressure', 'rose'], 'sickle-cell': ['BloodCells', 'rose'],
  'asthma-breathing': ['Lungs', 'teal'], 'pregnancy-new-parents': ['Pregnant', 'pink'], 'weight-fitness': ['Running', 'orange'],
  'skin-beauty': ['SkinLayers', 'amber'], 'healthy-ageing': ['Elderly', 'emerald'], sleep: ['HappySleepy', 'indigo'],
  'low-mood': ['MentalHealth', 'violet'], 'anxiety-stress': ['FaceNervous', 'blue'], 'grief-loss': ['People', 'slate'],
};

const REACTIONS = [['encourage', '💪', 'Encourage'], ['relate', '🤝', 'Me too'], ['thanks', '🙏', 'Thanks']];
const REPORT_REASONS = [
  ['worrying', 'I am worried about this person'], ['unkind', 'Unkind or bullying'], ['unsafe_advice', 'Unsafe health advice'],
  ['selling', 'Selling or advertising'], ['personal_details', 'Shares personal details'], ['other', 'Something else'],
];
const CATEGORY = { medical: 'Health conditions', lifestyle: 'Fitness, beauty and longevity', mind: 'Mind and feelings' };
const ago = (d) => {
  const sec = (Date.now() - new Date(d).getTime()) / 1000;
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export default function CommunityScreen({ accent = '#4f46e5' }) {
  const route = useRoute();
  const [me, setMe] = useState(null);
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api('/api/v1/community/me').then(setMe).catch((e) => setError(e?.message || 'Could not load.'));
    api('/api/v1/community/groups').then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => setGroups([]));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { if (route.params?.draft) setDraft(route.params.draft); }, [route.params?.draft]);

  if (!me || !groups) return <View style={{ padding: 16 }}><Text style={s.muted}>{error || 'Loading…'}</Text></View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      {!me.nickname ? <NicknameMobile accent={accent} onDone={load} />
        : open ? <GroupMobile group={open} me={me} accent={accent} draft={draft} clearDraft={() => setDraft('')} onBack={() => { setOpen(null); load(); }} />
        : (
          <>
            <View style={s.card}>
              <Text style={s.title}>Community</Text>
              <Text style={s.muted}>People on the same journey, encouraging each other. You appear as <Text style={s.strong}>{me.nickname}</Text>.</Text>
              {draft ? <Text style={[s.ok, { marginTop: 6 }]}>Choose a group to post your journal entry in.</Text> : null}
            </View>
            <View style={[s.gaps, { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }]}>
              <Text style={[s.detail, { marginTop: 0, color: '#075985' }]}>For support and shared experience, not medical advice. In an emergency, call 112.</Text>
            </View>
            {groups.some((g) => g.joined) ? (
              <View style={s.card}>
                <Text style={s.title}>My groups</Text>
                {groups.filter((g) => g.joined).map((g) => <GroupRow key={g.id} g={g} accent={accent} onOpen={() => setOpen(g)} />)}
              </View>
            ) : null}
            {['medical', 'lifestyle', 'mind'].map((c) => {
              const list = groups.filter((g) => !g.joined && g.category === c);
              return list.length ? (
                <View key={c} style={s.card}>
                  <Text style={s.title}>{CATEGORY[c]}</Text>
                  {list.map((g) => <GroupRow key={g.id} g={g} accent={accent} onOpen={() => setOpen(g)} />)}
                </View>
              ) : null;
            })}
          </>
        )}
    </ScrollView>
  );
}

function GroupRow({ g, accent, onOpen }) {
  return (
    <TouchableOpacity style={[s.row, { alignItems: 'center' }]} onPress={onOpen} accessibilityRole="button">
      <IconBubbleMobile icon={(GROUP_ICON[g.slug] || ['Health'])[0]} tone={(GROUP_ICON[g.slug] || [null, 'indigo'])[1]} size={22} />
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{g.name}</Text>
        <Text style={s.muted}>{g.description}</Text>
        <Text style={[s.muted, { color: accent, fontWeight: '700', marginTop: 2 }]}>{g.members} member{Number(g.members) === 1 ? '' : 's'}{g.joined ? ' · joined' : ''}</Text>
      </View>
    </TouchableOpacity>
  );
}

function NicknameMobile({ accent, onDone }) {
  const [n, setN] = useState('');
  const [error, setError] = useState('');
  return (
    <View style={s.card}>
      <View style={{ alignItems: 'center', marginBottom: 8 }}><IconBubbleMobile icon="GroupDiscussionMeetingx3" tone="indigo" size={44} /></View>
      <Text style={[s.title, { textAlign: 'center' }]}>Join the NessaHub community</Text>
      <Text style={s.detail}>Meet people with the same condition or goal, share how you are doing and cheer each other on.</Text>
      <Text style={[s.muted, { marginTop: 6 }]}>Choose a nickname. To keep your health private, do not use your real name.</Text>
      <TextInput style={s.input} value={n} onChangeText={setN} maxLength={30} placeholder="e.g. MorningWalker" autoCapitalize="none" />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <TouchableOpacity style={[s.btn, { backgroundColor: accent }, n.trim().length < 3 && { opacity: 0.5 }]} disabled={n.trim().length < 3}
        onPress={async () => { setError(''); try { await api('/api/v1/community/me', { method: 'PUT', body: { nickname: n } }); onDone(); } catch (e) { setError(e?.message || 'Could not save.'); } }}>
        <Text style={s.btnText}>Continue</Text>
      </TouchableOpacity>
    </View>
  );
}

function GroupMobile({ group, me, accent, draft, clearDraft, onBack }) {
  const [joined, setJoined] = useState(!!group.joined);
  const [accept, setAccept] = useState(false);
  const [posts, setPosts] = useState(null);
  const [text, setText] = useState(draft || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');
  const moderator = (me.moderates || []).includes(group.id) || me.isAdmin;
  const load = useCallback(() => {
    api(`/api/v1/community/groups/${group.id}/posts`).then((l) => setPosts(Array.isArray(l) ? l : [])).catch((e) => { setPosts([]); setError(e?.message || 'Could not load.'); });
  }, [group.id]);
  useEffect(() => { if (joined || moderator) load(); }, [joined, moderator, load]);

  const post = async () => {
    setBusy(true); setError(''); setNotice(null);
    try {
      const r = await api(`/api/v1/community/groups/${group.id}/posts`, { method: 'POST', body: { body: text } });
      setText(''); clearDraft();
      if (r.holdMessage) setNotice({ crisis: /harming/.test(r.holdMessage), text: r.holdMessage });
      else if (r.emergencyNote) setNotice({ crisis: false, text: `Posted. ${r.emergencyNote}` });
      load();
    } catch (e) { setError(e?.message || 'Could not post.'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <TouchableOpacity onPress={onBack}><Text style={[s.link, { color: accent }]}>‹ All groups</Text></TouchableOpacity>
      <View style={s.card}>
        <Text style={s.title}>{group.name}</Text>
        <Text style={s.muted}>{group.description}</Text>
        {joined ? (
          <TouchableOpacity onPress={() => api(`/api/v1/community/groups/${group.id}/leave`, { method: 'POST', body: {} }).then(onBack).catch(() => {})}>
            <Text style={[s.link, { color: accent, marginTop: 4 }]}>Leave group</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!joined && !moderator ? (
        <View style={s.card}>
          <Text style={s.title}>Group rules</Text>
          {me.rules.map((r, i) => <Text key={r} style={s.detail}>{i + 1}. {r}</Text>)}
          <TouchableOpacity onPress={() => setAccept(!accept)} style={[s.chips, { marginTop: 10 }]} accessibilityRole="checkbox" accessibilityState={{ checked: accept }}>
            <Text style={{ fontSize: 18 }}>{accept ? '☑' : '☐'}</Text>
            <Text style={[s.detail, { marginTop: 0, flex: 1 }]}>I have read the rules and I will follow them.</Text>
          </TouchableOpacity>
          {error ? <Text style={s.err}>{error}</Text> : null}
          <TouchableOpacity style={[s.btn, { backgroundColor: accent }, !accept && { opacity: 0.5 }]} disabled={!accept}
            onPress={async () => { setError(''); try { await api(`/api/v1/community/groups/${group.id}/join`, { method: 'POST', body: { acceptRules: true } }); setJoined(true); } catch (e) { setError(e?.message || 'Could not join.'); } }}>
            <Text style={s.btnText}>Join as {me.nickname}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {joined ? (
            <View style={s.card}>
              <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline maxLength={4000} value={text} onChangeText={setText}
                placeholder={`Share how you are doing, ${me.nickname}.`} />
              <Text style={[s.muted, { fontSize: 12, marginTop: 4 }]}>Posts are checked for safety. No names, phone numbers or links.</Text>
              {notice ? <Text style={[s.detail, { backgroundColor: notice.crisis ? '#fef2f2' : '#fffbeb', padding: 8, borderRadius: 8, color: notice.crisis ? '#7f1d1d' : '#92400e' }]}>{notice.text}</Text> : null}
              {error ? <Text style={s.err}>{error}</Text> : null}
              <TouchableOpacity style={[s.btn, { backgroundColor: accent }, (busy || text.trim().length < 2) && { opacity: 0.5 }]} disabled={busy || text.trim().length < 2} onPress={post}>
                <Text style={s.btnText}>{busy ? 'Posting…' : 'Post'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {posts === null ? <Text style={s.muted}>Loading…</Text> : posts.length === 0 ? <View style={s.card}><EmptyStateMobile icon="GroupDiscussionMeetingx3" tone="indigo" title="No posts yet">Be the first to say hello and share how you are doing.</EmptyStateMobile></View>
            : posts.map((p) => <PostMobile key={p.id} post={p} accent={accent} canWrite={joined} moderator={moderator} onChanged={load} />)}
        </>
      )}
    </>
  );
}

function PostMobile({ post, accent, canWrite, moderator, onChanged }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState(null);
  const [reply, setReply] = useState('');
  const [counts, setCounts] = useState({ encourage: Number(post.encourage), relate: Number(post.relate), thanks: Number(post.thanks) });
  const [mine, setMine] = useState(post.my_reactions || []);
  const [notice, setNotice] = useState('');
  const loadComments = useCallback(() => {
    api(`/api/v1/community/posts/${post.id}/comments`).then((l) => setComments(Array.isArray(l) ? l : [])).catch(() => setComments([]));
  }, [post.id]);
  useEffect(() => { if (open) loadComments(); }, [open, loadComments]);

  const react = async (kind) => {
    try {
      const r = await api(`/api/v1/community/posts/${post.id}/react`, { method: 'POST', body: { kind } });
      setCounts((c) => ({ ...c, [kind]: c[kind] + (r.on ? 1 : -1) }));
      setMine((m) => (r.on ? [...m, kind] : m.filter((k) => k !== kind)));
    } catch (_) { /* ignore */ }
  };
  // Inline, not an Alert: Android shows at most three Alert buttons.
  const [reporting, setReporting] = useState(null);
  const report = (type, id) => setReporting({ type, id });
  const sendReport = (type, id, reason) => api('/api/v1/community/reports', { method: 'POST', body: { targetType: type, targetId: id, reason } })
    .then(() => { setReporting(null); Alert.alert('Thank you', reason === 'worrying' ? 'A moderator has been told straight away. If someone is in danger now, call 112.' : 'A moderator will look at it.'); })
    .catch((e) => Alert.alert('Could not send', e?.message || 'Try again.'));
  const del = (type, id) => api(`/api/v1/community/${type === 'post' ? 'posts' : 'comments'}/${id}`, { method: 'DELETE' }).then(() => (type === 'post' ? onChanged() : loadComments())).catch(() => {});
  const mod = (type, id, action) => api(`/api/v1/community/moderation/${type}/${id}`, { method: 'POST', body: { action } }).then(() => (type === 'post' ? onChanged() : loadComments())).catch(() => {});
  const sendReply = async () => {
    setNotice('');
    try {
      const r = await api(`/api/v1/community/posts/${post.id}/comments`, { method: 'POST', body: { body: reply } });
      setReply('');
      if (r.holdMessage) setNotice(r.holdMessage); else if (r.emergencyNote) setNotice(r.emergencyNote);
      loadComments();
    } catch (e) { setNotice(e?.message || 'Could not reply.'); }
  };

  return (
    <View style={[s.card, post.status === 'held' && { backgroundColor: '#fffbeb', borderStyle: 'dashed' }]}>
      <View style={s.head}>
        <Text style={s.strong}>{post.nickname}{post.by_moderator ? ' · Moderator' : ''}<Text style={s.muted}> · {ago(post.created_at)}{post.pinned ? ' · Pinned' : ''}</Text></Text>
      </View>
      {post.status === 'held' ? <Text style={[s.muted, { color: '#92400e' }]}>Only you can see this for now. {post.holdMessage}</Text> : null}
      <Text style={[s.detail, { fontSize: 15 }]}>{post.body}</Text>
      {post.status === 'visible' ? (
        <View style={s.chips}>
          {REACTIONS.map(([k, e, l]) => (
            <TouchableOpacity key={k} disabled={!canWrite} onPress={() => react(k)} accessibilityLabel={l} accessibilityState={{ selected: mine.includes(k) }}
              style={[s.chip, mine.includes(k) && { borderColor: accent, backgroundColor: '#eef2ff' }]}>
              <Text style={s.chipText}>{e}{counts[k] ? ` ${counts[k]}` : ''}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setOpen(!open)} style={s.chip}><Text style={s.chipText}>💬 {Number(post.comment_count) || ''} {Number(post.comment_count) === 1 ? 'reply' : 'replies'}</Text></TouchableOpacity>
        </View>
      ) : null}
      <View style={s.chips}>
        {post.mine ? <TouchableOpacity onPress={() => del('post', post.id)}><Text style={[s.link, { color: accent }]}>Delete</Text></TouchableOpacity>
          : <TouchableOpacity onPress={() => report('post', post.id)}><Text style={[s.link, { color: accent }]}>Report</Text></TouchableOpacity>}
        {moderator ? <>
          <TouchableOpacity onPress={() => mod('post', post.id, post.pinned ? 'unpin' : 'pin')}><Text style={[s.link, { color: accent }]}>{post.pinned ? 'Unpin' : 'Pin'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => mod('post', post.id, 'hide')}><Text style={[s.link, { color: '#b91c1c' }]}>Hide</Text></TouchableOpacity>
        </> : null}
      </View>
      {reporting ? (
        <View style={{ backgroundColor: '#fff7f7', borderColor: '#fecaca', borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 6 }}>
          <Text style={s.strong}>Why are you reporting this?</Text>
          {REPORT_REASONS.map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => sendReport(reporting.type, reporting.id, k)} style={{ paddingVertical: 7 }}>
              <Text style={[s.detail, { marginTop: 0, color: accent }]}>{l}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setReporting(null)}><Text style={[s.link, { color: '#64748b' }]}>Cancel</Text></TouchableOpacity>
        </View>
      ) : null}
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 6, paddingTop: 6 }}>
          {comments === null ? <Text style={s.muted}>Loading…</Text> : comments.map((c) => (
            <View key={c.id} style={{ backgroundColor: c.status === 'held' ? '#fffbeb' : '#f8fafc', borderRadius: 8, padding: 8, marginBottom: 6 }}>
              <Text style={s.strong}>{c.nickname}{c.by_moderator ? ' · Moderator' : ''}<Text style={s.muted}> · {ago(c.created_at)}</Text></Text>
              {c.status === 'held' ? <Text style={[s.muted, { color: '#92400e' }]}>Only you can see this for now. {c.holdMessage}</Text> : null}
              <Text style={s.detail}>{c.body}</Text>
              {c.mine ? <TouchableOpacity onPress={() => del('comment', c.id)}><Text style={[s.link, { color: accent }]}>Delete</Text></TouchableOpacity>
                : <TouchableOpacity onPress={() => report('comment', c.id)}><Text style={[s.link, { color: accent }]}>Report</Text></TouchableOpacity>}
            </View>
          ))}
          {canWrite || moderator ? (
            <>
              <TextInput style={s.input} value={reply} onChangeText={setReply} maxLength={2000} placeholder="Write a kind reply" />
              <TouchableOpacity style={[s.btn, { backgroundColor: accent }, !reply.trim() && { opacity: 0.5 }]} disabled={!reply.trim()} onPress={sendReply}><Text style={s.btnText}>Reply</Text></TouchableOpacity>
            </>
          ) : null}
          {notice ? <Text style={[s.muted, { color: '#92400e', marginTop: 4 }]}>{notice}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

export function CommunityModerationScreen({ accent = '#4f46e5' }) {
  const [q, setQ] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => { api('/api/v1/community/moderation/queue').then(setQ).catch((e) => setError(e?.message || 'Could not load.')); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const act = async (fn, done) => { setError(''); setMsg(''); try { await fn(); setMsg(done); load(); } catch (e) { setError(e?.message || 'Could not do that.'); } };
  const moderate = (type, id, action) => act(() => api(`/api/v1/community/moderation/${type}/${id}`, { method: 'POST', body: { action } }), action === 'approve' ? 'Published.' : 'Done.');
  const pause = (group, user, action) => act(() => api(`/api/v1/community/moderation/groups/${group}/members/${user}`, { method: 'POST', body: { action, days: 7 } }),
    action === 'ban' ? 'Member removed from the group.' : 'Member paused for 7 days.');
  const REASON = { safety: 'Safety concern', health_advice: 'Medicine advice', contact_details: 'Link or phone number' };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <View style={s.card}>
        <Text style={s.title}>Community moderation</Text>
        <Text style={s.muted}>Safety concerns come first. If a member may be in danger, also reach out through their care team.</Text>
      </View>
      {msg ? <Text style={s.ok}>{msg}</Text> : null}
      {error ? <Text style={s.err}>{error}</Text> : null}
      {!q ? <Text style={s.muted}>Loading…</Text> : q.groups.length === 0 ? (
        <View style={s.card}><Text style={s.muted}>You do not moderate any groups yet. An administrator can add you.</Text></View>
      ) : (
        <>
          <View style={s.card}>
            <Text style={s.title}>Waiting for review ({q.held.length})</Text>
            {q.held.length === 0 ? <EmptyStateMobile compact icon="HealthDataSecurity" tone="emerald" title="Nothing waiting" /> : q.held.map((h) => (
              <View key={`${h.type}-${h.id}`} style={[s.row, { flexDirection: 'column' }, h.hold_reason === 'safety' && { backgroundColor: '#fef2f2', borderRadius: 8, padding: 8 }]}>
                <Text style={s.muted}>{h.group_name} · {h.type} by {h.nickname} · {ago(h.created_at)} · {h.status === 'hidden' ? 'hidden after reports' : REASON[h.hold_reason] || 'held'}</Text>
                <Text style={s.detail}>{h.body}</Text>
                <View style={s.chips}>
                  <TouchableOpacity onPress={() => moderate(h.type, h.id, 'approve')}><Text style={[s.link, { color: accent }]}>Publish</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => moderate(h.type, h.id, 'remove')}><Text style={[s.link, { color: '#b91c1c' }]}>Remove</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => pause(h.group_id, h.author_id, 'mute')}><Text style={[s.link, { color: accent }]}>Pause 7 days</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
          <View style={s.card}>
            <Text style={s.title}>Reports ({q.reports.length})</Text>
            {q.reports.length === 0 ? <EmptyStateMobile compact icon="CommunityMeeting" tone="teal" title="No open reports" /> : q.reports.map((r) => (
              <View key={r.id} style={[s.row, { flexDirection: 'column' }, r.reason === 'worrying' && { backgroundColor: '#fef2f2', borderRadius: 8, padding: 8 }]}>
                <Text style={s.muted}>{r.group_name} · {r.target_type} · {r.reason.replace('_', ' ')} · {ago(r.created_at)}{r.target_status !== 'visible' ? ` · now ${r.target_status}` : ''}</Text>
                <Text style={s.detail}>{r.body}</Text>
                {r.details ? <Text style={s.muted}>“{r.details}”</Text> : null}
                <View style={s.chips}>
                  <TouchableOpacity onPress={() => act(() => api(`/api/v1/community/moderation/reports/${r.id}/dismiss`, { method: 'POST', body: {} }), 'Report dismissed.')}><Text style={[s.link, { color: accent }]}>Nothing wrong</Text></TouchableOpacity>
                  {r.target_status !== 'visible' ? <TouchableOpacity onPress={() => moderate(r.target_type, r.target_id, 'approve')}><Text style={[s.link, { color: accent }]}>Restore</Text></TouchableOpacity> : null}
                  <TouchableOpacity onPress={() => moderate(r.target_type, r.target_id, 'remove')}><Text style={[s.link, { color: '#b91c1c' }]}>Remove</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => pause(r.group_id, r.author_id, 'mute')}><Text style={[s.link, { color: accent }]}>Pause writer</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => pause(r.group_id, r.author_id, 'ban')}><Text style={[s.link, { color: '#b91c1c' }]}>Remove writer</Text></TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
