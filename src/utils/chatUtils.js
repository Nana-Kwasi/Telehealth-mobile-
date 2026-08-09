import { Platform } from 'react-native';
import { api, uploadFile } from '../services/apiClient';

// ── Care chat threads (/api/v1/care/chats) ───────────────────────────────────
// The screens were written against Firestore documents and assumed a
// `participantIds` array plus a `{userId, participantIds}` create shape. The REST
// endpoints use `participantA`/`participantB` and require `channel`, so thread
// lookup never matched, creation always 400'd, and — because both were wrapped in
// `.catch(() => null)` — sending simply stopped with nothing shown to the user.
// These three helpers are the one correct implementation for every chat screen.

/** Threads expose participantA/participantB, not a participantIds array. */
export function threadHasParticipant(thread, userId) {
  if (!thread || !userId) return false;
  if (Array.isArray(thread.participantIds)) return thread.participantIds.includes(userId);
  return thread.participantA === userId || thread.participantB === userId;
}

/** Find the existing thread between two users, or create it. */
export async function findOrCreateThread(myId, otherId, channel = 'therapy') {
  if (!myId || !otherId) return null;
  const find = async () => {
    const threads = await api(`/api/v1/care/chats/threads?userId=${myId}`).catch(() => []);
    return (Array.isArray(threads) ? threads : []).find(t => threadHasParticipant(t, otherId)) || null;
  };
  const existing = await find();
  if (existing?.id) return existing;
  const created = await api('/api/v1/care/chats/threads', {
    method: 'POST',
    body: { channel, participantA: myId, participantB: otherId },
  }).catch(() => null);
  if (created?.id) return created;
  // Creation rejects duplicates ("Thread already exists"); re-read rather than
  // treating that as a dead end.
  return find();
}

/**
 * Post a message. ChatThreadView emits the Firestore-era {text,type,mediaUrl};
 * the endpoint stores body/messageType and `body` is NOT NULL — sending the raw
 * payload wrote a null and came back as "Request conflicts with existing data."
 */
export async function sendThreadMessage(threadId, senderId, payload = {}) {
  const messageType = payload.type || payload.messageType || 'text';
  const url = payload.mediaUrl || payload.fileUrl || null;
  const body =
    (typeof payload.text === 'string' && payload.text.trim())
    || payload.body
    || url
    || '';
  if (!threadId || !senderId || !body) throw new Error('Nothing to send.');
  // Attachments need their metadata sent too. Posting only the URL as `body`
  // meant the receiver had a bare link: mobile rendered it as plain text and web
  // rendered a broken image, because both expect name/type/duration alongside it.
  return api(`/api/v1/care/chats/threads/${threadId}/messages`, {
    method: 'POST',
    body: {
      senderId,
      messageType,
      body,
      ...(url ? {
        mediaUrl: url,
        fileUrl: url,
        fileName: payload.fileName || payload.content?.name || null,
        mimeType: payload.mimeType || payload.content?.type || null,
        fileSize: payload.fileSize ?? payload.content?.size ?? null,
        duration: payload.duration ?? payload.content?.duration ?? null,
      } : {}),
    },
  });
}

// ── Presence (generic online/offline heartbeat) ───────────────────────────────
export async function setPresenceOnline(uid) {
  if (!uid) return;
  api(`/api/v1/realtime/presence/${uid}`, { method: 'PUT', body: { status: 'online' } }).catch(() => {});
}

export async function setPresenceOffline(uid) {
  if (!uid) return;
  api(`/api/v1/realtime/presence/${uid}`, { method: 'PUT', body: { status: 'offline' } }).catch(() => {});
}

// ── Read Receipts (doctor↔patient chats) ──────────────────────────────────────
// One call marks every incoming message in this chat as read (blue double tick on
// the sender's side). The server only flips the *other* party's messages.
export async function markMessagesAsSeen(chatId, messages, myUid) {
  if (!chatId) return;
  const hasUnread = (messages || []).some(m => m.from !== myUid && m.status !== 'read' && m.status !== 'seen');
  if (!hasUnread) return;
  api(`/api/v1/doctor-chats/${chatId}/read`, { method: 'POST', body: {} }).catch(() => {});
}

// ── Date / Time Formatting ────────────────────────────────────────────────────
export function formatMsgTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateLabel(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (msgDay.getTime() === today.getTime()) return 'Today';
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  const diff = Math.floor((today - msgDay) / 86400000);
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatLastSeen(ts) {
  if (!ts) return 'last seen recently';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'last seen just now';
  if (diff < 3600) return `last seen ${Math.floor(diff / 60)}m ago`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime())
    return `last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return `last seen ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function formatAudioDuration(secs) {
  const s = Math.round(secs || 0);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function getAudioMimeType(msg, uri = '') {
  const content = msg?.content;
  if (content && typeof content === 'object' && content.type) return String(content.type);
  if (msg?.type && msg.type !== 'audio') return String(msg.type);
  const lower = String(uri || '').toLowerCase();
  if (lower.includes('webm')) return 'audio/webm';
  if (lower.includes('.m4a') || lower.includes('audio/mp4')) return 'audio/mp4';
  if (lower.startsWith('data:audio/webm')) return 'audio/webm';
  if (lower.startsWith('data:audio/mp4')) return 'audio/mp4';
  return '';
}

export function isAudioPlayableOnDevice(uri, mimeType = '') {
  if (!uri) return false;
  const mime = (mimeType || getAudioMimeType(null, uri)).toLowerCase();
  const lower = uri.toLowerCase();
  const isWebm = mime.includes('webm') || lower.includes('webm') || lower.startsWith('data:audio/webm');
  if (isWebm && Platform.OS === 'ios') return false;
  return true;
}

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function groupWithDateSeparators(messages) {
  const result = [];
  let lastLabel = null;
  messages.forEach(msg => {
    const label = formatDateLabel(msg.timestamp);
    if (label && label !== lastLabel) {
      result.push({ id: `sep_${label}_${msg.id}`, isSeparator: true, label });
      lastLabel = label;
    }
    result.push(msg);
  });
  return result;
}

// ── Media Upload ──────────────────────────────────────────────────────────────
export async function uploadMedia(uri, storagePath, contentType) {
  return uploadFile(storagePath, uri, contentType || 'application/octet-stream');
}

// ── Emoji List ────────────────────────────────────────────────────────────────
export const EMOJI_LIST = [
  '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊',
  '😍','🥰','😘','😗','😚','😙','🤗','🤔','🤭','🤫',
  '😐','😑','😶','😏','😒','🙄','😬','🤥','😔','😪',
  '😴','🤤','😷','🤒','🤕','🥴','🤧','🥵','🤯','😵',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕',
  '👍','👎','👏','🙌','🤝','🙏','💪','🦾','🫂','👋',
  '🎉','🎊','🎁','🏥','💊','🩺','🩻','💉','🩹','🌡️',
];
