import { api, getStoredUserId } from './apiClient';
import { enrichClientRecord, getClientDisplayName, fetchPersonProfile } from '../utils/clientTherapyMetrics';

/**
 * Fetch one person's profile, whichever kind of record they are.
 *
 * A therapy client lives behind /clients/{id}; /patients/{id} is the MEDICAL
 * record and returns 403 for them. The loaders below called /patients only,
 * so every lookup failed, the catch swallowed it, and the roster came back
 * empty — the therapist saw "no clients" while ten active assignments existed.
 *
 * Tries the therapy endpoint first because these loaders are only ever used by
 * a therapist, then falls back for the rare client who is also a patient.
 */
// Resolver lives in clientTherapyMetrics so there is exactly one copy.

export async function loadTherapistCalendarClients(therapistUid, { lite = false } = {}) {
  const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistUid}`).catch(() => []);

  // Keep the assignment's own clientName: it lets a client stay on the roster even
  // if the per-client profile lookup fails, instead of the whole list collapsing to
  // empty and the calendar claiming "No clients assigned".
  const assigned = (Array.isArray(assignments) ? assignments : [])
    .filter((a) => a?.clientId)
    .map((a) => ({ clientId: a.clientId, fallbackName: a.clientName || a.name || '' }));

  if (lite) {
    const rows = await Promise.all(
      assigned.map(async ({ clientId, fallbackName }) => {
        const data = await fetchPersonProfile(clientId);
        const displayName =
          data?.fullName || data?.name || (data && getClientDisplayName(data)) || fallbackName || 'Client';
        // Spread first so a payload `id` can never replace the assignment's clientId,
        // which is the users.id every downstream write needs.
        return { ...(data || {}), id: clientId, displayName, name: displayName };
      }),
    );
    return rows.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  }

  const clients = [];
  for (const { clientId, fallbackName } of assigned) {
    const raw = await fetchPersonProfile(clientId);
    if (!raw) {
      // Keep them on the roster under the assignment's own name rather than
      // dropping them. A therapist who cannot see a client they are assigned
      // to cannot call them — an incomplete profile must not cost them that.
      clients.push({ id: clientId, displayName: fallbackName || 'Client', name: fallbackName || 'Client' });
      continue;
    }
    try {
      const enriched = await enrichClientRecord(clientId, { ...raw, id: clientId });
      clients.push({
        ...enriched,
        id: clientId,
        displayName: enriched.name || getClientDisplayName(enriched) || fallbackName,
      });
    } catch {
      clients.push({ ...raw, id: clientId, displayName: raw.fullName || raw.name || fallbackName || 'Client' });
    }
  }

  clients.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
  return clients;
}

/** The API field is `scheduledTime`; scheduledAt/startsAt are legacy fallbacks. */
export function callDate(call) {
  const raw = call?.scheduledTime || call?.scheduledAt || call?.startsAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function loadTherapistScheduledCalls(therapistUid) {
  try {
    const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistUid}`);
    const list = Array.isArray(calls) ? calls : [];
    return list.sort((a, b) => (callDate(a)?.getTime() || 0) - (callDate(b)?.getTime() || 0));
  } catch {
    return [];
  }
}

export async function createScheduledCall(payload) {
  return api('/api/v1/scheduled-calls', { method: 'POST', body: payload });
}

export async function updateScheduledCall(callId, payload) {
  return api(`/api/v1/scheduled-calls/${callId}`, { method: 'PATCH', body: payload });
}

export async function deleteScheduledCall(callId) {
  return api(`/api/v1/scheduled-calls/${callId}`, { method: 'DELETE' });
}

// ── Client session requests ───────────────────────────────────────────────────
// A call a client books arrives as `pending` and stays out of the therapist's
// agenda until they confirm it.

/** True for a call the client requested and the therapist hasn't answered yet. */
export function isPendingRequest(call) {
  return String(call?.status || '').toLowerCase() === 'pending';
}

/** Confirm a client's request; it then behaves like any scheduled session. */
export async function acceptScheduledCall(callId, therapistUid) {
  return updateScheduledCall(callId, { status: 'scheduled', updatedBy: therapistUid });
}

/** Decline a client's request. Kept (not deleted) so the client sees the outcome. */
export async function declineScheduledCall(callId, therapistUid) {
  return updateScheduledCall(callId, { status: 'declined', updatedBy: therapistUid });
}

// ─── Calendar screen helpers ─────────────────────────────────────────────────
// TherapistScheduleScreen imports these six; none of them existed, so opening the
// Calendar tab crashed immediately with
//   "getCalendarMonthDays is not a function (it is undefined)".

/**
 * Dates for a month grid: whole weeks (Sun-first) covering `date`'s month, with
 * the leading/trailing days of the adjacent months included. The screen dims
 * those via its own isCurrentMonth() check.
 */
