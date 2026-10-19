import { API_BASE } from '../services/apiClient';

/**
 * Point a stored file URL at the host this app can actually reach.
 *
 * Uploads are saved with an absolute URL built from whatever host the UPLOADER
 * was on — a phone on a laptop hotspot stores `http://172.20.10.4:8085/...`,
 * which no other network can resolve. The file id and its capability token
 * travel fine; only the origin goes stale.
 *
 * This affects every stored file, not just chat attachments: a therapist's
 * profile photo saved on one network rendered as an EMPTY circle on another —
 * worse than no photo, because the initial fallback never showed (the value was
 * truthy, just unloadable).
 *
 * Only our own /api/ routes are rewritten; an external link is left alone.
 */
export function resolveFileUrl(url) {
  if (!url) return url;
  const raw = String(url).trim();
  if (raw.startsWith('/')) return `${API_BASE}${raw}`;
  const m = /^https?:\/\/[^/]+(\/.*)$/i.exec(raw);
  if (!m || !m[1].startsWith('/api/')) return raw;
  return `${API_BASE}${m[1]}`;
}

/**
 * A person's picture under whichever name it was saved as (avatarUrl / photoURL /
 * profilePhotoUrl / imageUrl / photoUrl), first match across the objects given —
 * the same rule as the web. The drawers read only photoURL, so a picture saved by
 * the admin or the settings screen (profilePhotoUrl / avatarUrl) never showed.
 * Local file:/blob: urls from another session are ignored.
 */
export function avatarOf(...subjects) {
  for (const subject of subjects) {
    if (!subject) continue;
    // Doctor and therapist records keep extra details (including the photo) in a
    // JSON text field; the web unpacks it, so do the same here.
    let meta = {};
    if (typeof subject.metadataJson === 'string') { try { meta = JSON.parse(subject.metadataJson) || {}; } catch { meta = {}; } }
    const s = { ...meta, ...subject };
    const url = s.avatarUrl || s.photoURL || s.profilePhotoUrl || s.imageUrl || s.photoUrl || null;
    if (url && !/^(blob|file):/i.test(String(url))) return resolveFileUrl(url);
  }
  return null;
}

export default resolveFileUrl;
