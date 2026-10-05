import { API_BASE, getStoredToken } from './apiClient';

/**
 * Consume the AI SSE stream in React Native.
 *
 * Uses XMLHttpRequest rather than fetch: React Native's fetch does not expose a
 * readable body, so there is no way to read a response as it arrives. XHR fires
 * `onprogress` with the accumulated text, which is enough to parse SSE frames
 * incrementally — and it needs no extra dependency.
 *
 * Callbacks mirror the server's event names exactly, so adding an event on the
 * backend does not silently do nothing here.
 */
export function streamAssist({ body, onChunk, onEscalation, onRefusal, onRetract, onDone, onError }) {
  const xhr = new XMLHttpRequest();
  let consumed = 0;      // how much of responseText has already been parsed
  let settled = false;

  const finish = (fn, arg) => {
    if (settled) return;
    settled = true;
    fn?.(arg);
  };

  xhr.open('POST', `${API_BASE}/api/v1/ai/assist/stream`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Accept', 'text/event-stream');

  (async () => {
    const token = await getStoredToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onprogress = () => {
      const fresh = xhr.responseText.slice(consumed);
      // Only consume up to the last complete frame; a partial tail is left for
      // the next progress event rather than being parsed as broken JSON.
      const lastBreak = fresh.lastIndexOf('\n\n');
      if (lastBreak < 0) return;
      const ready = fresh.slice(0, lastBreak);
      consumed += lastBreak + 2;

      for (const frame of ready.split('\n\n')) {
        if (!frame.trim()) continue;
        let event = 'message';
        let dataLine = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
        }
        if (!dataLine) continue;

        let payload;
        try { payload = JSON.parse(dataLine); } catch { continue; }

        if (event === 'chunk') onChunk?.(payload.text || '');
        else if (event === 'escalation') finish(onEscalation, payload);
        else if (event === 'refusal') finish(onRefusal, payload);
        else if (event === 'retract') finish(onRetract, payload);
        else if (event === 'done') finish(onDone, payload);
      }
    };

    xhr.onload = () => {
      xhr.onprogress();                 // flush any trailing frame
      if (!settled) finish(onDone, {}); // stream ended without an explicit done
    };
    xhr.onerror = () => finish(onError, new Error('The assistant could not be reached.'));
    xhr.ontimeout = () => finish(onError, new Error('The assistant took too long to respond.'));

    xhr.send(JSON.stringify(body));
  })();

  return () => { try { xhr.abort(); } catch { /* already finished */ } };
}
