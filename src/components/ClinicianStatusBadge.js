import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * A clinician's self-declared availability, wherever a client sees them.
 *
 * The status was already being set (therapist settings → "Current Status") and
 * already reaching the client — /api/v1/therapists/{id} hoists
 * availabilityStatus out of metadata — but nothing rendered it on either
 * platform. A therapist who marked themselves Away looked exactly the same to
 * everyone as one who was free.
 *
 * An unset status renders NOTHING rather than defaulting to "Available": most
 * clinicians have never opened that screen, and a green dot nobody chose would
 * be the app asserting availability on their behalf.
 */

const TONES = {
  /* text measured on the light card surface; dots are non-text UI (3:1 floor) */
  available: { label: 'Available', dot: '#1f8a4c', text: '#146134' },
  busy:      { label: 'Busy',      dot: '#c2410c', text: '#9a3708' },
  away:      { label: 'Away',      dot: '#b45309', text: '#8a4b09' },
  offline:   { label: 'Offline',   dot: '#6b7280', text: '#5b6170' },
};

/** Normalise whatever the record holds; unknown or missing → null. */
export function clinicianStatusOf(source) {
  const raw = typeof source === 'string'
    ? source
    : source?.availabilityStatus || source?.availability_status;
  const key = String(raw || '').trim().toLowerCase();
  return TONES[key] ? key : null;
}

export default function ClinicianStatusBadge({ status, style }) {
  const key = clinicianStatusOf(status);
  if (!key) return null;

  const tone = TONES[key];
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.label, { color: tone.text }]}>{tone.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 11.5, fontWeight: '700' },
});
