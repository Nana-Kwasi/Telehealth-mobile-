/**
 * Derives a branch's transfer ledger from prescriptions.
 *
 * The Transfers screens previously listed only lines where `transferOutcome` was
 * 'not_received' AND this branch was the one that failed to receive them — a single
 * failure case, so in normal operation the screen was always empty. A branch needs
 * to see every transfer it is party to, in both directions, and where each one has
 * got to.
 *
 * Shared by web and mobile so both report the same ledger.
 */

/** Where a transfer has reached, from the point of view of whoever is looking. */
export function transferStage(med) {
  const reqStatus = med?.transferRequestStatus || '';
  const outcome = med?.transferOutcome || '';
  if (outcome === 'received') return { key: 'received', label: 'Received', tone: 'ok' };
  if (outcome === 'not_received') return { key: 'declined', label: 'Declined by receiving branch', tone: 'bad' };
  if (reqStatus === 'rejected_by_patient') return { key: 'patient_declined', label: 'Patient declined', tone: 'bad' };
  if (reqStatus === 'expired') return { key: 'expired', label: 'Request expired', tone: 'warn' };
  if (reqStatus === 'superseded') return { key: 'superseded', label: 'Withdrawn (newer request)', tone: 'warn' };
  if (med?.drugStatus === 'transfer_requested' && reqStatus === 'pending_patient') {
    return { key: 'pending_patient', label: 'Awaiting patient approval', tone: 'warn' };
  }
  if (med?.drugStatus === 'transferred') {
    return { key: 'pending_receipt', label: 'Awaiting receiving branch confirmation', tone: 'info' };
  }
  // Carries transfer history but nothing is live any more (e.g. the request was
  // cleared, or the line was reset). Saying "in progress" here would have a
  // pharmacist waiting on a transfer that is not actually running.
  if (med?.drugStatus === 'not_available' || med?.drugStatus === 'available') {
    return { key: 'closed', label: 'No longer in transfer', tone: 'warn' };
  }
  return { key: 'unknown', label: 'In progress', tone: 'info' };
}

/**
 * Build the ledger rows for `branchId` from a list of prescriptions.
 * A row is produced for any medication line where this branch is either the sender
 * or the destination — including requests still awaiting the patient.
 */
export function buildTransferRows(prescriptions = [], branchId) {
  if (!branchId) return [];
  const rows = [];
  prescriptions.forEach((rx) => {
    (rx.medications || []).forEach((m, medIndex) => {
      const sentByMe = (m.transferFromBranchId || '') === branchId
        || (m.transferRequestedByBranchId || '') === branchId;
      const toMe = (m.transferBranchId || '') === branchId
        || (m.transferRequestBranchId || '') === branchId;
      // Only lines that actually carry transfer metadata count.
      const isTransferLine = !!(m.transferFromBranchId || m.transferRequestedByBranchId
        || m.transferBranchId || m.transferRequestBranchId);
      if (!isTransferLine || (!sentByMe && !toMe)) return;

      const stage = transferStage(m);
      rows.push({
        key: `${rx.id}-${medIndex}`,
        rxId: rx.id,
        medIndex,
        direction: sentByMe ? 'outgoing' : 'incoming',
        drug: m.name || 'Drug',
        strength: m.strength || '',
        patientName: rx.patientName || 'Patient',
        ref: rx.prescriptionRef || '—',
        counterparty: sentByMe
          ? (m.transferBranchName || m.transferRequestBranchName || 'another branch')
          : (m.transferFromBranchName || m.transferRequestedByBranchName || 'another branch'),
        stage,
        // Needs this branch to act: an approved transfer sitting on our counter.
        actionable: toMe && stage.key === 'pending_receipt',
        at: m.transferReceivedAt || m.transferRequestedAt || rx.updatedAt || rx.createdAt || null,
      });
    });
  });
  rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
  return rows;
}
