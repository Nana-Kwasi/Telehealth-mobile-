// ─── pushRouting ─────────────────────────────────────────────────────────────
// Where tapping a push notification should land.
//
// The backend already ships a `link` with every notification, but it is a WEB
// path ("/dashboard/messages") because the same notification drives the web
// bell. Nothing on the phone read it, so tapping a notification opened the app
// on whatever screen it was last on — the one thing a person tapping
// "New message from Dr. Mensah" is definitely not asking for.
//
// Screen names differ per role (Messages / MedicalMessages / DoctorMessages),
// so the mapping is resolved against the signed-in role rather than hardcoded.

/**
 * Web link path → screen name, per userIntent. Sub-paths only.
 *
 * Longest match wins, so "/dashboard/appointments/123" resolves to the
 * appointments screen rather than to the first prefix that happens to fit.
 *
 * The bare "/dashboard" root lives in ROOT_SCREEN instead, deliberately: as an
 * entry here it would match every unmapped sub-path as a prefix and silently
 * swallow them to the home screen. An unrecognised link should land on the
 * notification list, which is the one screen guaranteed to be showing the thing
 * that was tapped.
 */
const ROUTES = {
  therapy: {
    '/dashboard/messages':      'Messages',
    '/dashboard/video':         'Video',
    '/dashboard/appointments':  'Schedule',
    '/dashboard/sessions':      'Schedule',
    '/dashboard/couple':        'Home',
    '/dashboard/medications':   'TherapyCare',
    '/dashboard/my-care':       'TherapyCare',
    '/dashboard/prescriptions': 'TherapyCare',
    '/dashboard/ai-assistant':  'TherapyAiAssistant',
    '/dashboard/support':       'Support',
  },
  medical: {
    '/dashboard/messages':      'MedicalMessages',
    '/dashboard/video':         'MedicalVideo',
    '/dashboard/appointments':  'MedicalAppointments',
    '/dashboard/prescriptions': 'MedicalPrescriptions',
    '/dashboard/medications':   'MedicalCare',
    '/dashboard/my-care':       'MedicalCare',
    '/dashboard/diagnostic':    'MedicalDiagnostic',
    '/dashboard/diagnostics':   'MedicalDiagnostic',
    '/dashboard/ai-assistant':  'MedicalAiAssistant',
  },
  therapist: {
    '/dashboard/messages':      'TherapistMessages',
    '/dashboard/video':         'TherapistVideo',
    '/dashboard/appointments':  'TherapistAppointments',
    '/dashboard/sessions':      'TherapistAppointments',
    '/dashboard/couple':        'TherapistCoupleCases',
    '/dashboard/reports':       'TherapistNotes',
    '/dashboard/check-ins':     'TherapistCheckIns',
    '/dashboard/ai-assistant':  'TherapistAiAssistant',
  },
  doctor: {
    '/dashboard/messages':      'DoctorMessages',
    '/dashboard/video':         'DoctorVideo',
    '/dashboard/appointments':  'DoctorAppointments',
    '/dashboard/prescriptions': 'DoctorPrescriptions',
    '/dashboard/diagnostic':    'DoctorDiagnosticResults',
    '/dashboard/ai-assistant':  'DoctorAiAssistant',
    '/dashboard/check-ins':     'DoctorCheckIns',
  },
};

/** Where a bare "/dashboard" link — "just open the app" — should land. */
const ROOT_SCREEN = {
  therapy:   'Home',
  medical:   'MedicalHome',
  therapist: 'TherapistHome',
  doctor:    'DoctorHome',
};

/**
 * The root Stack screen that hosts each role's drawer.
 *
 * Every screen in the tables above lives inside a drawer nested under one of
 * these, and React Navigation will not resolve a nested route by bare name from
 * the root — the navigation has to name the parent and pass the child through
 * `{ screen }`, or it silently does nothing.
 */
const ROOT_STACK = {
  therapy:   'Main',
  medical:   'MedicalMain',
  therapist: 'TherapistMain',
  doctor:    'DoctorMain',
};

export function stackForIntent(userIntent) {
  return ROOT_STACK[userIntent] || null;
}

/** The notification list for each role — the honest fallback. */
const NOTIFICATIONS_SCREEN = {
  therapy:   'Notifications',
  medical:   'MedicalNotifications',
  therapist: 'TherapistNotifications',
  doctor:    'DoctorNotifications',
};

/**
 * Resolve a notification into a screen name.
 *
 * @returns the screen name, or null when this role has no mapping at all —
 *          the pharmacy, lab, scan and home-care navigators do not register a
 *          notification screen, and navigating to a name that does not exist
 *          throws rather than doing nothing.
 */
export function screenForNotification(link, userIntent) {
  const table = ROUTES[userIntent];
  const fallback = NOTIFICATIONS_SCREEN[userIntent] || null;
  if (!table) return fallback;

  const path = String(link || '').split('?')[0].replace(/\/+$/, '');
  if (!path) return fallback;
  if (path === '/dashboard') return ROOT_SCREEN[userIntent] || fallback;

  // Longest prefix wins.
  const match = Object.keys(table)
    .filter((prefix) => path === prefix || path.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];

  return match ? table[match] : fallback;
}
