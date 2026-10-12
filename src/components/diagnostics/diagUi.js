// Mobile copy of web Dashboard/Diagnostic/diagUi.js — keep the two in step.
// Shared vocabulary for the lab / scan dashboards (parent and branch):
// workflow stages, priority, turnaround, money, CSV export, result templates
// with reference ranges, and scan modalities with patient preparation.

export const STAGES = {
  PENDING:          { label: 'Awaiting patient', short: 'Pending',     bg: '#fef3c7', fg: '#92400e', dot: '#f59e0b' },
  SAMPLE_COLLECTED: { label: 'Sample collected', short: 'Collected',   bg: '#e0f2fe', fg: '#075985', dot: '#0ea5e9' },
  SCHEDULED:        { label: 'Scan booked',      short: 'Booked',      bg: '#ede9fe', fg: '#5b21b6', dot: '#8b5cf6' },
  IN_PROGRESS:      { label: 'In progress',      short: 'In progress', bg: '#dbeafe', fg: '#1e40af', dot: '#3b82f6' },
  COMPLETED:        { label: 'Completed',        short: 'Done',        bg: '#dcfce7', fg: '#14532d', dot: '#22c55e' },
  REJECTED:         { label: 'Rejected',         short: 'Rejected',    bg: '#fee2e2', fg: '#991b1b', dot: '#ef4444' },
  CANCELLED:        { label: 'Cancelled',        short: 'Cancelled',   bg: '#f1f5f9', fg: '#475569', dot: '#94a3b8' },
};

export const OPEN_STAGES = ['PENDING', 'SAMPLE_COLLECTED', 'SCHEDULED', 'IN_PROGRESS'];

export function stageOf(raw) {
  const s = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (!s || s === 'REQUESTED' || s === 'NEW') return 'PENDING';
  if (s === 'PROCESSING') return 'IN_PROGRESS';
  if (s === 'COMPLETE') return 'COMPLETED';
  return STAGES[s] ? s : 'PENDING';
}

export const PRIORITY = {
  STAT:    { label: 'STAT',    bg: '#dc2626', fg: '#fff', rank: 0, hours: 2 },
  URGENT:  { label: 'Urgent',  bg: '#f97316', fg: '#fff', rank: 1, hours: 6 },
  ROUTINE: { label: 'Routine', bg: '#e2e8f0', fg: '#334155', rank: 2, hours: null },
};
export const priorityOf = (p) => (PRIORITY[String(p || '').toUpperCase()] ? String(p).toUpperCase() : 'ROUTINE');

