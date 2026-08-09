import { api } from './apiClient';

export const REPORT_CATEGORIES = [
  { id: 'complaint', label: 'Complaint' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'technical', label: 'Technical' },
  { id: 'billing', label: 'Billing' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'other', label: 'Other' },
];

export const REPORT_SEVERITIES = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'critical', label: 'Critical' },
];

export const emptyGlobalReportForm = () => ({
  category: 'complaint',
  subject: '',
  message: '',
  severity: 'medium',
});

export function resolveReporterName(profile) {
  return (
    profile?.name ||
    profile?.fullName ||
    profile?.displayName ||
    profile?.pharmacyName ||
    profile?.branchName ||
    'User'
  );
}

export async function submitGlobalReport(form, profile, reporterType = 'user', contextPath = '') {
  if (!form.subject?.trim() || !form.message?.trim()) {
    throw new Error('Subject and details are required.');
  }

  await api('/api/v1/reports/global', {
    method: 'POST',
    body: {
      category: form.category,
      subject: form.subject.trim(),
      message: form.message.trim(),
      severity: form.severity || 'medium',
      reporterId: profile?.id || null,
      reporterName: resolveReporterName(profile),
      reporterEmail: profile?.email || '',
      reporterType,
      contextPath: contextPath || '',
    },
  });
}

// The user's own reports, newest first. GET /reports/global?reporterId= is
// available to any authenticated user and filters to that reporter.
export async function listMyGlobalReports(profile) {
  const reporterId = profile?.id;
  if (!reporterId) return [];
  const data = await api(`/api/v1/reports/global?reporterId=${reporterId}`).catch(() => []);
  const list = Array.isArray(data) ? data : [];
  return list.sort((a, b) => {
    const ta = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt || 0).getTime();
    const tb = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
}
