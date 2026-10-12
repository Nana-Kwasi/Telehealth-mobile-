import React from 'react';
import { LabColors as C } from '../../constants/colors';
import { DiagWorklistMobile } from '../../components/diagnostics/DiagScreensMobile';

// Lab worklist: tabs, priority, turnaround clock and the branch workflow actions.
export default function LabOrdersScreen({ profile }) {
  return <DiagWorklistMobile type="lab" profile={profile} isBranch={profile?.role === 'lab_branch'} colors={C} />;
}
