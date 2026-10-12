import React from 'react';
import { LabColors as C } from '../../constants/colors';
import { DiagResultsMobile } from '../../components/diagnostics/DiagScreensMobile';

// Uploaded lab results with critical / abnormal filters.
export default function LabResultsScreen({ profile }) {
  return <DiagResultsMobile type="lab" isBranch={profile?.role === 'lab_branch'} colors={C} />;
}
