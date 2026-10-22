import { Platform } from 'react-native';
import { api } from './apiClient';

/** Patient transfers between doctors, and between therapists (same API as the web). */

export const TRANSFER_STATUS = {
  AWAITING_PATIENT_CONSENT: { label: 'Waiting for patient consent', bg: '#fef3c7', fg: '#92400e' },
  AWAITING_RECIPIENT: { label: 'Waiting for the receiving clinician', bg: '#fef3c7', fg: '#92400e' },
  REJECTED_AWAITING_REASSIGN: { label: 'Declined — choose another clinician', bg: '#fee2e2', fg: '#991b1b' },
  DECLINED_BY_PATIENT: { label: 'Patient declined', bg: '#f1f5f9', fg: '#475569' },
  COMPLETED: { label: 'Completed', bg: '#dcfce7', fg: '#166534' },
  CANCELLED: { label: 'Cancelled', bg: '#f1f5f9', fg: '#475569' },
  DECLINED_OR_EXPIRED_FOR_YOU: { label: 'Declined or expired', bg: '#f1f5f9', fg: '#475569' },
};

export const OPEN_STATUSES = ['AWAITING_PATIENT_CONSENT', 'AWAITING_RECIPIENT', 'REJECTED_AWAITING_REASSIGN'];

export const listTransfers = () => api('/api/v1/care-transfers').then((r) => (Array.isArray(r) ? r : []));
export const getTransfer = (id) => api(`/api/v1/care-transfers/${id}`);
export const transferReasons = () => api('/api/v1/care-transfers/reasons');
export const requestTransfer = (form) => api('/api/v1/care-transfers', { method: 'POST', body: form });
export const transferSuggestions = ({ patientId, specialty, format, focus = [] }) => {
  const parts = [`patientId=${encodeURIComponent(patientId)}`];
  if (specialty) parts.push(`specialty=${encodeURIComponent(specialty)}`);
  if (format) parts.push(`format=${encodeURIComponent(format)}`);
  focus.forEach((f) => parts.push(`focus=${encodeURIComponent(f)}`));
  return api(`/api/v1/care-transfers/suggestions?${parts.join('&')}`).then((r) => (Array.isArray(r) ? r : []));
};
export const consentToTransfer = (id, agree, declineReason) =>
  api(`/api/v1/care-transfers/${id}/consent`, {
    method: 'POST',
    body: { agree, declineReason, platform: Platform.OS === 'ios' ? 'ios' : 'android' },
  });
export const decideTransfer = (id, accept, note) =>
  api(`/api/v1/care-transfers/${id}/decision`, { method: 'POST', body: { accept, note } });
export const redirectTransfer = (id, toClinicianId) =>
  api(`/api/v1/care-transfers/${id}/redirect`, { method: 'POST', body: { toClinicianId } });
export const cancelTransfer = (id, reason) =>
  api(`/api/v1/care-transfers/${id}/cancel`, { method: 'POST', body: { reason } });
export const incomingTransferPatients = () =>
  api('/api/v1/care-transfers/incoming-patients').then((r) => (Array.isArray(r) ? r : [])).catch(() => []);
export const draftTransferSummary = (body) =>
  api('/api/v1/care-transfers/draft-summary', { method: 'POST', body });
export const careCatalog = () => api('/api/v1/care-catalog', { authenticated: false });

export function timeLeft(deadline) {
  if (!deadline) return '';
  const ms = new Date(deadline).getTime() - Date.now();
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'overdue — reassigning';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${m} min left` : `${m} min left`;
}

export const fmtWhen = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
};
