import { API_BASE, api, getStoredToken } from '../../services/apiClient';

/**
 * The two voice calls. Both go through the NessaHub server, which holds the provider key and
 * screens what was said; the phone never talks to the speech provider itself.
 */

async function authed(path, init) {
  const send = async () => {
    const token = await getStoredToken();
    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  };
  let res = await send();
  if (res.status === 401) {
    // An expired access token: one ordinary call through api() refreshes it (and signs the
    // person out properly if the session is really over), then this is tried once more.
    try { await api('/api/v1/ai/status'); res = await send(); } catch { /* stays 401 */ }
  }
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(body?.message || `Voice request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}

/**
 * @param uri  a local recording: 16 kHz WAV from the native module, or m4a from expo-av
 * @returns {Promise<{ text, confidence, escalated, safetyText }>}
 */
export async function transcribe(uri, { snapshot = false } = {}) {
  const wav = /\.wav$/i.test(uri);
  const form = new FormData();
  form.append('audio', { uri, name: wav ? 'speech.wav' : 'speech.m4a', type: wav ? 'audio/wav' : 'audio/m4a' });
  form.append('language', 'en');
  if (snapshot) form.append('snapshot', 'true');
  const r = await authed('/api/v1/ai/voice/transcribe', { method: 'POST', body: form });
  return {
    text: r?.transcript || '',
    confidence: typeof r?.confidence === 'number' ? r.confidence : null,
    escalated: !!r?.escalated,
    safetyText: r?.text || null,
  };
}

/** @returns {Promise<{ audioBase64: string, marks: [number, number][] }>} marks: [char offset, seconds] */
export async function speak(text) {
  const r = await authed('/api/v1/ai/voice/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return { audioBase64: r?.audioBase64 || '', marks: Array.isArray(r?.marks) ? r.marks : [] };
}

export async function voiceAvailable() {
  try {
    const r = await authed('/api/v1/ai/voice/status', { method: 'GET' });
    return !!r?.available;
  } catch {
    return false;
  }
}
