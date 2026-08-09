/**
 * Pharmacy prescription status + per-line pickup (medications[].pickupDeliveredAt).
 *
 * Mirror of Telehealth/src/utils/pharmacyRxStatus.js so the mobile dispensing flow
 * makes the same decisions as the web one — keep the two in step.
 */
import { hasPendingDoctorNote, awaitingDoctorDecision } from './pharmacyRxNotes';

export { hasPendingDoctorNote, awaitingDoctorDecision };

/** Line is closed for pickup purposes (picked up, or NA / no dispense). */
export function isLinePickupSatisfied(m) {
  if (!m) return true;
  const ds = m.drugStatus || 'pending';
  if (ds === 'not_available') return true;
  if (ds === 'alternative_suggested') return false;
  if (['pending', 'transfer_requested', 'transferred'].includes(ds)) return false;
  if (ds === 'available' || ds === 'approved_replacement') return !!m.pickupDeliveredAt;
  return false;
}

/** Stock / workflow status only — never returns delivered (that is set on finalize). */
export function deriveRxStockStatus(meds = []) {
  if (!meds.length) return 'sent';
  const statuses = meds.map(m => m.drugStatus || 'pending');
  if (statuses.every(s => s === 'available' || s === 'approved_replacement')) return 'ready';
  if (statuses.some(s => ['not_available', 'alternative_suggested', 'transferred', 'transfer_requested'].includes(s))) {
    return 'partially_fulfilled';
  }
  return 'accepted';
}

// `ownerId` is the entity responsible for a line that isn't transferred elsewhere.
// It defaults to rx.branchId (the routed branch); the parent pharmacy passes its own
// id so it can dispense prescriptions that aren't routed to any branch.
export function pickupResponsibleBranchId(med, rx, ownerId) {
  if (!med || !rx) return null;
  if (med.pickupDeliveredAt) return null;
  const ds = med.drugStatus || 'pending';
  if (ds === 'not_available') return null;
  if (ds === 'alternative_suggested') return null;
  if (!['available', 'approved_replacement'].includes(ds)) return null;

  const tb = med.transferBranchId || '';
  const owner = (ownerId || rx.branchId) || '';
  if (tb && tb !== owner) return tb;
  return owner || null;
}

export function branchCanMarkLinePickup(profileId, med, rx, ownerId) {
  if (!profileId || !med || !rx) return false;
  if ((rx.pharmacyStatus || '') === 'delivered') return false;
  if (med.pickupDeliveredAt) return false;
  // A clinical-impact note or a suggested alternative on this line must be signed
  // off by the doctor before the drug can be handed over.
  if (awaitingDoctorDecision(med)) return false;
  const ds = med.drugStatus || 'pending';
  if (!['available', 'approved_replacement'].includes(ds)) return false;
  return pickupResponsibleBranchId(med, rx, ownerId) === profileId;
}

/** Owner cannot change stock on a line fulfilled at another branch after transfer. */
export function ownerDrugRowLockedForOps(isOwnerBranch, med, profileId) {
  if (!isOwnerBranch || !med) return false;
  const tb = med.transferBranchId || '';
  if (!tb || tb === profileId) return false;
  const ds = med.drugStatus || 'pending';
  return ['transferred', 'available', 'approved_replacement'].includes(ds);
}

export function allPickupsSatisfied(meds = []) {
  return meds.length > 0 && meds.every(isLinePickupSatisfied);
}
