import { API_BASE } from '../services/apiClient';

/** Message helpers — same shape as doctor/medical chat (mediaUrl + legacy content). */

/**
 * Point a stored media URL at the host we can actually reach RIGHT NOW.
 *
 * Attachments are saved with an absolute URL built from whatever host the
 * uploader was using — e.g. http://172.20.10.4:8085/... from a laptop hotspot.
 * That address is meaningless to anyone on a different network: the same voice
 * note played fine in the simulator (localhost IS the Mac) and failed on a real
 * phone over LTE, which looked like a broken recording rather than a broken URL.
 *
 * The file id and its capability token are the parts that matter and travel
 * fine; only the ORIGIN is stale. So keep the path and re-point it at the API
 * base this app is currently talking to — which is reachable by definition,
 * since every other request is going there. Also handles relative URLs.
 */
function resolveMediaHost(url) {
  if (!url) return url;
  const raw = String(url).trim();
  if (raw.startsWith('/')) return `${API_BASE}${raw}`;
  const m = /^https?:\/\/[^/]+(\/.*)$/i.exec(raw);
  if (!m) return raw;
  const path = m[1];
  // Only rewrite OUR own file routes. An external link (a resource on a real
  // website) must be left exactly as it is.
  if (!path.startsWith('/api/')) return raw;
  return `${API_BASE}${path}`;
}

export function getMessageMediaUrl(msg) {
  if (!msg) return null;
  const direct = msg.mediaUrl || msg.fileUrl || (typeof msg.content === 'object' ? msg.content?.url : null);
  if (direct) return resolveMediaHost(direct);
  // Messages sent before attachments carried their metadata stored the URL as the
  // message body — those rendered as a raw link instead of an image/voice note.
  // Treat a URL-looking body as the media url so old messages still display.
  const body = typeof msg.content === 'string' ? msg.content : (msg.text || msg.body || '');
  return /^https?:\/\//i.test(String(body).trim()) ? resolveMediaHost(String(body).trim()) : null;
}

export function getMessageText(msg) {
  if (!msg) return '';
  if (typeof msg.text === 'string') return msg.text;
  if (typeof msg.content === 'string') return msg.content;
  if (msg.message && typeof msg.message === 'string') return msg.message;
  return '';
}

export function getMessageFileName(msg) {
  return msg.fileName || (typeof msg.content === 'object' ? msg.content?.name : null) || 'File';
}

export function getMessageFileSize(msg) {
  return msg.fileSize || (typeof msg.content === 'object' ? msg.content?.size : null) || 0;
}

export function getMessageDuration(msg) {
  return Number(msg.duration || (typeof msg.content === 'object' ? msg.content?.duration : 0) || 0);
}

export function normalizeMessageType(msg) {
  const t = msg?.type || msg?.messageType;
  if (t === 'document') return 'file';
  if (t === 'video') return 'file';
  if (t) return t;
  // No type recorded but the body is a media URL → infer from its extension so it
  // renders as an image/voice note rather than a link.
  const url = String(msg?.text || msg?.body || '').trim();
  if (/^https?:\/\//i.test(url)) {
    if (/\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(url)) return 'image';
    if (/\.(m4a|mp3|wav|webm|aac|ogg)(\?|$)/i.test(url)) return 'audio';
    return 'file';
  }
  return 'text';
}

export function isOwnChatMessage(msg, uid) {
  return msg?.from === uid || msg?.senderId === uid;
}

export function buildTextPayload(text, meta) {
  return {
    text,
    type: 'text',
    content: text,
    ...meta,
  };
}

export function buildImagePayload(url, meta, fileName = 'image.jpg') {
  return {
    type: 'image',
    mediaUrl: url,
    fileUrl: url,
    fileName,
    text: '',
    content: { url, name: fileName, type: 'image/jpeg' },
    ...meta,
  };
}

export function buildFilePayload(url, meta, fileName, fileSize = 0, mimeType = '') {
  return {
    type: 'file',
    mediaUrl: url,
    fileUrl: url,
    fileName,
    fileSize,
    mimeType,
    text: '',
    content: { url, name: fileName, size: fileSize, type: mimeType },
    ...meta,
  };
}

export function buildAudioPayload(url, duration, meta) {
  return {
    type: 'audio',
    mediaUrl: url,
    fileUrl: url,
    duration,
    text: '',
    content: { url, duration, type: 'audio/m4a' },
    ...meta,
  };
}
