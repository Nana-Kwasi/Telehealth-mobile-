import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getStoredUserId } from './apiClient';
import { calculateClientProgress } from '../utils/clientProgress';

function inRange(dateVal, startDate, endDate) {
  const d = new Date(dateVal);
  return d >= startDate && d <= endDate;
}

export async function generateClientProgressReport(startDate, endDate) {
  const therapistId = await getStoredUserId();
  const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`);
  const clientProgress = [];
  let totalSessions = 0;
  let totalProgress = 0;
  // Only clients with real readings count toward the average, so an unmeasured
  // caseload can't drag a fabricated number into the report.
  let measuredClients = 0;

  for (const assignment of assignments || []) {
    const clientId = assignment.clientId;
    const notesData = await api(`/api/v1/clinical-notes?therapistId=${therapistId}&clientId=${clientId}`).catch(() => []);
    const notes = (notesData || []).filter((n) => inRange(n.createdAt || n.sessionDate, startDate, endDate));
    const sessions = notes.length;
    // Was: average of (moodRating || 5) × 10 — an absolute mood level, not a
    // change, and a note with no rating silently counted as 5 (=50%). A client
    // with no ratings at all scored 50% "progress". Measure change instead.
    const moodRows = await api(`/api/v1/patients/${clientId}/daily-feelings`).catch(() => []);
    const stat = calculateClientProgress(moodRows, notesData || []);
    const progress = stat ? stat.percent : null;
    totalSessions += sessions;
    if (stat) { totalProgress += stat.percent; measuredClients += 1; }

    const clientName = assignment.clientName || assignment.clientDisplayName || `Client ${String(clientId).slice(0, 8)}`;
    clientProgress.push({
      id: clientId,
      name: clientName,
      totalSessions: sessions,
      progress,
      lastSession: sessions > 0 ? new Date(notes[notes.length - 1].createdAt || notes[notes.length - 1].sessionDate).toLocaleDateString() : 'N/A',
    });
  }

  return {
    type: 'Client Progress Report',
    assignedClients: (assignments || []).length,
    totalSessions,
    averageProgress: measuredClients ? Math.round(totalProgress / measuredClients) : null,
    measuredClients,
    clientProgress,
  };
}

export async function generateTherapyNotesReport(startDate, endDate) {
  const therapistId = await getStoredUserId();
  const assignments = await api(`/api/v1/therapy-management/assignments?therapistId=${therapistId}`).catch(() => []);
  const notes = [];
  let totalMood = 0;

  for (const assignment of assignments || []) {
    const clientId = assignment.clientId;
    const clientName = assignment.clientName || assignment.clientDisplayName || 'Client';
    const notesData = await api(`/api/v1/clinical-notes?therapistId=${therapistId}&clientId=${clientId}`).catch(() => []);
    (notesData || []).forEach((n) => {
      if (!inRange(n.createdAt || n.sessionDate, startDate, endDate)) return;
      totalMood += Number(n.moodRating) || 0;
      notes.push({
        id: n.id,
        clientName,
        sessionDate: new Date(n.createdAt || n.sessionDate).toLocaleDateString(),
        sessionFocus: n.sessionFocus || n.subjectiveSummary || '—',
        moodRating: Number(n.moodRating) || null,
        interventionsUsed: n.interventionsUsed || '—',
        progressAssessment: n.progressAssessment || n.assessment || '—',
      });
    });
  }

  notes.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));

  return {
    type: 'My Therapy Notes Report',
    totalNotes: notes.length,
    averageMoodRating: notes.length ? Math.round((totalMood / notes.length) * 10) / 10 : 0,
    notes,
  };
}

export async function generateScheduledCallsReport(startDate, endDate) {
  const therapistId = await getStoredUserId();
  const data = await api(`/api/v1/scheduled-calls?therapistId=${therapistId}`).catch(() => []);
  const calls = (data || []).filter((c) => {
    const dt = c.scheduledTime ? new Date(c.scheduledTime) : null;
    return dt && dt >= startDate && dt <= endDate;
  });

  let completed = 0;
  let cancelled = 0;
  calls.forEach((c) => {
    if (c.status === 'completed') completed += 1;
    if (c.status === 'cancelled') cancelled += 1;
  });

  return {
    type: 'My Scheduled Calls Report',
    totalCalls: calls.length,
    completedCalls: completed,
    cancelledCalls: cancelled,
    pendingCalls: calls.length - completed - cancelled,
    calls: calls.map((c) => ({
      id: c.id,
      clientName: c.clientName || 'Client',
      scheduledTime: c.scheduledTime ? new Date(c.scheduledTime).toLocaleString() : '—',
      duration: c.duration || 30,
      status: c.status || 'scheduled',
    })),
  };
}

export async function generateCalendarReport(reportType, startDate, endDate, isAdmin) {
  switch (reportType) {
    case 'client-progress':
      return generateClientProgressReport(startDate, endDate);
    case 'therapy-notes':
      return generateTherapyNotesReport(startDate, endDate);
    case 'scheduled-calls':
      return generateScheduledCallsReport(startDate, endDate);
    case 'system-overview':
      if (!isAdmin) throw new Error('Admin access required');
      return generateSystemOverviewReport(startDate, endDate);
    default:
      if (reportType.startsWith('all-') && !isAdmin) {
        throw new Error('Admin access required');
      }
      return generateClientProgressReport(startDate, endDate);
  }
}

async function generateSystemOverviewReport(startDate, endDate) {
  const allAssignments = await api('/api/v1/therapy-management/assignments').catch(() => []);
  const therapistIds = [...new Set((allAssignments || []).map((a) => a.therapistId).filter(Boolean))];
  const totalClients = new Set((allAssignments || []).map((a) => a.clientId)).size;

  let totalSessions = 0;
  for (const assignment of allAssignments || []) {
    const notesData = await api(`/api/v1/clinical-notes?clientId=${assignment.clientId}`).catch(() => []);
    totalSessions += (notesData || []).filter((n) => inRange(n.createdAt || n.sessionDate, startDate, endDate)).length;
  }

  return {
    type: 'System Overview Report',
    totalTherapists: therapistIds.length,
    totalClients,
    totalSessions,
    averageProgress: 0,
  };
}