export function getCalendarMonthDays(date) {
  const base = date instanceof Date ? date : new Date(date || Date.now());
  const year = base.getFullYear();
  const month = base.getMonth();

  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay()); // back to Sunday

  const last = new Date(year, month + 1, 0);
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay())); // forward to Saturday

  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function isSameCalendarDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

/** Scheduled calls falling on a given calendar day, earliest first. */
export function getCallsForDate(calls, date) {
  if (!Array.isArray(calls) || !date) return [];
  const target = date instanceof Date ? date : new Date(date);
  return calls
    .filter((c) => isSameCalendarDay(callDate(c), target))
    .sort((a, b) => (callDate(a)?.getTime() || 0) - (callDate(b)?.getTime() || 0));
}

/**
 * Clinical notes for this therapist, flattened for the calendar's notes list.
 * The screen reads clientName / sessionDate / moodRating / mood / sessionFocus /
 * interventionsUsed — the last four live inside structuredData.
 */
export async function loadTherapistTherapyNotes(therapistUid, clients = []) {
  try {
    const rows = await api(`/api/v1/clinical-notes?therapistId=${therapistUid}`);
    const list = Array.isArray(rows) ? rows : [];
    const nameById = new Map(
      (Array.isArray(clients) ? clients : []).map((c) => [c.id, c.displayName || c.name]),
    );

    return list.map((n) => {
      let s = {};
      if (typeof n.structuredData === 'string' && n.structuredData.trim()) {
        try { s = JSON.parse(n.structuredData) || {}; } catch { s = {}; }
      } else if (n.structuredData && typeof n.structuredData === 'object') {
        s = n.structuredData;
      }
      return {
        ...n,
        ...s,
        id: n.id,
        clientName: n.clientName || nameById.get(n.clientId) || s.clientName || 'Client',
        sessionDate: s.sessionDate || s.date || n.createdAt || null,
        moodRating: s.moodRating ?? n.moodRating ?? null,
        mood: s.mood || n.mood || '',
        sessionFocus: s.sessionFocus || n.content || '',
        // The note editor stores this as `interventions`.
        interventionsUsed: s.interventionsUsed || s.interventions || '',
      };
    }).sort((a, b) => new Date(b.sessionDate || 0) - new Date(a.sessionDate || 0));
  } catch {
    return [];
  }
}

/** Book a session from the calendar's schedule sheet. */
export async function scheduleTherapistCalendarCall({ client, date, time, duration, notes }) {
  const clientId = client?.id || client;
  if (!clientId) throw new Error('Please choose a client');
  const when = new Date(`${date}T${time}`);
  if (Number.isNaN(when.getTime())) throw new Error('Please choose a valid date and time');
  if (when <= new Date()) throw new Error('Please select a future date and time');

  // therapistId was never sent, so the row was written with therapist_id = NULL
  // and the calendar — which queries ?therapistId={uid} — could never find the
  // call the therapist had just created.
  const therapistId = await getStoredUserId();
  if (!therapistId) throw new Error('Your session expired. Please sign in again.');

  return createScheduledCall({
    therapistId,
    createdBy: therapistId,
    status: 'scheduled',
    clientId,
    channel: 'video',
    // `scheduledTime` is the field the endpoint requires — sending scheduledAt
    // fails validation and the booking is rejected.
    scheduledTime: when.toISOString(),
    durationMinutes: parseInt(duration, 10) || 30,
    notes: notes || '',
    metadataJson: JSON.stringify({
      clientName: client?.displayName || client?.name || null,
      status: 'scheduled',
    }),
  });
}

const MOOD_EMOJI = ['😖', '😞', '😔', '😕', '😐', '🙂', '😊', '😄', '😁', '🤩'];

/** Emoji for a 1–10 mood rating. */
export function getMoodEmoji(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n) || n <= 0) return '❔';
  return MOOD_EMOJI[Math.min(Math.max(Math.round(n), 1), 10) - 1];
}

const INTERVENTION_COLORS = {
  cbt: '#4f46e5',
  dbt: '#0d9488',
  emdr: '#a855f7',
  act: '#0ea5e9',
  mindfulness: '#10b981',
  psychodynamic: '#f59e0b',
  solution: '#f43f5e',
  family: '#8b5cf6',
  trauma: '#ef4444',
};

/** Accent colour for a note card, keyed off the intervention used. */
export function getInterventionColor(intervention) {
  const raw = Array.isArray(intervention) ? intervention[0] : intervention;
  const key = String(raw || '').toLowerCase();
  if (!key) return '#94a3b8';
  const hit = Object.keys(INTERVENTION_COLORS).find((k) => key.includes(k));
  return hit ? INTERVENTION_COLORS[hit] : '#4f46e5';
}
