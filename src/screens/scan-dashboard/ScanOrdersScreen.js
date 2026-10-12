import React from 'react';
import { ScanColors as C } from '../../constants/colors';
import { DiagWorklistMobile } from '../../components/diagnostics/DiagScreensMobile';

// Scan worklist: tabs, priority, turnaround clock and the branch workflow actions.
export default function ScanOrdersScreen({ profile }) {
  return <DiagWorklistMobile type="scan" profile={profile} isBranch={profile?.role === 'scan_branch'} colors={C} />;
}
