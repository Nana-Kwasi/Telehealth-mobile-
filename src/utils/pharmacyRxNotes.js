/**
 * Pharmacy clinical-impact notes on a prescription line (medications[].pharmacyNotes).
 *
 * A note flagged `requiresDoctorApproval` must be signed off by the prescribing
 * doctor before the drug may be handed over, and the patient only ever sees it
 * once that approval has happened. Notes without the flag are purely operational:
 * they never block delivery and are visible to the patient immediately.
 *
 * Mirrors the web helpers in Telehealth/src/utils/pharmacyRxStatus.js — keep the
 * two in step.
 */

/**
 * A delivered prescription is a closed clinical record: nobody edits it afterwards,
 * not the pharmacy and not the prescribing doctor. `deliveredAt` is the reliable
 * signal (it is a real column); the status fields are checked too because the
 * pharmacy workflow state and the doctor's Rx status share one column.
 */
export function isRxDelivered(rx) {
  if (!rx) return false;
  if (rx.deliveredAt) return true;
  return (rx.pharmacyStatus || '') === 'delivered' || (rx.status || '') === 'delivered';
}

/** The pharmacy must not move this line on until the doctor has ruled on it. */
export function awaitingDoctorDecision(med) {
  if (!med) return false;
  if ((med.drugStatus || '') === 'alternative_suggested') return true;
  return hasPendingDoctorNote(med);
}

export function pendingDoctorNotes(med) {
  if (!med || !Array.isArray(med.pharmacyNotes)) return [];
  return med.pharmacyNotes.filter(
    n => n?.requiresDoctorApproval && (n.approvalStatus || 'pending_doctor') === 'pending_doctor'
  );
}

export function hasPendingDoctorNote(med) {
  return pendingDoctorNotes(med).length > 0;
}

/** True when any line of the prescription is still waiting on the doctor. */
export function rxHasPendingDoctorNote(rx) {
  return (rx?.medications || []).some(hasPendingDoctorNote);
}

/** Notes the patient is allowed to see — only what the doctor has approved. */
export function patientVisibleNotes(med) {
  if (!med || !Array.isArray(med.pharmacyNotes)) return [];
  return med.pharmacyNotes.filter(
    n => n && (!n.requiresDoctorApproval || n.approvalStatus === 'approved')
  );
}
