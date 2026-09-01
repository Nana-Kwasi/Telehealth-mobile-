// ─── callWindow ──────────────────────────────────────────────────────────────
// When a scheduled consultation can actually be started or joined.
//
// The medical module showed "Start" on every confirmed appointment regardless of
// date, so a consultation booked for next week looked startable today. Therapy
// already had this rule (therapistVideoCallService.isCallJoinable and the web
// utils/sessionJoinWindow); this is the same rule for the medical module, kept
// deliberately identical so the two behave the same way.
//
// A call opens a few minutes early — people arrive before the hour — and stays
// open for a while after it was due to end so an overrunning call is never cut.

/** Minutes before the start time that the call opens. Matches web + therapy. */
export const JOIN_OPENS_MINUTES_BEFORE = 15;

/** Minutes after the scheduled end that the call stays startable. */
export const JOIN_GRACE_MINUTES_AFTER = 30;

const MIN = 60 * 1000;

/**
 * The scheduled start of an appointment, as a Date.
 *
 * Handles every shape the API and the shim produce: `scheduledAt` (medical),
 * `scheduledTime` (therapy), a Firestore-style Timestamp, or the flat
 * `date` + `time` pair the appointment rows also carry.
 */
export function appointmentStart(appt) {
  if (!appt) return null;
  const raw = appt.scheduledAt || appt.scheduledTime || appt.startsAt;

  if (raw) {
    if (typeof raw?.toDate === 'function') {
      const d = raw.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof raw?.seconds === 'number') return new Date(raw.seconds * 1000);
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Fall back to the flat pair. Parsed as local time — appending 'Z' or letting
  // Date guess would shift the appointment by the timezone offset.
  if (appt.date) {
    const [y, m, day] = String(appt.date).split('-').map(Number);
    const [hh, mm] = String(appt.time || '00:00').split(':').map(Number);
    if (y && m && day) {
      const d = new Date(y, m - 1, day, hh || 0, mm || 0);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return null;
}

/**
 * @returns {{ canStart: boolean, state: 'early'|'open'|'ended'|'unknown', waitLabel: string }}
 *
 * `unknown` (no parseable time) returns canStart:true — an appointment with no
 * recorded time must not become permanently unstartable.
 */
export function getCallWindow(appt, now = new Date()) {
  const start = appointmentStart(appt);
  if (!start) return { canStart: true, state: 'unknown', waitLabel: '' };

  const duration = Number(appt?.durationMinutes) || 30;
  const opensAt = new Date(start.getTime() - JOIN_OPENS_MINUTES_BEFORE * MIN);
  const closesAt = new Date(start.getTime() + (duration + JOIN_GRACE_MINUTES_AFTER) * MIN);

  if (now < opensAt) return { canStart: false, state: 'early', waitLabel: formatWait(opensAt - now) };
  if (now > closesAt) return { canStart: false, state: 'ended', waitLabel: '' };
  return { canStart: true, state: 'open', waitLabel: '' };
}

/** "in 3 days" / "in 4 hrs" / "in 12 min" — how long until the call opens. */
function formatWait(ms) {
  const mins = Math.max(1, Math.round(ms / MIN));
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hr${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
