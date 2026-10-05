import { CALL_JOIN_WINDOW_MS } from '../constants/videoCallConfig';

/**
 * What state is this scheduled call in, right now?
 *
 * Only the therapist video screen had any notion of a call having passed;
 * every other screen showed a two-week-old appointment exactly like tomorrow's,
 * with a live "Join" button. A patient tapping that gets an empty room and no
 * explanation.
 *
 * The window comes from CALL_JOIN_WINDOW_MS so this cannot drift from the
 * rule the join button already uses: joinable from 5 minutes before until 30
 * minutes after the start.
 *
 * Returns { key, label, tone, joinable, past }.
 *   cancelled | completed | joinable | soon | upcoming | missed
 */
export function callState(scheduledTime, status) {
  const raw = String(status || '').toLowerCase();

  if (raw === 'cancelled' || raw === 'declined') {
    return { key: 'cancelled', label: 'Cancelled', tone: 'muted', joinable: false, past: true };
  }
  if (raw === 'completed') {
    return { key: 'completed', label: 'Completed', tone: 'good', joinable: false, past: true };
  }

  const when = scheduledTime?.toDate?.() ? scheduledTime.toDate() : new Date(scheduledTime);
  if (!when || Number.isNaN(when.getTime())) {
    return { key: 'upcoming', label: 'Scheduled', tone: 'info', joinable: false, past: false };
  }

  const diff = when.getTime() - Date.now();

  if (diff <= CALL_JOIN_WINDOW_MS.before && diff >= -CALL_JOIN_WINDOW_MS.after) {
    return { key: 'joinable', label: 'Join now', tone: 'live', joinable: true, past: false };
  }

  // Past the join window and never marked completed. "Missed" rather than
  // "Passed": it says what happened, and it is the word a patient needs if
  // they have to rebook.
  if (diff < 0) {
    return { key: 'missed', label: 'Missed', tone: 'warn', joinable: false, past: true };
  }

  if (diff < 60 * 60 * 1000) {
    return { key: 'soon', label: 'Starting soon', tone: 'info', joinable: false, past: false };
  }
  return { key: 'upcoming', label: 'Scheduled', tone: 'info', joinable: false, past: false };
}

/** Colours for each tone, measured against their own background. */
export const CALL_STATE_COLORS = {
  live:   { bg: '#dcfce7', fg: '#14532d' },   /* 8.30:1 */
  good:   { bg: '#e4f6ec', fg: '#12602f' },   /* 6.82:1 */
  info:   { bg: '#e4ecfb', fg: '#14427e' },   /* 8.38:1 */
  warn:   { bg: '#fdeee0', fg: '#8a4b09' },   /* 5.98:1 */
  muted:  { bg: '#eef0f5', fg: '#454b5c' },   /* 7.63:1 */
};

/** "in 2h 15m" / "3 days ago" — never a raw timestamp. */
export function callTimeLabel(scheduledTime) {
  const when = scheduledTime?.toDate?.() ? scheduledTime.toDate() : new Date(scheduledTime);
  if (!when || Number.isNaN(when.getTime())) return '';
  const diff = when.getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let span;
  if (mins < 1) span = 'less than a minute';
  else if (mins < 60) span = `${mins} min`;
  else if (hours < 24) span = `${hours}h ${mins % 60}m`;
  else span = `${days} day${days === 1 ? '' : 's'}`;

  return diff >= 0 ? `in ${span}` : `${span} ago`;
}
