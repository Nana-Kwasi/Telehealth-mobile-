import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, STORAGE_KEYS } from './apiClient';
import { loadTherapistCalendarClients } from './therapistCalendarService';
import { enrichClientRecord, getClientDisplayName } from '../utils/clientTherapyMetrics';
import { CALL_JOIN_WINDOW_MS } from '../constants/videoCallConfig';

export async function loadTherapistVideoClients(therapistUid) {
  return loadTherapistCalendarClients(therapistUid);
}

export async function loadTherapistScheduledCalls(therapistUid) {
  const now = Date.now();
  const minTime = now - CALL_JOIN_WINDOW_MS.after;

  try {
    const calls = await api(`/api/v1/scheduled-calls?therapistId=${therapistUid}`);
    const list = Array.isArray(calls) ? calls : [];
    return list
      .filter((call) => {
        const scheduled = call.scheduledTime || call.scheduledAt || call.startsAt;
        if (!scheduled) return false;
        return new Date(scheduled).getTime() >= minTime;
      })
      .sort((a, b) => new Date(a.scheduledTime || a.scheduledAt || a.startsAt || 0) - new Date(b.scheduledTime || b.scheduledAt || b.startsAt || 0));
  } catch {
    return [];
  }
}

export function isCallJoinable(scheduledTime) {
  const scheduled = scheduledTime?.toDate?.() ? scheduledTime.toDate() : new Date(scheduledTime);
  const diff = scheduled.getTime() - Date.now();
  return diff <= CALL_JOIN_WINDOW_MS.before && diff >= -CALL_JOIN_WINDOW_MS.after;
}

export function getTimeUntilCall(scheduledTime) {
  const scheduled = scheduledTime?.toDate?.() ? scheduledTime.toDate() : new Date(scheduledTime);
  const diff = scheduled.getTime() - Date.now();
  if (diff <= 0) return 'Now';
  if (diff < 60 * 1000) return 'Less than 1 min';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} min`;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

export function canManageScheduledCall(call, therapistUid) {
  const scheduled = call.scheduledTime || call.scheduledAt || call.startsAt;
  if (!scheduled) return false;
  const hasNotStarted = new Date(scheduled).getTime() - Date.now() > -CALL_JOIN_WINDOW_MS.before;
  return hasNotStarted && call.therapistId === therapistUid;
}

async function generateTwilioToken(roomName, participantName, participantRole) {
  const data = await api('/api/v1/video/twilio/token', {
    method: 'POST',
    body: { roomName, participantName, role: participantRole },
  });
  return data?.token;
}

export async function startInstantTherapistCall({ profile, client }) {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) throw new Error('Not signed in');

  const roomName = `instant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const participantName = profile?.name || profile?.email || `Therapist-${String(userId).slice(0, 8)}`;

  await api('/api/v1/care/video-calls', {
    method: 'POST',
    body: {
      therapistId: userId,
      clientId: client.id,
      roomName,
      callType: 'instant',
      status: 'incoming',
    },
  }).catch(() => {});

  const token = await generateTwilioToken(roomName, participantName, profile?.role || 'therapist');

  return {
    roomName,
    participantName,
    token,
    callInfo: { roomName, participantName, token, targetPerson: client, callType: 'instant' },
  };
}

export async function joinScheduledTherapistCall({ profile, call }) {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) throw new Error('Not signed in');

  const participantName = profile?.name || profile?.email || `Therapist-${String(userId).slice(0, 8)}`;
  const token = await generateTwilioToken(call.roomName, participantName, profile?.role || 'therapist');

  await api(`/api/v1/care/video-calls/${call.id}/status`, {
    method: 'PATCH',
    body: { status: 'in_progress' },
  }).catch(() => {});

  return {
    roomName: call.roomName,
    participantName,
    token,
    callInfo: { roomName: call.roomName, participantName, token, callType: 'scheduled', scheduledCall: call },
  };
}

export async function scheduleTherapistCall({ profile, client, date, time, duration, notes }) {
  const userId = await AsyncStorage.getItem(STORAGE_KEYS.userId);
  if (!userId) throw new Error('Not signed in');

  const scheduledAt = new Date(`${date}T${time}`);
  if (scheduledAt <= new Date()) throw new Error('Please select a future date and time');

  const roomName = `scheduled-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  await api('/api/v1/scheduled-calls', {
    method: 'POST',
    body: {
      therapistId: userId,
      clientId: client.id,
      roomName,
      scheduledTime: scheduledAt.toISOString(),
      durationMinutes: parseInt(duration, 10) || 30,
      notes: notes || '',
      status: 'scheduled',
    },
  });
}

export async function updateTherapistScheduledCall({ callId, date, time, duration, notes }) {
  const scheduledAt = new Date(`${date}T${time}`);
  if (scheduledAt <= new Date()) throw new Error('Please select a future date and time');

  await api(`/api/v1/scheduled-calls/${callId}`, {
    method: 'PATCH',
    body: {
      scheduledTime: scheduledAt.toISOString(),
      durationMinutes: parseInt(duration, 10) || 30,
      notes: notes || '',
    },
  });
}

export async function deleteTherapistScheduledCall(callId) {
  await api(`/api/v1/scheduled-calls/${callId}`, { method: 'DELETE' });
}
