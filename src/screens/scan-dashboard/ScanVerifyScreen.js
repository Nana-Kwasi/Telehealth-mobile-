import React from 'react';
import DiagnosticCheckInScreen from '../common/DiagnosticCheckInScreen';

/**
 * Patient check-in by QR or 8-digit code. This used to be a search by patient
 * name with a National ID check; the code now proves the order is theirs.
 */
export default function ScanVerifyScreen({ profile }) {
  return <DiagnosticCheckInScreen type="scan" profile={profile} />;
}
