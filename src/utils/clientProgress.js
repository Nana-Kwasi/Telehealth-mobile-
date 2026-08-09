// ─── clientProgress ──────────────────────────────────────────────────────────
// One correct way to express "how is this client doing?".
//
// WHAT WAS WRONG
// Three different formulas were in use, none of them measuring progress:
//
//   Math.min(95, 20 + noteCount * 7)      // more notes written = more "progress"
//   Math.round((moodRating || 5) / 10 * 100)   // today's mood IS the progress
//   Math.round(avgMood * 10)              // average mood across all sessions
//
// Each is wrong in a way that shows a number contradicting the client's actual
// wellbeing:
//   • Note count measures the therapist's admin activity, not the client.
//   • `|| 5` invents a mid-scale reading whenever a rating is missing, so a
//     client with no data at all reads as 50% "progress".
//   • An absolute mood level is not change. Someone stable at 7/10 for a year
//     shows "70% progress" having improved by nothing; someone who climbed 2→5
//     shows 50% while having made the larger gain.
//
// WHAT MEASUREMENT-BASED CARE ACTUALLY DOES
// Routine outcome monitoring scores a validated instrument repeatedly and reads
// the CHANGE FROM BASELINE, judged against a threshold big enough to exceed the
// instrument's measurement error ("reliable change" — ≥6 points on the PHQ-9,
// ≥4 on the GAD-7). Recovery additionally requires crossing below the clinical
// cut-off. Progress is never inferred from attendance or session count, and a
// missing score is missing — not a default.
//
// WHAT THIS DOES
// The system's longitudinal signal is a 1–10 wellbeing score (client mood
// journal entries, plus the therapist's per-session moodRating). So:
//
//   baseline = mean of the first up-to-3 readings
//   latest   = mean of the most recent up-to-3 readings
//   progress = (latest − baseline) / (10 − baseline)
//
// i.e. the share of the room-to-improve that the client has actually gained.
// Averaging the ends damps single-day noise. With fewer than MIN_READINGS
// readings it returns null and the UI must say so rather than print a number.

export const MIN_READINGS = 2;

// A 10-point wellbeing scale, scaled from the PHQ-9's ≥6/27 reliable-change
// threshold (~22% of range), gives ~2 points as the smallest change that is
// unlikely to be noise.
export const RELIABLE_CHANGE_POINTS = 2;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function toTime(value) {
  if (!value) return 0;
  const d = value?.toDate ? value.toDate() : new Date(value);
  const t = d.getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** A 1–10 reading, or null. Never substitutes a default for missing data. */
function readingValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 10) return null;
  return n;
}

/**
 * Gather every wellbeing reading we hold for a client, oldest first.
 *
 * @param {Array} moodEntries  mood journal rows ({ moodScore|moodValue|mood_score, createdAt })
 * @param {Array} notes        clinical notes; moodRating may sit inside structuredData
 */
export function collectReadings(moodEntries = [], notes = []) {
  const readings = [];

  (moodEntries || []).forEach((m) => {
    const v = readingValue(m?.moodScore ?? m?.mood_score ?? m?.moodValue ?? m?.mood_value);
    if (v !== null) readings.push({ value: v, at: toTime(m.createdAt || m.created_at), source: 'mood' });
  });

  (notes || []).forEach((n) => {
    let v = readingValue(n?.moodRating);
    if (v === null && n?.structuredData) {
      try {
        const parsed = typeof n.structuredData === 'string' ? JSON.parse(n.structuredData) : n.structuredData;
        v = readingValue(parsed?.moodRating);
      } catch { /* not JSON — no reading */ }
    }
    if (v !== null) {
      readings.push({ value: v, at: toTime(n.sessionDate || n.createdAt), source: 'note' });
    }
  });

  return readings.sort((a, b) => a.at - b.at);
}

const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);

/**
 * @returns {null | {
 *   percent: number, baseline: number, latest: number, change: number,
 *   readings: number, direction: 'improving'|'declining'|'stable', reliable: boolean
 * }}
 * null means "not enough data" — render that, don't render 0%.
 */
export function calculateClientProgress(moodEntries = [], notes = []) {
  const readings = collectReadings(moodEntries, notes);
  if (readings.length < MIN_READINGS) return null;

  const values = readings.map((r) => r.value);
  const window = Math.min(3, Math.floor(values.length / 2)) || 1;
  const baseline = mean(values.slice(0, window));
  const latest = mean(values.slice(-window));
  const change = latest - baseline;

  // Room left to improve. A client already at 10 has none, so treat any
  // maintenance at the ceiling as full progress rather than dividing by zero.
  const headroom = 10 - baseline;
  const percent = headroom <= 0
    ? (change >= 0 ? 100 : 0)
    : clamp(Math.round((change / headroom) * 100), 0, 100);

  return {
    percent,
    baseline: Math.round(baseline * 10) / 10,
    latest: Math.round(latest * 10) / 10,
    change: Math.round(change * 10) / 10,
    readings: readings.length,
    direction: change >= 0.5 ? 'improving' : change <= -0.5 ? 'declining' : 'stable',
    reliable: Math.abs(change) >= RELIABLE_CHANGE_POINTS,
  };
}

/** Label for the UI, so no screen has to invent wording for missing data. */
export function progressLabel(progress) {
  if (!progress) return 'Not enough data';
  const { percent, direction, reliable } = progress;
  if (direction === 'declining') return `${percent}% · declining`;
  if (!reliable) return `${percent}% · early`;
  return `${percent}% · improving`;
}
