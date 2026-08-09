export const RX_STATUSES = ['sent', 'accepted', 'partially_fulfilled', 'ready', 'delivered'];
export const BRANCH_STATUSES = ['active', 'suspended', 'inactive'];

export function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000;
  // Mobile talks to the REST API directly, so createdAt arrives as an ISO string
  // rather than the Firestore-shaped object the web shim produces. Without this
  // branch every row scores 0 and the date filter drops the entire report.
  if (typeof ts === 'string') {
    const ms = Date.parse(ts);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

export function parseRangeBounds(dateFromStr, dateToStr) {
  const start = new Date(`${dateFromStr}T00:00:00`);
  const end = new Date(`${dateToStr}T23:59:59.999`);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function rxTouchesBranch(rx, branchId) {
  if (!branchId || branchId === 'all') return true;
  if ((rx.branchId || '') === branchId) return true;
  return (rx.medications || []).some(m => (m.transferBranchId || '') === branchId);
}

export function buildMetrics(branches, filteredRx) {
  const branchCounts = BRANCH_STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
  let pendingPasswordResets = 0;
  branches.forEach(b => {
    const s = (b.status || 'active').toLowerCase();
    if (branchCounts[s] !== undefined) branchCounts[s] += 1;
    if (b.mustChangePassword) pendingPasswordResets += 1;
  });

  const rxCounts = RX_STATUSES.reduce((acc, s) => ({ ...acc, [s]: 0 }), {});
  let medsTotal = 0;
  let medsAvailable = 0;
  let medsNotAvailable = 0;
  let medsAltSuggested = 0;
  let medsApprovedAlt = 0;
  let readyBacklog = 0;
  let unassigned = 0;
  const byBranch = {};

  filteredRx.forEach(rx => {
    const status = (rx.pharmacyStatus || 'sent').toLowerCase();
    if (rxCounts[status] !== undefined) rxCounts[status] += 1;
    if (status === 'ready') readyBacklog += 1;
    if (!rx.branchId) unassigned += 1;

    const branchKey = rx.branchId || 'unassigned';
    const branchName = rx.branchName || 'Unassigned';
    if (!byBranch[branchKey]) byBranch[branchKey] = { branchName, total: 0, delivered: 0, ready: 0, active: 0 };
    byBranch[branchKey].total += 1;
    if (status === 'delivered') byBranch[branchKey].delivered += 1;
    if (status === 'ready') byBranch[branchKey].ready += 1;
    if (status === 'accepted' || status === 'partially_fulfilled') byBranch[branchKey].active += 1;

    (rx.medications || []).forEach(m => {
      medsTotal += 1;
      const ds = (m.drugStatus || 'pending').toLowerCase();
      if (ds === 'available') medsAvailable += 1;
      if (ds === 'not_available') medsNotAvailable += 1;
      if (ds === 'alternative_suggested') medsAltSuggested += 1;
      if (ds === 'approved_replacement') {
        medsApprovedAlt += 1;
        medsAvailable += 1;
      }
    });
  });

  const totalRx = filteredRx.length;
  const delivered = rxCounts.delivered || 0;
  const completionRate = totalRx ? (delivered / totalRx) * 100 : 0;
  const availabilityRate = medsTotal ? (medsAvailable / medsTotal) * 100 : 0;
  const stockoutRate = medsTotal ? (medsNotAvailable / medsTotal) * 100 : 0;
  const altRate = medsTotal ? (medsAltSuggested / medsTotal) * 100 : 0;
  const altApprovalRate = medsAltSuggested ? (medsApprovedAlt / medsAltSuggested) * 100 : 0;
  const branchRows = Object.values(byBranch).sort((a, b) => b.total - a.total);

  return {
    branchCounts,
    pendingPasswordResets,
    rxCounts,
    totalRx,
    readyBacklog,
    unassigned,
    completionRate,
    medsTotal,
    availabilityRate,
    stockoutRate,
    altRate,
    altApprovalRate,
    branchRows,
  };
}
