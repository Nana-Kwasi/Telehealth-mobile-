export const Colors = {
  primary: '#4a7c59',        // Primary green
  secondary: '#5d8aa8',      // Blue
  accent: '#b8860b',         // Gold
  background: '#f4f6f9',    // Light gray
  surface: '#ffffff',       // White
  text: '#333333',          // Dark gray
  textSecondary: '#666666',  // Medium gray
  textLight: '#999999',     // Light gray
  success: '#10b981',       // Green
  warning: '#f59e0b',       // Amber
  error: '#ef4444',         // Red
  info: '#3b82f6',          // Blue
  border: '#e5e7eb',        // Light border
  shadow: 'rgba(0, 0, 0, 0.1)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  individual: '#4a7c59',    // Individual therapy color
  couples: '#5d8aa8',       // Couples therapy color
  teen: '#b8860b',          // Teen therapy color
};

// Medical theme colors (blues, whites, soft tones)
export const MedicalColors = {
  primary: '#1e6bb8',        // Medical blue
  primaryDark: '#155a9c',    // Darker blue for headers
  primaryLight: '#e8f1fb',   // Light blue tint
  secondary: '#0891b2',      // Teal
  accent: '#6366f1',         // Indigo accent
  background: '#f0f6fc',    // Soft blue-gray
  surface: '#ffffff',       // White
  text: '#1e293b',          // Slate dark
  textSecondary: '#64748b',  // Slate medium
  textLight: '#94a3b8',     // Slate light
  success: '#10b981',       // Green
  warning: '#f59e0b',       // Amber
  error: '#ef4444',         // Red
  info: '#3b82f6',          // Blue
  border: '#cbd5e1',        // Slate border
  shadow: 'rgba(0, 0, 0, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  cardBg: '#f8fafc',        // Very light card background
  verified: '#059669',       // Verified badge green
  rating: '#f59e0b',        // Star rating gold
};

// Doctor theme colors — matches patient (Medical) portal blue theme
export const DoctorColors = {
  primary: '#1e6bb8',          // Medical blue (same as patient portal)
  primaryDark: '#155a9c',      // Darker blue for headers
  primaryLight: '#e8f1fb',     // Light blue tint
  secondary: '#0891b2',        // Teal accent
  accent: '#6366f1',           // Indigo accent
  background: '#f0f6fc',       // Soft blue-gray (same as patient portal)
  surface: '#ffffff',          // White
  text: '#1e293b',             // Slate dark
  textSecondary: '#64748b',    // Slate medium
  textLight: '#94a3b8',        // Slate light
  success: '#10b981',          // Emerald
  warning: '#f59e0b',          // Amber
  error: '#ef4444',            // Red
  info: '#3b82f6',             // Blue
  border: '#cbd5e1',           // Slate border
  shadow: 'rgba(0, 0, 0, 0.08)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  cardBg: '#f8fafc',
  verified: '#059669',
  rating: '#f59e0b',
};

// Pharmacy theme colors (dark navy + teal)
export const PharmacyColors = {
  primary: '#0c4a6e',
  primaryDark: '#082f49',
  primaryLight: '#e0f2fe',
  secondary: '#0891b2',
  accent: '#7c3aed',
  background: '#f0f9ff',
  surface: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  textLight: '#94a3b8',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#0369a1',
  border: '#bae6fd',
  shadow: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.5)',
  cardBg: '#f8fafc',
};

// Lab theme colors (emerald green + dark teal)
export const LabColors = {
  primary: '#065f46',
  primaryDark: '#022c22',
  primaryLight: '#d1fae5',
  secondary: '#0d9488',
  accent: '#10b981',
  background: '#ecfdf5',
  surface: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  textLight: '#94a3b8',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#0369a1',
  border: '#a7f3d0',
  shadow: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.5)',
  cardBg: '#f0fdf4',
};

