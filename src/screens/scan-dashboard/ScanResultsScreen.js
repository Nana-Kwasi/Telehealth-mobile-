import React from 'react';
import { ScanColors as C } from '../../constants/colors';
import { DiagResultsMobile } from '../../components/diagnostics/DiagScreensMobile';

// Uploaded scan results with critical / abnormal filters.
export default function ScanResultsScreen({ profile }) {
  return <DiagResultsMobile type="scan" isBranch={profile?.role === 'scan_branch'} colors={C} />;
}
