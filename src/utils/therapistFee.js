// ─── Therapist fee: one place ────────────────────────────────────────────────
// The session fee is set in exactly two UIs — the therapist's own Settings, and
// the admin's user editor — and read by many: matching, booking, payment,
// MedPsych/Second Opinion, and every summary that prints a total.
//
// Those readers had each grown their own fallback: `?? 80`, `?? 0`, sometimes
// `.rate`, sometimes `sessionRate`. Two consequences, both bad:
//
//   1. Admin edited `consultationFee` while the therapist's own screen wrote
//      `sessionRate`, so an admin's change never reached the booking screens.
//   2. A therapist who had not set a fee silently billed someone $80, because
//      that number was hardcoded as a fallback in the booking screen.
//
// So: ONE canonical field (`sessionRate`, which is what the API returns and the
// data already holds), read through ONE function, with NO invented default.
// A missing fee returns null and the caller must decide what to do — which is a
// decision about money and belongs in the UI, not in a `??`.

/** The canonical field name. Anything writing a fee must write this. */
export const FEE_FIELD = 'sessionRate';

/**
 * The therapist's session fee, or null when none is set.
 *
 * Reads the legacy aliases too, so a record written before this was
 * centralised still resolves rather than silently reading as unpriced.
 */
export function therapistFee(therapist) {
  if (!therapist) return null;
  const candidates = [
    therapist.sessionRate,
    therapist.consultationFee,   // what the admin editor used to write
    therapist.rate,              // older match/booking screens
    therapist.hourlyRate,
    therapist.metadata?.sessionRate,
  ];
  for (const value of candidates) {
    if (value === null || value === undefined || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

/** True when this therapist can be booked for a paid session. */
export function hasFee(therapist) {
  const fee = therapistFee(therapist);
  return fee !== null && fee > 0;
}

/**
 * Fee for display, e.g. "GHS 2,000" — or a plain statement when unset.
 *
 * Never prints "GHS 0" for a missing fee: zero is a real price (a free
 * session), and showing it for "not set yet" would be a lie about money.
 */
export function formatFee(therapist, currency = 'GHS') {
  const fee = therapistFee(therapist);
  if (fee === null) return 'Fee not set';
  if (fee === 0) return 'Free';
  return `${currency} ${fee.toLocaleString()}`;
}