// Scan theme colors (deep purple + indigo)
export const ScanColors = {
  primary: '#4c1d95',
  primaryDark: '#2e1065',
  primaryLight: '#ede9fe',
  secondary: '#7c3aed',
  accent: '#8b5cf6',
  background: '#f5f3ff',
  surface: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  textLight: '#94a3b8',
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#0369a1',
  border: '#ddd6fe',
  shadow: 'rgba(0,0,0,0.08)',
  overlay: 'rgba(0,0,0,0.5)',
  cardBg: '#faf5ff',
};

// Therapist theme colors (deep indigo + teal)
// ─── Therapy module: ZenCare ─────────────────────────────────────────────────
// Retheming these two palettes is how the ZenCare look reaches every therapy
// screen at once. React Native has no cascade to override with, so the shared
// palette IS the centralisation point: ~23 screens reference these keys, and
// changing them here changes all of them together.
//
// The key NAMES are unchanged on purpose. Every screen already reads
// `TherapistColors.surface` for a card and `.text` for a heading, so remapping
// the values converts each screen without touching a single one of them.
//
// Ground values are sampled from assets/zencare-emblem.png — the artwork ships
// with its navy baked in, so the app's navy has to be that same navy.
export const TherapistColors = {
  primary: '#5046bd',         // Violet — the only saturated accent (5.64:1 on white)
  primaryDark: '#3f3796',     // Deeper violet, for pressed states and chrome (7.85:1)
  primaryLight: '#7870e8',    // The raw sampled violet — borders and icon tiles only, 3.98:1
  secondary: '#7870e8',
  accent: '#5046bd',
  background: '#eceaf2',      // Warm off-white page ground
  surface: '#ffffff',         // Card — sits above the ground
  // ── Ink ramp ────────────────────────────────────────────────────────────
  // These were ALL pure white for the navy ground. On the light ground white
  // text is invisible, so they invert to a dark ramp. `textLight` keeps its
  // name for the sake of existing imports but is now the QUIETEST DARK, not a
  // light colour — it must never be used on a dark fill.
  text: '#101010',            // Headings
  textSecondary: '#3d3d3d',   // Body copy
  textLight: '#44474f',       // Meta — still ~7:1 on the ground, passes AA
  // For the rare label that genuinely sits on a pine fill.
  onAccent: '#ffffff',
  success: '#0f5628',
  warning: '#734e12',
  error: '#8c322d',
  info: '#2f5d7d',
  border: 'rgba(16,16,16,0.10)',
  shadow: 'rgba(38, 34, 70, 0.10)',
  overlay: 'rgba(13, 13, 13, 0.45)',
  cardBg: '#ffffff',
  sidebarBg: '#ffffff',       // The drawer is a light rail now, not a dark one
  activeItem: '#5046bd',      // Violet on white — reads clearly
  inactiveItem: '#3d3d3d',    // Dark enough that drawer labels stay legible
};

/**
 * The therapy CLIENT screens import the shared `Colors`, which is also used by
 * login, intent and the doctor flow — retheming it would drag the dark look
 * into modules that must keep their own. This is the same ZenCare palette under
 * the key names those screens already use, so they can swap one import instead
 * of being rewritten.
 */
export const TherapyColors = {
  primary: '#5046bd',
  secondary: '#7870e8',
  accent: '#5046bd',
  background: '#eceaf2',
  surface: '#ffffff',
  // Same inversion as TherapistColors above — dark ink on a light ground.
  text: '#101010',
  textSecondary: '#3d3d3d',
  textLight: '#44474f',
  onAccent: '#ffffff',
  success: '#0f5628',
  warning: '#734e12',
  error: '#8c322d',
  info: '#2f5d7d',
  border: 'rgba(16,16,16,0.10)',
  shadow: 'rgba(38, 34, 70, 0.10)',
  overlay: 'rgba(13, 13, 13, 0.45)',
  // Session-type accents, differentiated by hue but all dark enough to sit as
  // text or a chip label on the light ground.
  individual: '#5046bd',
  couples: '#2f6d9e',
  teen: '#0f5628',
};
