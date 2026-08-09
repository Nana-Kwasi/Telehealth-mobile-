// ─── Tolerant date formatting ────────────────────────────────────────────────
// Screens carried over from Firestore read timestamps as `ts.seconds * 1000`. The
// REST API sends ISO-8601 strings, so `ts.seconds` is undefined, `undefined * 1000`
// is NaN, and `new Date(NaN).toLocaleDateString()` renders the literal text
// "Invalid Date" — which is what the diagnostic order/result cards were showing.
//
// These helpers accept every shape a timestamp arrives in: an ISO string, a Date,
// epoch millis/seconds, or a Firestore-style { seconds } / { toDate() } object.

export function toDateSafe(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      const d = value.toDate();
      return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
    if (typeof value._seconds === 'number') return new Date(value._seconds * 1000);
    return null;
  }
  if (typeof value === 'number') {
    // Ten-digit values are seconds, not millis (a raw epoch-seconds column would
    // otherwise resolve to 1970).
    return new Date(value < 1e11 ? value * 1000 : value);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pick the first field that parses as a date. */
export function firstDate(...values) {
  for (const v of values) {
    const d = toDateSafe(v);
    if (d) return d;
  }
  return null;
}

export function formatDate(value, fallback = '—') {
  const d = toDateSafe(value);
  return d ? d.toLocaleDateString() : fallback;
}

export function formatDateTime(value, fallback = '—') {
  const d = toDateSafe(value);
  return d ? `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : fallback;
}

/** Epoch millis for sorting; 0 when absent so undated rows sink to the bottom. */
export function dateMillis(value) {
  const d = toDateSafe(value);
  return d ? d.getTime() : 0;
}
