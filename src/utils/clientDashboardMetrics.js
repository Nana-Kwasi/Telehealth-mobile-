// ─── clientDashboardMetrics ──────────────────────────────────────────────────
// The four bars on the client dashboard's "Your Progress" card.
//
// WHAT WAS WRONG
// They were derived by keyword-scraping the free text of therapy notes:
//
//   Stress Management = 100 − (hits of 'stress'|'anxiety'|'worried'… × 20)
//   Sleep Quality     = 50, ±5/10 per mention of 'sleep'|'tired'|'rested'…
//   Mood Improvement  = a PHQ-9 sum × 8, or a lookup on a questionnaire word
//   Goal Achievement  = 10% per week enrolled, capped at 80%
//
// So a note that simply never used the word "stress" scored the client 100% at
// stress management, and a client with no ratings at all landed on exactly 40%
// sleep quality — the `40 + (null × 5)` branch. Nobody recorded those numbers;
// they were artefacts of which words a therapist happened to type. In a health
// product that is worse than showing nothing.
//
// WHAT THIS DOES
// Every bar is now computed from data somebody actually recorded, and each one
// carries a `detail` string naming its own source so the number is auditable
// from the UI. When the underlying data does not exist the value is `null` and
// the caller must render "—", never 0%.
//
// Identical file in the web and mobile projects — keep them in sync.

import { calculateClientProgress } from './clientProgress';

const isCompletedGoal = (g) =>
  String(g?.status || '').toLowerCase() === 'completed' || Number(g?.progress) >= 100;

const isCompletedSession = (s) =>
  String(s?.status || '').toLowerCase() === 'completed';

function toTime(value) {
  if (!value) return 0;
  const d = value?.toDate ? value.toDate() : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Distinct days that carry a mood check-in within the last `days` days. */
export function checkInDays(moodEntries = [], days = 30) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const seen = new Set();
  (moodEntries || []).forEach((m) => {
    const t = toTime(m?.createdAt || m?.created_at);
    if (t && t >= cutoff) seen.add(new Date(t).toDateString());
  });
  return seen.size;
}

// Roughly three check-ins a week over a month — enough to show a trend without
// demanding daily journalling.
export const CHECKIN_TARGET_DAYS = 12;

/**
 * @returns {Array<{key, label, value: number|null, detail: string}>}
 *          `value` is 0-100, or null meaning "nothing recorded yet".
 */
export function buildProgressMetrics({
  moodEntries = [],
  notes = [],
  goals = [],
  sessions = [],
} = {}) {
  // 1 — Wellbeing: change from baseline across the client's own 1-10 readings.
  const progress = calculateClientProgress(moodEntries, notes);

  // 2 — Goals set by the therapist for this client.
  const totalGoals = (goals || []).length;
  const doneGoals = (goals || []).filter(isCompletedGoal).length;

  // 3 — Sessions actually attended out of those booked.
  const totalSessions = (sessions || []).length;
  const doneSessions = (sessions || []).filter(isCompletedSession).length;

  // 4 — How consistently the client is checking in.
  const days = checkInDays(moodEntries);

  return [
    {
      key: 'wellbeing',
      label: 'Wellbeing',
      value: progress ? progress.percent : null,
      detail: progress
        ? `${progress.baseline} → ${progress.latest} over ${progress.readings} check-ins`
        : 'Needs at least 2 mood check-ins',
    },
    {
      key: 'goals',
      label: 'Goals completed',
      value: totalGoals ? Math.round((doneGoals / totalGoals) * 100) : null,
      detail: totalGoals
        ? `${doneGoals} of ${totalGoals} goal${totalGoals === 1 ? '' : 's'} completed`
        : 'No goals set by your therapist yet',
    },
    {
      key: 'sessions',
      label: 'Sessions attended',
      value: totalSessions ? Math.round((doneSessions / totalSessions) * 100) : null,
      detail: totalSessions
        ? `${doneSessions} of ${totalSessions} session${totalSessions === 1 ? '' : 's'} completed`
        : 'No sessions booked yet',
    },
    {
      key: 'consistency',
      label: 'Check-in consistency',
      value: days ? Math.min(100, Math.round((days / CHECKIN_TARGET_DAYS) * 100)) : null,
      detail: days
        ? `${days} day${days === 1 ? '' : 's'} with a check-in in the last 30`
        : 'No check-ins in the last 30 days',
    },
  ];
}

/** The headline score: the mean of whichever metrics have data. null if none. */
export function overallProgressScore(metrics = []) {
  const known = metrics.filter((m) => typeof m.value === 'number');
  if (!known.length) return null;
  return Math.round(known.reduce((s, m) => s + m.value, 0) / known.length);
}