export function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    return null;
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmtDate = (v) => { const d = toDate(v); return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'; };
export const fmtDateTime = (v) => { const d = toDate(v); return d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };

export function fmtHours(h) {
  if (h == null || Number.isNaN(Number(h))) return '—';
  const n = Number(h);
  if (n < 1) return `${Math.max(1, Math.round(n * 60))}m`;
  if (n < 48) return `${n.toFixed(n < 10 ? 1 : 0)}h`;
  return `${(n / 24).toFixed(1)}d`;
}

export const money = (v, currency = 'GHS') => {
  const n = Number(v || 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Turnaround target in hours: STAT 2h, urgent 6h, catalog TAT, else 24h lab / 48h scan. */
export function targetHours(order, type) {
  const p = PRIORITY[priorityOf(order?.priority)];
  if (p.hours) return p.hours;
  if (order?.tatHours) return Number(order.tatHours);
  return type === 'scan' ? 48 : 24;
}

export function ageHours(order) {
  const start = toDate(order?.createdAt);
  if (!start) return 0;
  const end = stageOf(order?.status) === 'COMPLETED' ? (toDate(order?.completedAt) || toDate(order?.updatedAt) || new Date()) : new Date();
  return Math.max(0, (end.getTime() - start.getTime()) / 3600000);
}

/** 'ok' | 'soon' (≥75% of target) | 'late' for an open order. */
export function tatState(order, type) {
  if (!OPEN_STAGES.includes(stageOf(order?.status))) return 'closed';
  const ratio = ageHours(order) / targetHours(order, type);
  if (ratio >= 1) return 'late';
  if (ratio >= 0.75) return 'soon';
  return 'ok';
}

// ── Lab result templates ─────────────────────────────────────────────────────
// Typical adult reference ranges as a starting point. A centre overrides them
// per test in its Test Catalog (parameters saved on the catalog item).
// kind 'num': low/high normal range, critLow/critHigh trigger a CRITICAL flag.
// kind 'qual': `normal` lists the normal answers; anything else is abnormal.
const NEG = ['Negative', 'Not detected', 'Non-reactive'];
const qual = (name, options = ['Negative', 'Positive'], normal = NEG) => ({ name, kind: 'qual', options, normal });
const num = (name, unit, low, high, critLow = null, critHigh = null) => ({ name, kind: 'num', unit, low, high, critLow, critHigh });

export const LAB_TEMPLATES = [
  { match: ['full blood', 'fbc', 'cbc', 'blood count'], specimen: 'EDTA whole blood', params: [
    num('Haemoglobin', 'g/dL', 12, 17, 7, 20), num('WBC', '×10⁹/L', 4, 11, 2, 30), num('Platelets', '×10⁹/L', 150, 400, 50, 1000),
    num('RBC', '×10¹²/L', 4.2, 5.9), num('Haematocrit', '%', 36, 50, 20, 60), num('MCV', 'fL', 80, 100),
    num('Neutrophils', '%', 40, 75), num('Lymphocytes', '%', 20, 45)] },
  { match: ['fasting blood sugar', 'fbs', 'fasting glucose'], specimen: 'Fluoride plasma', params: [num('Glucose (fasting)', 'mmol/L', 3.9, 5.5, 2.8, 22)] },
  { match: ['random blood sugar', 'rbs', 'random glucose', 'blood sugar', 'glucose'], specimen: 'Fluoride plasma', params: [num('Glucose (random)', 'mmol/L', 3.9, 7.8, 2.8, 22)] },
  { match: ['hba1c', 'a1c', 'glycated'], specimen: 'EDTA whole blood', params: [num('HbA1c', '%', 4, 5.6)] },
  { match: ['lipid'], specimen: 'Serum', params: [num('Total cholesterol', 'mmol/L', 0, 5.2), num('LDL cholesterol', 'mmol/L', 0, 3.4), num('HDL cholesterol', 'mmol/L', 1, 9.9), num('Triglycerides', 'mmol/L', 0, 1.7)] },
  { match: ['liver', 'lft'], specimen: 'Serum', params: [num('ALT', 'U/L', 7, 56), num('AST', 'U/L', 10, 40), num('ALP', 'U/L', 44, 147), num('Total bilirubin', 'µmol/L', 5, 21, null, 340), num('Albumin', 'g/L', 35, 50), num('Total protein', 'g/L', 60, 83)] },
  { match: ['kidney', 'renal', 'rft', 'kft', 'electrolyte', 'u&e', 'creatinine'], specimen: 'Serum', params: [num('Urea', 'mmol/L', 2.5, 7.8), num('Creatinine', 'µmol/L', 60, 110, null, 500), num('Sodium', 'mmol/L', 135, 145, 120, 160), num('Potassium', 'mmol/L', 3.5, 5.1, 2.5, 6.5), num('Chloride', 'mmol/L', 98, 107)] },
  { match: ['thyroid', 'tsh'], specimen: 'Serum', params: [num('TSH', 'mIU/L', 0.4, 4.0)] },
  { match: ['malaria', 'mrdt', 'blood film', 'mps'], specimen: 'EDTA whole blood', params: [qual('Malaria parasites', ['Not detected', 'Detected'], ['Not detected']), { name: 'Species / density', kind: 'text' }] },
  { match: ['typhoid', 'widal'], specimen: 'Serum', params: [qual('Typhoid IgM'), qual('Typhoid IgG')] },
  { match: ['urinalysis', 'urine r', 'urine routine', 'urine'], specimen: 'Mid-stream urine', params: [
    qual('Protein', ['Negative', 'Trace', '1+', '2+', '3+']), qual('Glucose', ['Negative', 'Trace', '1+', '2+', '3+']),
    qual('Blood', ['Negative', 'Trace', '1+', '2+', '3+']), qual('Leukocytes', ['Negative', 'Trace', '1+', '2+', '3+']),
    qual('Nitrite'), num('pH', '', 4.5, 8), num('Specific gravity', '', 1.005, 1.03)] },
  { match: ['hiv'], specimen: 'Serum', params: [qual('HIV 1/2 antibody', ['Non-reactive', 'Reactive'], ['Non-reactive'])] },
  { match: ['hepatitis b', 'hbsag'], specimen: 'Serum', params: [qual('HBsAg', ['Non-reactive', 'Reactive'], ['Non-reactive'])] },
  { match: ['hepatitis c', 'hcv'], specimen: 'Serum', params: [qual('Anti-HCV', ['Non-reactive', 'Reactive'], ['Non-reactive'])] },
  { match: ['pregnancy', 'hcg'], specimen: 'Urine', params: [qual('hCG', ['Negative', 'Positive'], ['Negative', 'Positive'])] },
  { match: ['sickl', 'hb electrophoresis', 'genotype'], specimen: 'EDTA whole blood', params: [qual('Sickling test', ['Negative', 'Positive']), { name: 'Hb genotype', kind: 'text' }] },
];

export function parseParams(json) {
  if (!json) return null;
  try { const v = typeof json === 'string' ? JSON.parse(json) : json; return Array.isArray(v) && v.length ? v : null; } catch { return null; }
}

/** Parameter rows for a test: the catalog's own, else a built-in template, else one free row. */
export function templateFor(testType, catalogItem) {
  const own = parseParams(catalogItem?.parametersJson);
  if (own) return { params: own, specimen: catalogItem?.specimenType || '', source: 'catalog' };
  const t = String(testType || '').toLowerCase();
  const tpl = LAB_TEMPLATES.find(x => x.match.some(m => t.includes(m)));
  if (tpl) return { params: tpl.params, specimen: catalogItem?.specimenType || tpl.specimen, source: 'default' };
  return { params: [{ name: testType || 'Result', kind: 'text' }], specimen: catalogItem?.specimenType || '', source: 'none' };
}

/** 'N' normal, 'L'/'H' outside range, 'LL'/'HH' critical, 'A' abnormal qualitative, '' not entered. */
export function flagFor(param, value) {
  if (value == null || String(value).trim() === '') return '';
  if (param.kind === 'qual') return (param.normal || NEG).some(n => n.toLowerCase() === String(value).toLowerCase()) ? 'N' : 'A';
  if (param.kind !== 'num') return '';
  const v = Number(String(value).replace(',', '.'));
  if (Number.isNaN(v)) return '';
  if (param.critLow != null && v < param.critLow) return 'LL';
  if (param.critHigh != null && v > param.critHigh) return 'HH';
  if (param.low != null && v < param.low) return 'L';
  if (param.high != null && v > param.high) return 'H';
  return 'N';
}

export const FLAG_META = {
  N:  { label: 'Normal',     bg: '#dcfce7', fg: '#166534' },
  L:  { label: 'Low',        bg: '#fef3c7', fg: '#92400e' },
  H:  { label: 'High',       bg: '#fef3c7', fg: '#92400e' },
  A:  { label: 'Abnormal',   bg: '#ffedd5', fg: '#9a3412' },
  LL: { label: 'CRITICAL LOW',  bg: '#dc2626', fg: '#fff' },
  HH: { label: 'CRITICAL HIGH', bg: '#dc2626', fg: '#fff' },
};

export const rangeText = (p) => (p.kind === 'num'
  ? `${p.low ?? ''}${p.low != null || p.high != null ? '–' : ''}${p.high ?? ''} ${p.unit || ''}`.trim()
  : p.kind === 'qual' ? (p.normal || NEG)[0] : '');

// ── Scans ────────────────────────────────────────────────────────────────────
export const MODALITIES = [
  { key: 'xray', label: 'X-ray', match: ['x-ray', 'xray', 'x ray', 'radiograph', 'chest pa'], prep: 'No special preparation. Remove jewellery and metal objects. Tell staff if you may be pregnant.' },
  { key: 'us', label: 'Ultrasound', match: ['ultrasound', 'usg', 'sonograph', 'scan abdom', 'pelvic', 'obstetric', 'doppler'], prep: 'Abdominal: do not eat for 6 hours before. Pelvic/obstetric: drink 1 litre of water an hour before and do not empty your bladder.' },
  { key: 'ct', label: 'CT', match: ['ct ', 'ct-', 'computed tomography', 'cat scan', ' ct'], prep: 'If contrast is used: do not eat for 4 hours before; bring recent kidney function results. Tell staff about allergies, diabetes medicines or pregnancy.' },
  { key: 'mri', label: 'MRI', match: ['mri', 'magnetic resonance'], prep: 'Remove all metal. Tell staff about pacemakers, implants, metal fragments or claustrophobia. Arrive 20 minutes early.' },
  { key: 'mammo', label: 'Mammogram', match: ['mammo'], prep: 'Do not use deodorant, powder or lotion on the day. Bring previous mammograms if you have them.' },
  { key: 'echo', label: 'Echo / ECG', match: ['echo', 'ecg', 'ekg'], prep: 'Wear a two-piece outfit. No special preparation.' },
];

export function modalityFor(testType) {
  const t = ` ${String(testType || '').toLowerCase()} `;
  return MODALITIES.find(m => m.match.some(k => t.includes(k))) || { key: 'other', label: 'Imaging', prep: 'Follow any instructions from your doctor. Bring your National ID and referral.' };
}

export const SPECIMENS = ['EDTA whole blood', 'Serum', 'Fluoride plasma', 'Citrate plasma', 'Mid-stream urine', 'Stool', 'Sputum', 'Swab', 'CSF', 'Other'];

/** Drawer route names for a lab/scan login (parent or branch). */
export function diagRoutes(type, isBranch) {
  const base = type === 'scan' ? 'Scan' : 'Lab';
  const p = isBranch ? `${base}Branch` : base;
  return {
    home: `${p}Home`, orders: `${p}Orders`, detail: `${p}OrderDetail`, results: `${p}Results`, verify: `${p}Verify`,
    catalog: `${p}Catalog`, branches: `${base}Branches`, branchDetail: `${base}BranchDetail`,
  };
}
