import React from 'react';
import { LabColors as C } from '../../constants/colors';
import { DiagCatalogMobile } from '../../components/diagnostics/DiagScreensMobile';

// Lab catalog: parent edits price/turnaround; branches read it.
export default function LabCatalogScreen({ profile }) {
  return <DiagCatalogMobile type="lab" isBranch={profile?.role === 'lab_branch'} colors={C} />;
}
