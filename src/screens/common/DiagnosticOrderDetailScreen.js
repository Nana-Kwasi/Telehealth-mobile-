import React from 'react';
import { LabColors, ScanColors } from '../../constants/colors';
import { DiagOrderDetailMobile } from '../../components/diagnostics/DiagScreensMobile';

/**
 * Full diagnostic order for a lab/scan login: progress steps, workflow actions,
 * result values with flags, and the activity log. `type` is 'lab' or 'scan'.
 */
export default function DiagnosticOrderDetailScreen({ type = 'lab' }) {
  return <DiagOrderDetailMobile type={type} colors={type === 'scan' ? ScanColors : LabColors} />;
}
