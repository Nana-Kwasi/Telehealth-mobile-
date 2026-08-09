import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../services/apiClient';

export const A = {
  LOGIN_SUCCESS:           'LOGIN_SUCCESS',
  LOGIN_FAILED:            'LOGIN_FAILED',
  LOGOUT:                  'LOGOUT',
  PASSWORD_RESET_SENT:     'PASSWORD_RESET_SENT',
  PROFILE_UPDATED:         'PROFILE_UPDATED',
  APPOINTMENT_BOOKED:      'APPOINTMENT_BOOKED',
  APPOINTMENT_CANCELLED:   'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED: 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_COMPLETED:   'APPOINTMENT_COMPLETED',
  PRESCRIPTION_CREATED:    'PRESCRIPTION_CREATED',
  PRESCRIPTION_UPDATED:    'PRESCRIPTION_UPDATED',
  PRESCRIPTION_CANCELLED:  'PRESCRIPTION_CANCELLED',
  SESSION_SCHEDULED:       'SESSION_SCHEDULED',
  SESSION_COMPLETED:       'SESSION_COMPLETED',
  SESSION_CANCELLED:       'SESSION_CANCELLED',
  LAB_ORDER_CREATED:       'LAB_ORDER_CREATED',
  SCAN_ORDER_CREATED:      'SCAN_ORDER_CREATED',
  REPORT_SUBMITTED:        'REPORT_SUBMITTED',
  ADMIN_USER_STATUS:       'ADMIN_USER_STATUS_CHANGED',
  ADMIN_USER_DELETED:      'ADMIN_USER_DELETED',
  ADMIN_USER_EDITED:       'ADMIN_USER_EDITED',
  DOCTOR_ONBOARDED:        'DOCTOR_ONBOARDED',
  THERAPIST_ONBOARDED:     'THERAPIST_ONBOARDED',
};

export async function logAction(action, details = {}, userTypeOverride = null) {
  try {
    const userId = await AsyncStorage.getItem('th.userId') || details.userId || 'system';
    const userName = await AsyncStorage.getItem('userName') || details.userName || 'Unknown';
    await api('/api/v1/audit-logs', {
      method: 'POST',
      body: {
        action,
        details,
        userId,
        userName,
        userEmail: details.userEmail || '',
        userType:  userTypeOverride || details.userType || 'user',
        platform:  'mobile',
        timestamp: new Date().toISOString(),
      },
    }).catch(() => {});
  } catch (_) {
    // Silent — audit failures must never crash the app
  }
}
