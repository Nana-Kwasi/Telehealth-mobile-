import React from 'react';
import { LabColors as C } from '../../constants/colors';
import DiagDashboardMobile from '../../components/diagnostics/DiagDashboardMobile';

// Lab dashboard home (parent and branch) — see components/diagnostics.
export default function LabHomeScreen({ profile }) {
  return <DiagDashboardMobile type="lab" profile={profile} isBranch={profile?.role === 'lab_branch'} colors={C} />;
}
