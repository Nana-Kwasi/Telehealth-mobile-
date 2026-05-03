export function normalizeDiagnosticOrderStatus(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return 'PENDING';
  const u = s.toUpperCase().replace(/\s+/g, '_');
  if (u === 'COMPLETE' || u === 'COMPLETED') return 'COMPLETED';
  if (u === 'IN_PROGRESS' || u === 'IN-PROGRESS') return 'IN_PROGRESS';
  if (u === 'REJECTED') return 'REJECTED';
  if (u === 'PENDING') return 'PENDING';
  const lo = s.toLowerCase();
  if (lo === 'completed' || lo === 'complete') return 'COMPLETED';
  if (lo === 'in_progress' || lo === 'in progress') return 'IN_PROGRESS';
  if (lo === 'rejected') return 'REJECTED';
  if (lo === 'pending') return 'PENDING';
  return 'PENDING';
}

export function patientMobileStatusStyleKey(raw) {
  const n = normalizeDiagnosticOrderStatus(raw);
  if (n === 'COMPLETED') return 'completed';
  if (n === 'IN_PROGRESS') return 'in_progress';
  if (n === 'REJECTED') return 'rejected';
  return 'pending';
}
