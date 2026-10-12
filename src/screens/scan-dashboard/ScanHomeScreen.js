import React from 'react';
import { ScanColors as C } from '../../constants/colors';
import DiagDashboardMobile from '../../components/diagnostics/DiagDashboardMobile';

// Scan dashboard home (parent and branch) — see components/diagnostics.
export default function ScanHomeScreen({ profile }) {
  return <DiagDashboardMobile type="scan" profile={profile} isBranch={profile?.role === 'scan_branch'} colors={C} />;
}
