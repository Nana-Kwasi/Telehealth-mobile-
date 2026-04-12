import { db, storage } from '../services/firebaseConfig';
import {
  doc, setDoc, serverTimestamp, writeBatch, collection,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ── Presence ──────────────────────────────────────────────────────────────────
export async function setPresenceOnline(uid) {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'presence', uid), { online: true, lastSeen: serverTimestamp(), uid }, { merge: true });
  } catch (_) {}
}

export async function setPresenceOffline(uid) {
  if (!uid) return;
  try {
    await setDoc(doc(db, 'presence', uid), { online: false, lastSeen: serverTimestamp(), uid }, { merge: true });
  } catch (_) {}
}

// ── Read Receipts ─────────────────────────────────────────────────────────────
export async function markMessagesAsSeen(chatId, messages, myUid) {
  const toMark = messages.filter(m => m.from !== myUid && m.status !== 'seen');
  if (toMark.length === 0) return;
  try {
    const batch = writeBatch(db);
    toMark.forEach(m => {
      batch.update(doc(db, 'doctor_chats', chatId, 'messages', m.id), { status: 'seen' });
    });
    await batch.commit();
  } catch (_) {}
}

// ── Date / Time Formatting ───────────────────────────────────────────────────
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

export function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Groups messages inserting date separator objects between different dates
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
export async function uploadMedia(uri, storagePath) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, blob);
  return await getDownloadURL(storageRef);
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
