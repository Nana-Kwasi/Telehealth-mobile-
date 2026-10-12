import React from 'react';
import { ScanColors as C } from '../../constants/colors';
import { DiagCatalogMobile } from '../../components/diagnostics/DiagScreensMobile';

// Scan catalog: parent edits price/turnaround; branches read it.
export default function ScanCatalogScreen({ profile }) {
  return <DiagCatalogMobile type="scan" isBranch={profile?.role === 'scan_branch'} colors={C} />;
}
